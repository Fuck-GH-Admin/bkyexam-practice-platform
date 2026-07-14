import { describe, expect, it } from 'vitest';
import type { createSessionService } from '../../src/auth/session';
import { buildApp } from '../../src/app';
import type { LearningDashboardRepository } from '../../src/learning/repository';

type SessionService = ReturnType<typeof createSessionService>;

const studentId = 'student-1';
const bankId = '10000000-0000-4000-8000-000000000001';
const questionId = '20000000-0000-4000-8000-000000000002';
const reviewMarkId = '80000000-0000-4000-8000-000000000001';

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

const unusedReviewMarkMethods: Pick<
LearningDashboardRepository,
'listReviewMarks' | 'upsertReviewMark' | 'deleteReviewMark'
> = {
  async listReviewMarks() {
    throw new Error('not used by this learning route test');
  },
  async upsertReviewMark() {
    throw new Error('not used by this learning route test');
  },
  async deleteReviewMark() {
    throw new Error('not used by this learning route test');
  },
};

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
      async getTrends() {
        throw new Error('not used by dashboard route test');
      },
      async getGoals() {
        throw new Error('not used by dashboard route test');
      },
      async updateGoals() {
        throw new Error('not used by dashboard route test');
      },
      ...unusedReviewMarkMethods,
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

  it('returns typed learning trends and forwards the day window', async () => {
    const requests: Array<{ studentId: string; days: number }> = [];
    const repository: LearningDashboardRepository = {
      async getDashboard() {
        throw new Error('not used by trends route test');
      },
      async getTrends(input) {
        requests.push({ studentId: input.studentId, days: input.days });
        return {
          generatedAt: '2026-07-14T10:00:00.000Z',
          fromDate: '2026-07-08',
          toDate: '2026-07-14',
          days: 7,
          daily: [
            {
              date: '2026-07-08',
              sessionsStarted: 0,
              sessionsCompleted: 0,
              attempts: 0,
              gradedAttempts: 0,
              correctAttempts: 0,
              accuracy: null,
              wrongQuestionsTouched: 0,
            },
            {
              date: '2026-07-09',
              sessionsStarted: 0,
              sessionsCompleted: 0,
              attempts: 0,
              gradedAttempts: 0,
              correctAttempts: 0,
              accuracy: null,
              wrongQuestionsTouched: 0,
            },
            {
              date: '2026-07-10',
              sessionsStarted: 0,
              sessionsCompleted: 0,
              attempts: 0,
              gradedAttempts: 0,
              correctAttempts: 0,
              accuracy: null,
              wrongQuestionsTouched: 0,
            },
            {
              date: '2026-07-11',
              sessionsStarted: 0,
              sessionsCompleted: 0,
              attempts: 0,
              gradedAttempts: 0,
              correctAttempts: 0,
              accuracy: null,
              wrongQuestionsTouched: 0,
            },
            {
              date: '2026-07-12',
              sessionsStarted: 1,
              sessionsCompleted: 1,
              attempts: 2,
              gradedAttempts: 2,
              correctAttempts: 1,
              accuracy: 0.5,
              wrongQuestionsTouched: 1,
            },
            {
              date: '2026-07-13',
              sessionsStarted: 1,
              sessionsCompleted: 0,
              attempts: 1,
              gradedAttempts: 1,
              correctAttempts: 1,
              accuracy: 1,
              wrongQuestionsTouched: 0,
            },
            {
              date: '2026-07-14',
              sessionsStarted: 1,
              sessionsCompleted: 0,
              attempts: 0,
              gradedAttempts: 0,
              correctAttempts: 0,
              accuracy: null,
              wrongQuestionsTouched: 0,
            },
          ],
          summary: {
            days: 7,
            activeDays: 3,
            currentStreakDays: 3,
            longestStreakDays: 3,
            sessionsStarted: 3,
            sessionsCompleted: 1,
            attempts: 3,
            gradedAttempts: 3,
            correctAttempts: 2,
            accuracy: 0.6667,
            wrongQuestionsTouched: 1,
          },
        };
      },
      async getGoals() {
        throw new Error('not used by trends route test');
      },
      async updateGoals() {
        throw new Error('not used by trends route test');
      },
      ...unusedReviewMarkMethods,
    };
    const app = buildApp({
      sessionService: fakeLoggedInSessionService(),
      learningRepository: repository,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/learning/trends?days=7',
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      fromDate: '2026-07-08',
      toDate: '2026-07-14',
      days: 7,
      daily: expect.arrayContaining([
        expect.objectContaining({ date: '2026-07-12', attempts: 2, accuracy: 0.5 }),
      ]),
      summary: {
        days: 7,
        activeDays: 3,
        currentStreakDays: 3,
        longestStreakDays: 3,
        sessionsStarted: 3,
        sessionsCompleted: 1,
        attempts: 3,
        gradedAttempts: 3,
        correctAttempts: 2,
        accuracy: 0.6667,
        wrongQuestionsTouched: 1,
      },
    });
    expect(response.json().daily).toHaveLength(7);
    expect(requests).toEqual([{ studentId, days: 7 }]);
  });

  it('returns and updates typed learning goals with feedback signals', async () => {
    const requests: Array<{ kind: 'get' | 'update'; studentId: string; dailyAttemptsTarget?: number | null }> = [];
    const repository: LearningDashboardRepository = {
      async getDashboard() {
        throw new Error('not used by goals route test');
      },
      async getTrends() {
        throw new Error('not used by goals route test');
      },
      async getGoals(input) {
        requests.push({ kind: 'get', studentId: input.studentId });
        return sampleGoalsResponse('default');
      },
      async updateGoals(input) {
        requests.push({
          kind: 'update',
          studentId: input.studentId,
          dailyAttemptsTarget: input.goals.dailyAttemptsTarget,
        });
        return sampleGoalsResponse('student', input.goals.dailyAttemptsTarget ?? 3);
      },
      ...unusedReviewMarkMethods,
    };
    const app = buildApp({
      sessionService: fakeLoggedInSessionService(),
      learningRepository: repository,
    });

    const readResponse = await app.inject({
      method: 'GET',
      url: '/api/learning/goals',
      headers: { cookie: 'bky_session=token' },
    });
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json()).toMatchObject({
      goals: { source: 'default', dailyAttemptsTarget: 3 },
      progress: {
        today: {
          attempts: 2,
          dailyAttempts: { current: 2, target: 3, completed: false, remaining: 1 },
        },
        wrongbook: {
          pending: 1,
          wrongQuestionsReview: { current: 0, target: 1, completed: false, remaining: 1 },
        },
      },
      feedback: expect.arrayContaining([
        expect.objectContaining({ type: 'wrongbook_review_needed', severity: 'warning' }),
      ]),
    });

    const updateResponse = await app.inject({
      method: 'PUT',
      url: '/api/learning/goals',
      headers: { cookie: 'bky_session=token' },
      payload: { dailyAttemptsTarget: 2 },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      goals: { source: 'student', dailyAttemptsTarget: 2 },
      progress: {
        today: {
          attempts: 2,
          dailyAttempts: { current: 2, target: 2, completed: true, remaining: 0 },
        },
      },
    });
    expect(requests).toEqual([
      { kind: 'get', studentId },
      { kind: 'update', studentId, dailyAttemptsTarget: 2 },
    ]);
  });

  it('returns typed review marks and forwards list filters', async () => {
    const requests: Array<{
      studentId: string;
      bankId?: string;
      kind: string;
      limit: number;
      offset: number;
    }> = [];
    const repository: LearningDashboardRepository = {
      async getDashboard() {
        throw new Error('not used by review mark list route test');
      },
      async getTrends() {
        throw new Error('not used by review mark list route test');
      },
      async getGoals() {
        throw new Error('not used by review mark list route test');
      },
      async updateGoals() {
        throw new Error('not used by review mark list route test');
      },
      async listReviewMarks(input) {
        requests.push(input);
        return {
          reviewMarks: [sampleReviewMark()],
          page: { limit: input.limit, offset: input.offset, hasMore: false },
        };
      },
      async upsertReviewMark() {
        throw new Error('not used by review mark list route test');
      },
      async deleteReviewMark() {
        throw new Error('not used by review mark list route test');
      },
    };
    const app = buildApp({
      sessionService: fakeLoggedInSessionService(),
      learningRepository: repository,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/learning/review-marks?bankId=${bankId.toUpperCase()}&kind=favorite&limit=10&offset=0`,
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      reviewMarks: [{
        id: reviewMarkId,
        questionId,
        bankId,
        bankName: '数据库测试题库',
        questionType: 'multiple_choice',
        favorite: true,
        longTermReview: true,
        note: 'review ACID',
        source: 'manual',
      }],
      page: { limit: 10, offset: 0, hasMore: false },
    });
    expect(requests).toEqual([{
      studentId,
      bankId: bankId.toUpperCase(),
      kind: 'favorite',
      limit: 10,
      offset: 0,
    }]);
  });

  it('upserts and deletes review marks for the logged-in student', async () => {
    const requests: Array<{ kind: 'upsert' | 'delete'; studentId: string; note?: string; id?: string }> = [];
    const repository: LearningDashboardRepository = {
      async getDashboard() {
        throw new Error('not used by review mark write route test');
      },
      async getTrends() {
        throw new Error('not used by review mark write route test');
      },
      async getGoals() {
        throw new Error('not used by review mark write route test');
      },
      async updateGoals() {
        throw new Error('not used by review mark write route test');
      },
      async listReviewMarks() {
        throw new Error('not used by review mark write route test');
      },
      async upsertReviewMark(input) {
        requests.push({ kind: 'upsert', studentId: input.studentId, note: input.mark.note });
        return {
          ...sampleReviewMark(),
          note: input.mark.note,
          favorite: input.mark.favorite,
          longTermReview: input.mark.longTermReview,
          source: input.mark.source,
        };
      },
      async deleteReviewMark(input) {
        requests.push({ kind: 'delete', studentId: input.studentId, id: input.id });
        return true;
      },
    };
    const app = buildApp({
      sessionService: fakeLoggedInSessionService(),
      learningRepository: repository,
    });

    const upsert = await app.inject({
      method: 'PUT',
      url: '/api/learning/review-marks',
      headers: { cookie: 'bky_session=token' },
      payload: {
        questionId,
        bankId,
        favorite: true,
        longTermReview: true,
        note: 'review ACID again',
      },
    });
    expect(upsert.statusCode).toBe(200);
    expect(upsert.json()).toMatchObject({
      reviewMark: {
        id: reviewMarkId,
        questionId,
        bankId,
        favorite: true,
        longTermReview: true,
        note: 'review ACID again',
        source: 'manual',
      },
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/learning/review-marks/${reviewMarkId}`,
      headers: { cookie: 'bky_session=token' },
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ success: true });
    expect(requests).toEqual([
      { kind: 'upsert', studentId, note: 'review ACID again' },
      { kind: 'delete', studentId, id: reviewMarkId },
    ]);
  });

  it('rejects invalid review mark payloads and fails closed on invalid review mark responses', async () => {
    const app = buildApp({
      sessionService: fakeLoggedInSessionService(),
      learningRepository: {
        async getDashboard() {
          throw new Error('not used by review mark validation test');
        },
        async getTrends() {
          throw new Error('not used by review mark validation test');
        },
        async getGoals() {
          throw new Error('not used by review mark validation test');
        },
        async updateGoals() {
          throw new Error('not used by review mark validation test');
        },
        async listReviewMarks() {
          return {
            reviewMarks: [{
              ...sampleReviewMark(),
              favorite: false,
              longTermReview: false,
            }],
            page: { limit: 20, offset: 0, hasMore: false },
          };
        },
        async upsertReviewMark() {
          return sampleReviewMark();
        },
        async deleteReviewMark() {
          return true;
        },
      },
    });

    const invalidRequest = await app.inject({
      method: 'PUT',
      url: '/api/learning/review-marks',
      headers: { cookie: 'bky_session=token' },
      payload: {
        questionId,
        bankId,
        favorite: false,
        longTermReview: false,
      },
    });
    expect(invalidRequest.statusCode).toBe(400);

    const invalidResponse = await app.inject({
      method: 'GET',
      url: '/api/learning/review-marks',
      headers: { cookie: 'bky_session=token' },
    });
    expect(invalidResponse.statusCode).toBe(500);
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

  it('rejects invalid trends query and fails closed on invalid trend payloads', async () => {
    const app = buildApp({
      sessionService: fakeLoggedInSessionService(),
      learningRepository: {
        async getDashboard() {
          throw new Error('not used by trends validation test');
        },
        async getTrends() {
          return {
            generatedAt: '2026-07-14T10:00:00.000Z',
            fromDate: '2026-07-08',
            toDate: '2026-07-14',
            days: 7,
            daily: [],
            summary: {
              days: 7,
              activeDays: 0,
              currentStreakDays: 0,
              longestStreakDays: 0,
              sessionsStarted: 0,
              sessionsCompleted: 0,
              attempts: 0,
              gradedAttempts: 0,
              correctAttempts: 0,
              accuracy: null,
              wrongQuestionsTouched: 0,
            },
          };
        },
      } as LearningDashboardRepository,
    });

    const invalidQuery = await app.inject({
      method: 'GET',
      url: '/api/learning/trends?days=6',
      headers: { cookie: 'bky_session=token' },
    });
    expect(invalidQuery.statusCode).toBe(400);

    const invalidPayload = await app.inject({
      method: 'GET',
      url: '/api/learning/trends?days=7',
      headers: { cookie: 'bky_session=token' },
    });
    expect(invalidPayload.statusCode).toBe(500);
  });

  it('rejects invalid goals payloads and fails closed on invalid goals responses', async () => {
    const app = buildApp({
      sessionService: fakeLoggedInSessionService(),
      learningRepository: {
        async getDashboard() {
          throw new Error('not used by goals validation test');
        },
        async getTrends() {
          throw new Error('not used by goals validation test');
        },
        async getGoals() {
          return {
            ...sampleGoalsResponse('student'),
            progress: {
              ...sampleGoalsResponse('student').progress,
              today: {
                ...sampleGoalsResponse('student').progress.today,
                dailyAttempts: { current: 2, target: null, completed: true, remaining: 0 },
              },
            },
          };
        },
        async updateGoals() {
          return sampleGoalsResponse('student');
        },
      } as LearningDashboardRepository,
    });

    const invalidRequest = await app.inject({
      method: 'PUT',
      url: '/api/learning/goals',
      headers: { cookie: 'bky_session=token' },
      payload: { weeklyActiveDaysTarget: 8 },
    });
    expect(invalidRequest.statusCode).toBe(400);

    const invalidResponse = await app.inject({
      method: 'GET',
      url: '/api/learning/goals',
      headers: { cookie: 'bky_session=token' },
    });
    expect(invalidResponse.statusCode).toBe(500);
  });
});

