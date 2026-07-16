import { performance } from 'node:perf_hooks';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPgPool, type PgPool, type QueryClient } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { requireDedicatedTestDatabaseUrl } from '../db/testDatabaseSafety.js';
import { runDatabaseSmoke } from '../db/smoke.js';
import { currentCorpusBaseline } from './currentCorpusBaseline.js';
import {
  assertCurrentCorpusImportCounts,
  assertCurrentCorpusSummary,
  resetFullImportDatabase,
} from './fullImportSmoke.js';
import { importQuestionBank } from './importQuestionBank.js';
import { loadQuestionBankData } from './loadQuestionBankData.js';

interface CapacityCycle {
  cycle: number;
  durationMs: number;
  walBytes: number;
  writes: {
    classifications: number;
    questions: number;
    options: number;
    bankMappings: number;
  };
  databaseBytes: number;
  tables: Record<string, {
    inserts: number;
    updates: number;
    deadTuples: number;
  }>;
}

export async function runImportCapacityProfile(
  client: QueryClient,
  questionBankDir: string,
  migrationsDir: string,
  options: {
    cycles: number;
    batchSize: number;
    maxRepeatMs?: number;
    maxRepeatWalBytes?: number;
  },
) {
  await runMigrations(client, migrationsDir);
  await resetFullImportDatabase(client);
  const loadStartedAt = performance.now();
  const data = await loadQuestionBankData(questionBankDir);
  const loadDurationMs = round(performance.now() - loadStartedAt);
  assertCurrentCorpusSummary(data.summary);

  const initialStartedAt = performance.now();
  const initial = await importQuestionBank(client, data, { batchSize: options.batchSize });
  const initialDurationMs = round(performance.now() - initialStartedAt);
  assertCurrentCorpusImportCounts(initial);
  assertWrites('initial', initial.writes, {
    classifications: currentCorpusBaseline.classifications,
    questions: currentCorpusBaseline.questions,
    options: currentCorpusBaseline.importedOptions,
    bankMappings: currentCorpusBaseline.bankMappings,
  });

  const cycles: CapacityCycle[] = [];
  for (let cycle = 1; cycle <= options.cycles; cycle += 1) {
    const beforeLsn = await currentWalLsn(client);
    const startedAt = performance.now();
    const result = await importQuestionBank(client, data, { batchSize: options.batchSize });
    const durationMs = round(performance.now() - startedAt);
    assertCurrentCorpusImportCounts(result);
    const writes = result.writes ?? {
      classifications: -1,
      questions: -1,
      options: -1,
      bankMappings: -1,
    };
    assertWrites(`repeat cycle ${cycle}`, writes, {
      classifications: 0,
      questions: 0,
      options: 0,
      bankMappings: 0,
    });
    const walBytes = await walBytesSince(client, beforeLsn);
    if (options.maxRepeatMs !== undefined && durationMs > options.maxRepeatMs) {
      throw new Error(`Repeat cycle ${cycle} exceeded max duration: ${durationMs}ms > ${options.maxRepeatMs}ms`);
    }
    if (options.maxRepeatWalBytes !== undefined && walBytes > options.maxRepeatWalBytes) {
      throw new Error(
        `Repeat cycle ${cycle} exceeded max WAL: ${walBytes} > ${options.maxRepeatWalBytes} bytes`,
      );
    }

    cycles.push({
      cycle,
      durationMs,
      walBytes,
      writes,
      databaseBytes: await databaseSize(client),
      tables: await tableStats(client),
    });
  }

  const smoke = await runDatabaseSmoke(client);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceDir: resolve(questionBankDir),
    baselineRecordedAt: currentCorpusBaseline.recordedAt,
    options,
    loadDurationMs,
    initial: {
      durationMs: initialDurationMs,
      writes: initial.writes,
    },
    repeat: {
      cycles,
      averageDurationMs: round(average(cycles.map((cycle) => cycle.durationMs))),
      maxDurationMs: Math.max(...cycles.map((cycle) => cycle.durationMs)),
      averageWalBytes: round(average(cycles.map((cycle) => cycle.walBytes))),
      maxWalBytes: Math.max(...cycles.map((cycle) => cycle.walBytes)),
    },
    database: smoke.tables,
  };
}

