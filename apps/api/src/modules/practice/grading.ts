import { normalizeAnswer } from '../../import/normalizeAnswer.js';
import type {
  CorrectAnswerV1,
  SubmittedAnswerV1,
} from '@bkyexam-practice/shared';

export type SubmittedAnswer = SubmittedAnswerV1;

export interface GradableQuestion {
  normalizedType: string;
  answerRaw: string;
}

export interface GradeResult {
  isCorrect: boolean | null;
  correctAnswer: CorrectAnswerV1;
  needsSelfReview: boolean;
}

export function gradeAnswer(question: GradableQuestion, answer: SubmittedAnswer): GradeResult {
  if (question.normalizedType === 'single_choice') {
    const correctAnswer = normalizeAnswer(1, question.answerRaw);
    const correctOptions = correctAnswer.kind === 'option_ids' ? correctAnswer.value : [];
    const submittedOptions = normalizeSubmittedOptions(answer);

    if (correctOptions.length !== 1 || hasDuplicates(correctOptions)) {
      return selfReview(correctOptions);
    }

    return {
      isCorrect: submittedOptions.length === 1 && correctOptions.length === 1 && submittedOptions[0] === correctOptions[0],
      correctAnswer: correctOptions,
      needsSelfReview: false,
    };
  }

  if (question.normalizedType === 'multiple_choice') {
    const correctAnswer = normalizeAnswer(2, question.answerRaw);
    const correctOptions = correctAnswer.kind === 'option_ids' ? correctAnswer.value : [];
    const submittedOptions = normalizeSubmittedOptions(answer);

    if (correctOptions.length === 0 || hasDuplicates(correctOptions)) {
      return selfReview(correctOptions);
    }

    return {
      isCorrect: !hasDuplicates(submittedOptions) && areEqualSets(new Set(submittedOptions), new Set(correctOptions)),
      correctAnswer: correctOptions,
      needsSelfReview: false,
    };
  }

  if (question.normalizedType === 'yes_no') {
    const correctAnswer = normalizeAnswer(3, question.answerRaw);
    const correctValue = correctAnswer.kind === 'yes_no' ? correctAnswer.value : correctAnswer.value;

    if (correctAnswer.kind !== 'yes_no') {
      return {
        isCorrect: null,
        correctAnswer: correctValue,
        needsSelfReview: true,
      };
    }

    return {
      isCorrect: normalizeSubmittedBoolean(answer) === correctAnswer.value,
      correctAnswer: correctValue,
      needsSelfReview: false,
    };
  }

  return {
    isCorrect: null,
    correctAnswer: question.answerRaw,
    needsSelfReview: true,
  };
}

function selfReview(correctAnswer: string[]): GradeResult {
  return {
    isCorrect: null,
    correctAnswer,
    needsSelfReview: true,
  };
}

function normalizeSubmittedOptions(answer: SubmittedAnswer): string[] {
  if (Array.isArray(answer)) {
    return answer.map((option) => option.trim()).filter(Boolean);
  }

  if (typeof answer === 'string') {
    return answer
      .split(',')
      .map((option) => option.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeSubmittedBoolean(answer: SubmittedAnswer): boolean | null {
  if (typeof answer === 'boolean') {
    return answer;
  }

  if (answer === 'true') {
    return true;
  }

  if (answer === 'false') {
    return false;
  }

  return null;
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function areEqualSets(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}
