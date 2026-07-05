import type { QueryClient } from '../db/client.js';

export interface WrongQuestionItem {
  id: string;
  questionId: string;
  bankId: string;
  wrongCount: number;
  lastAnswer: string;
  mastered: boolean;
  lastWrongAt: string;
}

export interface WrongQuestionRepository {
  list(input: { studentId: string; bankId?: string; includeMastered: boolean }): Promise<WrongQuestionItem[]>;
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
  wrong_count: number | string;
  last_answer: string;
  mastered: boolean;
  last_wrong_at: Date | string;
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
      const filters = ['student_id = $1'];

      if (bankId) {
        params.push(bankId);
        filters.push(`bank_id = $${params.length}`);
      }

      if (!includeMastered) {
        filters.push('mastered = false');
      }

      const result = (await client.query(
        `
          SELECT id, question_id, bank_id, wrong_count, last_answer, mastered, last_wrong_at
          FROM wrong_questions
          WHERE ${filters.join(' AND ')}
          ORDER BY last_wrong_at DESC, id
        `,
        params,
      )) as QueryRows<WrongQuestionRow>;

      return result.rows.map(mapWrongQuestionRow);
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
    wrongCount: Number(row.wrong_count),
    lastAnswer: row.last_answer,
    mastered: row.mastered,
    lastWrongAt: row.last_wrong_at instanceof Date ? row.last_wrong_at.toISOString() : row.last_wrong_at,
  };
}
