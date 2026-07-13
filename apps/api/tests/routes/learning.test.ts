import { describe, expect, it } from 'vitest';
import type { createSessionService } from '../../src/auth/session';
import { buildApp } from '../../src/app';
import type { LearningDashboardRepository } from '../../src/learning/repository';

type SessionService = ReturnType<typeof createSessionService>;

const studentId = 'student-1';
const bankId = '10000000-0000-4000-8000-000000000001';

function fakeLoggedInSessionService(): SessionService {
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

describe('learning dashboard routes', () => {
  it('requires a student session', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/learning/dashboard' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthenticated' });
  });

  it('returns a typed learning dashboard and forwards the recent bank limit', async () => {
    const requests: Array<{ studentId: string; recentLimit: number }> = [];
    const repository: LearningDashboardRepository = {
      async getDashboard(input) {
        requests.push({ studentId: input.studentId, recentLimit: input.recentLimit });
        return {
          generatedAt: '2026-07-14T10:00:00.000Z',
          summary: {
            activeSessions: 2,
            completedSessions: 1,
            reviewSessions: 1,
            attempts: 3,
            gradedAttempts: 3,
            correctAttempts: 2,
            accuracy: 0.6667,
            wrongQuestions: 1,
            masteredWrongQuestions: 0,
            pendingWrongQuestions: 1,
            lastPracticedAt: '2026-07-14T09:00:00.000Z',
          },
          recentBanks: [{
            bankId,
            bankName: '数据库测试题库',
            subjectCategory: '质量保障',
            subjectName: 'PostgreSQL',
            lastPracticedAt: '2026-07-14T09:00:00.000Z',
            sessions: 3,
            completedSessions: 1,
            attempts: 3,
            gradedAttempts: 3,
            correctAttempts: 2,
            accuracy: 0.6667,
            wrongQuestions: 1,
          }],
          questionTypes: [{
            questionType: 'multiple_choice',
            attempts: 1,
            gradedAttempts: 1,
            correctAttempts: 0,
            accuracy: 0,
            wrongQuestions: 1,
          }],
          wrongbook: {
            total: 1,
            mastered: 0,
            pending: 1,
            lastWrongAt: '2026-07-14T08:59:00.000Z',
          },
        };
      },
    };
    const app = buildApp({
      sessionService: fakeLoggedInSessionService(),
      learningRepository: repository,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/learning/dashboard?recentLimit=1',
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      summary: { attempts: 3, correctAttempts: 2, accuracy: 0.6667 },
      recentBanks: [{ bankId, sessions: 3 }],
      questionTypes: [{ questionType: 'multiple_choice', wrongQuestions: 1 }],
      wrongbook: { total: 1, pending: 1 },
    });
    expect(requests).toEqual([{ studentId, recentLimit: 1 }]);
  });

  it('rejects invalid query and fails closed on invalid repository payloads', async () => {
    const app = buildApp({
      sessionService: fakeLoggedInSessionService(),
      learningRepository: {
        async getDashboard() {
          return {
            generatedAt: '2026-07-14T10:00:00.000Z',
            summary: {
              activeSessions: 0,
              completedSessions: 0,
              reviewSessions: 0,
              attempts: 1,
              gradedAttempts: 1,
              correctAttempts: 2,
              accuracy: 2,
              wrongQuestions: 0,
              masteredWrongQuestions: 0,
              pendingWrongQuestions: 0,
              lastPracticedAt: null,
            },
            recentBanks: [],
            questionTypes: [],
            wrongbook: { total: 0, mastered: 0, pending: 0, lastWrongAt: null },
          };
        },
      } as LearningDashboardRepository,
    });

    const invalidQuery = await app.inject({
      method: 'GET',
      url: '/api/learning/dashboard?recentLimit=11',
      headers: { cookie: 'bky_session=token' },
    });
    expect(invalidQuery.statusCode).toBe(400);

    const invalidPayload = await app.inject({
      method: 'GET',
      url: '/api/learning/dashboard',
      headers: { cookie: 'bky_session=token' },
    });
    expect(invalidPayload.statusCode).toBe(500);
  });
});
