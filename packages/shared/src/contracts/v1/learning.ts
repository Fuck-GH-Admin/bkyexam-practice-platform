import { z } from 'zod';
import { QuestionTypeSchema } from '../../question.js';
import { CanonicalUuidV1Schema } from './common.js';

const IsoTimestampV1Schema = z.string().datetime({ offset: true });

const AccuracyV1Schema = z.number().min(0).max(1).nullable();

export const LearningDateV1Schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type LearningDateV1 = z.infer<typeof LearningDateV1Schema>;

export const LearningSummaryV1Schema = z.object({
  activeSessions: z.number().int().nonnegative(),
  completedSessions: z.number().int().nonnegative(),
  reviewSessions: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  gradedAttempts: z.number().int().nonnegative(),
  correctAttempts: z.number().int().nonnegative(),
  accuracy: AccuracyV1Schema,
  wrongQuestions: z.number().int().nonnegative(),
  masteredWrongQuestions: z.number().int().nonnegative(),
  pendingWrongQuestions: z.number().int().nonnegative(),
  lastPracticedAt: IsoTimestampV1Schema.nullable(),
}).strict().superRefine((summary, context) => {
  if (summary.gradedAttempts > summary.attempts) {
    context.addIssue({
      code: 'custom',
      path: ['gradedAttempts'],
      message: 'gradedAttempts cannot exceed attempts',
    });
  }
  if (summary.correctAttempts > summary.gradedAttempts) {
    context.addIssue({
      code: 'custom',
      path: ['correctAttempts'],
      message: 'correctAttempts cannot exceed gradedAttempts',
    });
  }
  if (summary.masteredWrongQuestions > summary.wrongQuestions) {
    context.addIssue({
      code: 'custom',
      path: ['masteredWrongQuestions'],
      message: 'masteredWrongQuestions cannot exceed wrongQuestions',
    });
  }
  if (summary.pendingWrongQuestions > summary.wrongQuestions) {
    context.addIssue({
      code: 'custom',
      path: ['pendingWrongQuestions'],
      message: 'pendingWrongQuestions cannot exceed wrongQuestions',
    });
  }
});
export type LearningSummaryV1 = z.infer<typeof LearningSummaryV1Schema>;

export const LearningRecentBankV1Schema = z.object({
  bankId: CanonicalUuidV1Schema,
  bankName: z.string().min(1),
  subjectCategory: z.string().min(1),
  subjectName: z.string().min(1),
  lastPracticedAt: IsoTimestampV1Schema,
  sessions: z.number().int().nonnegative(),
  completedSessions: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  gradedAttempts: z.number().int().nonnegative(),
  correctAttempts: z.number().int().nonnegative(),
  accuracy: AccuracyV1Schema,
  wrongQuestions: z.number().int().nonnegative(),
}).strict().superRefine((bank, context) => {
  if (bank.completedSessions > bank.sessions) {
    context.addIssue({
      code: 'custom',
      path: ['completedSessions'],
      message: 'completedSessions cannot exceed sessions',
    });
  }
  if (bank.gradedAttempts > bank.attempts) {
    context.addIssue({
      code: 'custom',
      path: ['gradedAttempts'],
      message: 'gradedAttempts cannot exceed attempts',
    });
  }
  if (bank.correctAttempts > bank.gradedAttempts) {
    context.addIssue({
      code: 'custom',
      path: ['correctAttempts'],
      message: 'correctAttempts cannot exceed gradedAttempts',
    });
  }
});
export type LearningRecentBankV1 = z.infer<typeof LearningRecentBankV1Schema>;

export const LearningQuestionTypeStatV1Schema = z.object({
  questionType: QuestionTypeSchema,
  attempts: z.number().int().nonnegative(),
  gradedAttempts: z.number().int().nonnegative(),
  correctAttempts: z.number().int().nonnegative(),
  accuracy: AccuracyV1Schema,
  wrongQuestions: z.number().int().nonnegative(),
}).strict().superRefine((stat, context) => {
  if (stat.gradedAttempts > stat.attempts) {
    context.addIssue({
      code: 'custom',
      path: ['gradedAttempts'],
      message: 'gradedAttempts cannot exceed attempts',
    });
  }
  if (stat.correctAttempts > stat.gradedAttempts) {
    context.addIssue({
      code: 'custom',
      path: ['correctAttempts'],
      message: 'correctAttempts cannot exceed gradedAttempts',
    });
  }
});
export type LearningQuestionTypeStatV1 = z.infer<typeof LearningQuestionTypeStatV1Schema>;

export const LearningWrongbookSummaryV1Schema = z.object({
  total: z.number().int().nonnegative(),
  mastered: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  lastWrongAt: IsoTimestampV1Schema.nullable(),
}).strict().superRefine((summary, context) => {
  if (summary.mastered > summary.total) {
    context.addIssue({
      code: 'custom',
      path: ['mastered'],
      message: 'mastered cannot exceed total',
    });
  }
  if (summary.pending > summary.total) {
    context.addIssue({
      code: 'custom',
      path: ['pending'],
      message: 'pending cannot exceed total',
    });
  }
});
export type LearningWrongbookSummaryV1 = z.infer<typeof LearningWrongbookSummaryV1Schema>;

