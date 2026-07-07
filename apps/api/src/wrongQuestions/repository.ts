import { randomUUID } from 'node:crypto';
import type { QueryClient } from '../db/client.js';

export interface WrongQuestionItem {
  id: string;
  questionId: string;
  bankId: string;
  bankName: string;
  subjectCategory: string;
  subjectName: string;
  questionType: string;
  contentPreview: string;
  wrongCount: number;
  lastAnswer: string;
  mastered: boolean;
  lastWrongAt: string;
}

export interface WrongQuestionOption {
  id: string;
  sort: number;
  content: string;
}

export interface WrongQuestionDetail extends WrongQuestionItem {
  content: string;
  options: WrongQuestionOption[];
  correctAnswer: string;
  analysis: string;
}

export interface WrongQuestionRepository {
  list(input: { studentId: string; bankId?: string; includeMastered: boolean }): Promise<WrongQuestionItem[]>;
  getDetail(input: { studentId: string; id: string }): Promise<WrongQuestionDetail | null>;
  createReviewSession(input: {
    studentId: string;
    bankId?: string;
    includeMastered: boolean;
    limit: number;
  }): Promise<{ sessionId: string; questionCount: number } | null>;
  markMastered(input: { studentId: string; id: string }): Promise<boolean>;
}

interface QueryRows<T> {
  rows: T[];
}

interface QueryResult {
  rowCount?: number | null;
}

interface WrongQuestionRow {
  id: string;
  question_id: string;
  bank_id: string;
  bank_name: string | null;
  subject_category: string | null;
  subject_name: string | null;
  normalized_type: string | null;
  content_preview: string | null;
  wrong_count: number | string;
  last_answer: string;
  mastered: boolean;
  last_wrong_at: Date | string;
}

interface WrongQuestionDetailRow extends Omit<WrongQuestionRow, 'content_preview'> {
  content: string | null;
  answer_raw: string | null;
  analyze_raw: string | null;
}

interface WrongQuestionOptionRow {
  id: string;
  question_id: string;
  sort: number | string;
  content: string | null;
}

export function createMemoryWrongQuestionRepository(): WrongQuestionRepository {
  const items: Array<WrongQuestionItem & { studentId: string }> = [];

  return {
    async list({ studentId, bankId, includeMastered }) {
      return items
        .filter((item) => item.studentId === studentId)
        .filter((item) => !bankId || item.bankId === bankId)
        .filter((item) => includeMastered || !item.mastered)
        .map(({ studentId: _studentId, ...item }) => item);
    },

    async getDetail({ studentId, id }) {
      const item = items.find((candidate) => candidate.studentId === studentId && candidate.id === id);
      if (!item) return null;
      const { studentId: _studentId, ...wrongQuestion } = item;
      return {
        ...wrongQuestion,
        content: wrongQuestion.contentPreview,
        options: [],
        correctAnswer: '',
        analysis: '',
      };
    },

    async createReviewSession({ studentId, bankId, includeMastered, limit }) {
      const selected = items
        .filter((item) => item.studentId === studentId)
        .filter((item) => !bankId || item.bankId === bankId)
        .filter((item) => includeMastered || !item.mastered)
        .slice(0, limit);
      if (selected.length === 0) return null;
      return { sessionId: 'memory-review-session', questionCount: selected.length };
    },

    async markMastered({ studentId, id }) {
      const item = items.find((candidate) => candidate.studentId === studentId && candidate.id === id);
      if (!item) {
        return false;
      }

      item.mastered = true;
      return true;
    },
  };
}

