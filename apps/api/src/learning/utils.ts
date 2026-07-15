import type {
  LearningFeedbackSignalV1,
  LearningGoalSettingsV1,
  LearningGoalsResponseV1,
  LearningReviewMarkV1,
  LearningTrendDayV1,
  LearningTrendsResponseV1,
  LearningTrendSummaryV1,
} from '@bkyexam-practice/shared';
import type { GoalActivityFacts, GoalActivityRow, GoalSettingsRow, MemoryDashboard, ReviewMarkRow } from './types.js';

export function emptyDashboard(): MemoryDashboard {
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

export function emptyTrendResponse(days: number, now: Date): LearningTrendsResponseV1 {
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

export function summarizeTrendDays(daily: LearningTrendDayV1[], days: number): LearningTrendSummaryV1 {
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

export function defaultGoalSettings(): LearningGoalSettingsV1 {
  return {
    dailyAttemptsTarget: 20,
    weeklyActiveDaysTarget: 5,
    wrongQuestionsReviewTarget: 10,
    source: 'default',
    updatedAt: null,
  };
}

export function cloneGoalSettings(settings: LearningGoalSettingsV1): LearningGoalSettingsV1 {
  return { ...settings };
}

export function mapGoalSettingsRow(row: GoalSettingsRow): LearningGoalSettingsV1 {
  return {
    dailyAttemptsTarget: toNullableCount(row.daily_attempts_target),
    weeklyActiveDaysTarget: toNullableCount(row.weekly_active_days_target),
    wrongQuestionsReviewTarget: toNullableCount(row.wrong_questions_review_target),
    source: 'student',
    updatedAt: toIso(row.updated_at),
  };
}

export function emptyGoalActivityFacts(now: Date): GoalActivityFacts {
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

export function mapGoalActivityRow(row: GoalActivityRow | undefined, now: Date): GoalActivityFacts {
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

export function mapReviewMarkRow(row: ReviewMarkRow): LearningReviewMarkV1 {
  return {
    id: row.id,
    questionId: row.question_id,
    bankId: row.bank_id,
    bankName: row.bank_name ?? row.bank_id,
    subjectCategory: row.subject_category ?? 'Unknown',
    subjectName: row.subject_name ?? 'Unknown',
    questionType: row.normalized_type ?? 'unknown',
    contentPreview: row.content_preview ?? '',
    favorite: row.favorite,
    longTermReview: row.long_term_review,
    note: row.note ?? '',
    source: row.source,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function buildLearningGoalsResponse(
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

export function toCount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

export function toNullableCount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return toCount(value);
}

export function toAccuracy(correct: number, graded: number): number | null {
  if (graded <= 0) return null;
  return Number((correct / graded).toFixed(4));
}

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toIsoOrNull(value: Date | string | null): string | null {
  return value ? toIso(value) : null;
}

export function toLowerUuid(value: string): string {
  return value.toLowerCase();
}

export function toUtcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addUtcDays(date: string, offset: number): string {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10)) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}
