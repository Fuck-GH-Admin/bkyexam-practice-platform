import type {
  LearningReviewMarkKindV1,
  LearningReviewMarkListResponseV1,
  LearningReviewMarkSourceV1,
  LearningReviewMarkV1,
  LearningDashboardResponseV1,
  LearningGoalSettingsV1,
  LearningGoalsResponseV1,
  LearningTrendsResponseV1,
  UpdateLearningGoalsRequestV1,
  UpsertLearningReviewMarkRequestV1,
} from '@bkyexam-practice/shared';

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
  listReviewMarks(input: {
    studentId: string;
    bankId?: string;
    kind: LearningReviewMarkKindV1;
    limit: number;
    offset: number;
  }): Promise<LearningReviewMarkListResponseV1>;
  upsertReviewMark(input: {
    studentId: string;
    mark: UpsertLearningReviewMarkRequestV1;
    now?: Date;
  }): Promise<LearningReviewMarkV1 | null>;
  deleteReviewMark(input: {
    studentId: string;
    id: string;
  }): Promise<boolean>;
}

export interface QueryRows<T> {
  rows: T[];
}

export type MemoryDashboard = Omit<LearningDashboardResponseV1, 'generatedAt'> & {
  generatedAt?: string;
};

export type MemoryTrends = Omit<LearningTrendsResponseV1, 'generatedAt'> & {
  generatedAt?: string;
};

export interface SummaryRow {
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

export interface RecentBankRow {
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

export interface QuestionTypeRow {
  question_type: string;
  attempts: string | null;
  graded_attempts: string | null;
  correct_attempts: string | null;
  wrong_questions: string | null;
}

export interface TrendRow {
  date: string;
  sessions_started: string | number | null;
  sessions_completed: string | number | null;
  attempts: string | number | null;
  graded_attempts: string | number | null;
  correct_attempts: string | number | null;
  wrong_questions_touched: string | number | null;
}

export interface GoalSettingsRow {
  daily_attempts_target: string | number | null;
  weekly_active_days_target: string | number | null;
  wrong_questions_review_target: string | number | null;
  updated_at: Date | string;
}

export interface GoalActivityRow {
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

export interface GoalActivityFacts {
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

export interface ReviewMarkRow {
  id: string;
  question_id: string;
  bank_id: string;
  bank_name: string | null;
  subject_category: string | null;
  subject_name: string | null;
  normalized_type: LearningReviewMarkV1['questionType'] | null;
  content_preview: string | null;
  favorite: boolean;
  long_term_review: boolean;
  note: string | null;
  source: LearningReviewMarkSourceV1;
  created_at: Date | string;
  updated_at: Date | string;
}