function sampleGoalsResponse(source: 'default' | 'student', dailyAttemptsTarget = 3) {
  const dailyCompleted = 2 >= dailyAttemptsTarget;

  return {
    generatedAt: '2026-07-14T10:00:00.000Z',
    goals: {
      dailyAttemptsTarget,
      weeklyActiveDaysTarget: 2,
      wrongQuestionsReviewTarget: 1,
      source,
      updatedAt: source === 'student' ? '2026-07-14T09:55:00.000Z' : null,
    },
    progress: {
      today: {
        date: '2026-07-14',
        attempts: 2,
        gradedAttempts: 2,
        correctAttempts: 1,
        accuracy: 0.5,
        dailyAttempts: {
          current: 2,
          target: dailyAttemptsTarget,
          completed: dailyCompleted,
          remaining: Math.max(dailyAttemptsTarget - 2, 0),
        },
      },
      week: {
        fromDate: '2026-07-08',
        toDate: '2026-07-14',
        activeDays: 1,
        attempts: 2,
        gradedAttempts: 2,
        correctAttempts: 1,
        accuracy: 0.5,
        weeklyActiveDays: { current: 1, target: 2, completed: false, remaining: 1 },
      },
      wrongbook: {
        total: 1,
        mastered: 0,
        pending: 1,
        reviewedToday: 0,
        wrongQuestionsReview: { current: 0, target: 1, completed: false, remaining: 1 },
      },
    },
    feedback: [
      {
        type: dailyCompleted ? 'daily_attempts_goal' : 'wrongbook_review_needed',
        severity: dailyCompleted ? 'success' : 'warning',
        title: dailyCompleted ? 'Daily practice goal reached' : 'Wrongbook review recommended',
        message: dailyCompleted ? 'Completed 2/2 attempts today.' : '1 pending wrong question remains.',
        action: dailyCompleted ? 'view_trends' : 'review_wrongbook',
      },
    ],
  };
}

function sampleReviewMark() {
  return {
    id: reviewMarkId,
    questionId,
    bankId,
    bankName: '数据库测试题库',
    subjectCategory: '质量保障',
    subjectName: 'PostgreSQL',
    questionType: 'multiple_choice',
    contentPreview: '以下哪些属于 ACID 属性？',
    favorite: true,
    longTermReview: true,
    note: 'review ACID',
    source: 'manual',
    createdAt: '2026-07-14T10:00:00.000Z',
    updatedAt: '2026-07-14T10:00:00.000Z',
  } as const;
}
