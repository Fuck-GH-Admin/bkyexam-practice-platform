import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuditService, createPgAuditLogRepository } from '../../src/admin/audit.js';
import { createPgAdminAuthRepository } from '../../src/admin/auth.js';
import { createPgAdminBankMappingRepository } from '../../src/admin/bankMappings.js';
import { createPgAdminImportJobRepository } from '../../src/admin/importJobs.js';
import { createAdminSessionService, createPgAdminSessionRepository } from '../../src/admin/session.js';
import { createPgAdminSystemStatusRepository } from '../../src/admin/systemStatus.js';
import { hashPassword } from '../../src/auth/password.js';
import { createPgStudentSessionRepository, createSessionService } from '../../src/auth/session.js';
import { createPgStudentAuthRepository } from '../../src/auth/studentAuth.js';
import { buildApp } from '../../src/app.js';
import { createPgPool } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { requireDedicatedTestDatabaseUrl } from '../../src/db/testDatabaseSafety.js';
import { createPgPracticeSessionService } from '../../src/modules/practice/sessionService.js';
import { createPgPracticeRepository } from '../../src/practice/repository.js';
import { createPgBankRepository } from '../../src/repositories/bankRepository.js';
import { createPgWrongQuestionRepository } from '../../src/wrongQuestions/repository.js';
import { fixtureIds, resetAndSeedPostgresFixture } from './postgresFixture.js';

const migrationsDir = fileURLToPath(new URL('../../src/db/migrations/', import.meta.url));
const importFixtureDir = resolve(fileURLToPath(new URL('../import/fixtures/compact-qtype/', import.meta.url)));

