import { z } from 'zod';

export const QuestionTypeSchema = z.enum([
  'fill_blank',
  'single_choice',
  'multiple_choice',
  'yes_no',
  'office_operation',
  'programming',
  'essay',
  'reading',
  'cloze',
  'operation',
  'short_answer',
  'ai',
  'unknown',
]);

export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const ObjectiveQuestionTypes = ['single_choice', 'multiple_choice', 'yes_no'] as const;

export type ObjectiveQuestionType = (typeof ObjectiveQuestionTypes)[number];

export function isObjectiveQuestionType(type: QuestionType): type is ObjectiveQuestionType {
  return (ObjectiveQuestionTypes as readonly string[]).includes(type);
}
