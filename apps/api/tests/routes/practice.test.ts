import { describe, expect, it } from 'vitest';
import type { createSessionService } from '../../src/auth/session';
import { buildApp } from '../../src/app';
import { CompletedSessionError, type PracticeRepository } from '../../src/practice/repository';

type SessionService = ReturnType<typeof createSessionService>;

const bankId = '00000000-0000-0000-0000-000000000001';
const sessionId = '00000000-0000-0000-0000-000000000002';
const questionId = '00000000-0000-0000-0000-000000000003';

function fakeLoggedInSessionService(studentId = 'student-1'): SessionService {
  return {
    async createSession() {
      return { token: 'token', expiresAt: new Date('2030-01-01T00:00:00.000Z') };
    },
    async resolveStudent(token) {
      return token ? { id: studentId, loginName: 'alice', displayName: 'Alice' } : null;
    },
    async revokeSession() {},
  };
}

function sessionPayload(currentSessionId = sessionId) {
  return {
    session: {
      id: currentSessionId,
      bankId,
      mode: 'random' as const,
      questionCount: 1,
      completedCount: 0,
      correctCount: 0,
      status: 'active' as const,
    },
    questions: [
      {
        id: questionId,
        sort: 1,
        type: 'single_choice',
        content: 'Question 1',
        options: [{ id: 'option-1', sort: 1, content: 'A' }],
        answered: false,
      },
    ],
  };
}

function fakePracticeRepository(options: { missingSession?: boolean; missingAnswer?: boolean; completedAnswer?: boolean } = {}) {
  const createdSessions: Parameters<PracticeRepository['createSession']>[0][] = [];
  const requestedSessions: Parameters<PracticeRepository['getSession']>[0][] = [];
  const submittedAnswers: Parameters<PracticeRepository['submitAnswer']>[0][] = [];
  const repository: PracticeRepository = {
    async createSession(input) {
      createdSessions.push(input);
      return sessionPayload();
    },
    async getSession(input) {
      requestedSessions.push(input);
      return options.missingSession ? null : sessionPayload(input.sessionId);
    },
    async submitAnswer(input) {
      submittedAnswers.push(input);
      if (options.completedAnswer) {
        throw new CompletedSessionError();
      }
      if (options.missingAnswer) {
        return null;
      }

      return {
        result: {
          questionId: input.questionId,
          isCorrect: true,
          correctAnswer: ['option-1'],
          needsSelfReview: false,
        },
        session: { completedCount: 1, correctCount: 1, status: 'completed' },
      };
    },
  };

  return { repository, createdSessions, requestedSessions, submittedAnswers };
}