describe('PostgreSQL-backed API integration', () => {
  const databaseUrl = requireDedicatedTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const pool = createPgPool(databaseUrl);
  const app = buildApp({
    authRepository: createPgStudentAuthRepository(pool),
    adminAuthRepository: createPgAdminAuthRepository(pool),
    adminBankMappingRepository: createPgAdminBankMappingRepository(pool),
    adminImportJobRepository: createPgAdminImportJobRepository(pool),
    adminImportAllowedRoots: [importFixtureDir],
    adminSystemStatusRepository: createPgAdminSystemStatusRepository(pool),
    bankRepository: createPgBankRepository(pool),
    practiceRepository: createPgPracticeRepository(pool),
    practiceSessionService: createPgPracticeSessionService(pool),
    wrongQuestionRepository: createPgWrongQuestionRepository(pool),
    sessionService: createSessionService(createPgStudentSessionRepository(pool), { ttlDays: 1 }),
    adminSessionService: createAdminSessionService(createPgAdminSessionRepository(pool), { ttlHours: 8 }),
    auditService: createAuditService(createPgAuditLogRepository(pool)),
    cookieSecret: 'postgres-integration-cookie-secret',
    logger: false,
  });

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await runMigrations(client, migrationsDir);
      await resetAndSeedPostgresFixture(client);
      await seedIntegrationAdmin(client);
    } finally {
      client.release();
    }
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('persists auth, drafts, whole-session grading, wrongbook, and ownership boundaries', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'integration-alice' },
    });
    expect(login.statusCode).toBe(200);
    const aliceCookie = extractCookie(login.headers['set-cookie']);

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { loginName: 'integration-operator@example.com', password: 'secret' },
    });
    expect(adminLogin.statusCode).toBe(200);
    expect(adminLogin.json()).toMatchObject({
      admin: {
        id: '50000000-0000-4000-8000-000000000001',
        loginName: 'integration-operator@example.com',
        displayName: 'Integration Operator',
        roles: ['operator'],
        permissions: expect.arrayContaining(['admin:self:read', 'import_job:create']),
      },
      expiresAt: expect.any(String),
    });
    const adminCookie = extractCookie(adminLogin.headers['set-cookie']);
    expect(adminCookie).toContain('bky_admin_session=');
    expect(adminCookie).not.toContain('bky_session=');

    const adminMe = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: adminCookie },
    });
    expect(adminMe.statusCode).toBe(200);
    expect(adminMe.json().admin.loginName).toBe('integration-operator@example.com');

    const adminSystemStatus = await app.inject({
      method: 'GET',
      url: '/api/admin/system/status',
      headers: { cookie: adminCookie },
    });
    expect(adminSystemStatus.statusCode).toBe(200);
    expect(adminSystemStatus.json()).toMatchObject({
      api: { ok: true, service: 'bkyexam-practice-api', version: '0.1.0' },
      database: { ok: true, migrationCount: 6, currentMigration: '0006_import_jobs.sql' },
      corpus: {
        classifications: 3,
        questions: 5,
        questionOptions: 8,
        bankMappings: 2,
        visibleBanks: 1,
      },
      imports: { tableExists: true, runningJobId: null, lastJob: null },
      quality: { tableExists: false, openFlags: 0, blockingFlags: 0, excludedQuestions: 0 },
    });

    const adminAuditState = await pool.query<{ audit_count: string }>(`
      SELECT COUNT(*) AS audit_count
      FROM audit_logs
      WHERE actor_admin_id = $1
        AND action = 'admin.auth.login'
        AND result = 'success'
    `, ['50000000-0000-4000-8000-000000000001']);
    expect(adminAuditState.rows[0]).toEqual({ audit_count: '1' });

    const createdImportJob = await app.inject({
      method: 'POST',
      url: '/api/admin/import-jobs',
      headers: { cookie: adminCookie },
      payload: {
        kind: 'full_corpus_import',
        mode: 'dry_run',
        sourceDir: importFixtureDir,
        options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
      },
    });
    expect(createdImportJob.statusCode).toBe(200);
    expect(createdImportJob.json()).toMatchObject({
      job: {
        kind: 'full_corpus_import',
        mode: 'dry_run',
        status: 'succeeded',
        sourceDir: importFixtureDir,
        progress: { phase: 'done', current: 2, total: 2 },
        summary: {
          classifications: 1,
          questions: 2,
          rawOptions: 1,
          options: 1,
          skippedOptions: 0,
          bankMappings: 1,
          questionTypes: { single_choice: 1, yes_no: 1 },
        },
        createdBy: {
          id: '50000000-0000-4000-8000-000000000001',
          displayName: 'Integration Operator',
        },
      },
    });
    const importJobId = createdImportJob.json().job.id as string;

    const importJobList = await app.inject({
      method: 'GET',
      url: '/api/admin/import-jobs?status=succeeded',
      headers: { cookie: adminCookie },
    });
    expect(importJobList.statusCode).toBe(200);
    expect(importJobList.json()).toMatchObject({
      jobs: [{ id: importJobId, status: 'succeeded' }],
      page: { limit: 20, offset: 0, hasMore: false },
    });

    const importJobDetail = await app.inject({
      method: 'GET',
      url: `/api/admin/import-jobs/${importJobId}`,
      headers: { cookie: adminCookie },
    });
    expect(importJobDetail.statusCode).toBe(200);
    expect(importJobDetail.json().job.id).toBe(importJobId);

    const importJobAuditState = await pool.query<{ audit_count: string }>(`
      SELECT COUNT(*) AS audit_count
      FROM audit_logs
      WHERE actor_admin_id = $1
        AND action = 'import_job.create'
        AND resource_type = 'import_job'
        AND result = 'success'
    `, ['50000000-0000-4000-8000-000000000001']);
    expect(importJobAuditState.rows[0]).toEqual({ audit_count: '1' });

    const adminSystemStatusAfterImport = await app.inject({
      method: 'GET',
      url: '/api/admin/system/status',
      headers: { cookie: adminCookie },
    });
    expect(adminSystemStatusAfterImport.statusCode).toBe(200);
    expect(adminSystemStatusAfterImport.json()).toMatchObject({
      imports: {
        tableExists: true,
        runningJobId: null,
        lastJob: { id: importJobId, status: 'succeeded', finishedAt: expect.any(String) },
      },
    });

    const adminBankMappings = await app.inject({
      method: 'GET',
      url: '/api/admin/bank-mappings?status=active&visible=true&hasObjectiveQuestions=true',
      headers: { cookie: adminCookie },
    });
    expect(adminBankMappings.statusCode).toBe(200);
    expect(adminBankMappings.json()).toMatchObject({
      bankMappings: [{
        bankId: fixtureIds.bank,
        rawName: '数据库集成测试题库',
        bankName: '数据库集成测试题库',
        subjectCategory: '质量保障',
        subjectName: 'PostgreSQL',
        parentId: null,
        qGroup: 100,
        visible: true,
        status: 'active',
        difficulty: 'mixed',
        examPurpose: 'integration',
        questionTypes: ['single_choice', 'multiple_choice', 'yes_no'],
        audience: 'developers',
        keywords: ['integration', 'postgres'],
        questionCount: 4,
        descendantQuestionCount: 4,
        objectiveQuestionCount: 4,
        version: 1,
        updatedAt: expect.any(String),
        updatedBy: null,
      }],
      page: { limit: 20, offset: 0, hasMore: false },
    });

    const adminBankMappingDetail = await app.inject({
      method: 'GET',
      url: `/api/admin/bank-mappings/${fixtureIds.bank}`,
      headers: { cookie: adminCookie },
    });
    expect(adminBankMappingDetail.statusCode).toBe(200);
    expect(adminBankMappingDetail.json()).toMatchObject({
      bankMapping: {
        bankId: fixtureIds.bank,
        parentName: null,
        objectiveQuestionCount: 4,
        questionTypeCounts: {
          multiple_choice: 1,
          single_choice: 2,
          yes_no: 1,
        },
        studentPreview: {
          visibleInStudentCatalog: true,
          reason: 'visible active bank with objective questions',
        },
      },
    });

    const editorLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { loginName: 'integration-editor@example.com', password: 'secret' },
    });
    expect(editorLogin.statusCode).toBe(200);
    expect(editorLogin.json().admin.permissions).toEqual(expect.arrayContaining([
      'bank_mapping:write',
      'bank_mapping:publish',
    ]));
    const editorCookie = extractCookie(editorLogin.headers['set-cookie']);

    const updatedBankMapping = await app.inject({
      method: 'PATCH',
      url: `/api/admin/bank-mappings/${fixtureIds.bank}`,
      headers: { cookie: editorCookie },
      payload: {
        expectedVersion: 1,
        changes: {
          notes: 'Integration editor reviewed the mapping.',
        },
      },
    });
    expect(updatedBankMapping.statusCode).toBe(200);
    expect(updatedBankMapping.json()).toMatchObject({
      bankMapping: {
        bankId: fixtureIds.bank,
        notes: 'Integration editor reviewed the mapping.',
        version: 2,
        updatedBy: {
          id: '50000000-0000-4000-8000-000000000002',
          displayName: 'Integration Editor',
        },
      },
    });

    const staleBankMappingUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/admin/bank-mappings/${fixtureIds.bank}`,
      headers: { cookie: editorCookie },
      payload: {
        expectedVersion: 1,
        changes: { notes: 'stale update' },
      },
    });
    expect(staleBankMappingUpdate.statusCode).toBe(409);
    expect(staleBankMappingUpdate.json()).toEqual({ error: 'Bank mapping version conflict' });

    const bulkStatus = await app.inject({
      method: 'POST',
      url: '/api/admin/bank-mappings/bulk-status',
      headers: { cookie: editorCookie },
      payload: {
        items: [
          { bankId: fixtureIds.hiddenBank, expectedVersion: 1 },
          { bankId: fixtureIds.bank, expectedVersion: 1 },
        ],
        changes: { visible: false, status: 'hidden' },
      },
    });
    expect(bulkStatus.statusCode).toBe(200);
    expect(bulkStatus.json()).toEqual({
      updated: [{ bankId: fixtureIds.hiddenBank, version: 2 }],
      failed: [{ bankId: fixtureIds.bank, error: 'Bank mapping version conflict' }],
    });

    const bankMappingAuditState = await pool.query<{ audit_count: string }>(`
      SELECT COUNT(*) AS audit_count
      FROM audit_logs
      WHERE actor_admin_id = $1
        AND action = 'bank_mapping.update'
        AND resource_type = 'bank_mapping'
        AND result = 'success'
    `, ['50000000-0000-4000-8000-000000000002']);
    expect(bankMappingAuditState.rows[0]).toEqual({ audit_count: '2' });

    const studentMeWithAdminCookie = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: adminCookie },
    });
    expect(studentMeWithAdminCookie.statusCode).toBe(401);

    const adminMeWithStudentCookie = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: aliceCookie },
    });
    expect(adminMeWithStudentCookie.statusCode).toBe(401);

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: aliceCookie },
    });
    expect(me.statusCode).toBe(200);
    const aliceId = me.json().student.id as string;

    const banks = await app.inject({ method: 'GET', url: '/api/banks' });
    expect(banks.statusCode).toBe(200);
    expect(banks.json()).toEqual({
      banks: [{
        bankId: fixtureIds.bank,
        bankName: '数据库集成测试题库',
        subjectCategory: '质量保障',
        subjectName: 'PostgreSQL',
        visible: true,
        status: 'active',
        keywords: ['integration', 'postgres'],
        questionCount: 4,
        description: '用于真实 PostgreSQL integration profile 的最小题库。',
      }],
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: aliceCookie },
      payload: {
        bankId: fixtureIds.bank,
        mode: 'sequential',
        limit: 4,
      },
    });
    expect(created.statusCode).toBe(200);
    const createdBody = created.json();
    const sessionId = createdBody.session.id as string;
    expect(createdBody.session).toMatchObject({
      bankId: fixtureIds.bank,
      mode: 'sequential',
      questionCount: 4,
      completedCount: 0,
      correctCount: 0,
      currentSort: 1,
      status: 'active',
    });
    expect(createdBody.questions.map((question: { id: string }) => question.id)).toEqual([
      fixtureIds.questions.singleCorrect,
      fixtureIds.questions.multipleWrong,
      fixtureIds.questions.falseCorrect,
      fixtureIds.questions.unanswered,
    ]);
    expect(JSON.stringify(createdBody)).not.toContain('answerRaw');

    const secondaryCreated = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: aliceCookie },
      payload: {
        bankId: fixtureIds.bank,
        mode: 'random',
        limit: 1,
      },
    });
    expect(secondaryCreated.statusCode).toBe(200);
    const secondarySessionId = secondaryCreated.json().session.id as string;

    await expectDraftSave(
      app,
      aliceCookie,
      sessionId,
      fixtureIds.questions.singleCorrect,
      [fixtureIds.options.singleCorrect],
    );

    const activeAfterFirstDraft = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions?status=active',
      headers: { cookie: aliceCookie },
    });
    expect(activeAfterFirstDraft.statusCode).toBe(200);
    expect(activeAfterFirstDraft.json().sessions.map((session: { id: string }) => session.id)).toEqual([
      sessionId,
      secondarySessionId,
    ]);
    expect(findSession(activeAfterFirstDraft.json(), sessionId)).toMatchObject({
      bankId: fixtureIds.bank,
      bankName: '数据库集成测试题库',
      origin: 'bank',
      questionCount: 4,
      answeredCount: 1,
      correctCount: 0,
      reviewCount: 0,
      status: 'active',
      completedAt: null,
    });

    await expectDraftSave(
      app,
      aliceCookie,
      sessionId,
      fixtureIds.questions.multipleWrong,
      [fixtureIds.options.multipleFirst],
    );
    await expectDraftSave(
      app,
      aliceCookie,
      sessionId,
      fixtureIds.questions.falseCorrect,
      false,
    );

    const review = await app.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/review/${fixtureIds.questions.multipleWrong}`,
      headers: { cookie: aliceCookie },
      payload: { markedForReview: true },
    });
    expect(review.statusCode).toBe(200);
    expect(review.json()).toMatchObject({
      id: fixtureIds.questions.multipleWrong,
      draftAnswer: [fixtureIds.options.multipleFirst],
      markedForReview: true,
    });

    const progress = await app.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/progress`,
      headers: { cookie: aliceCookie },
      payload: { currentSort: 3 },
    });
    expect(progress.statusCode).toBe(200);
    expect(progress.json().currentSort).toBe(3);

    const activeWithProgress = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions?status=active&limit=20&offset=0',
      headers: { cookie: aliceCookie },
    });
    expect(activeWithProgress.statusCode).toBe(200);
    expect(findSession(activeWithProgress.json(), sessionId)).toMatchObject({
      answeredCount: 3,
      correctCount: 0,
      reviewCount: 1,
      currentSort: 3,
      status: 'active',
    });

    const resumed = await app.inject({
      method: 'GET',
      url: `/api/practice/sessions/${sessionId}`,
      headers: { cookie: aliceCookie },
    });
    expect(resumed.statusCode).toBe(200);
    const resumedBody = resumed.json();
    expect(resumedBody.session.currentSort).toBe(3);
    expect(findQuestion(resumedBody, fixtureIds.questions.multipleWrong)).toMatchObject({
      draftAnswer: [fixtureIds.options.multipleFirst],
      markedForReview: true,
    });
    expect(findQuestion(resumedBody, fixtureIds.questions.falseCorrect)).toMatchObject({
      draftAnswer: false,
      markedForReview: false,
    });

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/practice/sessions/${sessionId}/submit`,
      headers: { cookie: aliceCookie },
    });
    expect(submitted.statusCode).toBe(200);
    const submittedBody = submitted.json();
    expect(submittedBody.session).toMatchObject({
      id: sessionId,
      questionCount: 4,
      completedCount: 3,
      correctCount: 2,
      currentSort: 3,
      status: 'completed',
    });
    expect(submittedBody.results.map((result: { questionId: string; isCorrect: boolean }) => [
      result.questionId,
      result.isCorrect,
    ])).toEqual([
      [fixtureIds.questions.singleCorrect, true],
      [fixtureIds.questions.multipleWrong, false],
      [fixtureIds.questions.falseCorrect, true],
    ]);

    const history = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions?status=completed',
      headers: { cookie: aliceCookie },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().sessions).toHaveLength(1);
    const historySession = findSession<{ id: string; completedAt: unknown }>(history.json(), sessionId);
    expect(historySession).toMatchObject({
      bankName: '数据库集成测试题库',
      origin: 'bank',
      questionCount: 4,
      answeredCount: 3,
      correctCount: 2,
      reviewCount: 1,
      currentSort: 3,
      status: 'completed',
    });
    expect(historySession.completedAt).toEqual(expect.any(String));

    const completedDetail = await app.inject({
      method: 'GET',
      url: `/api/practice/sessions/${sessionId}`,
      headers: { cookie: aliceCookie },
    });
    expect(completedDetail.statusCode).toBe(200);
    expect(completedDetail.json().session).toMatchObject({
      id: sessionId,
      completedCount: 3,
      correctCount: 2,
      status: 'completed',
    });

    const databaseState = await pool.query<{
      attempt_count: string;
      wrong_count: string;
      unanswered_attempt_count: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM practice_attempts WHERE student_id = $1) AS attempt_count,
        (SELECT COUNT(*) FROM wrong_questions WHERE student_id = $1) AS wrong_count,
        (
          SELECT COUNT(*)
          FROM practice_attempts
          WHERE student_id = $1
            AND question_id = $2
        ) AS unanswered_attempt_count
    `, [aliceId, fixtureIds.questions.unanswered]);
    expect(databaseState.rows[0]).toEqual({
      attempt_count: '3',
      wrong_count: '1',
      unanswered_attempt_count: '0',
    });

    const completedWrite = await app.inject({
      method: 'PUT',
      url: `/api/practice/sessions/${sessionId}/drafts/${fixtureIds.questions.singleCorrect}`,
      headers: { cookie: aliceCookie },
      payload: { answer: [fixtureIds.options.singleCorrect] },
    });
    expect(completedWrite.statusCode).toBe(409);

    const wrongList = await app.inject({
      method: 'GET',
      url: '/api/wrong-questions',
      headers: { cookie: aliceCookie },
    });
    expect(wrongList.statusCode).toBe(200);
    const wrongQuestion = wrongList.json().wrongQuestions[0];
    expect(wrongList.json().wrongQuestions).toHaveLength(1);
    expect(wrongQuestion).toMatchObject({
      questionId: fixtureIds.questions.multipleWrong,
      bankId: fixtureIds.bank,
      bankName: '数据库集成测试题库',
      wrongCount: 1,
      lastAnswer: JSON.stringify([fixtureIds.options.multipleFirst]),
      mastered: false,
    });

    const wrongDetail = await app.inject({
      method: 'GET',
      url: `/api/wrong-questions/${wrongQuestion.id}`,
      headers: { cookie: aliceCookie },
    });
    expect(wrongDetail.statusCode).toBe(200);
    expect(wrongDetail.json().wrongQuestion).toMatchObject({
      id: wrongQuestion.id,
      questionId: fixtureIds.questions.multipleWrong,
      correctAnswer: [fixtureIds.options.multipleFirst, fixtureIds.options.multipleSecond],
      analysis: '原子性与一致性都属于 ACID。',
      options: [
        { id: fixtureIds.options.multipleFirst, sort: 1, content: '原子性' },
        { id: fixtureIds.options.multipleSecond, sort: 2, content: '一致性' },
        { id: fixtureIds.options.multipleWrong, sort: 3, content: '随机性' },
      ],
    });

    const mastered = await app.inject({
      method: 'POST',
      url: `/api/wrong-questions/${wrongQuestion.id}/mastered`,
      headers: { cookie: aliceCookie },
    });
    expect(mastered.statusCode).toBe(200);

    const hiddenMastered = await app.inject({
      method: 'GET',
      url: '/api/wrong-questions',
      headers: { cookie: aliceCookie },
    });
    expect(hiddenMastered.json()).toEqual({ wrongQuestions: [] });

    const includedMastered = await app.inject({
      method: 'GET',
      url: '/api/wrong-questions?includeMastered=true',
      headers: { cookie: aliceCookie },
    });
    expect(includedMastered.json().wrongQuestions).toEqual([
      expect.objectContaining({ id: wrongQuestion.id, mastered: true }),
    ]);

    const reviewSession = await app.inject({
      method: 'POST',
      url: '/api/wrong-questions/review-sessions',
      headers: { cookie: aliceCookie },
      payload: { includeMastered: true, limit: 10 },
    });
    expect(reviewSession.statusCode).toBe(200);
    const reviewSessionId = reviewSession.json().session.id as string;

    const reviewPayload = await app.inject({
      method: 'GET',
      url: `/api/practice/sessions/${reviewSessionId}`,
      headers: { cookie: aliceCookie },
    });
    expect(reviewPayload.statusCode).toBe(200);
    expect(reviewPayload.json()).toMatchObject({
      session: {
        id: reviewSessionId,
        bankId: fixtureIds.bank,
        mode: 'sequential',
        questionCount: 1,
        status: 'active',
      },
      questions: [{ id: fixtureIds.questions.multipleWrong }],
    });

    const activeWithReviewSession = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions?status=active',
      headers: { cookie: aliceCookie },
    });
    expect(activeWithReviewSession.statusCode).toBe(200);
    expect(findSession(activeWithReviewSession.json(), reviewSessionId)).toMatchObject({
      origin: 'wrongbook',
      bankName: '数据库集成测试题库',
      questionCount: 1,
      answeredCount: 0,
      reviewCount: 0,
      status: 'active',
    });

    const bobLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'integration-bob' },
    });
    const bobCookie = extractCookie(bobLogin.headers['set-cookie']);
    const bobSessionRead = await app.inject({
      method: 'GET',
      url: `/api/practice/sessions/${sessionId}`,
      headers: { cookie: bobCookie },
    });
    expect(bobSessionRead.statusCode).toBe(404);
    const bobWrongList = await app.inject({
      method: 'GET',
      url: '/api/wrong-questions?includeMastered=true',
      headers: { cookie: bobCookie },
    });
    expect(bobWrongList.json()).toEqual({ wrongQuestions: [] });
    const bobHistory = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions?status=completed',
      headers: { cookie: bobCookie },
    });
    expect(bobHistory.json()).toEqual({
      sessions: [],
      page: { limit: 20, offset: 0, hasMore: false },
    });

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: aliceCookie },
    });
    expect(logout.statusCode).toBe(200);
    const afterLogout = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: aliceCookie },
    });
    expect(afterLogout.statusCode).toBe(401);
  });
});

async function seedIntegrationAdmin(client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> }) {
  const passwordHash = await hashPassword('secret');
  await client.query(
    `
      INSERT INTO admin_users (id, login_name, display_name, password_hash, status)
      VALUES
        ($1, $2, $3, $4, 'active'),
        ($5, $6, $7, $8, 'active')
    `,
    [
      '50000000-0000-4000-8000-000000000001',
      'integration-operator@example.com',
      'Integration Operator',
      passwordHash,
      '50000000-0000-4000-8000-000000000002',
      'integration-editor@example.com',
      'Integration Editor',
      passwordHash,
    ],
  );
  await client.query(
    `
      INSERT INTO admin_user_roles (admin_user_id, role)
      VALUES
        ($1, 'operator'),
        ($2, 'content_editor')
    `,
    [
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000002',
    ],
  );
}

function extractCookie(header: string | string[] | undefined) {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error('Expected login response to set a session cookie.');
  return value.split(';', 1)[0];
}

function findQuestion(payload: { questions: Array<{ id: string }> }, questionId: string) {
  const question = payload.questions.find((candidate) => candidate.id === questionId);
  if (!question) throw new Error(`Question not found in payload: ${questionId}`);
  return question;
}

function findSession<T extends { id: string }>(
  payload: { sessions: T[] },
  sessionId: string,
): T {
  const session = payload.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) throw new Error(`Session not found in payload: ${sessionId}`);
  return session;
}

async function expectDraftSave(
  app: ReturnType<typeof buildApp>,
  cookie: string,
  sessionId: string,
  questionId: string,
  answer: string[] | boolean,
) {
  const response = await app.inject({
    method: 'PUT',
    url: `/api/practice/sessions/${sessionId}/drafts/${questionId}`,
    headers: { cookie },
    payload: { answer },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ id: questionId, draftAnswer: answer });
}
