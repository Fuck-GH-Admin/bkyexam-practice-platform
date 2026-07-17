import { randomUUID } from 'node:crypto';
import { hasSubmittedAnswerValue } from './answerCodec.js';
import {
  CompletedSessionError,
  type PracticeAnswerResultDto,
  type PracticeQuestionDto,
  type PracticeRepository,
  type PracticeSessionCardDto,
  type PracticeSessionDto,
} from './contracts.js';
import { gradeAnswer } from './grading.js';
import { mapGradeResult } from './resultMapper.js';

const memoryQuestionHasDraftState = Symbol('memoryQuestionHasDraftState');

type MemoryPracticeQuestionDto = PracticeQuestionDto & {
  answerRaw?: string;
  [memoryQuestionHasDraftState]?: boolean;
};

interface MemorySessionRecord {
  studentId: string;
  session: PracticeSessionDto;
  questions: MemoryPracticeQuestionDto[];
  origin: 'bank' | 'wrongbook';
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export function createMemoryPracticeRepository(): PracticeRepository {
  const sessions = new Map<string, MemorySessionRecord>();

  return {
    async createSession({ studentId, bankId, mode }) {
      const session: PracticeSessionDto = {
        id: randomUUID(),
        bankId,
        mode,
        questionCount: 0,
        completedCount: 0,
        correctCount: 0,
        currentSort: 1,
        status: 'active',
      };
      const result = { session, questions: [] };
      const now = new Date().toISOString();
      sessions.set(session.id, {
        studentId,
        ...result,
        origin: 'bank',
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      });

      return result;
    },

    async getSession({ studentId, sessionId }) {
      const record = sessions.get(sessionId);
      if (!record || record.studentId !== studentId) {
        return null;
      }

      return { session: record.session, questions: record.questions };
    },

    async listActiveSessions({ studentId }) {
      return Array.from(sessions.values())
        .filter((record) => record.studentId === studentId && record.session.status === 'active')
        .map((record) => record.session);
    },

    async listSessions({ studentId, status, limit, offset }) {
      const records = Array.from(sessions.values())
        .filter((record) => record.studentId === studentId && record.session.status === status)
        .sort((first, second) => {
          const firstTimestamp = status === 'completed'
            ? first.completedAt ?? first.updatedAt
            : first.updatedAt;
          const secondTimestamp = status === 'completed'
            ? second.completedAt ?? second.updatedAt
            : second.updatedAt;
          return secondTimestamp.localeCompare(firstTimestamp)
            || second.session.id.localeCompare(first.session.id);
        });
      const pageRecords = records.slice(offset, offset + limit + 1);

      return {
        sessions: pageRecords.slice(0, limit).map(mapMemorySessionCard),
        page: {
          limit,
          offset,
          hasMore: pageRecords.length > limit,
        },
      };
    },

    async saveProgress({ studentId, sessionId, currentSort }) {
      const record = sessions.get(sessionId);
      if (!record || record.studentId !== studentId) {
        return null;
      }
      if (record.session.status === 'completed') {
        throw new CompletedSessionError();
      }
      if (!record.questions.some((question) => question.sort === currentSort)) {
        return null;
      }

      record.session.currentSort = currentSort;
      touchMemorySession(record);
      return record.session;
    },

    async saveDraft({ studentId, sessionId, questionId, answer }) {
      const record = sessions.get(sessionId);
      if (!record || record.studentId !== studentId) {
        return null;
      }
      if (record.session.status === 'completed') {
        throw new CompletedSessionError();
      }

      const question = record.questions.find((candidate) => candidate.id === questionId);
      if (!question) {
        return null;
      }

      question.draftAnswer = answer;
      question[memoryQuestionHasDraftState] = true;
      touchMemorySession(record);
      return question;
    },

    async clearDraft({ studentId, sessionId, questionId }) {
      const record = sessions.get(sessionId);
      if (!record || record.studentId !== studentId) {
        return false;
      }
      if (record.session.status === 'completed') {
        throw new CompletedSessionError();
      }

      const question = record.questions.find((candidate) => candidate.id === questionId);
      if (!question) {
        return false;
      }
      if (question.draftAnswer === undefined && !question.markedForReview && !question[memoryQuestionHasDraftState]) {
        return false;
      }

      delete question.draftAnswer;
      if (!question.markedForReview) {
        delete question[memoryQuestionHasDraftState];
      }
      touchMemorySession(record);
      return true;
    },

    async setReviewFlag({ studentId, sessionId, questionId, markedForReview }) {
      const record = sessions.get(sessionId);
      if (!record || record.studentId !== studentId) {
        return null;
      }
      if (record.session.status === 'completed') {
        throw new CompletedSessionError();
      }

      const question = record.questions.find((candidate) => candidate.id === questionId);
      if (!question) {
        return null;
      }

      question.markedForReview = markedForReview;
      question[memoryQuestionHasDraftState] = true;
      touchMemorySession(record);
      return question;
    },

    async submitAnswer({ studentId, sessionId, questionId }) {
      const record = sessions.get(sessionId);
      if (!record || record.studentId !== studentId) {
        return null;
      }
      if (record.session.status === 'completed') {
        throw new CompletedSessionError();
      }

      const question = record.questions.find((candidate) => candidate.id === questionId);
      if (!question) {
        return null;
      }

      if (!question.answered) {
        question.answered = true;
        record.session.completedCount += 1;
      }
      const isCorrect = true;
      record.session.correctCount = Math.max(record.session.correctCount, isCorrect ? 1 : 0);
      if (record.session.completedCount >= record.session.questionCount) {
        record.session.status = 'completed';
        record.completedAt = new Date().toISOString();
      }
      touchMemorySession(record);

      return {
        result: {
          questionId,
          isCorrect,
          correctAnswer: question.options.map((option) => option.id),
          needsSelfReview: false,
        },
        session: {
          completedCount: record.session.completedCount,
          correctCount: record.session.correctCount,
          status: record.session.status,
        },
      };
    },

    async submitSession({ studentId, sessionId }) {
      const record = sessions.get(sessionId);
      if (!record || record.studentId !== studentId) {
        return null;
      }
      if (record.session.status === 'completed') {
        throw new CompletedSessionError();
      }

      const results: PracticeAnswerResultDto[] = [];
      let completedCount = 0;
      let correctCount = 0;

      for (const question of record.questions) {
        if (question.answered || question.isCorrect !== undefined) {
          completedCount += 1;
          if (question.isCorrect === true) {
            correctCount += 1;
          }
          continue;
        }

        if (!hasSubmittedAnswerValue(question.draftAnswer)) {
          continue;
        }

        const grade = gradeAnswer(
          { normalizedType: question.type, answerRaw: question.answerRaw ?? '' },
          question.draftAnswer,
        );
        question.answered = true;
        question.isCorrect = grade.isCorrect;
        question.correctAnswer = grade.correctAnswer;
        question.needsSelfReview = grade.needsSelfReview;
        completedCount += 1;
        if (grade.isCorrect === true) {
          correctCount += 1;
        }
        results.push(mapGradeResult(question.id, grade));
      }

      record.session.completedCount = completedCount;
      record.session.correctCount = correctCount;
      record.session.status = 'completed';
      record.completedAt = new Date().toISOString();
      touchMemorySession(record);

      return { session: record.session, results };
    },
  };
}

function mapMemorySessionCard(record: MemorySessionRecord): PracticeSessionCardDto {
  const { session } = record;
  const answeredCount = session.status === 'completed'
    ? session.completedCount
    : record.questions.filter(
      (question) => question.answered || hasSubmittedAnswerValue(question.draftAnswer),
    ).length;

  return {
    id: session.id,
    bankId: session.bankId,
    bankName: session.bankId,
    origin: record.origin,
    mode: session.mode,
    questionCount: session.questionCount,
    answeredCount,
    correctCount: session.correctCount,
    reviewCount: record.questions.filter((question) => question.markedForReview).length,
    currentSort: session.currentSort,
    status: session.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: session.status === 'completed'
      ? record.completedAt ?? record.updatedAt
      : null,
  };
}

function touchMemorySession(record: MemorySessionRecord): void {
  record.updatedAt = new Date().toISOString();
}
