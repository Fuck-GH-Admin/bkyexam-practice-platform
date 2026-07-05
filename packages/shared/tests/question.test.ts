import { describe, expect, it } from 'vitest';
import { QuestionTypeSchema, SubjectCategorySchema } from '../src/index';

describe('shared schemas', () => {
  it('accepts supported objective question types', () => {
    expect(QuestionTypeSchema.parse('single_choice')).toBe('single_choice');
    expect(QuestionTypeSchema.parse('multiple_choice')).toBe('multiple_choice');
    expect(QuestionTypeSchema.parse('yes_no')).toBe('yes_no');
  });

  it('rejects unknown subject categories', () => {
    expect(() => SubjectCategorySchema.parse('数学')).toThrow();
  });
});
