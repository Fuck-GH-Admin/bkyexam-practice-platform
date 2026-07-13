import type {
  PracticeAnswerResultV1,
  PracticeQuestionV1,
  PracticeSessionCardV1,
  PracticeSessionPageV1,
  PracticeSessionSummaryV1,
  PracticeSessionV1,
  PracticeStatusV1,
} from '@bkyexam-practice/shared';
import type { SubmittedAnswer } from './grading.js';

export type PracticeQuestionDto = PracticeQuestionV1;
export type PracticeSessionDto = PracticeSessionV1;
export type PracticeAnswerResultDto = PracticeAnswerResultV1;
export type PracticeSessionSummaryDto = PracticeSessionSummaryV1;
export type PracticeSessionCardDto = PracticeSessionCardV1;
export type PracticeSessionPageDto = PracticeSessionPageV1;

export class CompletedSessionError extends Error {
  constructor() {
    super('Practice session is completed');
    this.name = 'CompletedSessionError';
  }
}

export interface PracticeRepository {
  createSession(input: {
    studentId: string;
    bankId: string;
    mode: 'random' | 'sequential';
    limit: number;
    questionTypes: string[];
  }): Promise<{ session: PracticeSessionDto; questions: PracticeQuestionDto[] } | null>;
  getSession(input: {
    studentId: string;
    sessionId: string;
  }): Promise<{ session: PracticeSessionDto; questions: PracticeQuestionDto[] } | null>;
  listActiveSessions(input: { studentId: string }): Promise<PracticeSessionDto[]>;
  listSessions(input: {
    studentId: string;
    status: PracticeStatusV1;
    limit: number;
    offset: number;
  }): Promise<PracticeSessionPageDto>;
  saveProgress(input: { studentId: string; sessionId: string; currentSort: number }): Promise<PracticeSessionDto | null>;
  saveDraft(input: {
    studentId: string;
    sessionId: string;
    questionId: string;
    answer: SubmittedAnswer;
  }): Promise<PracticeQuestionDto | null>;
  clearDraft(input: { studentId: string; sessionId: string; questionId: string }): Promise<boolean>;
  setReviewFlag(input: {
    studentId: string;
    sessionId: string;
    questionId: string;
    markedForReview: boolean;
  }): Promise<PracticeQuestionDto | null>;
  submitAnswer(input: {
    studentId: string;
    sessionId: string;
    questionId: string;
    answer: SubmittedAnswer;
  }): Promise<{ result: PracticeAnswerResultDto; session: PracticeSessionSummaryDto } | null>;
  submitSession(input: {
    studentId: string;
    sessionId: string;
  }): Promise<{ session: PracticeSessionDto; results: PracticeAnswerResultDto[] } | null>;
}
