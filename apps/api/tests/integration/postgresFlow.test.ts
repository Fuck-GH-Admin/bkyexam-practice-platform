import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuditService, createPgAuditLogRepository } from '../../src/admin/audit.js';
import { createPgAdminAuthRepository } from '../../src/admin/auth.js';
import { createPgAdminBankMappingRepository } from '../../src/admin/bankMappings.js';
import { createAdminBootstrapService, createPgAdminBootstrapRepository } from '../../src/admin/bootstrap.js';
import { createPgAdminImportJobRepository, createPgQuestionBankImportRunner } from '../../src/admin/importJobs.js';
import { createPgAdminQuestionReviewRepository } from '../../src/admin/questionReview.js';
import { createAdminSessionService, createPgAdminSessionRepository } from '../../src/admin/session.js';
import { createPgAdminStudentRepository } from '../../src/admin/adminStudents.js';
import { createPgAdminSystemStatusRepository } from '../../src/admin/systemStatus.js';
import { createPgAdminUserRepository } from '../../src/admin/adminUsers.js';
import { hashPassword } from '../../src/auth/password.js';
import { createPgStudentSessionRepository, createSessionService } from '../../src/auth/session.js';
import { createPgStudentAuthRepository } from '../../src/auth/studentAuth.js';
import { buildApp } from '../../src/app.js';
import { createPgPool } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { requireDedicatedTestDatabaseUrl } from '../../src/db/testDatabaseSafety.js';
import { createPgReadinessProbe } from '../../src/health/readiness.js';
import { createPgLearningDashboardRepository } from '../../src/learning/repository.js';
import { createPgPracticeSessionService } from '../../src/modules/practice/sessionService.js';
import { createPgPracticeRepository } from '../../src/practice/repository.js';
import { createPgBankRepository } from '../../src/repositories/bankRepository.js';
import { createPgWrongQuestionRepository } from '../../src/wrongQuestions/repository.js';
import { fixtureIds, resetAndSeedPostgresFixture } from './postgresFixture.js';

const migrationsDir = fileURLToPath(new URL('../../src/db/migrations/', import.meta.url));
const importFixtureDir = resolve(fileURLToPath(new URL('../import/fixtures/compact-qtype/', import.meta.url)));
const importUuidFixtureDir = resolve(fileURLToPath(new URL('../import/fixtures/compact-uuid-qtype/', import.meta.url)));
const importBadFixtureDir = resolve(
  fileURLToPath(new URL('../import/fixtures/bad-missing-classification/', import.meta.url)),
);

