import { describe, expect, it } from 'vitest';
import {
  createMemoryLearningDashboardRepository,
  createPgLearningDashboardRepository,
} from '../../src/learning/repository';
import type { QueryClient } from '../../src/db/client';

interface RecordedQuery {
  sql: string;
  params?: readonly unknown[];
}

class FakeQueryClient implements QueryClient {
  queries: RecordedQuery[] = [];

  constructor(private readonly rows: unknown[][] = []) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.queries.push({ sql, params });
    return { rows: this.rows.shift() ?? [] };
  }
}

const studentId = '50000000-0000-4000-8000-000000000001';
const bankId = '10000000-0000-4000-8000-000000000001';

describe('learning dashboard repositories', () => {
  it('returns empty memory dashboard defaults for students without activity', async () => {
    const repository = createMemoryLearningDashboardRepository();

    await expect(repository.getDashboard({
      studentId,
      recentLimit: 5,
      now: new Date('2026-07-14T10:00:00.000Z'),
    })).resolves.toEqual({
      generatedAt: '2026-07-14T10:00:00.000Z',
      summary: {
        activeSessions: 0,
        completedSessions: 0,
        reviewSessions: 0,
        attempts: 0,
        gradedAttempts: 0,
        correctAttempts: 0,
        accuracy: null,
        wrongQuestions: 0,
        masteredWrongQuestions: 0,
        pendingWrongQuestions: 0,
        lastPracticedAt: null,
      },
      recentBanks: [],
      questionTypes: [],
      wrongbook: { total: 0, mastered: 0, pending: 0, lastWrongAt: null },
    });
  });

  it('maps PostgreSQL aggregate rows into learning dashboard counters', async () => {
    const client = new FakeQueryClient([
      [{
        active_sessions: '2',
        completed_sessions: '1',
        review_sessions: '1',
        attempts: '3',
        graded_attempts: '3',
        correct_attempts: '2',
        wrong_questions: '1',
        mastered_wrong_questions: '1',
        pending_wrong_questions: '0',
        last_practiced_at: new Date('2026-07-14T09:00:00.000Z'),
        last_wrong_at: new Date('2026-07-14T08:00:00.000Z'),
      }],
      [{
        bank_id: bankId,
        bank_name: '数据库测试题库',
        subject_category: '质量保障',
        subject_name: 'PostgreSQL',
        last_practiced_at: new Date('2026-07-14T09:00:00.000Z'),
        sessions: '3',
        completed_sessions: '1',
        attempts: '3',
        graded_attempts: '3',
        correct_attempts: '2',
        wrong_questions: '1',
      }],
      [
        {
          question_type: 'single_choice',
          attempts: '1',
          graded_attempts: '1',
          correct_attempts: '1',
          wrong_questions: '0',
        },
        {
          question_type: 'multiple_choice',
          attempts: '1',
          graded_attempts: '1',
          correct_attempts: '0',
          wrong_questions: '1',
        },
      ],
    ]);
    const repository = createPgLearningDashboardRepository(client);

    const dashboard = await repository.getDashboard({
      studentId,
      recentLimit: 3,
      now: new Date('2026-07-14T10:00:00.000Z'),
    });

    expect(dashboard).toMatchObject({
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
        masteredWrongQuestions: 1,
        pendingWrongQuestions: 0,
        lastPracticedAt: '2026-07-14T09:00:00.000Z',
      },
      recentBanks: [{
        bankId,
        sessions: 3,
        completedSessions: 1,
        accuracy: 0.6667,
      }],
      questionTypes: [
        { questionType: 'single_choice', attempts: 1, correctAttempts: 1, accuracy: 1 },
        { questionType: 'multiple_choice', attempts: 1, correctAttempts: 0, accuracy: 0 },
      ],
      wrongbook: {
        total: 1,
        mastered: 1,
        pending: 0,
        lastWrongAt: '2026-07-14T08:00:00.000Z',
      },
    });
    expect(client.queries).toHaveLength(3);
    expect(client.queries[0]?.sql).toContain('FROM practice_sessions');
    expect(client.queries[1]?.params).toEqual([studentId, 3]);
    expect(client.queries[2]?.sql).toContain('FULL OUTER JOIN');
  });
});
