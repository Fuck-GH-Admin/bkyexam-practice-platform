import { describe, expect, it } from 'vitest';
import { gradeAnswer } from '../../src/practice/grading';

const YES_ID = '11111111-1111-1111-1111-111111111111';

describe('gradeAnswer', () => {
  it('grades single choice correct when the submitted option matches', () => {
    expect(gradeAnswer({ normalizedType: 'single_choice', answerRaw: 'option-a' }, ['option-a'])).toEqual({
      isCorrect: true,
      correctAnswer: ['option-a'],
      needsSelfReview: false,
    });
  });

  it('grades single choice incorrect when the submission includes an extra option', () => {
    expect(gradeAnswer({ normalizedType: 'single_choice', answerRaw: 'option-a' }, ['option-a', 'option-b'])).toEqual({
      isCorrect: false,
      correctAnswer: ['option-a'],
      needsSelfReview: false,
    });
  });

  it('grades multiple choice correct regardless of submitted option order', () => {
    expect(gradeAnswer({ normalizedType: 'multiple_choice', answerRaw: 'option-a,option-b' }, ['option-b', 'option-a'])).toEqual({
      isCorrect: true,
      correctAnswer: ['option-a', 'option-b'],
      needsSelfReview: false,
    });
  });

  it('grades multiple choice incorrect when an option is missing', () => {
    expect(gradeAnswer({ normalizedType: 'multiple_choice', answerRaw: 'option-a,option-b' }, ['option-a'])).toEqual({
      isCorrect: false,
      correctAnswer: ['option-a', 'option-b'],
      needsSelfReview: false,
    });
  });

  it('returns self-review for multiple choice with an empty answer key', () => {
    expect(gradeAnswer({ normalizedType: 'multiple_choice', answerRaw: '' }, [])).toEqual({
      isCorrect: null,
      correctAnswer: [],
      needsSelfReview: true,
    });
  });

  it('returns self-review for multiple choice with a duplicate answer key', () => {
    expect(gradeAnswer({ normalizedType: 'multiple_choice', answerRaw: 'option-a,option-a' }, ['option-a'])).toEqual({
      isCorrect: null,
      correctAnswer: ['option-a', 'option-a'],
      needsSelfReview: true,
    });
  });

  it('grades multiple choice incorrect when the submission contains duplicates', () => {
    expect(gradeAnswer({ normalizedType: 'multiple_choice', answerRaw: 'option-a,option-b' }, ['option-a', 'option-b', 'option-b'])).toEqual({
      isCorrect: false,
      correctAnswer: ['option-a', 'option-b'],
      needsSelfReview: false,
    });
  });

  it('returns self-review for single choice with an empty answer key', () => {
    expect(gradeAnswer({ normalizedType: 'single_choice', answerRaw: '' }, [])).toEqual({
      isCorrect: null,
      correctAnswer: [],
      needsSelfReview: true,
    });
  });

  it('returns self-review for single choice with multiple answer keys', () => {
    expect(gradeAnswer({ normalizedType: 'single_choice', answerRaw: 'option-a,option-b' }, ['option-a'])).toEqual({
      isCorrect: null,
      correctAnswer: ['option-a', 'option-b'],
      needsSelfReview: true,
    });
  });

  it('grades yes/no boolean and string submissions', () => {
    expect(gradeAnswer({ normalizedType: 'yes_no', answerRaw: YES_ID }, true)).toEqual({
      isCorrect: true,
      correctAnswer: true,
      needsSelfReview: false,
    });
    expect(gradeAnswer({ normalizedType: 'yes_no', answerRaw: YES_ID }, 'true')).toEqual({
      isCorrect: true,
      correctAnswer: true,
      needsSelfReview: false,
    });
    expect(gradeAnswer({ normalizedType: 'yes_no', answerRaw: YES_ID }, false)).toEqual({
      isCorrect: false,
      correctAnswer: true,
      needsSelfReview: false,
    });
  });

  it('returns self-review for yes/no with an empty answer key', () => {
    expect(gradeAnswer({ normalizedType: 'yes_no', answerRaw: '' }, false)).toEqual({
      isCorrect: null,
      correctAnswer: '',
      needsSelfReview: true,
    });
  });

  it('returns a self-review result with the raw reference answer for non-objective questions', () => {
    expect(gradeAnswer({ normalizedType: 'essay', answerRaw: 'Reference answer' }, 'Student answer')).toEqual({
      isCorrect: null,
      correctAnswer: 'Reference answer',
      needsSelfReview: true,
    });
  });

  it('grades malformed yes/no string submissions incorrect without throwing', () => {
    expect(gradeAnswer({ normalizedType: 'yes_no', answerRaw: YES_ID }, 'yes')).toEqual({
      isCorrect: false,
      correctAnswer: true,
      needsSelfReview: false,
    });
  });
});