describe('PostgreSQL-backed API integration', () => {
  const databaseUrl = requireDedicatedTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const pool = createPgPool(databaseUrl);
  const auditLogRepository = createPgAuditLogRepository(pool);
  const app = buildApp({
    authRepository: createPgStudentAuthRepository(pool),
    adminAuthRepository: createPgAdminAuthRepository(pool),
    adminBankMappingRepository: createPgAdminBankMappingRepository(pool),
    adminImportJobRepository: createPgAdminImportJobRepository(pool),
    adminImportAllowedRoots: [importFixtureDir, importUuidFixtureDir, importBadFixtureDir],
    adminImportModeEnabled: true,
    adminImportRunner: createPgQuestionBankImportRunner(pool),
    adminQuestionReviewRepository: createPgAdminQuestionReviewRepository(pool),
    adminStudentRepository: createPgAdminStudentRepository(pool),
    adminSystemStatusRepository: createPgAdminSystemStatusRepository(pool),
    adminUserRepository: createPgAdminUserRepository(pool),
    bankRepository: createPgBankRepository(pool),
    learningRepository: createPgLearningDashboardRepository(pool),
    practiceRepository: createPgPracticeRepository(pool),
    practiceSessionService: createPgPracticeSessionService(pool),
    wrongQuestionRepository: createPgWrongQuestionRepository(pool),
    sessionService: createSessionService(createPgStudentSessionRepository(pool), { ttlDays: 1 }),
    adminSessionService: createAdminSessionService(createPgAdminSessionRepository(pool), { ttlHours: 8 }),
    auditLogRepository,
    auditService: createAuditService(auditLogRepository),
    cookieSecret: 'postgres-integration-cookie-secret',
    readinessProbe: createPgReadinessProbe(pool),
    logger: false,
  });

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await runMigrations(client, migrationsDir);
      await resetAndSeedPostgresFixture(client);
      await seedIntegrationAdmin(client);
      await createAdminBootstrapService(
        createPgAdminBootstrapRepository(client),
        createAuditService(createPgAuditLogRepository(client)),
      ).bootstrapSuperAdmin({
        loginName: 'integration-super@example.com',
        displayName: 'Integration Super Admin',
        password: 'secret123',
      }, new Date('2026-07-14T10:00:00.000Z'));
      await seedIntegrationStudent(
        client,
        '60000000-0000-4000-8000-000000000101',
        'integration-alice',
        'Integration Alice',
        'alice-secret123',
      );
      await seedIntegrationStudent(
        client,
        '60000000-0000-4000-8000-000000000102',
        'integration-bob',
        'Integration Bob',
        'bob-secret123',
      );
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
    const readiness = await app.inject({
      method: 'GET',
      url: '/api/health/readiness',
      headers: { 'x-request-id': 'integration-readiness' },
    });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.headers['x-request-id']).toBe('integration-readiness');
    expect(readiness.json()).toMatchObject({
      ok: true,
      service: 'bkyexam-practice-api',
      dependencies: {
        api: { ok: true, status: 'ok' },
        database: { ok: true, status: 'ok', latencyMs: expect.any(Number) },
      },
    });

    const metrics = await app.inject({ method: 'GET', url: '/api/health/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json()).toMatchObject({
      service: 'bkyexam-practice-api',
      http: {
        totalRequests: expect.any(Number),
        responses: expect.objectContaining({ success: expect.any(Number) }),
        routes: expect.arrayContaining([
          expect.objectContaining({
            method: 'GET',
            route: '/api/health/readiness',
            responses: expect.objectContaining({ success: 1 }),
          }),
        ]),
      },
    });
    expect(metrics.json().http.totalRequests).toBeGreaterThanOrEqual(1);

    const passwordlessLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'integration-alice' },
    });
    expect(passwordlessLogin.statusCode).toBe(400);
    expect(passwordlessLogin.json()).toEqual({ error: 'Student password is required' });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'integration-alice', password: 'alice-secret123' },
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
      database: { ok: true, migrationCount: 12, currentMigration: '0012_question_review_overrides.sql' },
      corpus: {
        classifications: 3,
        questions: 5,
        questionOptions: 8,
        bankMappings: 2,
        visibleBanks: 1,
      },
      imports: { tableExists: true, runningJobId: null, lastJob: null },
      quality: { tableExists: true, openFlags: 0, blockingFlags: 0, excludedQuestions: 0 },
    });

    const adminAuditState = await pool.query<{ audit_count: string }>(`
      SELECT COUNT(*) AS audit_count
      FROM audit_logs
      WHERE actor_admin_id = $1
        AND action = 'admin.auth.login'
        AND result = 'success'
    `, ['50000000-0000-4000-8000-000000000001']);
    expect(adminAuditState.rows[0]).toEqual({ audit_count: '1' });

    const superAdminLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { loginName: 'integration-super@example.com', password: 'secret123' },
    });
    expect(superAdminLogin.statusCode).toBe(200);
    expect(superAdminLogin.json()).toMatchObject({
      admin: {
        loginName: 'integration-super@example.com',
        roles: ['super_admin'],
        permissions: expect.arrayContaining(['audit_log:read', 'admin_user:manage']),
      },
    });
    const superAdminCookie = extractCookie(superAdminLogin.headers['set-cookie']);

    const operatorAuditForbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-logs',
      headers: { cookie: adminCookie },
    });
    expect(operatorAuditForbidden.statusCode).toBe(403);

    const operatorAdminUserForbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { cookie: adminCookie },
    });
    expect(operatorAdminUserForbidden.statusCode).toBe(403);

    const adminUserList = await app.inject({
      method: 'GET',
      url: '/api/admin/users?role=super_admin&limit=10&offset=0',
      headers: { cookie: superAdminCookie },
    });
    expect(adminUserList.statusCode).toBe(200);
    expect(adminUserList.json()).toMatchObject({
      adminUsers: [expect.objectContaining({
        loginName: 'integration-super@example.com',
        roles: ['super_admin'],
        permissions: expect.arrayContaining(['admin_user:manage']),
      })],
      page: { limit: 10, offset: 0, hasMore: false },
    });

    const createdAdminUser = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: superAdminCookie },
      payload: {
        loginName: 'integration-managed@example.com',
        displayName: 'Integration Managed Admin',
        password: 'secret123',
        roles: ['operator'],
      },
    });
    expect(createdAdminUser.statusCode).toBe(200);
    expect(createdAdminUser.json()).toMatchObject({
      adminUser: {
        loginName: 'integration-managed@example.com',
        displayName: 'Integration Managed Admin',
        status: 'active',
        roles: ['operator'],
        permissions: expect.arrayContaining(['import_job:create']),
      },
    });
    expect(JSON.stringify(createdAdminUser.json())).not.toContain('secret123');
    const managedAdminId = createdAdminUser.json().adminUser.id as string;

    const updatedAdminUser = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${managedAdminId}`,
      headers: { cookie: superAdminCookie },
      payload: {
        displayName: 'Integration Managed Editor',
        roles: ['content_editor', 'operator'],
        password: 'newsecret123',
      },
    });
    expect(updatedAdminUser.statusCode).toBe(200);
    expect(updatedAdminUser.json()).toMatchObject({
      adminUser: {
        id: managedAdminId,
        displayName: 'Integration Managed Editor',
        status: 'active',
        roles: ['content_editor', 'operator'],
        permissions: expect.arrayContaining(['bank_mapping:write', 'import_job:create']),
      },
    });

    const managedAdminDetail = await app.inject({
      method: 'GET',
      url: `/api/admin/users/${managedAdminId}`,
      headers: { cookie: superAdminCookie },
    });
    expect(managedAdminDetail.statusCode).toBe(200);
    expect(managedAdminDetail.json().adminUser).toMatchObject({
      id: managedAdminId,
      loginName: 'integration-managed@example.com',
      displayName: 'Integration Managed Editor',
      roles: ['content_editor', 'operator'],
    });

    const lastSuperAdminGuard = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${superAdminLogin.json().admin.id}`,
      headers: { cookie: superAdminCookie },
      payload: { status: 'disabled' },
    });
    expect(lastSuperAdminGuard.statusCode).toBe(409);
    expect(lastSuperAdminGuard.json()).toEqual({ error: 'Cannot remove or disable the last active super_admin' });

    const adminUserAuditState = await pool.query<{ create_count: string; update_count: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE action = 'admin_user.create') AS create_count,
        COUNT(*) FILTER (WHERE action = 'admin_user.update') AS update_count
      FROM audit_logs
      WHERE actor_admin_id = $1
        AND resource_type = 'admin_user'
        AND result = 'success'
    `, [superAdminLogin.json().admin.id]);
    expect(adminUserAuditState.rows[0]).toEqual({ create_count: '1', update_count: '1' });

    const existingStudentList = await app.inject({
      method: 'GET',
      url: '/api/admin/students?keyword=integration-alice&limit=10&offset=0',
      headers: { cookie: adminCookie },
    });
    expect(existingStudentList.statusCode).toBe(200);
    expect(existingStudentList.json()).toMatchObject({
      students: [expect.objectContaining({
        loginName: 'integration-alice',
        status: 'active',
        className: null,
        groupName: null,
      })],
      page: { limit: 10, offset: 0, hasMore: false },
    });
    expect(JSON.stringify(existingStudentList.json())).not.toContain('passwordHash');

    const createdStudent = await app.inject({
      method: 'POST',
      url: '/api/admin/students',
      headers: { cookie: adminCookie },
      payload: {
        loginName: '202502040201',
        displayName: 'Student 201',
        initialPassword: 'temporary123',
      },
    });
    expect(createdStudent.statusCode).toBe(200);
    expect(createdStudent.json()).toMatchObject({
      student: {
        loginName: '202502040201',
        displayName: 'Student 201',
        className: '2班',
        groupName: null,
        status: 'active',
        passwordResetRequired: true,
        createdBy: {
          id: '50000000-0000-4000-8000-000000000001',
          displayName: 'Integration Operator',
        },
      },
    });
    expect(JSON.stringify(createdStudent.json())).not.toContain('temporary123');
    const managedStudentId = createdStudent.json().student.id as string;

    const managedStudentLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: '202502040201', password: 'temporary123' },
    });
    expect(managedStudentLogin.statusCode).toBe(200);
    expect(managedStudentLogin.json()).toMatchObject({
      student: {
        loginName: '202502040201',
        className: '2班',
      },
      passwordResetRequired: true,
    });
    const managedStudentCookie = extractCookie(managedStudentLogin.headers['set-cookie']);

    const managedStudentPasswordChange = await app.inject({
      method: 'POST',
      url: '/api/auth/password/change',
      headers: { cookie: managedStudentCookie },
      payload: {
        currentPassword: 'temporary123',
        newPassword: 'permanent123',
      },
    });
    expect(managedStudentPasswordChange.statusCode).toBe(200);
    expect(managedStudentPasswordChange.json()).toEqual({ success: true, passwordResetRequired: false });

    const managedStudentMeAfterPasswordChange = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: managedStudentCookie },
    });
    expect(managedStudentMeAfterPasswordChange.statusCode).toBe(200);
    expect(managedStudentMeAfterPasswordChange.json()).toMatchObject({
      student: { loginName: '202502040201' },
      passwordResetRequired: false,
    });

    const managedStudentOldPasswordLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: '202502040201', password: 'temporary123' },
    });
    expect(managedStudentOldPasswordLogin.statusCode).toBe(401);

    const bulkCreatedStudents = await app.inject({
      method: 'POST',
      url: '/api/admin/students/bulk-create',
      headers: { cookie: adminCookie },
      payload: {
        students: [
          { loginName: 'integration-bulk-1', displayName: 'Bulk One', className: '实验班' },
          { loginName: '202502040202', displayName: 'Student 202' },
          { loginName: '202502040201' },
          { loginName: 'integration-bulk-1' },
        ],
        options: {
          defaultInitialPassword: 'temporary123',
          passwordResetRequired: true,
          skipExisting: true,
        },
      },
    });
    expect(bulkCreatedStudents.statusCode).toBe(200);
    expect(bulkCreatedStudents.json()).toMatchObject({
      created: expect.arrayContaining([
        expect.objectContaining({ loginName: 'integration-bulk-1', className: '实验班' }),
        expect.objectContaining({ loginName: '202502040202', className: '2班' }),
      ]),
      skipped: [{ loginName: '202502040201', reason: 'loginName already exists' }],
      failed: [{ loginName: 'integration-bulk-1', error: 'Duplicate loginName in request' }],
    });
    expect(bulkCreatedStudents.json().created).toHaveLength(2);

    const updatedStudent = await app.inject({
      method: 'PATCH',
      url: `/api/admin/students/${managedStudentId}`,
      headers: { cookie: adminCookie },
      payload: {
        displayName: 'Student 201 Updated',
        groupName: 'A组',
      },
    });
    expect(updatedStudent.statusCode).toBe(200);
    expect(updatedStudent.json()).toMatchObject({
      student: {
        id: managedStudentId,
        displayName: 'Student 201 Updated',
        className: '2班',
        groupName: 'A组',
        status: 'active',
      },
    });

    const resetStudentPassword = await app.inject({
      method: 'POST',
      url: `/api/admin/students/${managedStudentId}/reset-password`,
      headers: { cookie: adminCookie },
      payload: {
        newPassword: 'temporary456',
        revokeExistingSessions: true,
      },
    });
    expect(resetStudentPassword.statusCode).toBe(200);
    expect(resetStudentPassword.json()).toMatchObject({
      student: {
        id: managedStudentId,
        passwordResetRequired: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      revokedSessions: 1,
    });
    expect(JSON.stringify(resetStudentPassword.json())).not.toContain('temporary456');

    const afterResetOldSession = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: managedStudentCookie },
    });
    expect(afterResetOldSession.statusCode).toBe(401);

    const disabledStudent = await app.inject({
      method: 'PATCH',
      url: `/api/admin/students/${managedStudentId}`,
      headers: { cookie: adminCookie },
      payload: { status: 'disabled' },
    });
    expect(disabledStudent.statusCode).toBe(200);
    expect(disabledStudent.json()).toMatchObject({
      student: {
        id: managedStudentId,
        status: 'disabled',
      },
    });

    const revokedAgain = await app.inject({
      method: 'POST',
      url: `/api/admin/students/${managedStudentId}/revoke-sessions`,
      headers: { cookie: adminCookie },
    });
    expect(revokedAgain.statusCode).toBe(200);
    expect(revokedAgain.json()).toEqual({ studentId: managedStudentId, revokedSessions: 0 });

    const studentAccountAuditState = await pool.query<{
      create_count: string;
      bulk_count: string;
      update_count: string;
      reset_count: string;
      revoke_count: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE action = 'student_account.create') AS create_count,
        COUNT(*) FILTER (WHERE action = 'student_account.bulk_create') AS bulk_count,
        COUNT(*) FILTER (WHERE action = 'student_account.update') AS update_count,
        COUNT(*) FILTER (WHERE action = 'student_account.reset_password') AS reset_count,
        COUNT(*) FILTER (WHERE action = 'student_account.revoke_sessions') AS revoke_count
      FROM audit_logs
      WHERE actor_admin_id = $1
        AND resource_type = 'student'
        AND result = 'success'
    `, ['50000000-0000-4000-8000-000000000001']);
    expect(studentAccountAuditState.rows[0]).toEqual({
      create_count: '1',
      bulk_count: '1',
      update_count: '2',
      reset_count: '1',
      revoke_count: '1',
    });

    const adminAuditLogList = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-logs?action=admin_user.bootstrap&limit=5',
      headers: { cookie: superAdminCookie },
    });
    expect(adminAuditLogList.statusCode).toBe(200);
    expect(adminAuditLogList.json()).toMatchObject({
      auditLogs: [expect.objectContaining({
        actor: null,
        action: 'admin_user.bootstrap',
        resourceType: 'admin_user',
        after: {
          loginName: 'integration-super@example.com',
          displayName: 'Integration Super Admin',
          roles: ['super_admin'],
        },
        result: 'success',
        createdAt: '2026-07-14T10:00:00.000Z',
      })],
      page: { limit: 5, offset: 0, hasMore: false },
    });

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

    const importJobErrorReport = await app.inject({
      method: 'GET',
      url: `/api/admin/import-jobs/${importJobId}/errors`,
      headers: { cookie: adminCookie },
    });
    expect(importJobErrorReport.statusCode).toBe(200);
    expect(importJobErrorReport.json()).toEqual({
      jobId: importJobId,
      status: 'succeeded',
      errorSummary: [],
    });

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
    expect(me.json()).toMatchObject({
      student: {
        loginName: 'integration-alice',
        className: null,
        groupName: null,
      },
      passwordResetRequired: false,
    });
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

    const unansweredReviewDetail = await app.inject({
      method: 'GET',
      url: `/api/admin/question-review/${fixtureIds.questions.unanswered}`,
      headers: { cookie: editorCookie },
    });
    expect(unansweredReviewDetail.statusCode).toBe(200);
    expect(unansweredReviewDetail.json()).toMatchObject({
      question: {
        questionId: fixtureIds.questions.unanswered,
        content: '哪一个是 PostgreSQL 的默认端口？',
        answerRaw: fixtureIds.options.unansweredCorrect,
        options: [
          { id: fixtureIds.options.unansweredCorrect, effectiveContent: '5432' },
          { id: fixtureIds.options.unansweredWrong, effectiveContent: '3306' },
        ],
        overrideVersion: 0,
      },
    });

    const unansweredOverride = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${fixtureIds.questions.unanswered}/override`,
      headers: { cookie: editorCookie },
      payload: {
        expectedVersion: 0,
        content: '哪一个端口是 PostgreSQL 的默认监听端口？',
        optionContentOverrides: [{ optionId: fixtureIds.options.unansweredCorrect, content: '5432（默认端口）' }],
        note: 'Integration override should affect student-facing practice without editing raw imports.',
      },
    });
    expect(unansweredOverride.statusCode).toBe(200);
    expect(unansweredOverride.json()).toMatchObject({
      question: {
        questionId: fixtureIds.questions.unanswered,
        content: '哪一个端口是 PostgreSQL 的默认监听端口？',
        options: [
          { id: fixtureIds.options.unansweredCorrect, overrideContent: '5432（默认端口）', effectiveContent: '5432（默认端口）' },
          { id: fixtureIds.options.unansweredWrong, effectiveContent: '3306' },
        ],
        overrideVersion: 1,
      },
    });
    const staleUnansweredOverride = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${fixtureIds.questions.unanswered}/override`,
      headers: { cookie: editorCookie },
      payload: {
        expectedVersion: 0,
        content: 'stale override',
      },
    });
    expect(staleUnansweredOverride.statusCode).toBe(409);

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
    expect(findQuestion(createdBody, fixtureIds.questions.unanswered)).toMatchObject({
      content: '哪一个端口是 PostgreSQL 的默认监听端口？',
      options: [
        { id: fixtureIds.options.unansweredCorrect, content: '5432（默认端口）' },
        { id: fixtureIds.options.unansweredWrong, content: '3306' },
      ],
    });
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

    const questionReviewUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${fixtureIds.questions.unanswered}`,
      headers: { cookie: editorCookie },
      payload: {
        addFlags: [{
          type: 'bad_answer',
          severity: 'blocking',
          note: 'Integration review excludes this question from new practice sessions.',
        }],
        excludedFromPractice: true,
      },
    });
    expect(questionReviewUpdate.statusCode).toBe(200);
    expect(questionReviewUpdate.json()).toMatchObject({
      question: {
        questionId: fixtureIds.questions.unanswered,
        bankId: fixtureIds.bank,
        excludedFromPractice: true,
        flags: [expect.objectContaining({
          type: 'bad_answer',
          severity: 'blocking',
          status: 'open',
          createdBy: {
            id: '50000000-0000-4000-8000-000000000002',
            displayName: 'Integration Editor',
          },
        })],
      },
    });
    const qualityFlagId = questionReviewUpdate.json().question.flags[0].id as string;

    const questionReviewList = await app.inject({
      method: 'GET',
      url: `/api/admin/question-review?bankId=${fixtureIds.bank}&status=open&severity=blocking`,
      headers: { cookie: editorCookie },
    });
    expect(questionReviewList.statusCode).toBe(200);
    expect(questionReviewList.json()).toMatchObject({
      questions: [{
        questionId: fixtureIds.questions.unanswered,
        bankId: fixtureIds.bank,
        optionCount: 2,
        excludedFromPractice: true,
        flags: [{ id: qualityFlagId, status: 'open' }],
      }],
      page: { limit: 20, offset: 0, hasMore: false },
    });

    const questionReviewAuditState = await pool.query<{ audit_count: string }>(`
      SELECT COUNT(*) AS audit_count
      FROM audit_logs
      WHERE actor_admin_id = $1
        AND action IN ('question_review.flag_add', 'question_review.exclude_update')
        AND result = 'success'
    `, ['50000000-0000-4000-8000-000000000002']);
    expect(questionReviewAuditState.rows[0]).toEqual({ audit_count: '2' });

    const adminSystemStatusAfterQuestionReview = await app.inject({
      method: 'GET',
      url: '/api/admin/system/status',
      headers: { cookie: adminCookie },
    });
    expect(adminSystemStatusAfterQuestionReview.statusCode).toBe(200);
    expect(adminSystemStatusAfterQuestionReview.json()).toMatchObject({
      quality: {
        tableExists: true,
        openFlags: 1,
        blockingFlags: 1,
        excludedQuestions: 1,
      },
    });

    const postReviewCreated = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: aliceCookie },
      payload: {
        bankId: fixtureIds.bank,
        mode: 'sequential',
        limit: 4,
      },
    });
    expect(postReviewCreated.statusCode).toBe(200);
    expect(postReviewCreated.json().session.questionCount).toBe(3);
    expect(postReviewCreated.json().questions.map((question: { id: string }) => question.id)).not.toContain(
      fixtureIds.questions.unanswered,
    );

    const bobLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'integration-bob', password: 'bob-secret123' },
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

    const importedCorpus = await app.inject({
      method: 'POST',
      url: '/api/admin/import-jobs',
      headers: { cookie: adminCookie },
      payload: {
        kind: 'full_corpus_import',
        mode: 'import',
        sourceDir: importUuidFixtureDir,
        options: { batchSize: 1, resetBeforeImport: false, generateMappings: true },
      },
    });
    expect(importedCorpus.statusCode).toBe(200);
    expect(importedCorpus.json()).toMatchObject({
      job: {
        kind: 'full_corpus_import',
        mode: 'import',
        status: 'succeeded',
        sourceDir: importUuidFixtureDir,
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
      },
    });

    const importCorpusState = await pool.query<{
      class_count: string;
      question_count: string;
      option_count: string;
      mapping_count: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM classifications WHERE id = '11000000-0000-4000-8000-000000000001') AS class_count,
        (
          SELECT COUNT(*)
          FROM questions
          WHERE id IN (
            '12000000-0000-4000-8000-000000000001',
            '12000000-0000-4000-8000-000000000002'
          )
        ) AS question_count,
        (SELECT COUNT(*) FROM question_options WHERE id = '13000000-0000-4000-8000-000000000001') AS option_count,
        (SELECT COUNT(*) FROM bank_mappings WHERE bank_id = '11000000-0000-4000-8000-000000000001') AS mapping_count
    `);
    expect(importCorpusState.rows[0]).toEqual({
      class_count: '1',
      question_count: '2',
      option_count: '1',
      mapping_count: '1',
    });

    const repeatedImport = await app.inject({
      method: 'POST',
      url: '/api/admin/import-jobs',
      headers: { cookie: adminCookie },
      payload: {
        kind: 'full_corpus_import',
        mode: 'import',
        sourceDir: importUuidFixtureDir,
        options: { batchSize: 1, resetBeforeImport: false, generateMappings: true },
      },
    });
    expect(repeatedImport.statusCode).toBe(200);
    expect(repeatedImport.json()).toMatchObject({
      job: {
        mode: 'import',
        status: 'succeeded',
        summary: { classifications: 1, questions: 2, options: 1, bankMappings: 1 },
      },
    });

    const repeatedImportCorpusState = await pool.query<{
      class_count: string;
      question_count: string;
      option_count: string;
      mapping_count: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM classifications WHERE id = '11000000-0000-4000-8000-000000000001') AS class_count,
        (
          SELECT COUNT(*)
          FROM questions
          WHERE id IN (
            '12000000-0000-4000-8000-000000000001',
            '12000000-0000-4000-8000-000000000002'
          )
        ) AS question_count,
        (SELECT COUNT(*) FROM question_options WHERE id = '13000000-0000-4000-8000-000000000001') AS option_count,
        (SELECT COUNT(*) FROM bank_mappings WHERE bank_id = '11000000-0000-4000-8000-000000000001') AS mapping_count
    `);
    expect(repeatedImportCorpusState.rows[0]).toEqual(importCorpusState.rows[0]);

    const failedImport = await app.inject({
      method: 'POST',
      url: '/api/admin/import-jobs',
      headers: { cookie: adminCookie },
      payload: {
        kind: 'full_corpus_import',
        mode: 'import',
        sourceDir: importBadFixtureDir,
        options: { batchSize: 1, resetBeforeImport: false, generateMappings: true },
      },
    });
    expect(failedImport.statusCode).toBe(200);
    expect(failedImport.json()).toMatchObject({
      job: {
        mode: 'import',
        status: 'failed',
        progress: { phase: 'failed', current: 0, total: 0 },
        errorSummary: [expect.objectContaining({ message: expect.any(String) })],
      },
    });
    const failedImportJobId = failedImport.json().job.id as string;
    expect(failedImport.json().job.errorSummary[0].message).toContain('questions_classification_id_fkey');

    const rollbackState = await pool.query<{ rolled_back_class_count: string }>(`
      SELECT COUNT(*) AS rolled_back_class_count
      FROM classifications
      WHERE id = '11000000-0000-4000-8000-000000000099'
    `);
    expect(rollbackState.rows[0]).toEqual({ rolled_back_class_count: '0' });

    const failedImportErrors = await app.inject({
      method: 'GET',
      url: `/api/admin/import-jobs/${failedImportJobId}/errors`,
      headers: { cookie: adminCookie },
    });
    expect(failedImportErrors.statusCode).toBe(200);
    expect(failedImportErrors.json()).toMatchObject({
      jobId: failedImportJobId,
      status: 'failed',
      errorSummary: [expect.objectContaining({ message: expect.any(String) })],
    });

    const learningDashboard = await app.inject({
      method: 'GET',
      url: '/api/learning/dashboard?recentLimit=1',
      headers: { cookie: aliceCookie },
    });
    expect(learningDashboard.statusCode).toBe(200);
    expect(learningDashboard.json()).toMatchObject({
      generatedAt: expect.any(String),
      summary: {
        activeSessions: 3,
        completedSessions: 1,
        reviewSessions: 1,
        attempts: 3,
        gradedAttempts: 3,
        correctAttempts: 2,
        accuracy: 0.6667,
        wrongQuestions: 1,
        masteredWrongQuestions: 1,
        pendingWrongQuestions: 0,
        lastPracticedAt: expect.any(String),
      },
      recentBanks: [{
        bankId: fixtureIds.bank,
        bankName: '数据库集成测试题库',
        sessions: 4,
        completedSessions: 1,
        attempts: 3,
        gradedAttempts: 3,
        correctAttempts: 2,
        accuracy: 0.6667,
        wrongQuestions: 1,
      }],
      questionTypes: expect.arrayContaining([
        expect.objectContaining({
          questionType: 'single_choice',
          attempts: 1,
          gradedAttempts: 1,
          correctAttempts: 1,
          accuracy: 1,
          wrongQuestions: 0,
        }),
        expect.objectContaining({
          questionType: 'multiple_choice',
          attempts: 1,
          gradedAttempts: 1,
          correctAttempts: 0,
          accuracy: 0,
          wrongQuestions: 1,
        }),
        expect.objectContaining({
          questionType: 'yes_no',
          attempts: 1,
          gradedAttempts: 1,
          correctAttempts: 1,
          accuracy: 1,
          wrongQuestions: 0,
        }),
      ]),
      wrongbook: {
        total: 1,
        mastered: 1,
        pending: 0,
        lastWrongAt: expect.any(String),
      },
    });
    expect(learningDashboard.json().recentBanks).toHaveLength(1);

    const learningTrends = await app.inject({
      method: 'GET',
      url: '/api/learning/trends?days=7',
      headers: { cookie: aliceCookie },
    });
    expect(learningTrends.statusCode).toBe(200);
    const learningTrendsBody = learningTrends.json();
    expect(learningTrendsBody).toMatchObject({
      generatedAt: expect.any(String),
      fromDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      toDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      days: 7,
      summary: {
        days: 7,
        sessionsStarted: 4,
        sessionsCompleted: 1,
        attempts: 3,
        gradedAttempts: 3,
        correctAttempts: 2,
        accuracy: 0.6667,
        wrongQuestionsTouched: 1,
      },
    });
    expect(learningTrendsBody.daily).toHaveLength(7);
    expect(learningTrendsBody.daily[0].date).toBe(learningTrendsBody.fromDate);
    expect(learningTrendsBody.daily.at(-1).date).toBe(learningTrendsBody.toDate);
    expect(learningTrendsBody.daily).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sessionsStarted: 4,
        sessionsCompleted: 1,
        attempts: 3,
        gradedAttempts: 3,
        correctAttempts: 2,
        accuracy: 0.6667,
        wrongQuestionsTouched: 1,
      }),
    ]));
    expect(learningTrendsBody.summary.activeDays).toBeGreaterThanOrEqual(1);
    expect(learningTrendsBody.summary.currentStreakDays).toBeGreaterThanOrEqual(1);
    expect(learningTrendsBody.summary.longestStreakDays).toBeGreaterThanOrEqual(
      learningTrendsBody.summary.currentStreakDays,
    );

    const learningGoals = await app.inject({
      method: 'GET',
      url: '/api/learning/goals',
      headers: { cookie: aliceCookie },
    });
    expect(learningGoals.statusCode).toBe(200);
    expect(learningGoals.json()).toMatchObject({
      generatedAt: expect.any(String),
      goals: {
        dailyAttemptsTarget: 20,
        weeklyActiveDaysTarget: 5,
        wrongQuestionsReviewTarget: 10,
        source: 'default',
        updatedAt: null,
      },
      progress: {
        today: {
          date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          attempts: 3,
          gradedAttempts: 3,
          correctAttempts: 2,
          accuracy: 0.6667,
          dailyAttempts: { current: 3, target: 20, completed: false, remaining: 17 },
        },
        week: {
          fromDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          toDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          attempts: 3,
          gradedAttempts: 3,
          correctAttempts: 2,
          accuracy: 0.6667,
        },
        wrongbook: {
          total: 1,
          mastered: 1,
          pending: 0,
          reviewedToday: 0,
          wrongQuestionsReview: { current: 0, target: 10, completed: true, remaining: 0 },
        },
      },
      feedback: expect.arrayContaining([
        expect.objectContaining({ type: 'wrongbook_review_goal', severity: 'success' }),
      ]),
    });
    expect(learningGoals.json().progress.week.activeDays).toBeGreaterThanOrEqual(1);

    const updatedLearningGoals = await app.inject({
      method: 'PUT',
      url: '/api/learning/goals',
      headers: { cookie: aliceCookie },
      payload: {
        dailyAttemptsTarget: 3,
        weeklyActiveDaysTarget: 1,
        wrongQuestionsReviewTarget: 1,
      },
    });
    expect(updatedLearningGoals.statusCode).toBe(200);
    expect(updatedLearningGoals.json()).toMatchObject({
      goals: {
        dailyAttemptsTarget: 3,
        weeklyActiveDaysTarget: 1,
        wrongQuestionsReviewTarget: 1,
        source: 'student',
        updatedAt: expect.any(String),
      },
      progress: {
        today: {
          dailyAttempts: { current: 3, target: 3, completed: true, remaining: 0 },
        },
        week: {
          weeklyActiveDays: { target: 1, completed: true, remaining: 0 },
        },
        wrongbook: {
          wrongQuestionsReview: { current: 0, target: 1, completed: true, remaining: 0 },
        },
      },
      feedback: expect.arrayContaining([
        expect.objectContaining({ type: 'daily_attempts_goal', severity: 'success' }),
        expect.objectContaining({ type: 'weekly_active_days_goal', severity: 'success' }),
      ]),
    });

    const learningGoalState = await pool.query<{ goal_count: string }>(`
      SELECT COUNT(*) AS goal_count
      FROM student_learning_goals
      WHERE student_id = $1
        AND daily_attempts_target = 3
        AND weekly_active_days_target = 1
        AND wrong_questions_review_target = 1
    `, [aliceId]);
    expect(learningGoalState.rows[0]).toEqual({ goal_count: '1' });

    const createdReviewMark = await app.inject({
      method: 'PUT',
      url: '/api/learning/review-marks',
      headers: { cookie: aliceCookie },
      payload: {
        questionId: fixtureIds.questions.multipleWrong,
        bankId: fixtureIds.bank,
        favorite: true,
        longTermReview: true,
        note: 'Review ACID question again.',
        source: 'manual',
      },
    });
    expect(createdReviewMark.statusCode).toBe(200);
    expect(createdReviewMark.json()).toMatchObject({
      reviewMark: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        questionId: fixtureIds.questions.multipleWrong,
        bankId: fixtureIds.bank,
        bankName: '数据库集成测试题库',
        subjectCategory: '质量保障',
        subjectName: 'PostgreSQL',
        questionType: 'multiple_choice',
        contentPreview: expect.stringContaining('ACID'),
        favorite: true,
        longTermReview: true,
        note: 'Review ACID question again.',
        source: 'manual',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
    const reviewMarkId = createdReviewMark.json().reviewMark.id as string;

    const listedReviewMarks = await app.inject({
      method: 'GET',
      url: '/api/learning/review-marks?kind=long_term_review&limit=10&offset=0',
      headers: { cookie: aliceCookie },
    });
    expect(listedReviewMarks.statusCode).toBe(200);
    expect(listedReviewMarks.json()).toMatchObject({
      reviewMarks: [expect.objectContaining({
        id: reviewMarkId,
        questionId: fixtureIds.questions.multipleWrong,
        longTermReview: true,
      })],
      page: { limit: 10, offset: 0, hasMore: false },
    });

    const bobReviewMarks = await app.inject({
      method: 'GET',
      url: '/api/learning/review-marks',
      headers: { cookie: bobCookie },
    });
    expect(bobReviewMarks.statusCode).toBe(200);
    expect(bobReviewMarks.json()).toEqual({
      reviewMarks: [],
      page: { limit: 20, offset: 0, hasMore: false },
    });

    const bookmarkState = await pool.query<{ bookmark_count: string }>(`
      SELECT COUNT(*) AS bookmark_count
      FROM question_bookmarks
      WHERE student_id = $1
        AND question_id = $2
        AND bank_id = $3
        AND favorite = true
        AND long_term_review = true
    `, [aliceId, fixtureIds.questions.multipleWrong, fixtureIds.bank]);
    expect(bookmarkState.rows[0]).toEqual({ bookmark_count: '1' });

    const deletedReviewMark = await app.inject({
      method: 'DELETE',
      url: `/api/learning/review-marks/${reviewMarkId}`,
      headers: { cookie: aliceCookie },
    });
    expect(deletedReviewMark.statusCode).toBe(200);
    expect(deletedReviewMark.json()).toEqual({ success: true });

    const afterDeleteReviewMarks = await app.inject({
      method: 'GET',
      url: '/api/learning/review-marks',
      headers: { cookie: aliceCookie },
    });
    expect(afterDeleteReviewMarks.statusCode).toBe(200);
    expect(afterDeleteReviewMarks.json()).toEqual({
      reviewMarks: [],
      page: { limit: 20, offset: 0, hasMore: false },
    });

    const resetImport = await app.inject({
      method: 'POST',
      url: '/api/admin/import-jobs',
      headers: { cookie: superAdminCookie },
      payload: {
        kind: 'full_corpus_import',
        mode: 'import',
        sourceDir: importUuidFixtureDir,
        options: { batchSize: 1, resetBeforeImport: true, generateMappings: true },
      },
    });
    expect(resetImport.statusCode).toBe(200);
    expect(resetImport.json()).toMatchObject({
      job: {
        kind: 'full_corpus_import',
        mode: 'import',
        status: 'succeeded',
        options: { resetBeforeImport: true },
        progress: { phase: 'done', current: 2, total: 2 },
        summary: { classifications: 1, questions: 2, options: 1, bankMappings: 1 },
      },
    });
    const resetImportState = await pool.query<{
      old_bank_count: string;
      imported_bank_count: string;
      imported_question_count: string;
      practice_session_count: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM classifications WHERE id = $1) AS old_bank_count,
        (SELECT COUNT(*) FROM classifications WHERE id = '11000000-0000-4000-8000-000000000001') AS imported_bank_count,
        (
          SELECT COUNT(*)
          FROM questions
          WHERE id IN (
            '12000000-0000-4000-8000-000000000001',
            '12000000-0000-4000-8000-000000000002'
          )
        ) AS imported_question_count,
        (SELECT COUNT(*) FROM practice_sessions) AS practice_session_count
    `, [fixtureIds.bank]);
    expect(resetImportState.rows[0]).toEqual({
      old_bank_count: '0',
      imported_bank_count: '1',
      imported_question_count: '2',
      practice_session_count: '0',
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

async function seedIntegrationStudent(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<unknown> },
  studentId: string,
  loginName: string,
  displayName: string,
  password: string,
) {
  const passwordHash = await hashPassword(password);
  const now = new Date('2026-07-14T10:00:00.000Z');
  await client.query(
    `
      INSERT INTO students (
        id,
        login_name,
        display_name,
        password_hash,
        status,
        password_reset_required,
        password_changed_at,
        failed_login_count,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'active', false, $5, 0, $5, $5)
    `,
    [studentId, loginName, displayName, passwordHash, now],
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
