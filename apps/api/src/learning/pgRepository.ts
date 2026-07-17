import type {
  LearningGoalSettingsV1,
  LearningQuestionTypeStatV1,
  LearningRecentBankV1,
  LearningReviewMarkKindV1,
  LearningReviewMarkListResponseV1,
  LearningReviewMarkV1,
  LearningSummaryV1,
  LearningTrendDayV1,
  LearningWrongbookSummaryV1,
  UpdateLearningGoalsRequestV1,
  UpsertLearningReviewMarkRequestV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../db/client.js';
import type {
  GoalActivityFacts,
  GoalActivityRow,
  GoalSettingsRow,
  LearningDashboardRepository,
  QueryRows,
  QuestionTypeRow,
  RecentBankRow,
  ReviewMarkRow,
  SummaryRow,
  TrendRow,
} from './types.js';
import {
  addUtcDays,
  buildLearningGoalsResponse,
  defaultGoalSettings,
  mapGoalActivityRow,
  mapGoalSettingsRow,
  mapReviewMarkRow,
  summarizeTrendDays,
  toAccuracy,
  toCount,
  toIso,
  toIsoOrNull,
  toUtcDateKey,
} from './utils.js';

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
    async listReviewMarks({ studentId, bankId, kind, limit, offset }) {
      return loadReviewMarks(client, { studentId, bankId, kind, limit, offset });
    },
    async upsertReviewMark({ studentId, mark, now = new Date() }) {
      return upsertReviewMark(client, studentId, mark, now);
    },
    async deleteReviewMark({ studentId, id }) {
      return deleteReviewMark(client, studentId, id);
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

async function loadReviewMarks(
  client: QueryClient,
  input: {
    studentId: string;
    bankId?: string;
    kind: LearningReviewMarkKindV1;
    limit: number;
    offset: number;
  },
): Promise<LearningReviewMarkListResponseV1> {
  const params: unknown[] = [input.studentId, input.limit + 1, input.offset];
  const filters = ['question_bookmarks.student_id = $1'];

  if (input.bankId) {
    params.push(input.bankId);
    filters.push(`question_bookmarks.bank_id = $${params.length}`);
  }
  if (input.kind === 'favorite') {
    filters.push('question_bookmarks.favorite = true');
  }
  if (input.kind === 'long_term_review') {
    filters.push('question_bookmarks.long_term_review = true');
  }

  const result = (await client.query(
    `
      SELECT
        question_bookmarks.id,
        question_bookmarks.question_id,
        question_bookmarks.bank_id,
        COALESCE(bank_mappings.bank_name, question_bookmarks.bank_id::text) AS bank_name,
        COALESCE(bank_mappings.subject_category, 'Unknown') AS subject_category,
        COALESCE(bank_mappings.subject_name, 'Unknown') AS subject_name,
        questions.normalized_type,
        LEFT(regexp_replace(COALESCE(question_overrides.content_override, questions.content, ''), '\\s+', ' ', 'g'), 120) AS content_preview,
        question_bookmarks.favorite,
        question_bookmarks.long_term_review,
        question_bookmarks.note,
        question_bookmarks.source,
        question_bookmarks.created_at,
        question_bookmarks.updated_at
      FROM question_bookmarks
      JOIN questions ON questions.id = question_bookmarks.question_id
      LEFT JOIN question_overrides ON question_overrides.question_id = questions.id
      LEFT JOIN bank_mappings ON bank_mappings.bank_id = question_bookmarks.bank_id
      WHERE ${filters.join(' AND ')}
      ORDER BY question_bookmarks.updated_at DESC, question_bookmarks.id DESC
      LIMIT $2 OFFSET $3
    `,
    params,
  )) as QueryRows<ReviewMarkRow>;
  const rows = result.rows.slice(0, input.limit);

  return {
    reviewMarks: rows.map(mapReviewMarkRow),
    page: {
      limit: input.limit,
      offset: input.offset,
      hasMore: result.rows.length > input.limit,
    },
  };
}

async function upsertReviewMark(
  client: QueryClient,
  studentId: string,
  mark: UpsertLearningReviewMarkRequestV1,
  now: Date,
): Promise<LearningReviewMarkV1 | null> {
  const result = (await client.query(
    `
      WITH RECURSIVE bank_tree AS (
        SELECT id
        FROM classifications
        WHERE id = $3

        UNION ALL

        SELECT classifications.id
        FROM classifications
        JOIN bank_tree ON classifications.parent_id = bank_tree.id
      ),
      valid_question AS (
        SELECT questions.id
        FROM questions
        WHERE questions.id = $2
          AND questions.classification_id IN (SELECT id FROM bank_tree)
        LIMIT 1
      ),
      upserted AS (
        INSERT INTO question_bookmarks (
          student_id,
          question_id,
          bank_id,
          favorite,
          long_term_review,
          note,
          source,
          created_at,
          updated_at
        )
        SELECT
          $1,
          valid_question.id,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $8
        FROM valid_question
        ON CONFLICT (student_id, question_id, bank_id) DO UPDATE SET
          favorite = EXCLUDED.favorite,
          long_term_review = EXCLUDED.long_term_review,
          note = EXCLUDED.note,
          source = EXCLUDED.source,
          updated_at = EXCLUDED.updated_at
        RETURNING
          id,
          question_id,
          bank_id,
          favorite,
          long_term_review,
          note,
          source,
          created_at,
          updated_at
      )
      SELECT
        upserted.id,
        upserted.question_id,
        upserted.bank_id,
        COALESCE(bank_mappings.bank_name, upserted.bank_id::text) AS bank_name,
        COALESCE(bank_mappings.subject_category, 'Unknown') AS subject_category,
        COALESCE(bank_mappings.subject_name, 'Unknown') AS subject_name,
        questions.normalized_type,
        LEFT(regexp_replace(COALESCE(question_overrides.content_override, questions.content, ''), '\\s+', ' ', 'g'), 120) AS content_preview,
        upserted.favorite,
        upserted.long_term_review,
        upserted.note,
        upserted.source,
        upserted.created_at,
        upserted.updated_at
      FROM upserted
      JOIN questions ON questions.id = upserted.question_id
      LEFT JOIN question_overrides ON question_overrides.question_id = questions.id
      LEFT JOIN bank_mappings ON bank_mappings.bank_id = upserted.bank_id
    `,
    [
      studentId,
      mark.questionId,
      mark.bankId,
      mark.favorite,
      mark.longTermReview,
      mark.note,
      mark.source,
      now.toISOString(),
    ],
  )) as QueryRows<ReviewMarkRow>;

  return result.rows[0] ? mapReviewMarkRow(result.rows[0]) : null;
}

async function deleteReviewMark(client: QueryClient, studentId: string, id: string): Promise<boolean> {
  const result = (await client.query(
    `
      DELETE FROM question_bookmarks
      WHERE student_id = $1
        AND id = $2
    `,
    [studentId, id],
  )) as { rowCount?: number | null };

  return (result.rowCount ?? 0) > 0;
}
