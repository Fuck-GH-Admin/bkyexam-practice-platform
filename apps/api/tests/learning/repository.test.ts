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

  constructor(
    private readonly rows: unknown[][] = [],
    private readonly rowCounts: Array<number | null | undefined> = [],
  ) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.queries.push({ sql, params });
    return {
      rows: this.rows.shift() ?? [],
      rowCount: this.rowCounts.shift(),
    };
  }
}

const studentId = '50000000-0000-4000-8000-000000000001';
const bankId = '10000000-0000-4000-8000-000000000001';
const questionId = '20000000-0000-4000-8000-000000000002';
const reviewMarkId = '80000000-0000-4000-8000-000000000001';

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

  it('returns empty memory trends with UTC date buckets for students without activity', async () => {
    const repository = createMemoryLearningDashboardRepository();

    const trends = await repository.getTrends({
      studentId,
      days: 7,
      now: new Date('2026-07-14T10:00:00.000Z'),
    });

    expect(trends).toMatchObject({
      generatedAt: '2026-07-14T10:00:00.000Z',
      fromDate: '2026-07-08',
      toDate: '2026-07-14',
      days: 7,
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
    });
    expect(trends.daily.map((day) => day.date)).toEqual([
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
      '2026-07-13',
      '2026-07-14',
    ]);
    expect(trends.daily.every((day) => day.accuracy === null && day.attempts === 0)).toBe(true);
  });

  it('returns and updates memory learning goals with default progress', async () => {
    const repository = createMemoryLearningDashboardRepository();

    const initial = await repository.getGoals({
      studentId,
      now: new Date('2026-07-14T10:00:00.000Z'),
    });
    expect(initial).toMatchObject({
      generatedAt: '2026-07-14T10:00:00.000Z',
      goals: {
        dailyAttemptsTarget: 20,
        weeklyActiveDaysTarget: 5,
        wrongQuestionsReviewTarget: 10,
        source: 'default',
        updatedAt: null,
      },
      progress: {
        today: {
          date: '2026-07-14',
          attempts: 0,
          dailyAttempts: { current: 0, target: 20, completed: false, remaining: 20 },
        },
        week: {
          fromDate: '2026-07-08',
          toDate: '2026-07-14',
          activeDays: 0,
          weeklyActiveDays: { current: 0, target: 5, completed: false, remaining: 5 },
        },
        wrongbook: {
          total: 0,
          pending: 0,
          wrongQuestionsReview: { current: 0, target: 10, completed: true, remaining: 0 },
        },
      },
    });

    const updated = await repository.updateGoals({
      studentId,
      goals: { dailyAttemptsTarget: 5, weeklyActiveDaysTarget: null },
      now: new Date('2026-07-14T10:05:00.000Z'),
    });

    expect(updated.goals).toEqual({
      dailyAttemptsTarget: 5,
      weeklyActiveDaysTarget: null,
      wrongQuestionsReviewTarget: 10,
      source: 'student',
      updatedAt: '2026-07-14T10:05:00.000Z',
    });
    expect(updated.progress.week.weeklyActiveDays).toEqual({
      current: 0,
      target: null,
      completed: false,
      remaining: null,
    });
  });

  it('lists, updates, and deletes memory review marks per student', async () => {
    const repository = createMemoryLearningDashboardRepository({}, {}, {}, [
      { studentId, ...sampleReviewMark() },
      {
        studentId: '50000000-0000-4000-8000-000000000099',
        ...sampleReviewMark({
          id: '80000000-0000-4000-8000-000000000099',
          updatedAt: '2026-07-14T10:10:00.000Z',
        }),
      },
    ]);

    const initial = await repository.listReviewMarks({
      studentId,
      bankId,
      kind: 'long_term_review',
      limit: 1,
      offset: 0,
    });

    expect(initial).toMatchObject({
      reviewMarks: [{ id: reviewMarkId, questionId, bankId, longTermReview: true }],
      page: { limit: 1, offset: 0, hasMore: false },
    });

    const updated = await repository.upsertReviewMark({
      studentId,
      mark: {
        questionId: questionId.toUpperCase(),
        bankId: bankId.toUpperCase(),
        favorite: true,
        longTermReview: false,
        note: 'favorite only',
        source: 'wrongbook',
      },
      now: new Date('2026-07-14T10:30:00.000Z'),
    });
    expect(updated).toMatchObject({
      id: reviewMarkId,
      questionId,
      bankId,
      favorite: true,
      longTermReview: false,
      note: 'favorite only',
      source: 'wrongbook',
      updatedAt: '2026-07-14T10:30:00.000Z',
    });

    await expect(repository.deleteReviewMark({ studentId, id: reviewMarkId.toUpperCase() })).resolves.toBe(true);
    await expect(repository.deleteReviewMark({ studentId, id: reviewMarkId })).resolves.toBe(false);
    await expect(repository.listReviewMarks({
      studentId,
      kind: 'all',
      limit: 20,
      offset: 0,
    })).resolves.toEqual({ reviewMarks: [], page: { limit: 20, offset: 0, hasMore: false } });
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

  it('maps PostgreSQL daily aggregate rows into learning trends and streak counters', async () => {
    const client = new FakeQueryClient([
      [
        {
          date: '2026-07-08',
          sessions_started: '0',
          sessions_completed: '0',
          attempts: '0',
          graded_attempts: '0',
          correct_attempts: '0',
          wrong_questions_touched: '0',
        },
        {
          date: '2026-07-09',
          sessions_started: '1',
          sessions_completed: '0',
          attempts: '1',
          graded_attempts: '1',
          correct_attempts: '1',
          wrong_questions_touched: '0',
        },
        {
          date: '2026-07-10',
          sessions_started: '0',
          sessions_completed: '0',
          attempts: '0',
          graded_attempts: '0',
          correct_attempts: '0',
          wrong_questions_touched: '0',
        },
        {
          date: '2026-07-11',
          sessions_started: '1',
          sessions_completed: '1',
          attempts: '2',
          graded_attempts: '2',
          correct_attempts: '1',
          wrong_questions_touched: '1',
        },
        {
          date: '2026-07-12',
          sessions_started: '0',
          sessions_completed: '1',
          attempts: '0',
          graded_attempts: '0',
          correct_attempts: '0',
          wrong_questions_touched: '0',
        },
        {
          date: '2026-07-13',
          sessions_started: '0',
          sessions_completed: '0',
          attempts: '0',
          graded_attempts: '0',
          correct_attempts: '0',
          wrong_questions_touched: '0',
        },
        {
          date: '2026-07-14',
          sessions_started: '1',
          sessions_completed: '0',
          attempts: '1',
          graded_attempts: '1',
          correct_attempts: '0',
          wrong_questions_touched: '0',
        },
      ],
    ]);
    const repository = createPgLearningDashboardRepository(client);

    const trends = await repository.getTrends({
      studentId,
      days: 7,
      now: new Date('2026-07-14T10:00:00.000Z'),
    });

    expect(trends).toMatchObject({
      generatedAt: '2026-07-14T10:00:00.000Z',
      fromDate: '2026-07-08',
      toDate: '2026-07-14',
      days: 7,
      daily: [
        { date: '2026-07-08', attempts: 0, accuracy: null },
        { date: '2026-07-09', sessionsStarted: 1, attempts: 1, correctAttempts: 1, accuracy: 1 },
        { date: '2026-07-10', attempts: 0, accuracy: null },
        { date: '2026-07-11', sessionsCompleted: 1, attempts: 2, wrongQuestionsTouched: 1, accuracy: 0.5 },
        { date: '2026-07-12', sessionsCompleted: 1, attempts: 0, accuracy: null },
        { date: '2026-07-13', attempts: 0, accuracy: null },
        { date: '2026-07-14', sessionsStarted: 1, attempts: 1, correctAttempts: 0, accuracy: 0 },
      ],
      summary: {
        days: 7,
        activeDays: 4,
        currentStreakDays: 1,
        longestStreakDays: 2,
        sessionsStarted: 3,
        sessionsCompleted: 2,
        attempts: 4,
        gradedAttempts: 4,
        correctAttempts: 2,
        accuracy: 0.5,
        wrongQuestionsTouched: 1,
      },
    });
    expect(client.queries).toHaveLength(1);
    expect(client.queries[0]?.sql).toContain('generate_series');
    expect(client.queries[0]?.params).toEqual([studentId, '2026-07-14', 7]);
  });

  it('maps PostgreSQL learning goal settings and activity facts into feedback signals', async () => {
    const client = new FakeQueryClient([
      [{
        daily_attempts_target: '3',
        weekly_active_days_target: '2',
        wrong_questions_review_target: '1',
        updated_at: new Date('2026-07-14T09:55:00.000Z'),
      }],
      [{
        today_date: '2026-07-14',
        week_from_date: '2026-07-08',
        week_to_date: '2026-07-14',
        today_attempts: '3',
        today_graded_attempts: '3',
        today_correct_attempts: '2',
        week_active_days: '2',
        week_attempts: '5',
        week_graded_attempts: '5',
        week_correct_attempts: '4',
        wrong_questions: '2',
        mastered_wrong_questions: '1',
        pending_wrong_questions: '1',
        wrong_questions_reviewed_today: '0',
      }],
    ]);
    const repository = createPgLearningDashboardRepository(client);

    const goals = await repository.getGoals({
      studentId,
      now: new Date('2026-07-14T10:00:00.000Z'),
    });

    expect(goals).toMatchObject({
      generatedAt: '2026-07-14T10:00:00.000Z',
      goals: {
        dailyAttemptsTarget: 3,
        weeklyActiveDaysTarget: 2,
        wrongQuestionsReviewTarget: 1,
        source: 'student',
        updatedAt: '2026-07-14T09:55:00.000Z',
      },
      progress: {
        today: {
          date: '2026-07-14',
          attempts: 3,
          gradedAttempts: 3,
          correctAttempts: 2,
          accuracy: 0.6667,
          dailyAttempts: { current: 3, target: 3, completed: true, remaining: 0 },
        },
        week: {
          fromDate: '2026-07-08',
          toDate: '2026-07-14',
          activeDays: 2,
          attempts: 5,
          accuracy: 0.8,
          weeklyActiveDays: { current: 2, target: 2, completed: true, remaining: 0 },
        },
        wrongbook: {
          total: 2,
          mastered: 1,
          pending: 1,
          reviewedToday: 0,
          wrongQuestionsReview: { current: 0, target: 1, completed: false, remaining: 1 },
        },
      },
      feedback: expect.arrayContaining([
        expect.objectContaining({ type: 'daily_attempts_goal', severity: 'success' }),
        expect.objectContaining({ type: 'weekly_active_days_goal', severity: 'success' }),
        expect.objectContaining({ type: 'wrongbook_review_needed', severity: 'warning' }),
      ]),
    });
    expect(client.queries).toHaveLength(2);
    expect(client.queries[0]?.sql).toContain('FROM student_learning_goals');
    expect(client.queries[1]?.params).toEqual([studentId, '2026-07-14']);
  });

  it('upserts PostgreSQL learning goals before returning current progress', async () => {
    const client = new FakeQueryClient([
      [],
      [{
        daily_attempts_target: '3',
        weekly_active_days_target: null,
        wrong_questions_review_target: '1',
        updated_at: new Date('2026-07-14T10:05:00.000Z'),
      }],
      [{
        today_date: '2026-07-14',
        week_from_date: '2026-07-08',
        week_to_date: '2026-07-14',
        today_attempts: '3',
        today_graded_attempts: '3',
        today_correct_attempts: '2',
        week_active_days: '1',
        week_attempts: '3',
        week_graded_attempts: '3',
        week_correct_attempts: '2',
        wrong_questions: '1',
        mastered_wrong_questions: '1',
        pending_wrong_questions: '0',
        wrong_questions_reviewed_today: '0',
      }],
    ]);
    const repository = createPgLearningDashboardRepository(client);

    const goals = await repository.updateGoals({
      studentId,
      goals: {
        dailyAttemptsTarget: 3,
        weeklyActiveDaysTarget: null,
        wrongQuestionsReviewTarget: 1,
      },
      now: new Date('2026-07-14T10:05:00.000Z'),
    });

    expect(goals).toMatchObject({
      goals: {
        dailyAttemptsTarget: 3,
        weeklyActiveDaysTarget: null,
        wrongQuestionsReviewTarget: 1,
        source: 'student',
      },
      progress: {
        today: {
          dailyAttempts: { current: 3, target: 3, completed: true, remaining: 0 },
        },
        week: {
          weeklyActiveDays: { current: 1, target: null, completed: false, remaining: null },
        },
        wrongbook: {
          pending: 0,
          wrongQuestionsReview: { current: 0, target: 1, completed: true, remaining: 0 },
        },
      },
      feedback: expect.arrayContaining([
        expect.objectContaining({ type: 'wrongbook_review_goal', severity: 'success' }),
      ]),
    });
    expect(client.queries).toHaveLength(3);
    expect(client.queries[1]?.sql).toContain('ON CONFLICT (student_id) DO UPDATE');
    expect(client.queries[1]?.params).toEqual([
      studentId,
      3,
      null,
      1,
      '2026-07-14T10:05:00.000Z',
    ]);
  });

  it('lists PostgreSQL review marks with bank and kind filters', async () => {
    const client = new FakeQueryClient([
      [
        sampleReviewMarkRow({ updated_at: new Date('2026-07-14T10:30:00.000Z') }),
        sampleReviewMarkRow({
          id: '80000000-0000-4000-8000-000000000002',
          question_id: '20000000-0000-4000-8000-000000000003',
          updated_at: new Date('2026-07-14T10:20:00.000Z'),
        }),
      ],
    ]);
    const repository = createPgLearningDashboardRepository(client);

    const marks = await repository.listReviewMarks({
      studentId,
      bankId,
      kind: 'favorite',
      limit: 1,
      offset: 0,
    });

    expect(marks).toMatchObject({
      reviewMarks: [{
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
        updatedAt: '2026-07-14T10:30:00.000Z',
      }],
      page: { limit: 1, offset: 0, hasMore: true },
    });
    expect(client.queries).toHaveLength(1);
    expect(client.queries[0]?.sql).toContain('FROM question_bookmarks');
    expect(client.queries[0]?.sql).toContain('question_bookmarks.favorite = true');
    expect(client.queries[0]?.params).toEqual([studentId, 2, 0, bankId]);
  });

  it('upserts and deletes PostgreSQL review marks', async () => {
    const client = new FakeQueryClient([
      [sampleReviewMarkRow({ note: 'review again', updated_at: new Date('2026-07-14T10:45:00.000Z') })],
      [],
    ], [undefined, 1]);
    const repository = createPgLearningDashboardRepository(client);

    const mark = await repository.upsertReviewMark({
      studentId,
      mark: {
        questionId,
        bankId,
        favorite: true,
        longTermReview: true,
        note: 'review again',
        source: 'manual',
      },
      now: new Date('2026-07-14T10:45:00.000Z'),
    });

    expect(mark).toMatchObject({
      id: reviewMarkId,
      questionId,
      bankId,
      favorite: true,
      longTermReview: true,
      note: 'review again',
      updatedAt: '2026-07-14T10:45:00.000Z',
    });
    expect(client.queries[0]?.sql).toContain('WITH RECURSIVE bank_tree AS');
    expect(client.queries[0]?.sql).toContain('ON CONFLICT (student_id, question_id, bank_id) DO UPDATE');
    expect(client.queries[0]?.params).toEqual([
      studentId,
      questionId,
      bankId,
      true,
      true,
      'review again',
      'manual',
      '2026-07-14T10:45:00.000Z',
    ]);

    await expect(repository.deleteReviewMark({ studentId, id: reviewMarkId })).resolves.toBe(true);
    expect(client.queries[1]?.sql).toContain('DELETE FROM question_bookmarks');
    expect(client.queries[1]?.params).toEqual([studentId, reviewMarkId]);
  });
});

