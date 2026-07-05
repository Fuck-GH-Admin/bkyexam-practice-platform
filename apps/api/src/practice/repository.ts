import { randomUUID } from 'node:crypto';
import type { QueryClient } from '../db/client.js';
import { gradeAnswer, type GradeResult, type SubmittedAnswer } from './grading.js';

export interface PracticeQuestionDto {
  id: string;
  sort: number;
  type: string;
  content: string;
  options: { id: string; sort: number; content: string }[];
  answered: boolean;
}

export interface PracticeSessionDto {
  id: string;
  bankId: string;
  mode: 'random' | 'sequential';
  questionCount: number;
  completedCount: number;
  correctCount: number;
  status: 'active' | 'completed';
}

export interface PracticeAnswerResultDto {
  questionId: string;
  isCorrect: boolean | null;
  correctAnswer: string[] | boolean | string;
  needsSelfReview: boolean;
}

export interface PracticeSessionSummaryDto {
  completedCount: number;
  correctCount: number;
  status: 'active' | 'completed';
}

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
  submitAnswer(input: {
    studentId: string;
    sessionId: string;
    questionId: string;
    answer: SubmittedAnswer;
  }): Promise<{ result: PracticeAnswerResultDto; session: PracticeSessionSummaryDto } | null>;
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
  normalized_type: string;
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
  status: 'active' | 'completed';
}

interface SessionQuestionRow extends SessionRow {
  question_id: string;
  sort: number | string;
  normalized_type: string;
  content: string;
  answered: boolean;
}

interface SubmitAnswerRow {
  session_id: string;
  bank_id: string;
  status: 'active' | 'completed';
  question_count: number | string;
  session_question_id: string;
  question_id: string;
  normalized_type: string;
  answer_raw: string;
}

export function createMemoryPracticeRepository(): PracticeRepository {
  const sessions = new Map<
    string,
    { studentId: string; session: PracticeSessionDto; questions: PracticeQuestionDto[] }
  >();

  return {
    async createSession({ studentId, bankId, mode }) {
      const session: PracticeSessionDto = {
        id: randomUUID(),
        bankId,
        mode,
        questionCount: 0,
        completedCount: 0,
        correctCount: 0,
        status: 'active',
      };
      const result = { session, questions: [] };
      sessions.set(session.id, { studentId, ...result });

      return result;
    },

    async getSession({ studentId, sessionId }) {
      const record = sessions.get(sessionId);
      if (!record || record.studentId !== studentId) {
        return null;
      }

      return { session: record.session, questions: record.questions };
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
      }

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
            RETURNING id, bank_id, mode, question_count, completed_count, correct_count, status
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
          SELECT id, bank_id, mode, question_count, completed_count, correct_count, status
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
            practice_sessions.status,
            practice_session_questions.question_id,
            practice_session_questions.sort,
            questions.normalized_type,
            questions.content,
            (practice_session_questions.answered_at IS NOT NULL) AS answered
          FROM practice_session_questions
          JOIN practice_sessions ON practice_sessions.id = practice_session_questions.session_id
          JOIN questions ON questions.id = practice_session_questions.question_id
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
        questions: questionsResult.rows.map((row) => ({
          id: row.question_id,
          sort: Number(row.sort),
          type: row.normalized_type,
          content: row.content,
          options: optionsResult.rows
            .filter((option) => option.question_id === row.question_id)
            .map(mapOptionRow),
          answered: row.answered,
        })),
      };
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
    status: row.status,
  };
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
  }));
}

function mapOptionRow(row: OptionRow): PracticeQuestionDto['options'][number] {
  return { id: row.id, sort: Number(row.sort), content: row.content };
}

function serializeSubmittedAnswer(answer: SubmittedAnswer): string {
  return Array.isArray(answer) ? JSON.stringify(answer) : String(answer);
}

function mapGradeResult(questionId: string, grade: GradeResult): PracticeAnswerResultDto {
  return {
    questionId,
    isCorrect: grade.isCorrect,
    correctAnswer: grade.correctAnswer,
    needsSelfReview: grade.needsSelfReview,
  };
}
