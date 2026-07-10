import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgStudentSessionRepository, createSessionService } from '../../src/auth/session.js';
import { createPgStudentAuthRepository } from '../../src/auth/studentAuth.js';
import { buildApp } from '../../src/app.js';
import { createPgPool } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { requireDedicatedTestDatabaseUrl } from '../../src/db/testDatabaseSafety.js';
import { createPgPracticeRepository } from '../../src/practice/repository.js';
import { createPgBankRepository } from '../../src/repositories/bankRepository.js';
import { createPgWrongQuestionRepository } from '../../src/wrongQuestions/repository.js';
import { fixtureIds, resetAndSeedPostgresFixture } from './postgresFixture.js';

const migrationsDir = fileURLToPath(new URL('../../src/db/migrations/', import.meta.url));

describe('PostgreSQL-backed API integration', () => {
  const databaseUrl = requireDedicatedTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const pool = createPgPool(databaseUrl);
  const app = buildApp({
    authRepository: createPgStudentAuthRepository(pool),
    bankRepository: createPgBankRepository(pool),
    practiceRepository: createPgPracticeRepository(pool),
    wrongQuestionRepository: createPgWrongQuestionRepository(pool),
    sessionService: createSessionService(createPgStudentSessionRepository(pool), { ttlDays: 1 }),
    cookieSecret: 'postgres-integration-cookie-secret',
    logger: false,
  });

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await runMigrations(client, migrationsDir);
      await resetAndSeedPostgresFixture(client);
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

    await expectDraftSave(
      app,
      aliceCookie,
      sessionId,
      fixtureIds.questions.singleCorrect,
      [fixtureIds.options.singleCorrect],
    );
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