export function createPgWrongQuestionRepository(client: QueryClient): WrongQuestionRepository {
  return {
    async list({ studentId, bankId, includeMastered }) {
      const params: unknown[] = [studentId];
      const filters = ['wrong_questions.student_id = $1'];

      if (bankId) {
        params.push(bankId);
        filters.push(`wrong_questions.bank_id = $${params.length}`);
      }

      if (!includeMastered) {
        filters.push('wrong_questions.mastered = false');
      }

      const result = (await client.query(
        `
          SELECT
            wrong_questions.id,
            wrong_questions.question_id,
            wrong_questions.bank_id,
            COALESCE(bank_mappings.bank_name, wrong_questions.bank_id::text) AS bank_name,
            COALESCE(bank_mappings.subject_category, '') AS subject_category,
            COALESCE(bank_mappings.subject_name, '') AS subject_name,
            questions.normalized_type,
            LEFT(regexp_replace(COALESCE(questions.content, ''), '\s+', ' ', 'g'), 120) AS content_preview,
            wrong_questions.wrong_count,
            wrong_questions.last_answer,
            wrong_questions.mastered,
            wrong_questions.last_wrong_at
          FROM wrong_questions
          JOIN questions ON questions.id = wrong_questions.question_id
          LEFT JOIN bank_mappings ON bank_mappings.bank_id = wrong_questions.bank_id
          WHERE ${filters.join(' AND ')}
          ORDER BY wrong_questions.last_wrong_at DESC, wrong_questions.id
        `,
        params,
      )) as QueryRows<WrongQuestionRow>;

      return result.rows.map(mapWrongQuestionRow);
    },

    async getDetail({ studentId, id }) {
      const result = (await client.query(
        `
          SELECT
            wrong_questions.id,
            wrong_questions.question_id,
            wrong_questions.bank_id,
            COALESCE(bank_mappings.bank_name, wrong_questions.bank_id::text) AS bank_name,
            COALESCE(bank_mappings.subject_category, '') AS subject_category,
            COALESCE(bank_mappings.subject_name, '') AS subject_name,
            questions.normalized_type,
            questions.content,
            questions.answer_raw,
            questions.analyze_raw,
            wrong_questions.wrong_count,
            wrong_questions.last_answer,
            wrong_questions.mastered,
            wrong_questions.last_wrong_at
          FROM wrong_questions
          JOIN questions ON questions.id = wrong_questions.question_id
          LEFT JOIN bank_mappings ON bank_mappings.bank_id = wrong_questions.bank_id
          WHERE wrong_questions.student_id = $1
            AND wrong_questions.id = $2
          LIMIT 1
        `,
        [studentId, id],
      )) as QueryRows<WrongQuestionDetailRow>;
      const row = result.rows[0];
      if (!row) return null;

      const optionResult = (await client.query(
        `
          SELECT id, question_id, sort, content
          FROM question_options
          WHERE question_id = $1
          ORDER BY sort, id
        `,
        [row.question_id],
      )) as QueryRows<WrongQuestionOptionRow>;

      return mapWrongQuestionDetailRow(row, optionResult.rows);
    },

    async createReviewSession({ studentId, bankId, includeMastered, limit }) {
      const params: unknown[] = [studentId, limit];
      const filters = ['student_id = $1'];
      if (!includeMastered) filters.push('mastered = false');
      if (bankId) {
        params.push(bankId);
        filters.push(`bank_id = $${params.length}`);
      }

      const selectedResult = (await client.query(
        `
          SELECT question_id, bank_id
          FROM wrong_questions
          WHERE ${filters.join(' AND ')}
          ORDER BY last_wrong_at DESC, id
          LIMIT $2
        `,
        params,
      )) as QueryRows<{ question_id: string; bank_id: string }>;
      const selected = selectedResult.rows;
      if (selected.length === 0) return null;

      const sessionId = randomUUID();
      const sessionResult = (await client.query(
        `
          INSERT INTO practice_sessions (id, student_id, bank_id, mode, question_limit, question_count, completed_count, correct_count, status)
          VALUES ($1, $2, $3, 'sequential', $4, $4, 0, 0, 'active')
          RETURNING id
        `,
        [sessionId, studentId, selected[0].bank_id, selected.length],
      )) as QueryRows<{ id: string }>;

      const values = selected.map((_, index) => `($1, $${index + 2}, ${index + 1})`).join(', ');
      await client.query(
        `
          INSERT INTO practice_session_questions (session_id, question_id, sort)
          VALUES ${values}
        `,
        [sessionResult.rows[0].id, ...selected.map((item) => item.question_id)],
      );

      return { sessionId: sessionResult.rows[0].id, questionCount: selected.length };
    },

    async markMastered({ studentId, id }) {
      const result = (await client.query(
        `
          UPDATE wrong_questions
          SET mastered = true,
              mastered_at = now()
          WHERE id = $1
            AND student_id = $2
        `,
        [id, studentId],
      )) as QueryResult;

      return (result.rowCount ?? 0) > 0;
    },
  };
}

function mapWrongQuestionRow(row: WrongQuestionRow): WrongQuestionItem {
  return {
    id: row.id,
    questionId: row.question_id,
    bankId: row.bank_id,
    bankName: row.bank_name ?? row.bank_id,
    subjectCategory: row.subject_category ?? '',
    subjectName: row.subject_name ?? '',
    questionType: row.normalized_type ?? 'unknown',
    contentPreview: row.content_preview ?? '',
    wrongCount: Number(row.wrong_count),
    lastAnswer: row.last_answer,
    mastered: row.mastered,
    lastWrongAt: row.last_wrong_at instanceof Date ? row.last_wrong_at.toISOString() : row.last_wrong_at,
  };
}

function mapWrongQuestionDetailRow(row: WrongQuestionDetailRow, options: WrongQuestionOptionRow[]): WrongQuestionDetail {
  return {
    ...mapWrongQuestionRow({
      ...row,
      content_preview: row.content ? row.content.replace(/\s+/g, ' ').slice(0, 120) : '',
    }),
    content: row.content ?? '',
    options: options.map((option) => ({ id: option.id, sort: Number(option.sort), content: option.content ?? '' })),
    correctAnswer: row.answer_raw ?? '',
    analysis: row.analyze_raw ?? '',
  };
}
