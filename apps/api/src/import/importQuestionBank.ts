import { pathToFileURL } from 'node:url';
import { createPgPool, type PgPool, type QueryClient } from '../db/client.js';
import {
  loadQuestionBankData,
  type ImportedClassification,
  type ImportedOption,
  type ImportedQuestion,
  type ImportedQuestionBankData,
} from './loadQuestionBankData.js';
import { generateBankMappings } from '../mapping/generateBankMappings.js';
import type { BankMapping } from '../mapping/bankMapping.js';
import { throwIfImportCancelled } from './cancellation.js';

export interface ImportQuestionBankOptions {
  batchSize: number;
  generateMappings?: boolean;
  resetBeforeImport?: boolean;
  shouldAbort?: () => boolean | Promise<boolean>;
  onProgress?: (progress: ImportQuestionBankProgress) => void | Promise<void>;
}

export interface ImportQuestionBankProgress {
  phase: 'classifications' | 'questions' | 'options' | 'bank_mappings';
  current: number;
  total: number;
}

export interface ImportQuestionBankCounts {
  classifications: number;
  questions: number;
  options: number;
  skippedOptions: number;
  bankMappings: number;
  writes?: {
    classifications: number;
    questions: number;
    options: number;
    bankMappings: number;
  };
}

export interface RunImportCliOptions {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  createPool?: (databaseUrl: string) => PgPool;
  loadData?: (questionBankDir: string) => Promise<ImportedQuestionBankData>;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export async function importQuestionBank(
  client: QueryClient,
  data: ImportedQuestionBankData,
  options: ImportQuestionBankOptions,
): Promise<ImportQuestionBankCounts> {
  const batchSize = Math.max(1, Math.floor(options.batchSize));
  const bankMappings = options.generateMappings === false
    ? []
    : generateBankMappings(data.classifications, data.questions);
  const questionIds = new Set(data.questions.map((question) => question.id));
  const importableOptions = data.options.filter((option) => questionIds.has(option.questionId));

  await throwIfImportCancelled(options.shouldAbort);
  await client.query('BEGIN');

  try {
    await throwIfImportCancelled(options.shouldAbort);
    if (options.resetBeforeImport) {
      await resetImportedCorpus(client);
      await throwIfImportCancelled(options.shouldAbort);
    }

    const classificationWrites = await insertBatches(client, data.classifications, batchSize, classificationSql, 'classifications', options);
    const questionWrites = await insertBatches(client, data.questions, batchSize, questionSql, 'questions', options);
    const optionWrites = await insertBatches(client, importableOptions, batchSize, optionSql, 'options', options);
    const bankMappingWrites = await insertBatches(client, bankMappings, batchSize, bankMappingSql, 'bank_mappings', options);
    await client.query('COMMIT');

    return {
      classifications: data.classifications.length,
      questions: data.questions.length,
      options: importableOptions.length,
      skippedOptions: data.options.length - importableOptions.length,
      bankMappings: bankMappings.length,
      writes: {
        classifications: classificationWrites,
        questions: questionWrites,
        options: optionWrites,
        bankMappings: bankMappingWrites,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function insertBatches<T>(
  client: QueryClient,
  records: readonly T[],
  batchSize: number,
  buildSql: (records: readonly T[]) => { sql: string; params: readonly unknown[] },
  phase: ImportQuestionBankProgress['phase'],
  options: Pick<ImportQuestionBankOptions, 'shouldAbort' | 'onProgress'>,
): Promise<number> {
  let affectedRows = 0;
  await options.onProgress?.({ phase, current: 0, total: records.length });
  for (let index = 0; index < records.length; index += batchSize) {
    await throwIfImportCancelled(options.shouldAbort);
    const batch = records.slice(index, index + batchSize);

    if (batch.length > 0) {
      const { sql, params } = buildSql(batch);
      const result = await client.query(sql, params) as { rowCount?: number | null };
      affectedRows += Number(result.rowCount ?? 0);
      await throwIfImportCancelled(options.shouldAbort);
      await options.onProgress?.({
        phase,
        current: Math.min(index + batch.length, records.length),
        total: records.length,
      });
    }
  }
  return affectedRows;
}

async function resetImportedCorpus(client: QueryClient): Promise<void> {
  await client.query('TRUNCATE classifications CASCADE');
}

function classificationSql(records: readonly ImportedClassification[]): { sql: string; params: readonly unknown[] } {
  const columns = ['id', 'name', 'parent_id', 'q_group', 'sort', 'is_deleted'];
  const params = records.flatMap((record) => [
    record.id,
    record.name,
    record.parentId,
    record.qGroup,
    record.sort,
    record.isDeleted,
  ]);

  return {
    sql: `INSERT INTO classifications (${columns.join(', ')})
      SELECT incoming.*
      FROM (VALUES ${typedPlaceholders(records.length, ['uuid', 'text', 'uuid', 'integer', 'integer', 'boolean'])}) AS incoming (${columns.join(', ')})
      WHERE NOT EXISTS (
        SELECT 1
        FROM classifications existing
        WHERE existing.id = incoming.id
          AND ROW(existing.name, existing.parent_id, existing.q_group, existing.sort, existing.is_deleted)
            IS NOT DISTINCT FROM ROW(incoming.name, incoming.parent_id, incoming.q_group, incoming.sort, incoming.is_deleted)
      )
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, q_group = EXCLUDED.q_group, sort = EXCLUDED.sort, is_deleted = EXCLUDED.is_deleted
      WHERE ROW(classifications.name, classifications.parent_id, classifications.q_group, classifications.sort, classifications.is_deleted) IS DISTINCT FROM ROW(EXCLUDED.name, EXCLUDED.parent_id, EXCLUDED.q_group, EXCLUDED.sort, EXCLUDED.is_deleted)`,
    params,
  };
}

function questionSql(records: readonly ImportedQuestion[]): { sql: string; params: readonly unknown[] } {
  const columns = [
    'id',
    'classification_id',
    'q_type',
    'normalized_type',
    'q_group',
    'content',
    'answer_raw',
    'analyze_raw',
    'use_count',
    'difficulty',
    'searchable_text',
  ];
  const params = records.flatMap((record) => [
    record.id,
    record.classificationId,
    record.qType,
    record.normalizedType,
    record.qGroup,
    record.content,
    record.answerRaw,
    record.analyzeRaw,
    record.useCount,
    record.difficulty,
    record.searchableText,
  ]);

  return {
    sql: `INSERT INTO questions (${columns.join(', ')})
      SELECT incoming.*
      FROM (VALUES ${typedPlaceholders(records.length, ['uuid', 'uuid', 'integer', 'text', 'integer', 'text', 'text', 'text', 'integer', 'numeric', 'text'])}) AS incoming (${columns.join(', ')})
      WHERE NOT EXISTS (
        SELECT 1
        FROM questions existing
        WHERE existing.id = incoming.id
          AND ROW(existing.classification_id, existing.q_type, existing.normalized_type, existing.q_group, existing.content, existing.answer_raw, existing.analyze_raw, existing.use_count, existing.difficulty, existing.searchable_text)
            IS NOT DISTINCT FROM ROW(incoming.classification_id, incoming.q_type, incoming.normalized_type, incoming.q_group, incoming.content, incoming.answer_raw, incoming.analyze_raw, incoming.use_count, incoming.difficulty, incoming.searchable_text)
      )
      ON CONFLICT (id) DO UPDATE SET classification_id = EXCLUDED.classification_id, q_type = EXCLUDED.q_type, normalized_type = EXCLUDED.normalized_type, q_group = EXCLUDED.q_group, content = EXCLUDED.content, answer_raw = EXCLUDED.answer_raw, analyze_raw = EXCLUDED.analyze_raw, use_count = EXCLUDED.use_count, difficulty = EXCLUDED.difficulty, searchable_text = EXCLUDED.searchable_text
      WHERE ROW(questions.classification_id, questions.q_type, questions.normalized_type, questions.q_group, questions.content, questions.answer_raw, questions.analyze_raw, questions.use_count, questions.difficulty, questions.searchable_text) IS DISTINCT FROM ROW(EXCLUDED.classification_id, EXCLUDED.q_type, EXCLUDED.normalized_type, EXCLUDED.q_group, EXCLUDED.content, EXCLUDED.answer_raw, EXCLUDED.analyze_raw, EXCLUDED.use_count, EXCLUDED.difficulty, EXCLUDED.searchable_text)`,
    params,
  };
}

function optionSql(records: readonly ImportedOption[]): { sql: string; params: readonly unknown[] } {
  const columns = ['id', 'question_id', 'sort', 'content'];
  const params = records.flatMap((record) => [record.id, record.questionId, record.sort, record.content]);

  return {
    sql: `INSERT INTO question_options (${columns.join(', ')})
      SELECT incoming.*
      FROM (VALUES ${typedPlaceholders(records.length, ['uuid', 'uuid', 'integer', 'text'])}) AS incoming (${columns.join(', ')})
      WHERE NOT EXISTS (
        SELECT 1
        FROM question_options existing
        WHERE existing.id = incoming.id
          AND ROW(existing.question_id, existing.sort, existing.content)
            IS NOT DISTINCT FROM ROW(incoming.question_id, incoming.sort, incoming.content)
      )
      ON CONFLICT (id) DO UPDATE SET question_id = EXCLUDED.question_id, sort = EXCLUDED.sort, content = EXCLUDED.content
      WHERE ROW(question_options.question_id, question_options.sort, question_options.content) IS DISTINCT FROM ROW(EXCLUDED.question_id, EXCLUDED.sort, EXCLUDED.content)`,
    params,
  };
}

function bankMappingSql(records: readonly BankMapping[]): { sql: string; params: readonly unknown[] } {
  const columns = [
    'bank_id',
    'subject_category',
    'subject_name',
    'bank_name',
    'raw_name',
    'parent_id',
    'q_group',
    'visible',
    'status',
    'difficulty',
    'exam_purpose',
    'question_types',
    'audience',
    'keywords',
    'description',
    'notes',
    'question_count',
    'descendant_question_count',
  ];
  const params = records.flatMap((record) => [
    record.bankId,
    record.subjectCategory,
    record.subjectName,
    record.bankName,
    record.rawName,
    record.parentId,
    record.qGroup,
    record.visible,
    record.status,
    record.difficulty,
    record.examPurpose,
    JSON.stringify(record.questionTypes),
    record.audience,
    JSON.stringify(record.keywords),
    record.description,
    record.notes,
    record.questionCount,
    record.descendantQuestionCount,
  ]);

  return {
    sql: `INSERT INTO bank_mappings (${columns.join(', ')})
      SELECT incoming.*
      FROM (VALUES ${typedPlaceholders(records.length, ['uuid', 'text', 'text', 'text', 'text', 'uuid', 'integer', 'boolean', 'text', 'text', 'text', 'jsonb', 'text', 'jsonb', 'text', 'text', 'integer', 'integer'])}) AS incoming (${columns.join(', ')})
      WHERE NOT EXISTS (
        SELECT 1
        FROM bank_mappings existing
        WHERE existing.bank_id = incoming.bank_id
          AND ROW(existing.subject_category, existing.subject_name, existing.bank_name, existing.raw_name, existing.parent_id, existing.q_group, existing.visible, existing.status, existing.difficulty, existing.exam_purpose, existing.question_types, existing.audience, existing.keywords, existing.description, existing.notes, existing.question_count, existing.descendant_question_count)
            IS NOT DISTINCT FROM ROW(incoming.subject_category, incoming.subject_name, incoming.bank_name, incoming.raw_name, incoming.parent_id, incoming.q_group, incoming.visible, incoming.status, incoming.difficulty, incoming.exam_purpose, incoming.question_types, incoming.audience, incoming.keywords, incoming.description, incoming.notes, incoming.question_count, incoming.descendant_question_count)
      )
      ON CONFLICT (bank_id) DO UPDATE SET subject_category = EXCLUDED.subject_category, subject_name = EXCLUDED.subject_name, bank_name = EXCLUDED.bank_name, raw_name = EXCLUDED.raw_name, parent_id = EXCLUDED.parent_id, q_group = EXCLUDED.q_group, visible = EXCLUDED.visible, status = EXCLUDED.status, difficulty = EXCLUDED.difficulty, exam_purpose = EXCLUDED.exam_purpose, question_types = EXCLUDED.question_types, audience = EXCLUDED.audience, keywords = EXCLUDED.keywords, description = EXCLUDED.description, notes = EXCLUDED.notes, question_count = EXCLUDED.question_count, descendant_question_count = EXCLUDED.descendant_question_count
      WHERE ROW(bank_mappings.subject_category, bank_mappings.subject_name, bank_mappings.bank_name, bank_mappings.raw_name, bank_mappings.parent_id, bank_mappings.q_group, bank_mappings.visible, bank_mappings.status, bank_mappings.difficulty, bank_mappings.exam_purpose, bank_mappings.question_types, bank_mappings.audience, bank_mappings.keywords, bank_mappings.description, bank_mappings.notes, bank_mappings.question_count, bank_mappings.descendant_question_count) IS DISTINCT FROM ROW(EXCLUDED.subject_category, EXCLUDED.subject_name, EXCLUDED.bank_name, EXCLUDED.raw_name, EXCLUDED.parent_id, EXCLUDED.q_group, EXCLUDED.visible, EXCLUDED.status, EXCLUDED.difficulty, EXCLUDED.exam_purpose, EXCLUDED.question_types, EXCLUDED.audience, EXCLUDED.keywords, EXCLUDED.description, EXCLUDED.notes, EXCLUDED.question_count, EXCLUDED.descendant_question_count)`,
    params,
  };
}

function typedPlaceholders(recordCount: number, casts: readonly string[]): string {
  return Array.from({ length: recordCount }, (_, recordIndex) => {
    const start = recordIndex * casts.length;
    return `(${casts.map((cast, columnIndex) => `$${start + columnIndex + 1}::${cast}`).join(', ')})`;
  }).join(', ');
}

async function main(): Promise<void> {
  process.exitCode = await runImportCli({ argv: process.argv, env: process.env });
}

export async function runImportCli({
  argv,
  env,
  createPool = createPgPool,
  loadData = loadQuestionBankData,
  log = console.log,
  error = console.error,
}: RunImportCliOptions): Promise<number> {
  const questionBankDir = argv[2];
  const databaseUrl = env.DATABASE_URL;

  if (!questionBankDir) {
    error('Usage: npm run import:db -w @bkyexam-practice/api -- <questionbank-dir>');
    return 1;
  }

  if (!databaseUrl) {
    error('DATABASE_URL is required to import question bank data.');
    return 1;
  }

  const pool = createPool(databaseUrl);

  try {
    const dbClient = await pool.connect();

    try {
      const data = await loadData(questionBankDir);
      const counts = await importQuestionBank(dbClient, data, { batchSize: 1_000 });
      log(JSON.stringify(counts, null, 2));
    } finally {
      dbClient.release();
    }

    return 0;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
