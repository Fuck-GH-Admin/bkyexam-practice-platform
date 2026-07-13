import { performance } from 'node:perf_hooks';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPgPool, type PgPool, type QueryClient } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runDatabaseSmoke, type DatabaseSmokeResult } from '../db/smoke.js';
import { requireDedicatedTestDatabaseUrl } from '../db/testDatabaseSafety.js';
import { currentCorpusBaseline } from './currentCorpusBaseline.js';
import {
  importQuestionBank,
  type ImportQuestionBankCounts,
} from './importQuestionBank.js';
import {
  loadQuestionBankData,
  type ImportedQuestionBankData,
} from './loadQuestionBankData.js';

export interface RunFullImportSmokeCliOptions {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  createPool?: (databaseUrl: string) => PgPool;
  migrationsDir?: string;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export interface FullImportSmokeResult {
  ok: true;
  baselineRecordedAt: string;
  sourceDir: string;
  parsed: ImportedQuestionBankData['summary'];
  imported: ImportQuestionBankCounts;
  database: DatabaseSmokeResult['tables'];
  durationsMs: {
    load: number;
    firstImport: number;
    secondImport: number;
    total: number;
  };
}

export async function runFullImportSmoke(
  client: QueryClient,
  questionBankDir: string,
  migrationsDir: string,
): Promise<FullImportSmokeResult> {
  const totalStartedAt = performance.now();
  await runMigrations(client, migrationsDir);
  await resetFullImportDatabase(client);

  const loadStartedAt = performance.now();
  const data = await loadQuestionBankData(questionBankDir);
  const loadDuration = performance.now() - loadStartedAt;
  assertCurrentCorpusSummary(data.summary);

  const firstImportStartedAt = performance.now();
  const firstImport = await importQuestionBank(client, data, { batchSize: 1_000 });
  const firstImportDuration = performance.now() - firstImportStartedAt;
  assertCurrentCorpusImportCounts(firstImport);
  const firstSmoke = await runDatabaseSmoke(client);
  assertDatabaseCounts(firstSmoke.tables);

  const secondImportStartedAt = performance.now();
  const secondImport = await importQuestionBank(client, data, { batchSize: 1_000 });
  const secondImportDuration = performance.now() - secondImportStartedAt;
  assertCurrentCorpusImportCounts(secondImport);
  const secondSmoke = await runDatabaseSmoke(client);
  assertDatabaseCounts(secondSmoke.tables);

  assertEqual('second import counts', secondImport, firstImport);
  assertEqual('database counts after second import', secondSmoke.tables, firstSmoke.tables);

  return {
    ok: true,
    baselineRecordedAt: currentCorpusBaseline.recordedAt,
    sourceDir: resolve(questionBankDir),
    parsed: data.summary,
    imported: secondImport,
    database: secondSmoke.tables,
    durationsMs: {
      load: roundDuration(loadDuration),
      firstImport: roundDuration(firstImportDuration),
      secondImport: roundDuration(secondImportDuration),
      total: roundDuration(performance.now() - totalStartedAt),
    },
  };
}

export function assertCurrentCorpusSummary(summary: ImportedQuestionBankData['summary']) {
  assertNumber('parsed classifications', summary.classifications, currentCorpusBaseline.classifications);
  assertNumber('parsed questions', summary.questions, currentCorpusBaseline.questions);
  assertNumber('parsed raw options', summary.options, currentCorpusBaseline.rawOptions);
  assertEqual('parsed question type counts', summary.questionTypes, currentCorpusBaseline.questionTypes);
}

export function assertCurrentCorpusImportCounts(counts: ImportQuestionBankCounts) {
  assertEqual('import counts', counts, {
    classifications: currentCorpusBaseline.classifications,
    questions: currentCorpusBaseline.questions,
    options: currentCorpusBaseline.importedOptions,
    skippedOptions: currentCorpusBaseline.skippedOptions,
    bankMappings: currentCorpusBaseline.bankMappings,
  });
}

async function resetFullImportDatabase(client: QueryClient) {
  await client.query(`
    TRUNCATE TABLE
      question_quality_flags,
      import_jobs,
      audit_logs,
      admin_sessions,
      admin_user_roles,
      practice_session_drafts,
      practice_session_questions,
      practice_sessions,
      student_sessions,
      wrong_questions,
      practice_attempts,
      question_options,
      questions,
      bank_mappings,
      admin_users,
      students,
      classifications
    RESTART IDENTITY CASCADE
  `);
}

function assertDatabaseCounts(tables: DatabaseSmokeResult['tables']) {
  assertEqual('database counts', tables, {
    classifications: currentCorpusBaseline.classifications,
    questions: currentCorpusBaseline.questions,
    question_options: currentCorpusBaseline.importedOptions,
    bank_mappings: currentCorpusBaseline.bankMappings,
  });
}

function assertNumber(label: string, actual: number, expected: number) {
  if (actual !== expected) {
    throw new Error(`${label} changed: expected ${expected}, received ${actual}.`);
  }
}

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `${label} changed.\nExpected: ${JSON.stringify(expected)}\nReceived: ${JSON.stringify(actual)}`,
    );
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function roundDuration(value: number) {
  return Math.round(value * 100) / 100;
}

export async function runFullImportSmokeCli({
  argv,
  env,
  createPool = createPgPool,
  migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../db/migrations'),
  log = console.log,
  error = console.error,
}: RunFullImportSmokeCliOptions): Promise<number> {
  const questionBankDir = argv[2];
  if (!questionBankDir) {
    error('Usage: npm run smoke:import:full -w @bkyexam-practice/api -- <questionbank-dir>');
    return 1;
  }

  let databaseUrl: string;
  try {
    databaseUrl = requireDedicatedTestDatabaseUrl(env.TEST_DATABASE_URL);
  } catch (caught) {
    error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }

  const pool = createPool(databaseUrl);
  try {
    const client = await pool.connect();
    try {
      const result = await runFullImportSmoke(client, questionBankDir, migrationsDir);
      log(JSON.stringify(result, null, 2));
      return 0;
    } finally {
      client.release();
    }
  } catch (caught) {
    error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  } finally {
    await pool.end();
  }
}

async function main() {
  process.exitCode = await runFullImportSmokeCli({ argv: process.argv, env: process.env });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