async function currentWalLsn(client: QueryClient): Promise<string> {
  const result = await client.query(
    'SELECT pg_current_wal_lsn()::text AS lsn',
  ) as { rows?: Array<{ lsn: string }> };
  const lsn = result.rows?.[0]?.lsn;
  if (!lsn) throw new Error('Unable to read pg_current_wal_lsn().');
  return lsn;
}

async function walBytesSince(client: QueryClient, lsn: string): Promise<number> {
  const result = await client.query(
    'SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn)::text AS bytes',
    [lsn],
  ) as { rows?: Array<{ bytes: string }> };
  return Number(result.rows?.[0]?.bytes ?? 0);
}

async function databaseSize(client: QueryClient): Promise<number> {
  const result = await client.query(
    'SELECT pg_database_size(current_database())::text AS bytes',
  ) as { rows?: Array<{ bytes: string }> };
  return Number(result.rows?.[0]?.bytes ?? 0);
}

async function tableStats(client: QueryClient): Promise<CapacityCycle['tables']> {
  await client.query('SELECT pg_stat_clear_snapshot()');
  const result = await client.query(
    `
      SELECT
        relname,
        n_tup_ins::text AS inserts,
        n_tup_upd::text AS updates,
        n_dead_tup::text AS dead_tuples
      FROM pg_stat_user_tables
      WHERE relname = ANY($1::text[])
      ORDER BY relname
    `,
    [['classifications', 'questions', 'question_options', 'bank_mappings']],
  ) as {
    rows?: Array<{
      relname: string;
      inserts: string;
      updates: string;
      dead_tuples: string;
    }>;
  };
  return Object.fromEntries((result.rows ?? []).map((row) => [
    row.relname,
    {
      inserts: Number(row.inserts),
      updates: Number(row.updates),
      deadTuples: Number(row.dead_tuples),
    },
  ]));
}

function assertWrites(
  label: string,
  actual: CapacityCycle['writes'] | undefined,
  expected: CapacityCycle['writes'],
) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} write count changed. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

async function runCli(argv: readonly string[], env: NodeJS.ProcessEnv, createPool = createPgPool): Promise<number> {
  const questionBankDir = argv[2];
  if (!questionBankDir) {
    console.error(
      'Usage: npm run smoke:import:capacity -w @bkyexam-practice/api -- <questionbank-dir> [--cycles=3] [--batch-size=1000]',
    );
    return 1;
  }
  const parsed = parseArgs(argv.slice(3));
  const databaseUrl = requireDedicatedTestDatabaseUrl(env.TEST_DATABASE_URL);
  const pool: PgPool = createPool(databaseUrl);
  try {
    const client = await pool.connect();
    try {
      const result = await runImportCapacityProfile(
        client,
        questionBankDir,
        join(dirname(fileURLToPath(import.meta.url)), '../db/migrations'),
        parsed,
      );
      console.log(JSON.stringify(result, null, 2));
    } finally {
      client.release();
    }
    return 0;
  } finally {
    await pool.end();
  }
}

function parseArgs(argv: readonly string[]) {
  const options: {
    cycles: number;
    batchSize: number;
    maxRepeatMs?: number;
    maxRepeatWalBytes?: number;
  } = {
    cycles: 3,
    batchSize: 1_000,
  };
  for (const arg of argv) {
    if (arg.startsWith('--cycles=')) options.cycles = integer(arg.slice('--cycles='.length), 1, 100);
    else if (arg.startsWith('--batch-size=')) options.batchSize = integer(arg.slice('--batch-size='.length), 1, 10_000);
    else if (arg.startsWith('--max-repeat-ms=')) options.maxRepeatMs = integer(arg.slice('--max-repeat-ms='.length), 1, Number.MAX_SAFE_INTEGER);
    else if (arg.startsWith('--max-repeat-wal-bytes=')) options.maxRepeatWalBytes = integer(arg.slice('--max-repeat-wal-bytes='.length), 0, Number.MAX_SAFE_INTEGER);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function integer(value: string, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Expected integer between ${minimum} and ${maximum}, received ${value}.`);
  }
  return parsed;
}

async function main() {
  try {
    process.exitCode = await runCli(process.argv, process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