export const LearningDashboardResponseV1Schema = z.object({
  generatedAt: IsoTimestampV1Schema,
  summary: LearningSummaryV1Schema,
  recentBanks: z.array(LearningRecentBankV1Schema),
  questionTypes: z.array(LearningQuestionTypeStatV1Schema),
  wrongbook: LearningWrongbookSummaryV1Schema,
}).strict();
export type LearningDashboardResponseV1 = z.infer<typeof LearningDashboardResponseV1Schema>;

export const GetLearningDashboardRequestV1Schema = z.object({
  recentLimit: z.coerce.number().int().min(1).max(10).default(5),
}).strict();
export type GetLearningDashboardRequestV1 = z.infer<typeof GetLearningDashboardRequestV1Schema>;

export const LearningTrendDayV1Schema = z.object({
  date: LearningDateV1Schema,
  sessionsStarted: z.number().int().nonnegative(),
  sessionsCompleted: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  gradedAttempts: z.number().int().nonnegative(),
  correctAttempts: z.number().int().nonnegative(),
  accuracy: AccuracyV1Schema,
  wrongQuestionsTouched: z.number().int().nonnegative(),
}).strict().superRefine((day, context) => {
  if (day.gradedAttempts > day.attempts) {
    context.addIssue({
      code: 'custom',
      path: ['gradedAttempts'],
      message: 'gradedAttempts cannot exceed attempts',
    });
  }
  if (day.correctAttempts > day.gradedAttempts) {
    context.addIssue({
      code: 'custom',
      path: ['correctAttempts'],
      message: 'correctAttempts cannot exceed gradedAttempts',
    });
  }
});
export type LearningTrendDayV1 = z.infer<typeof LearningTrendDayV1Schema>;

export const LearningTrendSummaryV1Schema = z.object({
  days: z.number().int().min(7).max(90),
  activeDays: z.number().int().nonnegative(),
  currentStreakDays: z.number().int().nonnegative(),
  longestStreakDays: z.number().int().nonnegative(),
  sessionsStarted: z.number().int().nonnegative(),
  sessionsCompleted: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  gradedAttempts: z.number().int().nonnegative(),
  correctAttempts: z.number().int().nonnegative(),
  accuracy: AccuracyV1Schema,
  wrongQuestionsTouched: z.number().int().nonnegative(),
}).strict().superRefine((summary, context) => {
  if (summary.activeDays > summary.days) {
    context.addIssue({
      code: 'custom',
      path: ['activeDays'],
      message: 'activeDays cannot exceed days',
    });
  }
  if (summary.currentStreakDays > summary.activeDays) {
    context.addIssue({
      code: 'custom',
      path: ['currentStreakDays'],
      message: 'currentStreakDays cannot exceed activeDays',
    });
  }
  if (summary.longestStreakDays > summary.activeDays) {
    context.addIssue({
      code: 'custom',
      path: ['longestStreakDays'],
      message: 'longestStreakDays cannot exceed activeDays',
    });
  }
  if (summary.gradedAttempts > summary.attempts) {
    context.addIssue({
      code: 'custom',
      path: ['gradedAttempts'],
      message: 'gradedAttempts cannot exceed attempts',
    });
  }
  if (summary.correctAttempts > summary.gradedAttempts) {
    context.addIssue({
      code: 'custom',
      path: ['correctAttempts'],
      message: 'correctAttempts cannot exceed gradedAttempts',
    });
  }
});
export type LearningTrendSummaryV1 = z.infer<typeof LearningTrendSummaryV1Schema>;

export const LearningTrendsResponseV1Schema = z.object({
  generatedAt: IsoTimestampV1Schema,
  fromDate: LearningDateV1Schema,
  toDate: LearningDateV1Schema,
  days: z.number().int().min(7).max(90),
  daily: z.array(LearningTrendDayV1Schema),
  summary: LearningTrendSummaryV1Schema,
}).strict().superRefine((response, context) => {
  if (response.daily.length !== response.days) {
    context.addIssue({
      code: 'custom',
      path: ['daily'],
      message: 'daily length must equal days',
    });
  }
  if (response.summary.days !== response.days) {
    context.addIssue({
      code: 'custom',
      path: ['summary', 'days'],
      message: 'summary days must equal response days',
    });
  }
  if (response.daily[0] && response.daily[0].date !== response.fromDate) {
    context.addIssue({
      code: 'custom',
      path: ['fromDate'],
      message: 'fromDate must equal the first daily date',
    });
  }
  const lastDaily = response.daily[response.daily.length - 1];
  if (lastDaily && lastDaily.date !== response.toDate) {
    context.addIssue({
      code: 'custom',
      path: ['toDate'],
      message: 'toDate must equal the last daily date',
    });
  }
});
export type LearningTrendsResponseV1 = z.infer<typeof LearningTrendsResponseV1Schema>;

export const GetLearningTrendsRequestV1Schema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(14),
}).strict();
export type GetLearningTrendsRequestV1 = z.infer<typeof GetLearningTrendsRequestV1Schema>;
