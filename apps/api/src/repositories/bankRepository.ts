import type { QueryClient } from '../db/client.js';
import type { BankListItem, BankRepository } from '../routes/banks.js';

interface BankMappingRow {
  bank_id: string;
  bank_name: string;
  subject_category: string;
  subject_name: string;
  visible: boolean;
  status: string;
  keywords: unknown;
  question_count: number | string;
  objective_question_count?: number | string;
  description: string;
}

interface QueryRows<T> {
  rows: T[];
}

function mapBankRow(row: BankMappingRow): BankListItem {
  return {
    bankId: row.bank_id,
    bankName: row.bank_name,
    subjectCategory: row.subject_category,
    subjectName: row.subject_name,
    visible: row.visible,
    status: row.status,
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    questionCount: Number(row.objective_question_count ?? row.question_count),
    description: row.description,
  };
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function createPgBankRepository(client: QueryClient): BankRepository {
  return {
    async listBanks(filters) {
      const params: unknown[] = [];
      const where = ['visible = true', "status = 'active'"];

      if (filters.category) {
        params.push(filters.category);
        where.push(`subject_category = $${params.length}`);
      }

      if (filters.keyword) {
        params.push(`%${escapeLikePattern(filters.keyword.toLocaleLowerCase())}%`);
        const placeholder = `$${params.length}`;
        where.push(`(
          lower(bank_name) LIKE ${placeholder} ESCAPE '\\'
          OR lower(subject_name) LIKE ${placeholder} ESCAPE '\\'
          OR lower(subject_category) LIKE ${placeholder} ESCAPE '\\'
          OR lower(keywords::text) LIKE ${placeholder} ESCAPE '\\'
        )`);
      }

      const result = (await client.query(
        `
          WITH RECURSIVE base_banks AS (
            SELECT
              bank_id,
              bank_name,
              subject_category,
              subject_name,
              visible,
              status,
              keywords,
              question_count,
              description
            FROM bank_mappings
            WHERE ${where.join(' AND ')}
          ), bank_classifications AS (
            SELECT base_banks.bank_id, classifications.id AS classification_id
            FROM base_banks
            JOIN classifications ON classifications.id = base_banks.bank_id
            UNION ALL
            SELECT bank_classifications.bank_id, classifications.id AS classification_id
            FROM classifications
            JOIN bank_classifications ON classifications.parent_id = bank_classifications.classification_id
          ), objective_counts AS (
            SELECT bank_classifications.bank_id, count(*) AS objective_question_count
            FROM bank_classifications
            JOIN questions ON questions.classification_id = bank_classifications.classification_id
            WHERE questions.normalized_type IN ('single_choice', 'multiple_choice', 'yes_no')
            GROUP BY bank_classifications.bank_id
          )
          SELECT
            base_banks.bank_id,
            base_banks.bank_name,
            base_banks.subject_category,
            base_banks.subject_name,
            base_banks.visible,
            base_banks.status,
            base_banks.keywords,
            base_banks.question_count,
            COALESCE(objective_counts.objective_question_count, 0) AS objective_question_count,
            base_banks.description
          FROM base_banks
          LEFT JOIN objective_counts ON objective_counts.bank_id = base_banks.bank_id
          WHERE COALESCE(objective_counts.objective_question_count, 0) > 0
          ORDER BY subject_category, subject_name, bank_name, bank_id
        `,
        params,
      )) as QueryRows<BankMappingRow>;

      return result.rows.map(mapBankRow);
    },
  };
}