function sampleReviewMark(overrides: Partial<{
  id: string;
  questionId: string;
  bankId: string;
  bankName: string;
  subjectCategory: string;
  subjectName: string;
  questionType: 'multiple_choice';
  contentPreview: string;
  favorite: boolean;
  longTermReview: boolean;
  note: string;
  source: 'manual' | 'practice_review' | 'wrongbook';
  createdAt: string;
  updatedAt: string;
}> = {}) {
  return {
    id: reviewMarkId,
    questionId,
    bankId,
    bankName: '数据库测试题库',
    subjectCategory: '质量保障',
    subjectName: 'PostgreSQL',
    questionType: 'multiple_choice' as const,
    contentPreview: '以下哪些属于 ACID 属性？',
    favorite: true,
    longTermReview: true,
    note: 'review ACID',
    source: 'manual' as const,
    createdAt: '2026-07-14T10:00:00.000Z',
    updatedAt: '2026-07-14T10:00:00.000Z',
    ...overrides,
  };
}

function sampleReviewMarkRow(overrides: Partial<{
  id: string;
  question_id: string;
  bank_id: string;
  bank_name: string;
  subject_category: string;
  subject_name: string;
  normalized_type: 'multiple_choice';
  content_preview: string;
  favorite: boolean;
  long_term_review: boolean;
  note: string;
  source: 'manual' | 'practice_review' | 'wrongbook';
  created_at: Date;
  updated_at: Date;
}> = {}) {
  return {
    id: reviewMarkId,
    question_id: questionId,
    bank_id: bankId,
    bank_name: '数据库测试题库',
    subject_category: '质量保障',
    subject_name: 'PostgreSQL',
    normalized_type: 'multiple_choice' as const,
    content_preview: '以下哪些属于 ACID 属性？',
    favorite: true,
    long_term_review: true,
    note: 'review ACID',
    source: 'manual' as const,
    created_at: new Date('2026-07-14T10:00:00.000Z'),
    updated_at: new Date('2026-07-14T10:00:00.000Z'),
    ...overrides,
  };
}
