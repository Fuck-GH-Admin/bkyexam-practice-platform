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
      currentSort: 1,
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
        markedForReview: false,
      },
    ],
  };
}

function sessionCard(status: 'active' | 'completed' = 'active') {
  return {
    id: sessionId,
    bankId,
    bankName: '测试题库',
    origin: 'bank' as const,
    mode: 'random' as const,
    questionCount: 1,
    answeredCount: 0,
    correctCount: 0,
    reviewCount: 0,
    currentSort: 1,
    status,
    createdAt: '2026-07-11T08:00:00.000Z',
    updatedAt: '2026-07-11T08:01:00.000Z',
    completedAt: status === 'completed' ? '2026-07-11T08:02:00.000Z' : null,
  };
}

function fakePracticeRepository(options: {
  missingSession?: boolean;
  missingAnswer?: boolean;
  completedAnswer?: boolean;
  missingProgress?: boolean;
  missingDraft?: boolean;
  missingReviewFlag?: boolean;
  missingSubmitSession?: boolean;
  completedSessionWrite?: boolean;
  invalidSessionList?: boolean;
} = {}) {
  const createdSessions: Parameters<PracticeRepository['createSession']>[0][] = [];
  const requestedSessions: Parameters<PracticeRepository['getSession']>[0][] = [];
  const requestedActiveSessions: Parameters<PracticeRepository['listActiveSessions']>[0][] = [];
  const requestedSessionLists: Parameters<PracticeRepository['listSessions']>[0][] = [];
  const savedProgress: Parameters<PracticeRepository['saveProgress']>[0][] = [];
  const savedDrafts: Parameters<PracticeRepository['saveDraft']>[0][] = [];
  const clearedDrafts: Parameters<PracticeRepository['clearDraft']>[0][] = [];
  const reviewFlags: Parameters<PracticeRepository['setReviewFlag']>[0][] = [];
  const submittedAnswers: Parameters<PracticeRepository['submitAnswer']>[0][] = [];
  const submittedSessions: Parameters<PracticeRepository['submitSession']>[0][] = [];
  const activeSessions = [sessionPayload().session];
  const repository: PracticeRepository = {
    async createSession(input) {
      createdSessions.push(input);
      return sessionPayload();
    },
    async getSession(input) {
      requestedSessions.push(input);
      return options.missingSession ? null : sessionPayload(input.sessionId);
    },
    async listActiveSessions(input) {
      requestedActiveSessions.push(input);
      return activeSessions;
    },
    async listSessions(input) {
      requestedSessionLists.push(input);
      if (options.invalidSessionList) {
        return {
          sessions: [{ ...sessionCard('completed'), completedAt: null }],
          page: { limit: input.limit, offset: input.offset, hasMore: false },
        } as never;
      }
      return {
        sessions: [sessionCard(input.status)],
        page: { limit: input.limit, offset: input.offset, hasMore: false },
      };
    },
    async saveProgress(input) {
      savedProgress.push(input);
      if (options.completedSessionWrite) {
        throw new CompletedSessionError();
      }
      return options.missingProgress ? null : { ...sessionPayload(input.sessionId).session, currentSort: input.currentSort };
    },
    async saveDraft(input) {
      savedDrafts.push(input);
      if (options.completedSessionWrite) {
        throw new CompletedSessionError();
      }
      return options.missingDraft ? null : { ...sessionPayload(input.sessionId).questions[0]!, draftAnswer: input.answer };
    },
    async clearDraft(input) {
      clearedDrafts.push(input);
      if (options.completedSessionWrite) {
        throw new CompletedSessionError();
      }
      return !options.missingDraft;
    },
    async setReviewFlag(input) {
      reviewFlags.push(input);
      if (options.completedSessionWrite) {
        throw new CompletedSessionError();
      }
      return options.missingReviewFlag
        ? null
        : { ...sessionPayload(input.sessionId).questions[0]!, markedForReview: input.markedForReview };
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
    async submitSession(input) {
      submittedSessions.push(input);
      if (options.completedSessionWrite) {
        throw new CompletedSessionError();
      }
      return options.missingSubmitSession
        ? null
        : {
          session: { ...sessionPayload(input.sessionId).session, status: 'completed' },
          results: [
            {
              questionId,
              isCorrect: true,
              correctAnswer: ['option-1'],
              needsSelfReview: false,
            },
          ],
        };
    },
  };

  return {
    repository,
    createdSessions,
    requestedSessions,
    requestedActiveSessions,
    requestedSessionLists,
    savedProgress,
    savedDrafts,
    clearedDrafts,
    reviewFlags,
    submittedAnswers,
    submittedSessions,
    activeSessions,
  };
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

  it('fails closed when a repository returns a payload outside the v1 practice contract', async () => {
    const { repository } = fakePracticeRepository();
    repository.createSession = async () => ({
      ...sessionPayload(),
      session: {
        ...sessionPayload().session,
        completedCount: 2,
      },
    } as never);
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
      payload: { bankId },
    });

    expect(response.statusCode).toBe(500);
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

  it('lists active sessions for the current student', async () => {
    const { repository, requestedSessions, requestedActiveSessions, activeSessions } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const unauthenticated = await app.inject({ method: 'GET', url: '/api/practice/sessions/active' });
    const response = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions/active',
      headers: { cookie: 'bky_session=token' },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(activeSessions);
    expect(requestedActiveSessions).toEqual([{ studentId: 'student-1' }]);
    expect(requestedSessions).toEqual([]);
  });

  it('lists active and completed session cards with bounded paging for the current student', async () => {
    const { repository, requestedSessionLists } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const active = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions?status=active&limit=1&offset=2',
      headers: { cookie: 'bky_session=token' },
    });
    const completed = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions?status=completed',
      headers: { cookie: 'bky_session=token' },
    });

    expect(active.statusCode).toBe(200);
    expect(active.json()).toEqual({
      sessions: [sessionCard('active')],
      page: { limit: 1, offset: 2, hasMore: false },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toEqual({
      sessions: [sessionCard('completed')],
      page: { limit: 20, offset: 0, hasMore: false },
    });
    expect(requestedSessionLists).toEqual([
      { studentId: 'student-1', status: 'active', limit: 1, offset: 2 },
      { studentId: 'student-1', status: 'completed', limit: 20, offset: 0 },
    ]);
  });

  it('rejects unauthenticated and invalid session-list queries before calling the repository', async () => {
    const { repository, requestedSessionLists } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const unauthenticated = await app.inject({ method: 'GET', url: '/api/practice/sessions?status=active' });
    const missingStatus = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions',
      headers: { cookie: 'bky_session=token' },
    });
    const invalidStatus = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions?status=archived',
      headers: { cookie: 'bky_session=token' },
    });
    const invalidLimit = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions?status=active&limit=51',
      headers: { cookie: 'bky_session=token' },
    });
    const invalidOffset = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions?status=active&offset=-1',
      headers: { cookie: 'bky_session=token' },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(missingStatus.statusCode).toBe(400);
    expect(invalidStatus.statusCode).toBe(400);
    expect(invalidLimit.statusCode).toBe(400);
    expect(invalidOffset.statusCode).toBe(400);
    expect(requestedSessionLists).toEqual([]);
  });

  it('fails closed when a repository returns an invalid session card', async () => {
    const { repository } = fakePracticeRepository({ invalidSessionList: true });
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'GET',
      url: '/api/practice/sessions?status=completed',
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(500);
  });

  it('saves practice session progress for the current student', async () => {
    const { repository, savedProgress } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/progress`,
      headers: { cookie: 'bky_session=token' },
      payload: { currentSort: 2 },
    });
    const malformedSession = await app.inject({
      method: 'PATCH',
      url: '/api/practice/sessions/not-a-uuid/progress',
      headers: { cookie: 'bky_session=token' },
      payload: { currentSort: 2 },
    });
    const uppercaseSession = await app.inject({
      method: 'PATCH',
      url: '/api/practice/sessions/AAAAAAAA-0000-0000-0000-000000000002/progress',
      headers: { cookie: 'bky_session=token' },
      payload: { currentSort: 2 },
    });
    const invalidProgress = await app.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/progress`,
      headers: { cookie: 'bky_session=token' },
      payload: { currentSort: 201 },
    });
    const zeroProgress = await app.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/progress`,
      headers: { cookie: 'bky_session=token' },
      payload: { currentSort: 0 },
    });
    const decimalProgress = await app.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/progress`,
      headers: { cookie: 'bky_session=token' },
      payload: { currentSort: 1.5 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...sessionPayload(sessionId).session, currentSort: 2 });
    expect(savedProgress).toEqual([{ studentId: 'student-1', sessionId, currentSort: 2 }]);
    expect(malformedSession.statusCode).toBe(400);
    expect(uppercaseSession.statusCode).toBe(400);
    expect(uppercaseSession.json()).toEqual({ error: 'sessionId must be a valid UUID' });
    expect(invalidProgress.statusCode).toBe(400);
    expect(invalidProgress.json()).toEqual({ error: 'currentSort must be an integer between 1 and 200' });
    expect(zeroProgress.statusCode).toBe(400);
    expect(zeroProgress.json()).toEqual({ error: 'currentSort must be an integer between 1 and 200' });
    expect(decimalProgress.statusCode).toBe(400);
    expect(decimalProgress.json()).toEqual({ error: 'currentSort must be an integer between 1 and 200' });
  });

  it('returns progress write errors without saving progress', async () => {
    const missing = fakePracticeRepository({ missingProgress: true });
    const completed = fakePracticeRepository({ completedSessionWrite: true });
    const unauthenticatedApp = buildApp({ practiceRepository: fakePracticeRepository().repository });
    const missingApp = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: missing.repository });
    const completedApp = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: completed.repository });

    const unauthenticated = await unauthenticatedApp.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/progress`,
      payload: { currentSort: 2 },
    });
    const missingResponse = await missingApp.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/progress`,
      headers: { cookie: 'bky_session=token' },
      payload: { currentSort: 2 },
    });
    const completedResponse = await completedApp.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/progress`,
      headers: { cookie: 'bky_session=token' },
      payload: { currentSort: 2 },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(missingResponse.statusCode).toBe(404);
    expect(completedResponse.statusCode).toBe(409);
  });

  it('saves and clears draft answers for the current student', async () => {
    const { repository, savedDrafts, clearedDrafts } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/practice/sessions/${sessionId}/drafts/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { answer: ['option-1'] },
    });
    const cleared = await app.inject({
      method: 'DELETE',
      url: `/api/practice/sessions/${sessionId}/drafts/${questionId}`,
      headers: { cookie: 'bky_session=token' },
    });
    const malformedQuestion = await app.inject({
      method: 'PUT',
      url: `/api/practice/sessions/${sessionId}/drafts/not-a-uuid`,
      headers: { cookie: 'bky_session=token' },
      payload: { answer: ['option-1'] },
    });
    const uppercaseQuestion = await app.inject({
      method: 'PUT',
      url: `/api/practice/sessions/${sessionId}/drafts/AAAAAAAA-0000-0000-0000-000000000003`,
      headers: { cookie: 'bky_session=token' },
      payload: { answer: ['option-1'] },
    });
    const uppercaseSession = await app.inject({
      method: 'PUT',
      url: `/api/practice/sessions/AAAAAAAA-0000-0000-0000-000000000002/drafts/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { answer: ['option-1'] },
    });
    const malformedClearQuestion = await app.inject({
      method: 'DELETE',
      url: `/api/practice/sessions/${sessionId}/drafts/not-a-uuid`,
      headers: { cookie: 'bky_session=token' },
    });
    const uppercaseClearQuestion = await app.inject({
      method: 'DELETE',
      url: `/api/practice/sessions/${sessionId}/drafts/AAAAAAAA-0000-0000-0000-000000000003`,
      headers: { cookie: 'bky_session=token' },
    });
    const invalidAnswer = await app.inject({
      method: 'PUT',
      url: `/api/practice/sessions/${sessionId}/drafts/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { answer: { option: 'option-1' } },
    });
    const emptyOptionId = await app.inject({
      method: 'PUT',
      url: `/api/practice/sessions/${sessionId}/drafts/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { answer: [''] },
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ ...sessionPayload(sessionId).questions[0], draftAnswer: ['option-1'] });
    expect(savedDrafts).toEqual([{ studentId: 'student-1', sessionId, questionId, answer: ['option-1'] }]);
    expect(cleared.statusCode).toBe(204);
    expect(cleared.body).toBe('');
    expect(clearedDrafts).toEqual([{ studentId: 'student-1', sessionId, questionId }]);
    expect(malformedQuestion.statusCode).toBe(400);
    expect(uppercaseQuestion.statusCode).toBe(400);
    expect(uppercaseQuestion.json()).toEqual({ error: 'questionId must be a valid UUID' });
    expect(uppercaseSession.statusCode).toBe(400);
    expect(uppercaseSession.json()).toEqual({ error: 'sessionId must be a valid UUID' });
    expect(malformedClearQuestion.statusCode).toBe(400);
    expect(malformedClearQuestion.json()).toEqual({ error: 'questionId must be a valid UUID' });
    expect(uppercaseClearQuestion.statusCode).toBe(400);
    expect(uppercaseClearQuestion.json()).toEqual({ error: 'questionId must be a valid UUID' });
    expect(invalidAnswer.statusCode).toBe(400);
    expect(emptyOptionId.statusCode).toBe(400);
  });

  it('returns draft write errors', async () => {
    const missing = fakePracticeRepository({ missingDraft: true });
    const completed = fakePracticeRepository({ completedSessionWrite: true });
    const unauthenticatedApp = buildApp({ practiceRepository: fakePracticeRepository().repository });
    const missingApp = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: missing.repository });
    const completedApp = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: completed.repository });

    const unauthenticated = await unauthenticatedApp.inject({
      method: 'PUT',
      url: `/api/practice/sessions/${sessionId}/drafts/${questionId}`,
      payload: { answer: ['option-1'] },
    });
    const unauthenticatedClear = await unauthenticatedApp.inject({
      method: 'DELETE',
      url: `/api/practice/sessions/${sessionId}/drafts/${questionId}`,
    });
    const missingSave = await missingApp.inject({
      method: 'PUT',
      url: `/api/practice/sessions/${sessionId}/drafts/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { answer: ['option-1'] },
    });
    const missingClear = await missingApp.inject({
      method: 'DELETE',
      url: `/api/practice/sessions/${sessionId}/drafts/${questionId}`,
      headers: { cookie: 'bky_session=token' },
    });
    const completedSave = await completedApp.inject({
      method: 'PUT',
      url: `/api/practice/sessions/${sessionId}/drafts/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { answer: ['option-1'] },
    });
    const completedClear = await completedApp.inject({
      method: 'DELETE',
      url: `/api/practice/sessions/${sessionId}/drafts/${questionId}`,
      headers: { cookie: 'bky_session=token' },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticatedClear.statusCode).toBe(401);
    expect(unauthenticatedClear.json()).toEqual({ error: 'Unauthenticated' });
    expect(missingSave.statusCode).toBe(404);
    expect(missingClear.statusCode).toBe(404);
    expect(completedSave.statusCode).toBe(409);
    expect(completedClear.statusCode).toBe(409);
    expect(completedClear.json()).toEqual({ error: 'Practice session is completed' });
  });

  it('sets review flags for the current student', async () => {
    const { repository, reviewFlags } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/review/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { markedForReview: true },
    });
    const invalidBody = await app.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/review/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { markedForReview: 'yes' },
    });
    const malformedSession = await app.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/not-a-uuid/review/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { markedForReview: true },
    });
    const uppercaseQuestion = await app.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/review/AAAAAAAA-0000-0000-0000-000000000003`,
      headers: { cookie: 'bky_session=token' },
      payload: { markedForReview: true },
    });
    const uppercaseSession = await app.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/AAAAAAAA-0000-0000-0000-000000000002/review/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { markedForReview: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...sessionPayload(sessionId).questions[0], markedForReview: true });
    expect(reviewFlags).toEqual([{ studentId: 'student-1', sessionId, questionId, markedForReview: true }]);
    expect(invalidBody.statusCode).toBe(400);
    expect(malformedSession.statusCode).toBe(400);
    expect(uppercaseQuestion.statusCode).toBe(400);
    expect(uppercaseQuestion.json()).toEqual({ error: 'questionId must be a valid UUID' });
    expect(uppercaseSession.statusCode).toBe(400);
    expect(uppercaseSession.json()).toEqual({ error: 'sessionId must be a valid UUID' });
  });

  it('returns review flag write errors', async () => {
    const missing = fakePracticeRepository({ missingReviewFlag: true });
    const completed = fakePracticeRepository({ completedSessionWrite: true });
    const unauthenticatedApp = buildApp({ practiceRepository: fakePracticeRepository().repository });
    const missingApp = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: missing.repository });
    const completedApp = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: completed.repository });

    const unauthenticated = await unauthenticatedApp.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/review/${questionId}`,
      payload: { markedForReview: true },
    });
    const missingResponse = await missingApp.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/review/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { markedForReview: true },
    });
    const completedResponse = await completedApp.inject({
      method: 'PATCH',
      url: `/api/practice/sessions/${sessionId}/review/${questionId}`,
      headers: { cookie: 'bky_session=token' },
      payload: { markedForReview: true },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(missingResponse.statusCode).toBe(404);
    expect(completedResponse.statusCode).toBe(409);
  });

  it('submits a practice session for the current student', async () => {
    const { repository, submittedSessions } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: `/api/practice/sessions/${sessionId}/submit`,
      headers: { cookie: 'bky_session=token' },
    });
    const malformedSession = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions/not-a-uuid/submit',
      headers: { cookie: 'bky_session=token' },
    });
    const uppercaseSession = await app.inject({
      method: 'POST',
      url: '/api/practice/sessions/AAAAAAAA-0000-0000-0000-000000000002/submit',
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      session: { ...sessionPayload(sessionId).session, status: 'completed' },
      results: [{ questionId, isCorrect: true, correctAnswer: ['option-1'], needsSelfReview: false }],
    });
    expect(submittedSessions).toEqual([{ studentId: 'student-1', sessionId }]);
    expect(malformedSession.statusCode).toBe(400);
    expect(uppercaseSession.statusCode).toBe(400);
    expect(uppercaseSession.json()).toEqual({ error: 'sessionId must be a valid UUID' });
  });

  it('returns submit session errors', async () => {
    const missing = fakePracticeRepository({ missingSubmitSession: true });
    const completed = fakePracticeRepository({ completedSessionWrite: true });
    const unauthenticatedApp = buildApp({ practiceRepository: fakePracticeRepository().repository });
    const missingApp = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: missing.repository });
    const completedApp = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: completed.repository });

    const unauthenticated = await unauthenticatedApp.inject({ method: 'POST', url: `/api/practice/sessions/${sessionId}/submit` });
    const missingResponse = await missingApp.inject({
      method: 'POST',
      url: `/api/practice/sessions/${sessionId}/submit`,
      headers: { cookie: 'bky_session=token' },
    });
    const completedResponse = await completedApp.inject({
      method: 'POST',
      url: `/api/practice/sessions/${sessionId}/submit`,
      headers: { cookie: 'bky_session=token' },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(missingResponse.statusCode).toBe(404);
    expect(completedResponse.statusCode).toBe(409);
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

  it('keeps legacy answer submission compatible with uppercase UUIDs', async () => {
    const { repository, submittedAnswers } = fakePracticeRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), practiceRepository: repository });
    const uppercaseSessionId = 'AAAAAAAA-0000-0000-0000-000000000002';
    const uppercaseQuestionId = 'AAAAAAAA-0000-0000-0000-000000000003';

    const response = await app.inject({
      method: 'POST',
      url: `/api/practice/sessions/${uppercaseSessionId}/answers`,
      headers: { cookie: 'bky_session=token' },
      payload: { questionId: uppercaseQuestionId, answer: ['option-1'] },
    });

    expect(response.statusCode).toBe(200);
    expect(submittedAnswers).toEqual([
      {
        studentId: 'student-1',
        sessionId: uppercaseSessionId,
        questionId: uppercaseQuestionId,
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
