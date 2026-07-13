import type {
  LearningDashboardResponseV1,
  LearningQuestionTypeStatV1,
  LearningRecentBankV1,
  LearningSummaryV1,
  LearningWrongbookSummaryV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../db/client.js';

export interface LearningDashboardRepository {
  getDashboard(input: {
    studentId: string;
    recentLimit: number;
    now?: Date;
  }): Promise<LearningDashboardResponseV1>;
}

interface QueryRows<T> {
  rows: T[];
}

type MemoryDashboard = Omit<LearningDashboardResponseV1, 'generatedAt'> & {
  generatedAt?: string;
};

export function createMemoryLearningDashboardRepository(
  dashboards: Record<string, MemoryDashboard> = {},
): LearningDashboardRepository {
  return {
    async getDashboard({ studentId, recentLimit, now = new Date() }) {
      const dashboard = dashboards[studentId] ?? emptyDashboard();

      return {
        generatedAt: dashboard.generatedAt ?? now.toISOString(),
        summary: { ...dashboard.summary },
        recentBanks: dashboard.recentBanks.slice(0, recentLimit).map((bank) => ({ ...bank })),
        questionTypes: dashboard.questionTypes.map((stat) => ({ ...stat })),
        wrongbook: { ...dashboard.wrongbook },
      };
    },
  };
}

interface SummaryRow {
  active_sessions: string;
  completed_sessions: string;
  review_sessions: string;
  attempts: string;
  graded_attempts: string;
  correct_attempts: string;
  wrong_questions: string;
  mastered_wrong_questions: string;
  pending_wrong_questions: string;
  last_practiced_at: Date | string | null;
  last_wrong_at: Date | string | null;
}

interface RecentBankRow {
  bank_id: string;
  bank_name: string | null;
  subject_category: string | null;
  subject_name: string | null;
  last_practiced_at: Date | string;
  sessions: string;
  completed_sessions: string;
  attempts: string | null;
  graded_attempts: string | null;
  correct_attempts: string | null;
  wrong_questions: string | null;
}

interface QuestionTypeRow {
  question_type: string;
  attempts: string | null;
  graded_attempts: string | null;
  correct_attempts: string | null;
  wrong_questions: string | null;
}

export function createPgLearningDashboardRepository(client: QueryClient): LearningDashboardRepository {
  return {
    async getDashboard({ studentId, recentLimit, now = new Date() }) {
      const [summary, recentBanks, questionTypes] = await Promise.all([
        loadSummary(client, studentId),
        loadRecentBanks(client, studentId, recentLimit),
        loadQuestionTypes(client, studentId),
      ]);

      return {
        generatedAt: now.toISOString(),
        summary: summary.summary,
        recentBanks,
        questionTypes,
        wrongbook: summary.wrongbook,
      };
    },
  };
}

async function loadSummary(client: QueryClient, studentId: string) {
  const result = (await client.query(
    `
      WITH activity AS (
        SELECT updated_at AS activity_at
        FROM practice_sessions
        WHERE student_id = $1

        UNION ALL

        SELECT created_at AS activity_at
        FROM practice_attempts
        WHERE student_id = $1
      )
      SELECT
        (SELECT COUNT(*) FROM practice_sessions WHERE student_id = $1 AND status = 'active') AS active_sessions,
        (SELECT COUNT(*) FROM practice_sessions WHERE student_id = $1 AND status = 'completed') AS completed_sessions,
        (SELECT COUNT(*) FROM practice_sessions WHERE student_id = $1 AND origin = 'wrongbook') AS review_sessions,
        (SELECT COUNT(*) FROM practice_attempts WHERE student_id = $1) AS attempts,
        (SELECT COUNT(*) FROM practice_attempts WHERE student_id = $1 AND is_correct IS NOT NULL) AS graded_attempts,
        (SELECT COUNT(*) FROM practice_attempts WHERE student_id = $1 AND is_correct = true) AS correct_attempts,
        (SELECT COUNT(*) FROM wrong_questions WHERE student_id = $1) AS wrong_questions,
        (SELECT COUNT(*) FROM wrong_questions WHERE student_id = $1 AND mastered = true) AS mastered_wrong_questions,
        (SELECT COUNT(*) FROM wrong_questions WHERE student_id = $1 AND mastered = false) AS pending_wrong_questions,
        (SELECT MAX(activity_at) FROM activity) AS last_practiced_at,
        (SELECT MAX(last_wrong_at) FROM wrong_questions WHERE student_id = $1) AS last_wrong_at
    `,
    [studentId],
  )) as QueryRows<SummaryRow>;
  const row = result.rows[0] ?? {
    active_sessions: '0',
    completed_sessions: '0',
    review_sessions: '0',
    attempts: '0',
    graded_attempts: '0',
    correct_attempts: '0',
    wrong_questions: '0',
    mastered_wrong_questions: '0',
    pending_wrong_questions: '0',
    last_practiced_at: null,
    last_wrong_at: null,
  };

  const attempts = toCount(row.attempts);
  const gradedAttempts = toCount(row.graded_attempts);
  const correctAttempts = toCount(row.correct_attempts);
  const wrongQuestions = toCount(row.wrong_questions);
  const masteredWrongQuestions = toCount(row.mastered_wrong_questions);
  const pendingWrongQuestions = toCount(row.pending_wrong_questions);
  const summary: LearningSummaryV1 = {
    activeSessions: toCount(row.active_sessions),
    completedSessions: toCount(row.completed_sessions),
    reviewSessions: toCount(row.review_sessions),
    attempts,
    gradedAttempts,
    correctAttempts,
    accuracy: toAccuracy(correctAttempts, gradedAttempts),
    wrongQuestions,
    masteredWrongQuestions,
    pendingWrongQuestions,
    lastPracticedAt: toIsoOrNull(row.last_practiced_at),
  };
  const wrongbook: LearningWrongbookSummaryV1 = {
    total: wrongQuestions,
    mastered: masteredWrongQuestions,
    pending: pendingWrongQuestions,
    lastWrongAt: toIsoOrNull(row.last_wrong_at),
  };

  return { summary, wrongbook };
}

async function loadRecentBanks(client: QueryClient, studentId: string, recentLimit: number): Promise<LearningRecentBankV1[]> {
  const result = (await client.query(
    `
      WITH session_stats AS (
        SELECT
          bank_id,
          COUNT(*) AS sessions,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_sessions,
          MAX(updated_at) AS last_practiced_at
        FROM practice_sessions
        WHERE student_id = $1
        GROUP BY bank_id
      ),
      attempt_stats AS (
        SELECT
          bank_id,
          COUNT(*) AS attempts,
          COUNT(*) FILTER (WHERE is_correct IS NOT NULL) AS graded_attempts,
          COUNT(*) FILTER (WHERE is_correct = true) AS correct_attempts
        FROM practice_attempts
        WHERE student_id = $1
        GROUP BY bank_id
      ),
      wrong_stats AS (
        SELECT
          bank_id,
          COUNT(*) AS wrong_questions
        FROM wrong_questions
        WHERE student_id = $1
        GROUP BY bank_id
      )
      SELECT
        session_stats.bank_id,
        bank_mappings.bank_name,
        bank_mappings.subject_category,
        bank_mappings.subject_name,
        session_stats.last_practiced_at,
        session_stats.sessions,
        session_stats.completed_sessions,
        attempt_stats.attempts,
        attempt_stats.graded_attempts,
        attempt_stats.correct_attempts,
        wrong_stats.wrong_questions
      FROM session_stats
      LEFT JOIN attempt_stats ON attempt_stats.bank_id = session_stats.bank_id
      LEFT JOIN wrong_stats ON wrong_stats.bank_id = session_stats.bank_id
      LEFT JOIN bank_mappings ON bank_mappings.bank_id = session_stats.bank_id
      ORDER BY session_stats.last_practiced_at DESC, session_stats.bank_id ASC
      LIMIT $2
    `,
    [studentId, recentLimit],
  )) as QueryRows<RecentBankRow>;

  return result.rows.map((row) => {
    const attempts = toCount(row.attempts);
    const gradedAttempts = toCount(row.graded_attempts);
    const correctAttempts = toCount(row.correct_attempts);

    return {
      bankId: row.bank_id,
      bankName: row.bank_name ?? 'Unknown Bank',
      subjectCategory: row.subject_category ?? 'Unknown',
      subjectName: row.subject_name ?? 'Unknown',
      lastPracticedAt: toIso(row.last_practiced_at),
      sessions: toCount(row.sessions),
      completedSessions: toCount(row.completed_sessions),
      attempts,
      gradedAttempts,
      correctAttempts,
      accuracy: toAccuracy(correctAttempts, gradedAttempts),
      wrongQuestions: toCount(row.wrong_questions),
    };
  });
}

async function loadQuestionTypes(client: QueryClient, studentId: string): Promise<LearningQuestionTypeStatV1[]> {
  const result = (await client.query(
    `
      WITH attempt_type_stats AS (
        SELECT
          questions.normalized_type AS question_type,
          COUNT(*) AS attempts,
          COUNT(*) FILTER (WHERE practice_attempts.is_correct IS NOT NULL) AS graded_attempts,
          COUNT(*) FILTER (WHERE practice_attempts.is_correct = true) AS correct_attempts
        FROM practice_attempts
        JOIN questions ON questions.id = practice_attempts.question_id
        WHERE practice_attempts.student_id = $1
        GROUP BY questions.normalized_type
      ),
      wrong_type_stats AS (
        SELECT
          questions.normalized_type AS question_type,
          COUNT(*) AS wrong_questions
        FROM wrong_questions
        JOIN questions ON questions.id = wrong_questions.question_id
        WHERE wrong_questions.student_id = $1
        GROUP BY questions.normalized_type
      )
      SELECT
        COALESCE(attempt_type_stats.question_type, wrong_type_stats.question_type) AS question_type,
        attempt_type_stats.attempts,
        attempt_type_stats.graded_attempts,
        attempt_type_stats.correct_attempts,
        wrong_type_stats.wrong_questions
      FROM attempt_type_stats
      FULL OUTER JOIN wrong_type_stats
        ON wrong_type_stats.question_type = attempt_type_stats.question_type
      ORDER BY COALESCE(attempt_type_stats.attempts, 0) DESC,
        COALESCE(wrong_type_stats.wrong_questions, 0) DESC,
        question_type ASC
    `,
    [studentId],
  )) as QueryRows<QuestionTypeRow>;

  return result.rows.map((row) => {
    const attempts = toCount(row.attempts);
    const gradedAttempts = toCount(row.graded_attempts);
    const correctAttempts = toCount(row.correct_attempts);

    return {
      questionType: row.question_type as LearningQuestionTypeStatV1['questionType'],
      attempts,
      gradedAttempts,
      correctAttempts,
      accuracy: toAccuracy(correctAttempts, gradedAttempts),
      wrongQuestions: toCount(row.wrong_questions),
    };
  });
}

function emptyDashboard(): MemoryDashboard {
  return {
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
    wrongbook: {
      total: 0,
      mastered: 0,
      pending: 0,
      lastWrongAt: null,
    },
  };
}

function toCount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

function toAccuracy(correct: number, graded: number): number | null {
  if (graded <= 0) return null;
  return Number((correct / graded).toFixed(4));
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value ? toIso(value) : null;
}