describe('practice routes', () => {
  it('returns 401 when creating a practice session without login', async () => {
    const { repository } = fakePracticeRepository();
    const app = buildApp({ practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      payload: { bankId: 'bank-1' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('creates a random 70-question objective practice session by default', async () => {
    const { repository, createdSessions } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(sessionPayload());
    expect(createdSessions).toEqual([
      {
        studentId: 'student-1',
        bankId,
        mode: 'random',
        limit: 70,
        questionTypes: ['single_choice', 'multiple_choice', 'yes_no'],
      },
    ]);
  });

  it('returns 400 when creating a practice session with a malformed bankId', async () => {
    const { repository, createdSessions } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId: 'not-a-uuid' },
    });

    expect(response.statusCode).toBe(400);
    expect(createdSessions).toEqual([]);
  });

  it('accepts canonical UUIDs when creating a practice session', async () => {
    const { repository, createdSessions } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId },
    });

    expect(response.statusCode).toBe(200);
    expect(createdSessions).toHaveLength(1);
    expect(createdSessions[0]?.bankId).toBe(bankId);
  });

  it('validates invalid mode, invalid limit, and missing bankId', async () => {
    const { repository } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const invalidMode = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId, mode: 'latest' },
    });
    const invalidLimit = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId, limit: 201 },
    });
    const missingBankId = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { mode: 'random' },
    });

    expect(invalidMode.statusCode).toBe(400);
    expect(invalidLimit.statusCode).toBe(400);
    expect(missingBankId.statusCode).toBe(400);
  });

  it('validates questionTypes entries', async () => {
    const { repository } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const emptyQuestionTypes = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId, questionTypes: [] },
    });
    const emptyQuestionType = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId, questionTypes: [''] },
    });
    const whitespaceQuestionType = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId, questionTypes: ['   '] },
    });
    const nonStringQuestionType = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId, questionTypes: ['single_choice', 3] },
    });

    expect(emptyQuestionTypes.statusCode).toBe(400);
    expect(emptyQuestionType.statusCode).toBe(400);
    expect(whitespaceQuestionType.statusCode).toBe(400);
    expect(nonStringQuestionType.statusCode).toBe(400);
  });

  it('validates lower-bound and non-integer limits', async () => {
    const { repository } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const zeroLimit = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId, limit: 0 },
    });
    const nonIntegerLimit = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId, limit: 1.5 },
    });

    expect(zeroLimit.statusCode).toBe(400);
    expect(nonIntegerLimit.statusCode).toBe(400);
  });

  it('returns 401 when reading a practice session without login', async () => {
    const { repository } = fakePracticeRepository();
    const app = buildApp({ practiceRepository: repository });

    const response = await app.inject({ method: 'GET', url: `/api/practice/sessions/${sessionId}` });

    expect(response.statusCode).toBe(401);
  });

  it('returns a session for the current student', async () => {
    const { repository, requestedSessions } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'GET',
      url: `/api/practice/sessions/${sessionId}`,
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(sessionPayload(sessionId));
    expect(requestedSessions).toEqual([{ studentId: 'student-1', sessionId }]);
  });

  it('returns 400 when reading a practice session with a malformed sessionId', async () => {
    const { repository, requestedSessions } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions/not-a-uuid',
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(400);
    expect(requestedSessions).toEqual([]);
  });

  it('returns 404 when a session is missing or not owned by the current student', async () => {
    const { repository } = fakePracticeRepository({ missingSession: true });
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions/00000000-0000-0000-0000-000000000004',
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('submits an answer for the current student', async () => {
    const { repository, submittedAnswers } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: `/api/practice/sessions/${sessionId}/answers`,
      headers: { cookie: 'bky_session=token' },
      payload: { questionId, answer: ['option-1'] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      result: {
        questionId,
        isCorrect: true,
        correctAnswer: ['option-1'],
        needsSelfReview: false,
      },
      session: { completedCount: 1, correctCount: 1, status: 'completed' },
    });
    expect(submittedAnswers).toEqual([
      {
        studentId: 'student-1',
        sessionId,
        questionId,
        answer: ['option-1'],
      },
    ]);
  });

  it('returns 401 when submitting an answer without login', async () => {
    const { repository } = fakePracticeRepository();
    const app = buildApp({ practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: `/api/practice/sessions/${sessionId}/answers`,
      payload: { questionId: 'question-1', answer: 'A' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 400 for malformed answer submission bodies', async () => {
    const { repository } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const missingQuestionId = await app.inject({
      method: 'POST',
      url: `/api/practice/sessions/${sessionId}/answers`,
      headers: { cookie: 'bky_session=token' },
      payload: { answer: 'A' },
    });
    const malformedAnswer = await app.inject({
      method: 'POST',
      url: `/api/practice/sessions/${sessionId}/answers`,
      headers: { cookie: 'bky_session=token' },
      payload: { questionId, answer: { option: 'A' } },
    });

    expect(missingQuestionId.statusCode).toBe(400);
    expect(malformedAnswer.statusCode).toBe(400);
  });

  it('returns 400 when submitting an answer with a malformed sessionId', async () => {
    const { repository, submittedAnswers } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions/not-a-uuid/answers',
      headers: { cookie: 'bky_session=token' },
      payload: { questionId, answer: ['option-1'] },
    });

    expect(response.statusCode).toBe(400);
    expect(submittedAnswers).toEqual([]);
  });

  it('returns 400 when submitting an answer with a malformed questionId', async () => {
    const { repository, submittedAnswers } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: `/api/practice/sessions/${sessionId}/answers`,
      headers: { cookie: 'bky_session=token' },
      payload: { questionId: 'not-a-uuid', answer: ['option-1'] },
    });

    expect(response.statusCode).toBe(400);
    expect(submittedAnswers).toEqual([]);
  });

  it('returns 404 when submitting to a missing or unowned session question', async () => {
    const { repository } = fakePracticeRepository({ missingAnswer: true });
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: `/api/practice/sessions/${sessionId}/answers`,
      headers: { cookie: 'bky_session=token' },
      payload: { questionId, answer: false },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 409 when submitting to a completed session', async () => {
    const { repository } = fakePracticeRepository({ completedAnswer: true });
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: `/api/practice/sessions/${sessionId}/answers`,
      headers: { cookie: 'bky_session=token' },
      payload: { questionId, answer: true },
    });

    expect(response.statusCode).toBe(409);
  });
});
