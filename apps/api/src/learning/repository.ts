import type {
  LearningDashboardResponseV1,
  LearningFeedbackSignalV1,
  LearningGoalSettingsV1,
  LearningGoalsResponseV1,
  LearningQuestionTypeStatV1,
  LearningRecentBankV1,
  LearningSummaryV1,
  LearningTrendDayV1,
  LearningTrendSummaryV1,
  LearningTrendsResponseV1,
  LearningWrongbookSummaryV1,
  UpdateLearningGoalsRequestV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../db/client.js';

export interface LearningDashboardRepository {
  getDashboard(input: {
    studentId: string;
    recentLimit: number;
    now?: Date;
  }): Promise<LearningDashboardResponseV1>;
  getTrends(input: {
    studentId: string;
    days: number;
    now?: Date;
  }): Promise<LearningTrendsResponseV1>;
  getGoals(input: {
    studentId: string;
    now?: Date;
  }): Promise<LearningGoalsResponseV1>;
  updateGoals(input: {
    studentId: string;
    goals: UpdateLearningGoalsRequestV1;
    now?: Date;
  }): Promise<LearningGoalsResponseV1>;
}

interface QueryRows<T> {
  rows: T[];
}

type MemoryDashboard = Omit<LearningDashboardResponseV1, 'generatedAt'> & {
  generatedAt?: string;
};

type MemoryTrends = Omit<LearningTrendsResponseV1, 'generatedAt'> & {
  generatedAt?: string;
};

export function createMemoryLearningDashboardRepository(
  dashboards: Record<string, MemoryDashboard> = {},
  trends: Record<string, MemoryTrends> = {},
  goals: Record<string, LearningGoalSettingsV1> = {},
): LearningDashboardRepository {
  const goalSettingsByStudent = new Map(Object.entries(goals).map(([studentId, settings]) => [
    studentId,
    cloneGoalSettings(settings),
  ]));

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
    async getTrends({ studentId, days, now = new Date() }) {
      const trend = trends[studentId];
      if (!trend) return emptyTrendResponse(days, now);

      return {
        generatedAt: trend.generatedAt ?? now.toISOString(),
        fromDate: trend.fromDate,
        toDate: trend.toDate,
        days: trend.days,
        daily: trend.daily.map((day) => ({ ...day })),
        summary: { ...trend.summary },
      };
    },
    async getGoals({ studentId, now = new Date() }) {
      return buildLearningGoalsResponse(
        goalSettingsByStudent.get(studentId) ?? defaultGoalSettings(),
        emptyGoalActivityFacts(now),
        now,
      );
    },
    async updateGoals({ studentId, goals: changes, now = new Date() }) {
      const existing = goalSettingsByStudent.get(studentId) ?? defaultGoalSettings();
      const updated: LearningGoalSettingsV1 = {
        ...existing,
        ...changes,
        source: 'student',
        updatedAt: now.toISOString(),
      };
      goalSettingsByStudent.set(studentId, cloneGoalSettings(updated));

      return buildLearningGoalsResponse(updated, emptyGoalActivityFacts(now), now);
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

interface TrendRow {
  date: string;
  sessions_started: string | number | null;
  sessions_completed: string | number | null;
  attempts: string | number | null;
  graded_attempts: string | number | null;
  correct_attempts: string | number | null;
  wrong_questions_touched: string | number | null;
}

interface GoalSettingsRow {
  daily_attempts_target: string | number | null;
  weekly_active_days_target: string | number | null;
  wrong_questions_review_target: string | number | null;
  updated_at: Date | string;
}

interface GoalActivityRow {
  today_date: string;
  week_from_date: string;
  week_to_date: string;
  today_attempts: string | number | null;
  today_graded_attempts: string | number | null;
  today_correct_attempts: string | number | null;
  week_active_days: string | number | null;
  week_attempts: string | number | null;
  week_graded_attempts: string | number | null;
  week_correct_attempts: string | number | null;
  wrong_questions: string | number | null;
  mastered_wrong_questions: string | number | null;
  pending_wrong_questions: string | number | null;
  wrong_questions_reviewed_today: string | number | null;
}

interface GoalActivityFacts {
  todayDate: string;
  weekFromDate: string;
  weekToDate: string;
  todayAttempts: number;
  todayGradedAttempts: number;
  todayCorrectAttempts: number;
  weekActiveDays: number;
  weekAttempts: number;
  weekGradedAttempts: number;
  weekCorrectAttempts: number;
  wrongQuestions: number;
  masteredWrongQuestions: number;
  pendingWrongQuestions: number;
  wrongQuestionsReviewedToday: number;
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
    async getTrends({ studentId, days, now = new Date() }) {
      const toDate = toUtcDateKey(now);
      const daily = await loadDailyTrends(client, studentId, days, toDate);

      return {
        generatedAt: now.toISOString(),
        fromDate: daily[0]?.date ?? addUtcDays(toDate, -(days - 1)),
        toDate: daily[daily.length - 1]?.date ?? toDate,
        days,
        daily,
        summary: summarizeTrendDays(daily, days),
      };
    },
    async getGoals({ studentId, now = new Date() }) {
      const [settings, facts] = await Promise.all([
        loadGoalSettings(client, studentId),
        loadGoalActivityFacts(client, studentId, now),
      ]);

      return buildLearningGoalsResponse(settings, facts, now);
    },
    async updateGoals({ studentId, goals, now = new Date() }) {
      const existing = await loadGoalSettings(client, studentId);
      const settings = await upsertGoalSettings(client, studentId, {
        ...existing,
        ...goals,
        source: 'student',
        updatedAt: now.toISOString(),
      });
      const facts = await loadGoalActivityFacts(client, studentId, now);

      return buildLearningGoalsResponse(settings, facts, now);
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

async function loadDailyTrends(
  client: QueryClient,
  studentId: string,
  days: number,
  toDate: string,
): Promise<LearningTrendDayV1[]> {
  const result = (await client.query(
    `
      WITH bounds AS (
        SELECT
          ($2::date - (($3::int - 1) * INTERVAL '1 day'))::date AS from_date,
          $2::date AS to_date
      ),
      days AS (
        SELECT series.day::date AS day
        FROM bounds, generate_series(bounds.from_date, bounds.to_date, INTERVAL '1 day') AS series(day)
      ),
      session_started_stats AS (
        SELECT
          (created_at AT TIME ZONE 'UTC')::date AS day,
          COUNT(*) AS sessions_started
        FROM practice_sessions, bounds
        WHERE student_id = $1
          AND (created_at AT TIME ZONE 'UTC')::date BETWEEN bounds.from_date AND bounds.to_date
        GROUP BY 1
      ),
      session_completed_stats AS (
        SELECT
          (completed_at AT TIME ZONE 'UTC')::date AS day,
          COUNT(*) AS sessions_completed
        FROM practice_sessions, bounds
        WHERE student_id = $1
          AND status = 'completed'
          AND completed_at IS NOT NULL
          AND (completed_at AT TIME ZONE 'UTC')::date BETWEEN bounds.from_date AND bounds.to_date
        GROUP BY 1
      ),
      attempt_stats AS (
        SELECT
          (created_at AT TIME ZONE 'UTC')::date AS day,
          COUNT(*) AS attempts,
          COUNT(*) FILTER (WHERE is_correct IS NOT NULL) AS graded_attempts,
          COUNT(*) FILTER (WHERE is_correct = true) AS correct_attempts
        FROM practice_attempts, bounds
        WHERE student_id = $1
          AND (created_at AT TIME ZONE 'UTC')::date BETWEEN bounds.from_date AND bounds.to_date
        GROUP BY 1
      ),
      wrong_stats AS (
        SELECT
          (last_wrong_at AT TIME ZONE 'UTC')::date AS day,
          COUNT(*) AS wrong_questions_touched
        FROM wrong_questions, bounds
        WHERE student_id = $1
          AND (last_wrong_at AT TIME ZONE 'UTC')::date BETWEEN bounds.from_date AND bounds.to_date
        GROUP BY 1
      )
      SELECT
        to_char(days.day, 'YYYY-MM-DD') AS date,
        COALESCE(session_started_stats.sessions_started, 0) AS sessions_started,
        COALESCE(session_completed_stats.sessions_completed, 0) AS sessions_completed,
        COALESCE(attempt_stats.attempts, 0) AS attempts,
        COALESCE(attempt_stats.graded_attempts, 0) AS graded_attempts,
        COALESCE(attempt_stats.correct_attempts, 0) AS correct_attempts,
        COALESCE(wrong_stats.wrong_questions_touched, 0) AS wrong_questions_touched
      FROM days
      LEFT JOIN session_started_stats ON session_started_stats.day = days.day
      LEFT JOIN session_completed_stats ON session_completed_stats.day = days.day
      LEFT JOIN attempt_stats ON attempt_stats.day = days.day
      LEFT JOIN wrong_stats ON wrong_stats.day = days.day
      ORDER BY days.day ASC
    `,
    [studentId, toDate, days],
  )) as QueryRows<TrendRow>;

  return result.rows.map((row) => {
    const attempts = toCount(row.attempts);
    const gradedAttempts = toCount(row.graded_attempts);
    const correctAttempts = toCount(row.correct_attempts);

    return {
      date: row.date,
      sessionsStarted: toCount(row.sessions_started),
      sessionsCompleted: toCount(row.sessions_completed),
      attempts,
      gradedAttempts,
      correctAttempts,
      accuracy: toAccuracy(correctAttempts, gradedAttempts),
      wrongQuestionsTouched: toCount(row.wrong_questions_touched),
    };
  });
}

async function loadGoalSettings(client: QueryClient, studentId: string): Promise<LearningGoalSettingsV1> {
  const result = (await client.query(
    `
      SELECT
        daily_attempts_target,
        weekly_active_days_target,
        wrong_questions_review_target,
        updated_at
      FROM student_learning_goals
      WHERE student_id = $1
      LIMIT 1
    `,
    [studentId],
  )) as QueryRows<GoalSettingsRow>;
  const row = result.rows[0];
  if (!row) return defaultGoalSettings();

  return mapGoalSettingsRow(row);
}

async function upsertGoalSettings(
  client: QueryClient,
  studentId: string,
  settings: LearningGoalSettingsV1,
): Promise<LearningGoalSettingsV1> {
  const result = (await client.query(
    `
      INSERT INTO student_learning_goals (
        student_id,
        daily_attempts_target,
        weekly_active_days_target,
        wrong_questions_review_target,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (student_id) DO UPDATE SET
        daily_attempts_target = EXCLUDED.daily_attempts_target,
        weekly_active_days_target = EXCLUDED.weekly_active_days_target,
        wrong_questions_review_target = EXCLUDED.wrong_questions_review_target,
        updated_at = EXCLUDED.updated_at
      RETURNING
        daily_attempts_target,
        weekly_active_days_target,
        wrong_questions_review_target,
        updated_at
    `,
    [
      studentId,
      settings.dailyAttemptsTarget,
      settings.weeklyActiveDaysTarget,
      settings.wrongQuestionsReviewTarget,
      settings.updatedAt,
    ],
  )) as QueryRows<GoalSettingsRow>;
  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to upsert learning goals.');
  }

  return mapGoalSettingsRow(row);
}

async function loadGoalActivityFacts(
  client: QueryClient,
  studentId: string,
  now: Date,
): Promise<GoalActivityFacts> {
  const today = toUtcDateKey(now);
  const result = (await client.query(
    `
      WITH bounds AS (
        SELECT
          $2::date AS today,
          ($2::date - INTERVAL '6 days')::date AS week_from
      ),
      activity_days AS (
        SELECT (created_at AT TIME ZONE 'UTC')::date AS day
        FROM practice_sessions, bounds
        WHERE student_id = $1
          AND (created_at AT TIME ZONE 'UTC')::date BETWEEN bounds.week_from AND bounds.today

        UNION

        SELECT (completed_at AT TIME ZONE 'UTC')::date AS day
        FROM practice_sessions, bounds
        WHERE student_id = $1
          AND completed_at IS NOT NULL
          AND (completed_at AT TIME ZONE 'UTC')::date BETWEEN bounds.week_from AND bounds.today

        UNION

        SELECT (created_at AT TIME ZONE 'UTC')::date AS day
        FROM practice_attempts, bounds
        WHERE student_id = $1
          AND (created_at AT TIME ZONE 'UTC')::date BETWEEN bounds.week_from AND bounds.today

        UNION

        SELECT (last_wrong_at AT TIME ZONE 'UTC')::date AS day
        FROM wrong_questions, bounds
        WHERE student_id = $1
          AND (last_wrong_at AT TIME ZONE 'UTC')::date BETWEEN bounds.week_from AND bounds.today
      ),
      attempt_window AS (
        SELECT
          (created_at AT TIME ZONE 'UTC')::date AS day,
          is_correct
        FROM practice_attempts, bounds
        WHERE student_id = $1
          AND (created_at AT TIME ZONE 'UTC')::date BETWEEN bounds.week_from AND bounds.today
      ),
      wrongbook_stats AS (
        SELECT
          COUNT(*) AS wrong_questions,
          COUNT(*) FILTER (WHERE mastered = true) AS mastered_wrong_questions,
          COUNT(*) FILTER (WHERE mastered = false) AS pending_wrong_questions
        FROM wrong_questions
        WHERE student_id = $1
      )
      SELECT
        to_char(bounds.today, 'YYYY-MM-DD') AS today_date,
        to_char(bounds.week_from, 'YYYY-MM-DD') AS week_from_date,
        to_char(bounds.today, 'YYYY-MM-DD') AS week_to_date,
        (SELECT COUNT(*) FROM attempt_window WHERE day = bounds.today) AS today_attempts,
        (
          SELECT COUNT(*)
          FROM attempt_window
          WHERE day = bounds.today
            AND is_correct IS NOT NULL
        ) AS today_graded_attempts,
        (
          SELECT COUNT(*)
          FROM attempt_window
          WHERE day = bounds.today
            AND is_correct = true
        ) AS today_correct_attempts,
        (SELECT COUNT(DISTINCT day) FROM activity_days) AS week_active_days,
        (SELECT COUNT(*) FROM attempt_window) AS week_attempts,
        (SELECT COUNT(*) FROM attempt_window WHERE is_correct IS NOT NULL) AS week_graded_attempts,
        (SELECT COUNT(*) FROM attempt_window WHERE is_correct = true) AS week_correct_attempts,
        wrongbook_stats.wrong_questions,
        wrongbook_stats.mastered_wrong_questions,
        wrongbook_stats.pending_wrong_questions,
        (
          SELECT COALESCE(SUM(completed_count), 0)
          FROM practice_sessions
          WHERE student_id = $1
            AND origin = 'wrongbook'
            AND status = 'completed'
            AND completed_at IS NOT NULL
            AND (completed_at AT TIME ZONE 'UTC')::date = bounds.today
        ) AS wrong_questions_reviewed_today
      FROM bounds
      CROSS JOIN wrongbook_stats
    `,
    [studentId, today],
  )) as QueryRows<GoalActivityRow>;

  return mapGoalActivityRow(result.rows[0], now);
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

function emptyTrendResponse(days: number, now: Date): LearningTrendsResponseV1 {
  const toDate = toUtcDateKey(now);
  const fromDate = addUtcDays(toDate, -(days - 1));
  const daily = Array.from({ length: days }, (_, index) => emptyTrendDay(addUtcDays(fromDate, index)));

  return {
    generatedAt: now.toISOString(),
    fromDate,
    toDate,
    days,
    daily,
    summary: summarizeTrendDays(daily, days),
  };
}

function emptyTrendDay(date: string): LearningTrendDayV1 {
  return {
    date,
    sessionsStarted: 0,
    sessionsCompleted: 0,
    attempts: 0,
    gradedAttempts: 0,
    correctAttempts: 0,
    accuracy: null,
    wrongQuestionsTouched: 0,
  };
}

function summarizeTrendDays(daily: LearningTrendDayV1[], days: number): LearningTrendSummaryV1 {
  let activeDays = 0;
  let currentRun = 0;
  let longestStreakDays = 0;

  for (const day of daily) {
    if (isActiveTrendDay(day)) {
      activeDays += 1;
      currentRun += 1;
      longestStreakDays = Math.max(longestStreakDays, currentRun);
    } else {
      currentRun = 0;
    }
  }

  let currentStreakDays = 0;
  for (let index = daily.length - 1; index >= 0; index -= 1) {
    if (!isActiveTrendDay(daily[index])) break;
    currentStreakDays += 1;
  }

  const totals = daily.reduce((accumulator, day) => ({
    sessionsStarted: accumulator.sessionsStarted + day.sessionsStarted,
    sessionsCompleted: accumulator.sessionsCompleted + day.sessionsCompleted,
    attempts: accumulator.attempts + day.attempts,
    gradedAttempts: accumulator.gradedAttempts + day.gradedAttempts,
    correctAttempts: accumulator.correctAttempts + day.correctAttempts,
    wrongQuestionsTouched: accumulator.wrongQuestionsTouched + day.wrongQuestionsTouched,
  }), {
    sessionsStarted: 0,
    sessionsCompleted: 0,
    attempts: 0,
    gradedAttempts: 0,
    correctAttempts: 0,
    wrongQuestionsTouched: 0,
  });

  return {
    days,
    activeDays,
    currentStreakDays,
    longestStreakDays,
    ...totals,
    accuracy: toAccuracy(totals.correctAttempts, totals.gradedAttempts),
  };
}

function isActiveTrendDay(day: LearningTrendDayV1 | undefined): boolean {
  if (!day) return false;
  return day.sessionsStarted + day.sessionsCompleted + day.attempts + day.wrongQuestionsTouched > 0;
}

function defaultGoalSettings(): LearningGoalSettingsV1 {
  return {
    dailyAttemptsTarget: 20,
    weeklyActiveDaysTarget: 5,
    wrongQuestionsReviewTarget: 10,
    source: 'default',
    updatedAt: null,
  };
}

function cloneGoalSettings(settings: LearningGoalSettingsV1): LearningGoalSettingsV1 {
  return { ...settings };
}

function mapGoalSettingsRow(row: GoalSettingsRow): LearningGoalSettingsV1 {
  return {
    dailyAttemptsTarget: toNullableCount(row.daily_attempts_target),
    weeklyActiveDaysTarget: toNullableCount(row.weekly_active_days_target),
    wrongQuestionsReviewTarget: toNullableCount(row.wrong_questions_review_target),
    source: 'student',
    updatedAt: toIso(row.updated_at),
  };
}

function emptyGoalActivityFacts(now: Date): GoalActivityFacts {
  const todayDate = toUtcDateKey(now);

  return {
    todayDate,
    weekFromDate: addUtcDays(todayDate, -6),
    weekToDate: todayDate,
    todayAttempts: 0,
    todayGradedAttempts: 0,
    todayCorrectAttempts: 0,
    weekActiveDays: 0,
    weekAttempts: 0,
    weekGradedAttempts: 0,
    weekCorrectAttempts: 0,
    wrongQuestions: 0,
    masteredWrongQuestions: 0,
    pendingWrongQuestions: 0,
    wrongQuestionsReviewedToday: 0,
  };
}

function mapGoalActivityRow(row: GoalActivityRow | undefined, now: Date): GoalActivityFacts {
  if (!row) return emptyGoalActivityFacts(now);

  return {
    todayDate: row.today_date,
    weekFromDate: row.week_from_date,
    weekToDate: row.week_to_date,
    todayAttempts: toCount(row.today_attempts),
    todayGradedAttempts: toCount(row.today_graded_attempts),
    todayCorrectAttempts: toCount(row.today_correct_attempts),
    weekActiveDays: toCount(row.week_active_days),
    weekAttempts: toCount(row.week_attempts),
    weekGradedAttempts: toCount(row.week_graded_attempts),
    weekCorrectAttempts: toCount(row.week_correct_attempts),
    wrongQuestions: toCount(row.wrong_questions),
    masteredWrongQuestions: toCount(row.mastered_wrong_questions),
    pendingWrongQuestions: toCount(row.pending_wrong_questions),
    wrongQuestionsReviewedToday: toCount(row.wrong_questions_reviewed_today),
  };
}

function buildLearningGoalsResponse(
  settings: LearningGoalSettingsV1,
  facts: GoalActivityFacts,
  now: Date,
): LearningGoalsResponseV1 {
  const todayAccuracy = toAccuracy(facts.todayCorrectAttempts, facts.todayGradedAttempts);
  const weekAccuracy = toAccuracy(facts.weekCorrectAttempts, facts.weekGradedAttempts);
  const dailyAttempts = buildGoalMetric(facts.todayAttempts, settings.dailyAttemptsTarget);
  const weeklyActiveDays = buildGoalMetric(facts.weekActiveDays, settings.weeklyActiveDaysTarget);
  const wrongQuestionsReview = buildWrongbookGoalMetric(
    facts.wrongQuestionsReviewedToday,
    settings.wrongQuestionsReviewTarget,
    facts.pendingWrongQuestions,
  );
  const progress: LearningGoalsResponseV1['progress'] = {
    today: {
      date: facts.todayDate,
      attempts: facts.todayAttempts,
      gradedAttempts: facts.todayGradedAttempts,
      correctAttempts: facts.todayCorrectAttempts,
      accuracy: todayAccuracy,
      dailyAttempts,
    },
    week: {
      fromDate: facts.weekFromDate,
      toDate: facts.weekToDate,
      activeDays: facts.weekActiveDays,
      attempts: facts.weekAttempts,
      gradedAttempts: facts.weekGradedAttempts,
      correctAttempts: facts.weekCorrectAttempts,
      accuracy: weekAccuracy,
      weeklyActiveDays,
    },
    wrongbook: {
      total: facts.wrongQuestions,
      mastered: facts.masteredWrongQuestions,
      pending: facts.pendingWrongQuestions,
      reviewedToday: facts.wrongQuestionsReviewedToday,
      wrongQuestionsReview,
    },
  };

  return {
    generatedAt: now.toISOString(),
    goals: cloneGoalSettings(settings),
    progress,
    feedback: buildFeedbackSignals(progress),
  };
}

function buildGoalMetric(current: number, target: number | null) {
  if (target === null) {
    return { current, target, completed: false, remaining: null };
  }

  return {
    current,
    target,
    completed: current >= target,
    remaining: Math.max(target - current, 0),
  };
}

function buildWrongbookGoalMetric(current: number, target: number | null, pendingWrongQuestions: number) {
  if (target === null) {
    return { current, target, completed: false, remaining: null };
  }
  if (pendingWrongQuestions === 0) {
    return { current, target, completed: true, remaining: 0 };
  }

  return {
    current,
    target,
    completed: current >= target,
    remaining: Math.max(target - current, 0),
  };
}

function buildFeedbackSignals(progress: LearningGoalsResponseV1['progress']): LearningFeedbackSignalV1[] {
  const signals: LearningFeedbackSignalV1[] = [];
  const daily = progress.today.dailyAttempts;
  if (daily.target !== null) {
    signals.push(daily.completed
      ? {
        type: 'daily_attempts_goal',
        severity: 'success',
        title: 'Daily practice goal reached',
        message: `Completed ${daily.current}/${daily.target} attempts today.`,
        action: 'view_trends',
      }
      : {
        type: 'daily_attempts_goal',
        severity: 'info',
        title: 'Daily practice goal in progress',
        message: `${daily.remaining} more attempts needed to reach today's goal.`,
        action: 'start_practice',
      });
  }

  const weekly = progress.week.weeklyActiveDays;
  if (weekly.target !== null) {
    signals.push(weekly.completed
      ? {
        type: 'weekly_active_days_goal',
        severity: 'success',
        title: 'Weekly activity goal reached',
        message: `Active on ${weekly.current}/${weekly.target} target days this week.`,
        action: 'view_trends',
      }
      : {
        type: 'weekly_active_days_goal',
        severity: 'info',
        title: 'Weekly activity goal in progress',
        message: `${weekly.remaining} more active days needed for this week's goal.`,
        action: 'start_practice',
      });
  }

  const wrongbook = progress.wrongbook.wrongQuestionsReview;
  if (wrongbook.target !== null) {
    if (progress.wrongbook.pending === 0) {
      signals.push({
        type: 'wrongbook_review_goal',
        severity: 'success',
        title: 'No pending wrong questions',
        message: 'All current wrong questions are mastered.',
        action: 'view_trends',
      });
    } else if (wrongbook.completed) {
      signals.push({
        type: 'wrongbook_review_goal',
        severity: 'success',
        title: 'Wrongbook review goal reached',
        message: `Reviewed ${wrongbook.current}/${wrongbook.target} wrong questions today.`,
        action: 'view_trends',
      });
    } else {
      signals.push({
        type: 'wrongbook_review_needed',
        severity: 'warning',
        title: 'Wrongbook review recommended',
        message: `${progress.wrongbook.pending} pending wrong questions remain; review ${wrongbook.remaining} more today.`,
        action: 'review_wrongbook',
      });
    }
  }

  if (progress.week.gradedAttempts >= 3 && progress.week.accuracy !== null && progress.week.accuracy < 0.6) {
    signals.push({
      type: 'accuracy_attention',
      severity: 'warning',
      title: 'Accuracy needs attention',
      message: `Weekly accuracy is ${(progress.week.accuracy * 100).toFixed(1)}%; review explanations before continuing.`,
      action: 'view_trends',
    });
  }

  return signals;
}

function toCount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

function toNullableCount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return toCount(value);
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

function toUtcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(date: string, offset: number): string {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10)) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}
