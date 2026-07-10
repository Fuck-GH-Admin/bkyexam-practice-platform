import { randomUUID } from 'node:crypto';
import type {
  PracticeAnswerResultV1,
  PracticeQuestionV1,
  PracticeSessionCardV1,
  PracticeSessionPageV1,
  PracticeSessionSummaryV1,
  PracticeSessionV1,
  PracticeStatusV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../db/client.js';
import { gradeAnswer, type GradeResult, type SubmittedAnswer } from './grading.js';

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

interface QueryRows<T> {
  rows: T[];
}

type TransactionClient = QueryClient & { release?: () => void };

interface ConnectableQueryClient extends QueryClient {
  connect(): Promise<TransactionClient>;
}

interface QuestionRow {
  id: string;
  normalized_type: PracticeQuestionDto['type'];
  content: string;
}

interface OptionRow {
  id: string;
  question_id: string;
  sort: number | string;
  content: string;
}

interface SessionRow {
  id: string;
  bank_id: string;
  mode: 'random' | 'sequential';
  question_count: number | string;
  completed_count: number | string;
  correct_count: number | string;
  current_sort: number | string;
  status: 'active' | 'completed';
}

interface SessionQuestionRow extends SessionRow {
  question_id: string;
  sort: number | string;
  normalized_type: PracticeQuestionDto['type'];
  content: string;
  answered: boolean;
  is_correct: boolean | null;
  answer_raw: string;
  draft_answer: string | null;
  marked_for_review: boolean;
}

interface SessionListRow extends SessionRow {
  bank_name: string | null;
  origin: 'bank' | 'wrongbook';
  answered_count: number | string;
  review_count: number | string;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

interface SubmitAnswerRow {
  session_id: string;
  bank_id: string;
  status: 'active' | 'completed';
  question_count: number | string;
  session_question_id: string;
  question_id: string;
  normalized_type: PracticeQuestionDto['type'];
  answer_raw: string;
}

interface SubmitSessionRow {
  session_id: string;
  bank_id: string;
  mode: 'random' | 'sequential';
  question_count: number | string;
  current_sort: number | string;
  status: 'active' | 'completed';
  session_question_id: string;
  question_id: string;
  answered_at: Date | string | null;
  is_correct: boolean | null;
  normalized_type: PracticeQuestionDto['type'];
  answer_raw: string;
  draft_answer: string | null;
}

interface DraftQuestionRow {
  question_id: string;
  draft_answer: string | null;
  marked_for_review: boolean;
}

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

export function createPgPracticeRepository(client: QueryClient): PracticeRepository {
  return {
    async createSession(input) {
      const transactionClient = await checkoutTransactionClient(client);
      let transactionStarted = false;

      try {
        const bankResult = (await transactionClient.query(
          `
            SELECT bank_id
            FROM bank_mappings
            WHERE bank_id = $1
              AND visible = true
            LIMIT 1
          `,
          [input.bankId],
        )) as QueryRows<{ bank_id: string }>;
        if (!bankResult.rows[0]) {
          return null;
        }

        await transactionClient.query('BEGIN');
        transactionStarted = true;

        const orderBy = input.mode === 'random' ? 'random()' : 'questions.id';
        const questionsResult = (await transactionClient.query(
          `
            WITH RECURSIVE bank_classifications AS (
              SELECT id
              FROM classifications
              WHERE id = $1
              UNION ALL
              SELECT classifications.id
              FROM classifications
              JOIN bank_classifications ON classifications.parent_id = bank_classifications.id
            )
            SELECT questions.id, questions.normalized_type, questions.content
            FROM questions
            JOIN bank_classifications ON bank_classifications.id = questions.classification_id
            WHERE questions.normalized_type = ANY($2::text[])
            ORDER BY ${orderBy}
            LIMIT $3
          `,
          [input.bankId, input.questionTypes, input.limit],
        )) as QueryRows<QuestionRow>;
        const questionRows = questionsResult.rows;
        const questionIds = questionRows.map((question) => question.id);

        const optionsResult = (await transactionClient.query(
          `
            SELECT id, question_id, sort, content
            FROM question_options
            WHERE question_id = ANY($1::uuid[])
            ORDER BY question_id, sort, id
          `,
          [questionIds],
        )) as QueryRows<OptionRow>;

        const sessionResult = (await transactionClient.query(
          `
            INSERT INTO practice_sessions (
              student_id,
              bank_id,
              mode,
              question_limit,
              question_count
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, bank_id, mode, question_count, completed_count, correct_count, current_sort, status
          `,
          [input.studentId, input.bankId, input.mode, input.limit, questionRows.length],
        )) as QueryRows<SessionRow>;
        const session = mapSessionRow(sessionResult.rows[0]);

        if (questionRows.length > 0) {
          const values = questionRows
            .map((_, index) => `($1, $${index * 2 + 2}, $${index * 2 + 3})`)
            .join(', ');
          const params = questionRows.flatMap((question, index) => [question.id, index + 1]);
          await transactionClient.query(
            `
              INSERT INTO practice_session_questions (session_id, question_id, sort)
              VALUES ${values}
            `,
            [session.id, ...params],
          );
        }

        const result = {
          session,
          questions: mapQuestions(questionRows, optionsResult.rows),
        };

        await transactionClient.query('COMMIT');

        return result;
      } catch (error) {
        if (transactionStarted) {
          await transactionClient.query('ROLLBACK');
        }

        throw error;
      } finally {
        transactionClient.release?.();
      }
    },

    async getSession({ studentId, sessionId }) {
      const sessionResult = (await client.query(
        `
          SELECT id, bank_id, mode, question_count, completed_count, correct_count, current_sort, status
          FROM practice_sessions
          WHERE id = $1
            AND student_id = $2
          LIMIT 1
        `,
        [sessionId, studentId],
      )) as QueryRows<SessionRow>;
      const sessionRow = sessionResult.rows[0];
      if (!sessionRow) {
        return null;
      }

      const questionsResult = (await client.query(
        `
          SELECT
            practice_sessions.id,
            practice_sessions.bank_id,
            practice_sessions.mode,
            practice_sessions.question_count,
            practice_sessions.completed_count,
            practice_sessions.correct_count,
            practice_sessions.current_sort,
            practice_sessions.status,
            practice_session_questions.question_id,
            practice_session_questions.sort,
            practice_session_questions.is_correct,
            questions.normalized_type,
            questions.answer_raw,
            questions.content,
            (practice_session_questions.answered_at IS NOT NULL) AS answered,
            practice_session_drafts.draft_answer,
            COALESCE(practice_session_drafts.marked_for_review, false) AS marked_for_review
          FROM practice_session_questions
          JOIN practice_sessions ON practice_sessions.id = practice_session_questions.session_id
          JOIN questions ON questions.id = practice_session_questions.question_id
          LEFT JOIN practice_session_drafts
            ON practice_session_drafts.session_id = practice_session_questions.session_id
            AND practice_session_drafts.question_id = practice_session_questions.question_id
            AND practice_session_drafts.student_id = practice_sessions.student_id
          WHERE practice_session_questions.session_id = $1
            AND practice_sessions.student_id = $2
          ORDER BY practice_session_questions.sort
        `,
        [sessionId, studentId],
      )) as QueryRows<SessionQuestionRow>;
      const questionIds = questionsResult.rows.map((question) => question.question_id);
      const optionsResult = (await client.query(
        `
          SELECT id, question_id, sort, content
          FROM question_options
          WHERE question_id = ANY($1::uuid[])
          ORDER BY question_id, sort, id
        `,
        [questionIds],
      )) as QueryRows<OptionRow>;

      return {
        session: mapSessionRow(sessionRow),
        questions: questionsResult.rows.map((row) => mapSessionQuestionRow(row, optionsResult.rows)),
      };
    },

    async listActiveSessions({ studentId }) {
      const result = (await client.query(
        `
          SELECT id, bank_id, mode, question_count, completed_count, correct_count, current_sort, status
          FROM practice_sessions
          WHERE practice_sessions.student_id = $1
            AND practice_sessions.status = 'active'
          ORDER BY updated_at DESC, id
        `,
        [studentId],
      )) as QueryRows<SessionRow>;

      return result.rows.map(mapSessionRow);
    },

    async listSessions({ studentId, status, limit, offset }) {
      const orderBy = status === 'completed'
        ? 'practice_sessions.completed_at DESC NULLS LAST, practice_sessions.updated_at DESC, practice_sessions.id DESC'
        : 'practice_sessions.updated_at DESC, practice_sessions.id DESC';
      const result = (await client.query(
        `
          SELECT
            practice_sessions.id,
            practice_sessions.bank_id,
            practice_sessions.mode,
            practice_sessions.question_count,
            practice_sessions.completed_count,
            practice_sessions.correct_count,
            practice_sessions.current_sort,
            practice_sessions.status,
            practice_sessions.origin,
            practice_sessions.created_at,
            practice_sessions.updated_at,
            practice_sessions.completed_at,
            COALESCE(bank_mappings.bank_name, classifications.name, practice_sessions.bank_id::text) AS bank_name,
            (
              COUNT(DISTINCT practice_session_questions.question_id) FILTER (
                WHERE practice_session_questions.answered_at IS NOT NULL
                  OR (
                    practice_session_drafts.draft_answer IS NOT NULL
                    AND btrim(practice_session_drafts.draft_answer) <> ''
                    AND practice_session_drafts.draft_answer <> '[]'
                    AND practice_session_drafts.draft_answer !~ '^"[[:space:]]*"$'
                  )
              )
            )::integer AS answered_count,
            (
              COUNT(DISTINCT practice_session_drafts.question_id) FILTER (
                WHERE practice_session_drafts.marked_for_review = true
              )
            )::integer AS review_count
          FROM practice_sessions
          LEFT JOIN bank_mappings ON bank_mappings.bank_id = practice_sessions.bank_id
          LEFT JOIN classifications ON classifications.id = practice_sessions.bank_id
          LEFT JOIN practice_session_questions
            ON practice_session_questions.session_id = practice_sessions.id
          LEFT JOIN practice_session_drafts
            ON practice_session_drafts.session_id = practice_session_questions.session_id
            AND practice_session_drafts.question_id = practice_session_questions.question_id
            AND practice_session_drafts.student_id = practice_sessions.student_id
          WHERE practice_sessions.student_id = $1
            AND practice_sessions.status = $2
          GROUP BY practice_sessions.id, bank_mappings.bank_name, classifications.name
          ORDER BY ${orderBy}
          LIMIT $3
          OFFSET $4
        `,
        [studentId, status, limit + 1, offset],
      )) as QueryRows<SessionListRow>;
      const rows = result.rows;

      return {
        sessions: rows.slice(0, limit).map(mapSessionListRow),
        page: {
          limit,
          offset,
          hasMore: rows.length > limit,
        },
      };
    },

    async saveProgress({ studentId, sessionId, currentSort }) {
      const result = (await client.query(
        `
          UPDATE practice_sessions
          SET current_sort = $3,
              updated_at = now()
          WHERE practice_sessions.student_id = $1
            AND practice_sessions.id = $2
            AND practice_sessions.status = 'active'
            AND EXISTS (
              SELECT 1
              FROM practice_session_questions
              WHERE practice_session_questions.session_id = practice_sessions.id
                AND practice_session_questions.sort = $3
            )
          RETURNING id, bank_id, mode, question_count, completed_count, correct_count, current_sort, status
        `,
        [studentId, sessionId, currentSort],
      )) as QueryRows<SessionRow>;

      if (result.rows[0]) {
        return mapSessionRow(result.rows[0]);
      }

      await throwIfCompletedOwnedSession(client, studentId, sessionId);
      return null;
    },

    async saveDraft(input) {
      const result = (await client.query(
        `
          WITH saved AS (
            INSERT INTO practice_session_drafts (session_id, question_id, student_id, draft_answer, marked_for_review, updated_at)
            SELECT practice_sessions.id, practice_session_questions.question_id, practice_sessions.student_id, $4, false, now()
            FROM practice_sessions
            JOIN practice_session_questions ON practice_session_questions.session_id = practice_sessions.id
            WHERE practice_sessions.student_id = $1
              AND practice_sessions.id = $2
              AND practice_session_questions.question_id = $3
              AND practice_sessions.status = 'active'
            ON CONFLICT (session_id, question_id) DO UPDATE SET
              draft_answer = EXCLUDED.draft_answer,
              updated_at = now()
            RETURNING question_id, draft_answer, marked_for_review
          ), touched AS (
            UPDATE practice_sessions
            SET updated_at = now()
            WHERE practice_sessions.student_id = $1
              AND practice_sessions.id = $2
              AND practice_sessions.status = 'active'
              AND EXISTS (SELECT 1 FROM saved)
            RETURNING practice_sessions.id
          )
          SELECT question_id, draft_answer, marked_for_review
          FROM saved
        `,
        [input.studentId, input.sessionId, input.questionId, serializeDraftAnswer(input.answer)],
      )) as QueryRows<DraftQuestionRow>;

      if (result.rows[0]) {
        return loadPracticeQuestion(client, input.studentId, input.sessionId, input.questionId);
      }

      await throwIfCompletedOwnedSession(client, input.studentId, input.sessionId);
      return null;
    },

    async clearDraft({ studentId, sessionId, questionId }) {
      const result = (await client.query(
        `
          WITH eligible AS (
            SELECT practice_session_drafts.session_id, practice_session_drafts.question_id, practice_session_drafts.marked_for_review
            FROM practice_session_drafts
            JOIN practice_sessions ON practice_sessions.id = practice_session_drafts.session_id
            JOIN practice_session_questions
              ON practice_session_questions.session_id = practice_sessions.id
              AND practice_session_questions.question_id = practice_session_drafts.question_id
            WHERE practice_sessions.student_id = $1
              AND practice_sessions.id = $2
              AND practice_session_questions.question_id = $3
              AND practice_sessions.status = 'active'
          ), preserved AS (
            UPDATE practice_session_drafts
            SET draft_answer = '',
                updated_at = now()
            FROM eligible
            WHERE practice_session_drafts.session_id = eligible.session_id
              AND practice_session_drafts.question_id = eligible.question_id
              AND eligible.marked_for_review = true
            RETURNING practice_session_drafts.question_id
          ), removed AS (
            DELETE FROM practice_session_drafts
            USING eligible
            WHERE practice_session_drafts.session_id = eligible.session_id
              AND practice_session_drafts.question_id = eligible.question_id
              AND eligible.marked_for_review = false
            RETURNING practice_session_drafts.question_id
          ), changed AS (
            SELECT question_id FROM preserved
            UNION ALL
            SELECT question_id FROM removed
          ), touched AS (
            UPDATE practice_sessions
            SET updated_at = now()
            WHERE practice_sessions.student_id = $1
              AND practice_sessions.id = $2
              AND practice_sessions.status = 'active'
              AND EXISTS (SELECT 1 FROM changed)
            RETURNING practice_sessions.id
          )
          SELECT question_id FROM changed
        `,
        [studentId, sessionId, questionId],
      )) as QueryRows<{ question_id: string }>;

      if (result.rows.length > 0) {
        return true;
      }

      await throwIfCompletedOwnedSession(client, studentId, sessionId);
      return false;
    },

    async setReviewFlag(input) {
      const result = (await client.query(
        `
          WITH saved AS (
            INSERT INTO practice_session_drafts (session_id, question_id, student_id, draft_answer, marked_for_review, updated_at)
            SELECT
              practice_sessions.id,
              practice_session_questions.question_id,
              practice_sessions.student_id,
              COALESCE(practice_session_drafts.draft_answer, ''),
              $4,
              now()
            FROM practice_sessions
            JOIN practice_session_questions ON practice_session_questions.session_id = practice_sessions.id
            LEFT JOIN practice_session_drafts
              ON practice_session_drafts.session_id = practice_sessions.id
              AND practice_session_drafts.question_id = practice_session_questions.question_id
              AND practice_session_drafts.student_id = practice_sessions.student_id
            WHERE practice_sessions.student_id = $1
              AND practice_sessions.id = $2
              AND practice_session_questions.question_id = $3
              AND practice_sessions.status = 'active'
            ON CONFLICT (session_id, question_id) DO UPDATE SET
              marked_for_review = EXCLUDED.marked_for_review,
              updated_at = now()
            RETURNING question_id, draft_answer, marked_for_review
          ), touched AS (
            UPDATE practice_sessions
            SET updated_at = now()
            WHERE practice_sessions.student_id = $1
              AND practice_sessions.id = $2
              AND practice_sessions.status = 'active'
              AND EXISTS (SELECT 1 FROM saved)
            RETURNING practice_sessions.id
          )
          SELECT question_id, draft_answer, marked_for_review
          FROM saved
        `,
        [input.studentId, input.sessionId, input.questionId, input.markedForReview],
      )) as QueryRows<DraftQuestionRow>;

      if (result.rows[0]) {
        return loadPracticeQuestion(client, input.studentId, input.sessionId, input.questionId);
      }

      await throwIfCompletedOwnedSession(client, input.studentId, input.sessionId);
      return null;
    },

    async submitAnswer(input) {
      const transactionClient = await checkoutTransactionClient(client);
      let transactionStarted = false;

      try {
        await transactionClient.query('BEGIN');
        transactionStarted = true;

        const answerResult = (await transactionClient.query(
          `
            SELECT
              practice_sessions.id AS session_id,
              practice_sessions.bank_id,
              practice_sessions.status,
              practice_sessions.question_count,
              practice_session_questions.id AS session_question_id,
              questions.id AS question_id,
              questions.normalized_type,
              questions.answer_raw
            FROM practice_sessions
            JOIN practice_session_questions ON practice_session_questions.session_id = practice_sessions.id
            JOIN questions ON questions.id = practice_session_questions.question_id
            WHERE practice_sessions.id = $1
              AND practice_sessions.student_id = $2
              AND practice_session_questions.question_id = $3
            LIMIT 1
            FOR UPDATE OF practice_sessions, practice_session_questions
          `,
          [input.sessionId, input.studentId, input.questionId],
        )) as QueryRows<SubmitAnswerRow>;
        const row = answerResult.rows[0];
        if (!row) {
          await transactionClient.query('COMMIT');
          return null;
        }
        if (row.status === 'completed') {
          throw new CompletedSessionError();
        }

        const grade = gradeAnswer(
          { normalizedType: row.normalized_type, answerRaw: row.answer_raw },
          input.answer,
        );

        await transactionClient.query(
          `
            INSERT INTO practice_attempts (id, student_id, question_id, bank_id, answer, is_correct, source)
            VALUES ($1, $2, $3, $4, $5, $6, 'practice')
          `,
          [randomUUID(), input.studentId, input.questionId, row.bank_id, serializeSubmittedAnswer(input.answer), grade.isCorrect],
        );

        await transactionClient.query(
          `
            UPDATE practice_session_questions
            SET answered_at = now(), is_correct = $2
            WHERE id = $1
          `,
          [row.session_question_id, grade.isCorrect],
        );

        if (grade.isCorrect === false) {
          await transactionClient.query(
            `
              INSERT INTO wrong_questions (id, student_id, question_id, bank_id, last_answer, mastered, source, last_wrong_at)
              VALUES ($1, $2, $3, $4, $5, false, 'practice', now())
              ON CONFLICT (student_id, question_id, bank_id) DO UPDATE SET
                wrong_count = wrong_questions.wrong_count + 1,
                last_answer = EXCLUDED.last_answer,
                mastered = false,
                mastered_at = NULL,
                source = EXCLUDED.source,
                last_wrong_at = now()
            `,
            [randomUUID(), input.studentId, input.questionId, row.bank_id, serializeSubmittedAnswer(input.answer)],
          );
        }

        const progressResult = (await transactionClient.query(
          `
            WITH progress AS (
              SELECT
                (COUNT(*) FILTER (WHERE answered_at IS NOT NULL))::integer AS completed_count,
                (COUNT(*) FILTER (WHERE is_correct = true))::integer AS correct_count,
                COUNT(*)::integer AS question_count
              FROM practice_session_questions
              WHERE session_id = $1
            )
            UPDATE practice_sessions
            SET
              completed_count = progress.completed_count,
              correct_count = progress.correct_count,
              status = CASE
                WHEN progress.question_count > 0 AND progress.completed_count = progress.question_count THEN 'completed'
                ELSE 'active'
              END,
              completed_at = CASE
                WHEN progress.question_count > 0 AND progress.completed_count = progress.question_count THEN COALESCE(practice_sessions.completed_at, now())
                ELSE NULL
              END,
              updated_at = now()
            FROM progress
            WHERE practice_sessions.id = $1
            RETURNING practice_sessions.id, practice_sessions.completed_count, practice_sessions.correct_count, practice_sessions.status
          `,
          [input.sessionId],
        )) as QueryRows<{ id: string; completed_count: number | string; correct_count: number | string; status: 'active' | 'completed' }>;
        const progress = progressResult.rows[0];

        const result = {
          result: mapGradeResult(input.questionId, grade),
          session: {
            completedCount: Number(progress.completed_count),
            correctCount: Number(progress.correct_count),
            status: progress.status,
          },
        };

        await transactionClient.query('COMMIT');

        return result;
      } catch (error) {
        if (transactionStarted) {
          await transactionClient.query('ROLLBACK');
        }

        throw error;
      } finally {
        transactionClient.release?.();
      }
    },

    async submitSession(input) {
      const transactionClient = await checkoutTransactionClient(client);
      let transactionStarted = false;

      try {
        await transactionClient.query('BEGIN');
        transactionStarted = true;

        const sessionResult = (await transactionClient.query(
          `
            SELECT
              practice_sessions.id AS session_id,
              practice_sessions.bank_id,
              practice_sessions.mode,
              practice_sessions.question_count,
              practice_sessions.current_sort,
              practice_sessions.status,
              practice_session_questions.id AS session_question_id,
              practice_session_questions.question_id,
              practice_session_questions.answered_at,
              practice_session_questions.is_correct,
              questions.normalized_type,
              questions.answer_raw,
              practice_session_drafts.draft_answer
            FROM practice_sessions
            JOIN practice_session_questions ON practice_session_questions.session_id = practice_sessions.id
            JOIN questions ON questions.id = practice_session_questions.question_id
            LEFT JOIN practice_session_drafts
              ON practice_session_drafts.session_id = practice_sessions.id
              AND practice_session_drafts.question_id = practice_session_questions.question_id
              AND practice_session_drafts.student_id = practice_sessions.student_id
            WHERE practice_sessions.id = $1
              AND practice_sessions.student_id = $2
            ORDER BY practice_session_questions.sort
            FOR UPDATE OF practice_sessions, practice_session_questions
          `,
          [input.sessionId, input.studentId],
        )) as QueryRows<SubmitSessionRow>;
        const rows = sessionResult.rows;
        if (rows.length === 0) {
          await transactionClient.query('COMMIT');
          return null;
        }
        if (rows[0]?.status === 'completed') {
          throw new CompletedSessionError();
        }

        const results: PracticeAnswerResultDto[] = [];
        let completedCount = 0;
        let correctCount = 0;

        for (const row of rows) {
          if (row.answered_at != null || row.is_correct != null) {
            completedCount += 1;
            if (row.is_correct === true) {
              correctCount += 1;
            }
            continue;
          }

          const answer = parseStoredAnswer(row.draft_answer);
          if (!hasSubmittedAnswerValue(answer)) {
            continue;
          }

          const grade = gradeAnswer({ normalizedType: row.normalized_type, answerRaw: row.answer_raw }, answer);
          const serializedAnswer = serializeSubmittedAnswer(answer);

          await transactionClient.query(
            `
              INSERT INTO practice_attempts (id, student_id, question_id, bank_id, answer, is_correct, source)
              VALUES ($1, $2, $3, $4, $5, $6, 'practice')
            `,
            [randomUUID(), input.studentId, row.question_id, row.bank_id, serializedAnswer, grade.isCorrect],
          );

          await transactionClient.query(
            `
              UPDATE practice_session_questions
              SET answered_at = now(), is_correct = $2
              WHERE id = $1
            `,
            [row.session_question_id, grade.isCorrect],
          );

          if (grade.isCorrect === false) {
            await transactionClient.query(
              `
                INSERT INTO wrong_questions (id, student_id, question_id, bank_id, last_answer, mastered, source, last_wrong_at)
                VALUES ($1, $2, $3, $4, $5, false, 'practice', now())
                ON CONFLICT (student_id, question_id, bank_id) DO UPDATE SET
                  wrong_count = wrong_questions.wrong_count + 1,
                  last_answer = EXCLUDED.last_answer,
                  mastered = false,
                  mastered_at = NULL,
                  source = EXCLUDED.source,
                  last_wrong_at = now()
              `,
              [randomUUID(), input.studentId, row.question_id, row.bank_id, serializedAnswer],
            );
          }

          completedCount += 1;
          if (grade.isCorrect === true) {
            correctCount += 1;
          }
          results.push(mapGradeResult(row.question_id, grade));
        }

        const updatedSessionResult = (await transactionClient.query(
          `
            UPDATE practice_sessions
            SET completed_count = $2,
                correct_count = $3,
                status = 'completed',
                completed_at = COALESCE(completed_at, now()),
                updated_at = now()
            WHERE id = $1
            RETURNING id, bank_id, mode, question_count, completed_count, correct_count, current_sort, status
          `,
          [input.sessionId, completedCount, correctCount],
        )) as QueryRows<SessionRow>;

        const updatedSession = updatedSessionResult.rows[0];
        const result = updatedSession ? { session: mapSessionRow(updatedSession), results } : null;

        await transactionClient.query('COMMIT');

        return result;
      } catch (error) {
        if (transactionStarted) {
          await transactionClient.query('ROLLBACK');
        }

        throw error;
      } finally {
        transactionClient.release?.();
      }
    },
  };
}

function mapSessionRow(row: SessionRow): PracticeSessionDto {
  return {
    id: row.id,
    bankId: row.bank_id,
    mode: row.mode,
    questionCount: Number(row.question_count),
    completedCount: Number(row.completed_count),
    correctCount: Number(row.correct_count),
    currentSort: Number(row.current_sort),
    status: row.status,
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

function mapSessionListRow(row: SessionListRow): PracticeSessionCardDto {
  return {
    id: row.id,
    bankId: row.bank_id,
    bankName: row.bank_name ?? row.bank_id,
    origin: row.origin,
    mode: row.mode,
    questionCount: Number(row.question_count),
    answeredCount: row.status === 'completed'
      ? Number(row.completed_count)
      : Number(row.answered_count),
    correctCount: Number(row.correct_count),
    reviewCount: Number(row.review_count),
    currentSort: Number(row.current_sort),
    status: row.status,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    completedAt: row.status === 'completed' && row.completed_at
      ? toIsoTimestamp(row.completed_at)
      : null,
  };
}

function toIsoTimestamp(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

async function checkoutTransactionClient(client: QueryClient): Promise<TransactionClient> {
  return isConnectableQueryClient(client) ? client.connect() : client;
}

function isConnectableQueryClient(client: QueryClient): client is ConnectableQueryClient {
  return 'connect' in client && typeof client.connect === 'function';
}

function mapQuestions(questionRows: QuestionRow[], optionRows: OptionRow[]): PracticeQuestionDto[] {
  return questionRows.map((question, index) => ({
    id: question.id,
    sort: index + 1,
    type: question.normalized_type,
    content: question.content,
    options: optionRows.filter((option) => option.question_id === question.id).map(mapOptionRow),
    answered: false,
    markedForReview: false,
  }));
}

function mapOptionRow(row: OptionRow): PracticeQuestionDto['options'][number] {
  return { id: row.id, sort: Number(row.sort), content: row.content };
}

async function loadPracticeQuestion(
  client: QueryClient,
  studentId: string,
  sessionId: string,
  questionId: string,
): Promise<PracticeQuestionDto | null> {
  const questionResult = (await client.query(
    `
      SELECT
        practice_sessions.id,
        practice_sessions.bank_id,
        practice_sessions.mode,
        practice_sessions.question_count,
        practice_sessions.completed_count,
        practice_sessions.correct_count,
        practice_sessions.current_sort,
        practice_sessions.status,
        practice_session_questions.question_id,
        practice_session_questions.sort,
        practice_session_questions.is_correct,
        questions.normalized_type,
        questions.answer_raw,
        questions.content,
        (practice_session_questions.answered_at IS NOT NULL) AS answered,
        practice_session_drafts.draft_answer,
        COALESCE(practice_session_drafts.marked_for_review, false) AS marked_for_review
      FROM practice_session_questions
      JOIN practice_sessions ON practice_sessions.id = practice_session_questions.session_id
      JOIN questions ON questions.id = practice_session_questions.question_id
      LEFT JOIN practice_session_drafts
        ON practice_session_drafts.session_id = practice_session_questions.session_id
        AND practice_session_drafts.question_id = practice_session_questions.question_id
        AND practice_session_drafts.student_id = practice_sessions.student_id
      WHERE practice_sessions.student_id = $1
        AND practice_sessions.id = $2
        AND practice_session_questions.question_id = $3
      LIMIT 1
    `,
    [studentId, sessionId, questionId],
  )) as QueryRows<SessionQuestionRow>;
  const row = questionResult.rows[0];
  if (!row) {
    return null;
  }

  const optionsResult = (await client.query(
    `
      SELECT id, question_id, sort, content
      FROM question_options
      WHERE question_id = $1
      ORDER BY sort, id
    `,
    [questionId],
  )) as QueryRows<OptionRow>;

  return mapSessionQuestionRow(row, optionsResult.rows);
}

function mapSessionQuestionRow(row: SessionQuestionRow, optionRows: OptionRow[]): PracticeQuestionDto {
  const draftAnswer = parseStoredAnswer(row.draft_answer);
  const grade = row.answered && typeof row.answer_raw === 'string' && hasSubmittedAnswerValue(draftAnswer)
    ? gradeAnswer({ normalizedType: row.normalized_type, answerRaw: row.answer_raw }, draftAnswer)
    : null;

  return {
    id: row.question_id,
    sort: Number(row.sort),
    type: row.normalized_type,
    content: row.content,
    options: optionRows
      .filter((option) => option.question_id === row.question_id)
      .map(mapOptionRow),
    answered: row.answered,
    draftAnswer,
    markedForReview: row.marked_for_review === true,
    isCorrect: row.is_correct ?? null,
    ...(grade ? { correctAnswer: grade.correctAnswer, needsSelfReview: grade.needsSelfReview } : {}),
  };
}

async function throwIfCompletedOwnedSession(client: QueryClient, studentId: string, sessionId: string): Promise<void> {
  const result = (await client.query(
    `
      SELECT status
      FROM practice_sessions
      WHERE student_id = $1
        AND id = $2
      LIMIT 1
    `,
    [studentId, sessionId],
  )) as QueryRows<{ status: 'active' | 'completed' }>;

  if (result.rows[0]?.status === 'completed') {
    throw new CompletedSessionError();
  }
}

function serializeSubmittedAnswer(answer: SubmittedAnswer): string {
  return Array.isArray(answer) ? JSON.stringify(answer) : String(answer);
}

function serializeDraftAnswer(answer: SubmittedAnswer): string {
  return typeof answer === 'string' || Array.isArray(answer) ? JSON.stringify(answer) : String(answer);
}

function parseStoredAnswer(answer: string | null | undefined): SubmittedAnswer | undefined {
  if (!answer) return undefined;
  try {
    const parsed = JSON.parse(answer) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
  } catch {
    if (answer === 'true') return true;
    if (answer === 'false') return false;
    return answer;
  }
  if (answer === 'true') return true;
  if (answer === 'false') return false;
  return answer;
}

function hasSubmittedAnswerValue(answer: SubmittedAnswer | undefined): answer is SubmittedAnswer {
  if (answer === undefined) return false;
  if (typeof answer === 'string') return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return true;
}

function mapGradeResult(questionId: string, grade: GradeResult): PracticeAnswerResultDto {
  return {
    questionId,
    isCorrect: grade.isCorrect,
    correctAnswer: grade.correctAnswer,
    needsSelfReview: grade.needsSelfReview,
  };
}
