import type { GradeResult } from './grading.js';
import type { PracticeAnswerResultDto } from './contracts.js';

export function mapGradeResult(questionId: string, grade: GradeResult): PracticeAnswerResultDto {
  return {
    questionId,
    isCorrect: grade.isCorrect,
    correctAnswer: grade.correctAnswer,
    needsSelfReview: grade.needsSelfReview,
  };
}
