import { describe, expect, it } from 'vitest';
import type { createSessionService } from '../../src/auth/session';
import { buildApp } from '../../src/app';
import type { WrongQuestionItem, WrongQuestionRepository } from '../../src/wrongQuestions/repository';

type SessionService = ReturnType<typeof createSessionService>;

const wrongQuestionId = '11111111-1111-4111-8111-111111111111';
const missingWrongQuestionId = '22222222-2222-4222-8222-222222222222';
const questionId = '33333333-3333-4333-8333-333333333333';
const bankId = '44444444-4444-4444-8444-444444444444';
const filteredBankId = '55555555-5555-4555-8555-555555555555';
const canonicalPostgresUuid = '00000000-0000-0000-0000-000000000001';

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

const wrongQuestion: WrongQuestionItem = {
  id: wrongQuestionId,
  questionId,
  bankId,
  wrongCount: 2,
  lastAnswer: 'A',
  mastered: false,
  lastWrongAt: '2026-01-02T03:04:05.000Z',
};

function fakeWrongQuestionRepository(options: { markMasteredResult?: boolean } = {}) {
  const listRequests: Parameters<WrongQuestionRepository['list']>[0][] = [];
  const markMasteredRequests: Parameters<WrongQuestionRepository['markMastered']>[0][] = [];
  const repository: WrongQuestionRepository = {
    async list(input) {
      listRequests.push(input);
      return [wrongQuestion];
    },
    async markMastered(input) {
      markMasteredRequests.push(input);
      return options.markMasteredResult ?? true;
    },
  };

  return { repository, listRequests, markMasteredRequests };
}

describe('wrong question routes', () => {
  it('returns 401 when listing wrong questions without login', async () => {
    const { repository } = fakeWrongQuestionRepository();
    const app = buildApp({ wrongQuestionRepository: repository });

    const response = await app.inject({ method: 'GET', url: '/api/wrong-questions' });

    expect(response.statusCode).toBe(401);
  });

  it('lists unmastered wrong questions for the current student', async () => {
    const { repository, listRequests } = fakeWrongQuestionRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

    const response = await app.inject({
      method: 'GET',
      url: '/api/wrong-questions',
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ wrongQuestions: [wrongQuestion] });
    expect(listRequests).toEqual([{ studentId: 'student-1', includeMastered: false }]);
  });

  it('passes includeMastered true only when the query param exactly equals true', async () => {
    const { repository, listRequests } = fakeWrongQuestionRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

    await app.inject({
      method: 'GET',
      url: '/api/wrong-questions?includeMastered=true',
      headers: { cookie: 'bky_session=token' },
    });
    await app.inject({
      method: 'GET',
      url: '/api/wrong-questions?includeMastered=True',
      headers: { cookie: 'bky_session=token' },
    });

    expect(listRequests).toEqual([
      { studentId: 'student-1', includeMastered: true },
      { studentId: 'student-1', includeMastered: false },
    ]);
  });

  it('passes bankId filter to the repository', async () => {
    const { repository, listRequests } = fakeWrongQuestionRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

    const response = await app.inject({
      method: 'GET',
      url: `/api/wrong-questions?bankId=${filteredBankId}`,
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(200);
    expect(listRequests).toEqual([{ studentId: 'student-1', bankId: filteredBankId, includeMastered: false }]);
  });

  it('returns 400 for an invalid bankId filter', async () => {
    const { repository, listRequests } = fakeWrongQuestionRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

    const response = await app.inject({
      method: 'GET',
      url: '/api/wrong-questions?bankId=not-a-uuid',
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(400);
    expect(listRequests).toEqual([]);
  });

  it('accepts canonical PostgreSQL UUID bankId values without version or variant bits', async () => {
    const { repository, listRequests } = fakeWrongQuestionRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

    const response = await app.inject({
      method: 'GET',
      url: `/api/wrong-questions?bankId=${canonicalPostgresUuid}`,
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(200);
    expect(listRequests).toEqual([{ studentId: 'student-1', bankId: canonicalPostgresUuid, includeMastered: false }]);
  });

  it('returns 401 when marking mastered without login', async () => {
    const { repository } = fakeWrongQuestionRepository();
    const app = buildApp({ wrongQuestionRepository: repository });

    const response = await app.inject({ method: 'POST', url: `/api/wrong-questions/${wrongQuestionId}/mastered` });

    expect(response.statusCode).toBe(401);
  });

  it('marks a wrong question mastered for the current student', async () => {
    const { repository, markMasteredRequests } = fakeWrongQuestionRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: `/api/wrong-questions/${wrongQuestionId}/mastered`,
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(markMasteredRequests).toEqual([{ studentId: 'student-1', id: wrongQuestionId }]);
  });

  it('returns 400 for an invalid mastered route id', async () => {
    const { repository, markMasteredRequests } = fakeWrongQuestionRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: '/api/wrong-questions/not-a-uuid/mastered',
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(400);
    expect(markMasteredRequests).toEqual([]);
  });

  it('accepts canonical PostgreSQL UUID mastered route ids without version or variant bits', async () => {
    const { repository, markMasteredRequests } = fakeWrongQuestionRepository();
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: `/api/wrong-questions/${canonicalPostgresUuid}/mastered`,
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(200);
    expect(markMasteredRequests).toEqual([{ studentId: 'student-1', id: canonicalPostgresUuid }]);
  });

  it('returns 404 when the wrong question is missing or not owned by the current student', async () => {
    const { repository } = fakeWrongQuestionRepository({ markMasteredResult: false });
    const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: `/api/wrong-questions/${missingWrongQuestionId}/mastered`,
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(404);
  });
});
