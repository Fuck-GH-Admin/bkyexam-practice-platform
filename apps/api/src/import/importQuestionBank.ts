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

export interface ImportQuestionBankOptions {
  batchSize: number;
}

export interface ImportQuestionBankCounts {
  classifications: number;
  questions: number;
  options: number;
  skippedOptions: number;
  bankMappings: number;
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
  const bankMappings = generateBankMappings(data.classifications, data.questions);
  const questionIds = new Set(data.questions.map((question) => question.id));
  const importableOptions = data.options.filter((option) => questionIds.has(option.questionId));

  await client.query('BEGIN');

  try {
    await insertBatches(client, data.classifications, batchSize, classificationSql);
    await insertBatches(client, data.questions, batchSize, questionSql);
    await insertBatches(client, importableOptions, batchSize, optionSql);
    await insertBatches(client, bankMappings, batchSize, bankMappingSql);
    await client.query('COMMIT');

    return {
      classifications: data.classifications.length,
      questions: data.questions.length,
      options: importableOptions.length,
      skippedOptions: data.options.length - importableOptions.length,
      bankMappings: bankMappings.length,
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
): Promise<void> {
  for (let index = 0; index < records.length; index += batchSize) {
    const batch = records.slice(index, index + batchSize);

    if (batch.length > 0) {
      const { sql, params } = buildSql(batch);
      await client.query(sql, params);
    }
  }
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
    sql: `INSERT INTO classifications (${columns.join(', ')}) VALUES ${placeholders(records.length, columns.length)} ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, q_group = EXCLUDED.q_group, sort = EXCLUDED.sort, is_deleted = EXCLUDED.is_deleted`,
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
    sql: `INSERT INTO questions (${columns.join(', ')}) VALUES ${placeholders(records.length, columns.length)} ON CONFLICT (id) DO UPDATE SET classification_id = EXCLUDED.classification_id, q_type = EXCLUDED.q_type, normalized_type = EXCLUDED.normalized_type, q_group = EXCLUDED.q_group, content = EXCLUDED.content, answer_raw = EXCLUDED.answer_raw, analyze_raw = EXCLUDED.analyze_raw, use_count = EXCLUDED.use_count, difficulty = EXCLUDED.difficulty, searchable_text = EXCLUDED.searchable_text`,
    params,
  };
}

function optionSql(records: readonly ImportedOption[]): { sql: string; params: readonly unknown[] } {
  const columns = ['id', 'question_id', 'sort', 'content'];
  const params = records.flatMap((record) => [record.id, record.questionId, record.sort, record.content]);

  return {
    sql: `INSERT INTO question_options (${columns.join(', ')}) VALUES ${placeholders(records.length, columns.length)} ON CONFLICT (id) DO UPDATE SET question_id = EXCLUDED.question_id, sort = EXCLUDED.sort, content = EXCLUDED.content`,
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
    sql: `INSERT INTO bank_mappings (${columns.join(', ')}) VALUES ${placeholders(records.length, columns.length)} ON CONFLICT (bank_id) DO UPDATE SET subject_category = EXCLUDED.subject_category, subject_name = EXCLUDED.subject_name, bank_name = EXCLUDED.bank_name, raw_name = EXCLUDED.raw_name, parent_id = EXCLUDED.parent_id, q_group = EXCLUDED.q_group, visible = EXCLUDED.visible, status = EXCLUDED.status, difficulty = EXCLUDED.difficulty, exam_purpose = EXCLUDED.exam_purpose, question_types = EXCLUDED.question_types, audience = EXCLUDED.audience, keywords = EXCLUDED.keywords, description = EXCLUDED.description, notes = EXCLUDED.notes, question_count = EXCLUDED.question_count, descendant_question_count = EXCLUDED.descendant_question_count`,
    params,
  };
}

function placeholders(recordCount: number, columnCount: number): string {
  return Array.from({ length: recordCount }, (_, recordIndex) => {
    const start = recordIndex * columnCount;
    const row = Array.from({ length: columnCount }, (__, columnIndex) => `$${start + columnIndex + 1}`);

    return `(${row.join(', ')})`;
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
