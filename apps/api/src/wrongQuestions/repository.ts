import type {
  PracticeOptionV1,
  WrongQuestionDetailV1,
  WrongQuestionItemV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../db/client.js';
import { normalizeAnswer } from '../import/normalizeAnswer.js';

export type WrongQuestionItem = WrongQuestionItemV1;
export type WrongQuestionOption = PracticeOptionV1;
export type WrongQuestionDetail = WrongQuestionDetailV1;

export interface WrongQuestionReviewCandidate {
  questionId: string;
  bankId: string;
}

export interface WrongQuestionRepository {
  list(input: { studentId: string; bankId?: string; includeMastered: boolean }): Promise<WrongQuestionItem[]>;
  getDetail(input: { studentId: string; id: string }): Promise<WrongQuestionDetail | null>;
  listReviewCandidates(input: {
    studentId: string;
    bankId?: string;
    includeMastered: boolean;
    limit: number;
  }): Promise<WrongQuestionReviewCandidate[]>;
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
  normalized_type: WrongQuestionItem['questionType'] | null;
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

    async listReviewCandidates({ studentId, bankId, includeMastered, limit }) {
      return items
        .filter((item) => item.studentId === studentId)
        .filter((item) => !bankId || item.bankId === bankId)
        .filter((item) => includeMastered || !item.mastered)
        .slice(0, limit)
        .map((item) => ({ questionId: item.questionId, bankId: item.bankId }));
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

    async listReviewCandidates({ studentId, bankId, includeMastered, limit }) {
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
      return selectedResult.rows.map((row) => ({ questionId: row.question_id, bankId: row.bank_id }));
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
    correctAnswer: normalizeCorrectAnswer(row.normalized_type, row.answer_raw),
    analysis: row.analyze_raw ?? '',
  };
}

function normalizeCorrectAnswer(normalizedType: string | null, answerRaw: string | null) {
  const raw = answerRaw ?? '';
  if (normalizedType === 'single_choice') {
    const answer = normalizeAnswer(1, raw);
    return answer.kind === 'option_ids' ? answer.value : raw;
  }
  if (normalizedType === 'multiple_choice') {
    const answer = normalizeAnswer(2, raw);
    return answer.kind === 'option_ids' ? answer.value : raw;
  }
  if (normalizedType === 'yes_no') {
    const answer = normalizeAnswer(3, raw);
    return answer.kind === 'yes_no' ? answer.value : raw;
  }
  return raw;
}
