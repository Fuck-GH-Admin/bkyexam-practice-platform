import { z } from 'zod';
import { QuestionTypeSchema } from '../../question.js';
import {
  CaseInsensitiveUuidV1Schema,
  CanonicalUuidV1Schema,
  CorrectAnswerV1Schema,
} from './common.js';
import { PracticeOptionV1Schema } from './practice.js';

export const WrongQuestionItemV1Schema = z.object({
  id: CanonicalUuidV1Schema,
  questionId: CanonicalUuidV1Schema,
  bankId: CanonicalUuidV1Schema,
  bankName: z.string(),
  subjectCategory: z.string(),
  subjectName: z.string(),
  questionType: QuestionTypeSchema,
  contentPreview: z.string(),
  wrongCount: z.number().int().positive(),
  lastAnswer: z.string(),
  mastered: z.boolean(),
  lastWrongAt: z.string().min(1),
}).strict();
export type WrongQuestionItemV1 = z.infer<typeof WrongQuestionItemV1Schema>;

export const WrongQuestionDetailV1Schema = WrongQuestionItemV1Schema.extend({
  content: z.string(),
  options: z.array(PracticeOptionV1Schema),
  correctAnswer: CorrectAnswerV1Schema,
  analysis: z.string(),
}).strict();
export type WrongQuestionDetailV1 = z.infer<typeof WrongQuestionDetailV1Schema>;

export const WrongQuestionListResponseV1Schema = z.object({
  wrongQuestions: z.array(WrongQuestionItemV1Schema),
}).strict();
export type WrongQuestionListResponseV1 = z.infer<typeof WrongQuestionListResponseV1Schema>;

export const WrongQuestionDetailResponseV1Schema = z.object({
  wrongQuestion: WrongQuestionDetailV1Schema,
}).strict();
export type WrongQuestionDetailResponseV1 = z.infer<typeof WrongQuestionDetailResponseV1Schema>;

export const CreateWrongQuestionReviewSessionRequestV1Schema = z.object({
  bankId: CaseInsensitiveUuidV1Schema.optional(),
  includeMastered: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();
export type CreateWrongQuestionReviewSessionRequestV1 = z.infer<
  typeof CreateWrongQuestionReviewSessionRequestV1Schema
>;

export const WrongQuestionReviewSessionResponseV1Schema = z.object({
  session: z.object({
    id: CanonicalUuidV1Schema,
    questionCount: z.number().int().positive(),
  }).strict(),
}).strict();
export type WrongQuestionReviewSessionResponseV1 = z.infer<
  typeof WrongQuestionReviewSessionResponseV1Schema
>;

export const MarkWrongQuestionMasteredResponseV1Schema = z.object({
  success: z.literal(true),
}).strict();
export type MarkWrongQuestionMasteredResponseV1 = z.infer<
  typeof MarkWrongQuestionMasteredResponseV1Schema
>;
