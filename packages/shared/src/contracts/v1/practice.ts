import { z } from 'zod';
import { ObjectiveQuestionTypes, QuestionTypeSchema } from '../../question.js';
import {
  CaseInsensitiveUuidV1Schema,
  CanonicalUuidV1Schema,
  CorrectAnswerV1Schema,
  OpaqueOptionIdV1Schema,
  SubmittedAnswerV1Schema,
} from './common.js';

export const PRACTICE_COMPLETED_COUNT_SEMANTICS_V1 = 'answered_or_graded_questions' as const;

export const PracticeModeV1Schema = z.enum(['random', 'sequential']);
export type PracticeModeV1 = z.infer<typeof PracticeModeV1Schema>;

export const PracticeStatusV1Schema = z.enum(['active', 'completed']);
export type PracticeStatusV1 = z.infer<typeof PracticeStatusV1Schema>;

export const PracticeSessionOriginV1Schema = z.enum(['bank', 'wrongbook']);
export type PracticeSessionOriginV1 = z.infer<typeof PracticeSessionOriginV1Schema>;

export const PracticeOptionV1Schema = z.object({
  id: OpaqueOptionIdV1Schema,
  sort: z.number().int().positive(),
  content: z.string(),
}).strict();
export type PracticeOptionV1 = z.infer<typeof PracticeOptionV1Schema>;

export const PracticeQuestionV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  sort: z.number().int().positive(),
  type: QuestionTypeSchema,
  content: z.string(),
  options: z.array(PracticeOptionV1Schema),
  answered: z.boolean(),
  draftAnswer: SubmittedAnswerV1Schema.optional(),
  markedForReview: z.boolean(),
  isCorrect: z.boolean().nullable().optional(),
  correctAnswer: CorrectAnswerV1Schema.optional(),
  needsSelfReview: z.boolean().optional(),
}).strict();
export type PracticeQuestionV1 = z.infer<typeof PracticeQuestionV1Schema>;

export const PracticeSessionV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  bankId: CanonicalUuidV1Schema,
  mode: PracticeModeV1Schema,
  questionCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  currentSort: z.number().int().positive(),
  status: PracticeStatusV1Schema,
}).strict().superRefine((session, context) => {
  if (session.completedCount > session.questionCount) {
    context.addIssue({
      code: 'custom',
      path: ['completedCount'],
      message: 'completedCount cannot exceed questionCount',
    });
  }
  if (session.correctCount > session.completedCount) {
    context.addIssue({
      code: 'custom',
      path: ['correctCount'],
      message: 'correctCount cannot exceed completedCount',
    });
  }
});
export type PracticeSessionV1 = z.infer<typeof PracticeSessionV1Schema>;

export const PracticeSessionSummaryV1Schema = z.object({
  completedCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  status: PracticeStatusV1Schema,
}).strict().superRefine((session, context) => {
  if (session.correctCount > session.completedCount) {
    context.addIssue({
      code: 'custom',
      path: ['correctCount'],
      message: 'correctCount cannot exceed completedCount',
    });
  }
});
export type PracticeSessionSummaryV1 = z.infer<typeof PracticeSessionSummaryV1Schema>;

export const PracticeAnswerResultV1Schema = z.object({
  questionId: CanonicalUuidV1Schema,
  isCorrect: z.boolean().nullable(),
  correctAnswer: CorrectAnswerV1Schema,
  needsSelfReview: z.boolean(),
}).strict();
export type PracticeAnswerResultV1 = z.infer<typeof PracticeAnswerResultV1Schema>;

export const PracticePayloadV1Schema = z.object({
  session: PracticeSessionV1Schema,
  questions: z.array(PracticeQuestionV1Schema),
}).strict();
export type PracticePayloadV1 = z.infer<typeof PracticePayloadV1Schema>;

export const PracticeSessionListV1Schema = z.array(PracticeSessionV1Schema);

const IsoTimestampV1Schema = z.string().datetime({ offset: true });

export const PracticeSessionCardV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  bankId: CanonicalUuidV1Schema,
  bankName: z.string().min(1),
  origin: PracticeSessionOriginV1Schema,
  mode: PracticeModeV1Schema,
  questionCount: z.number().int().nonnegative(),
  answeredCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  currentSort: z.number().int().positive(),
  status: PracticeStatusV1Schema,
  createdAt: IsoTimestampV1Schema,
  updatedAt: IsoTimestampV1Schema,
  completedAt: IsoTimestampV1Schema.nullable(),
}).strict().superRefine((session, context) => {
  if (session.answeredCount > session.questionCount) {
    context.addIssue({
      code: 'custom',
      path: ['answeredCount'],
      message: 'answeredCount cannot exceed questionCount',
    });
  }
  if (session.correctCount > session.answeredCount) {
    context.addIssue({
      code: 'custom',
      path: ['correctCount'],
      message: 'correctCount cannot exceed answeredCount',
    });
  }
  if (session.reviewCount > session.questionCount) {
    context.addIssue({
      code: 'custom',
      path: ['reviewCount'],
      message: 'reviewCount cannot exceed questionCount',
    });
  }
  if (session.status === 'completed' && session.completedAt === null) {
    context.addIssue({
      code: 'custom',
      path: ['completedAt'],
      message: 'completedAt is required for completed sessions',
    });
  }
  if (session.status === 'active' && session.completedAt !== null) {
    context.addIssue({
      code: 'custom',
      path: ['completedAt'],
      message: 'completedAt must be null for active sessions',
    });
  }
});
export type PracticeSessionCardV1 = z.infer<typeof PracticeSessionCardV1Schema>;

export const PracticeSessionPageV1Schema = z.object({
  sessions: z.array(PracticeSessionCardV1Schema),
  page: z.object({
    limit: z.number().int().min(1).max(50),
    offset: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }).strict(),
}).strict();
export type PracticeSessionPageV1 = z.infer<typeof PracticeSessionPageV1Schema>;

export const ListPracticeSessionsRequestV1Schema = z.object({
  status: PracticeStatusV1Schema,
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
export type ListPracticeSessionsRequestV1 = z.infer<typeof ListPracticeSessionsRequestV1Schema>;

export const PracticeSubmitSessionResponseV1Schema = z.object({
  session: PracticeSessionV1Schema,
  results: z.array(PracticeAnswerResultV1Schema),
}).strict();
export type PracticeSubmitSessionResponseV1 = z.infer<typeof PracticeSubmitSessionResponseV1Schema>;

export const LegacyPracticeAnswerResultV1Schema = PracticeAnswerResultV1Schema.extend({
  questionId: CaseInsensitiveUuidV1Schema,
}).strict();
export type LegacyPracticeAnswerResultV1 = z.infer<typeof LegacyPracticeAnswerResultV1Schema>;

export const PracticeSubmitAnswerResponseV1Schema = z.object({
  result: LegacyPracticeAnswerResultV1Schema,
  session: PracticeSessionSummaryV1Schema,
}).strict();
export type PracticeSubmitAnswerResponseV1 = z.infer<typeof PracticeSubmitAnswerResponseV1Schema>;

export const CreatePracticeSessionRequestV1Schema = z.object({
  bankId: CanonicalUuidV1Schema,
  mode: PracticeModeV1Schema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
  questionTypes: z.array(
    z.string().refine((value) => value.trim().length > 0, 'Expected a non-blank question type'),
  ).min(1).optional(),
}).strict();
export type CreatePracticeSessionRequestV1 = z.infer<typeof CreatePracticeSessionRequestV1Schema>;

export const SavePracticeProgressRequestV1Schema = z.object({
  currentSort: z.number().int().min(1).max(200),
}).strict();
export type SavePracticeProgressRequestV1 = z.infer<typeof SavePracticeProgressRequestV1Schema>;

export const SavePracticeDraftRequestV1Schema = z.object({
  answer: SubmittedAnswerV1Schema,
}).strict();
export type SavePracticeDraftRequestV1 = z.infer<typeof SavePracticeDraftRequestV1Schema>;

export const SetPracticeReviewFlagRequestV1Schema = z.object({
  markedForReview: z.boolean(),
}).strict();
export type SetPracticeReviewFlagRequestV1 = z.infer<typeof SetPracticeReviewFlagRequestV1Schema>;

export const SubmitPracticeAnswerRequestV1Schema = z.object({
  questionId: CaseInsensitiveUuidV1Schema,
  answer: SubmittedAnswerV1Schema,
}).strict();
export type SubmitPracticeAnswerRequestV1 = z.infer<typeof SubmitPracticeAnswerRequestV1Schema>;

export const ObjectivePracticeQuestionTypesV1 = [...ObjectiveQuestionTypes] as const;
