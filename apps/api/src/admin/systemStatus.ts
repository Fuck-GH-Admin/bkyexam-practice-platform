import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AdminSystemStatusResponseV1 } from '@bkyexam-practice/shared';
import type { QueryClient } from '../db/client.js';

export interface AdminSystemStatusRepository {
  getSystemStatus(): Promise<AdminSystemStatusResponseV1>;
}

interface QueryRows<T> {
  rows: T[];
}

interface AdminSystemStatusRepositoryOptions {
  serviceVersion?: string;
  migrationsDir?: string;
}

const defaultServiceVersion = '0.1.0';
const defaultMigrationsDir = fileURLToPath(new URL('../db/migrations/', import.meta.url));

function createEmptyStatus(
  overrides: Partial<AdminSystemStatusResponseV1> = {},
): AdminSystemStatusResponseV1 {
  return {
    api: {
      ok: true,
      service: 'bkyexam-practice-api',
      version: defaultServiceVersion,
    },
    database: {
      ok: false,
      migrationCount: 0,
      currentMigration: null,
    },
    corpus: {
      classifications: 0,
      questions: 0,
      questionOptions: 0,
      bankMappings: 0,
      visibleBanks: 0,
    },
    imports: {
      tableExists: false,
      runningJobId: null,
      lastJob: null,
    },
    quality: {
      tableExists: false,
      openFlags: 0,
      blockingFlags: 0,
      excludedQuestions: 0,
    },
    ...overrides,
  };
}

export function createMemoryAdminSystemStatusRepository(
  status: AdminSystemStatusResponseV1 = createEmptyStatus(),
): AdminSystemStatusRepository {
  return {
    async getSystemStatus() {
      return {
        ...status,
        api: { ...status.api },
        database: { ...status.database },
        corpus: { ...status.corpus },
        imports: {
          ...status.imports,
          lastJob: status.imports.lastJob ? { ...status.imports.lastJob } : null,
        },
        quality: { ...status.quality },
      };
    },
  };
}

export function createPgAdminSystemStatusRepository(
  client: QueryClient,
  options: AdminSystemStatusRepositoryOptions = {},
): AdminSystemStatusRepository {
  const serviceVersion = options.serviceVersion ?? defaultServiceVersion;
  const migrationsDir = options.migrationsDir ?? defaultMigrationsDir;

  return {
    async getSystemStatus() {
      await client.query('SELECT 1 AS ok');

      const [
        migrationSummary,
        corpus,
        imports,
        quality,
      ] = await Promise.all([
        loadMigrationSummary(migrationsDir),
        loadCorpusSummary(client),
        loadImportSummary(client),
        loadQualitySummary(client),
      ]);

      return {
        api: {
          ok: true,
          service: 'bkyexam-practice-api',
          version: serviceVersion,
        },
        database: {
          ok: true,
          migrationCount: migrationSummary.migrationCount,
          currentMigration: migrationSummary.currentMigration,
        },
        corpus,
        imports,
        quality,
      };
    },
  };
}

async function loadMigrationSummary(migrationsDir: string) {
  try {
    const files = (await readdir(migrationsDir))
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort();

    return {
      migrationCount: files.length,
      currentMigration: files.at(-1) ?? null,
    };
  } catch {
    return {
      migrationCount: 0,
      currentMigration: null,
    };
  }
}

async function loadCorpusSummary(client: QueryClient): Promise<AdminSystemStatusResponseV1['corpus']> {
  const [
    classifications,
    questions,
    questionOptions,
    bankMappings,
    visibleBanks,
  ] = await Promise.all([
    countRows(client, 'SELECT COUNT(*) AS count FROM classifications'),
    countRows(client, 'SELECT COUNT(*) AS count FROM questions'),
    countRows(client, 'SELECT COUNT(*) AS count FROM question_options'),
    countRows(client, 'SELECT COUNT(*) AS count FROM bank_mappings'),
    countRows(client, `
      WITH RECURSIVE base_banks AS (
        SELECT bank_id
        FROM bank_mappings
        WHERE visible = true
          AND status = 'active'
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
      SELECT COUNT(*) AS count
      FROM base_banks
      LEFT JOIN objective_counts ON objective_counts.bank_id = base_banks.bank_id
      WHERE COALESCE(objective_counts.objective_question_count, 0) > 0
    `),
  ]);

  return {
    classifications,
    questions,
    questionOptions,
    bankMappings,
    visibleBanks,
  };
}

async function loadImportSummary(client: QueryClient): Promise<AdminSystemStatusResponseV1['imports']> {
  const tableExists = await hasTable(client, 'public.import_jobs');
  if (!tableExists) {
    return { tableExists: false, runningJobId: null, lastJob: null };
  }

  const runningResult = (await client.query(
    `
      SELECT id
      FROM import_jobs
      WHERE status = 'running'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
  )) as QueryRows<{ id: string }>;
  const lastJobResult = (await client.query(
    `
      SELECT id, status, finished_at
      FROM import_jobs
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
  )) as QueryRows<{ id: string; status: string; finished_at: Date | string | null }>;
  const lastJob = lastJobResult.rows[0];

  return {
    tableExists: true,
    runningJobId: runningResult.rows[0]?.id ?? null,
    lastJob: lastJob
      ? {
        id: lastJob.id,
        status: lastJob.status,
        finishedAt: lastJob.finished_at ? toIsoTimestamp(lastJob.finished_at) : null,
      }
      : null,
  };
}

async function loadQualitySummary(client: QueryClient): Promise<AdminSystemStatusResponseV1['quality']> {
  const tableExists = await hasTable(client, 'public.question_quality_flags');
  if (!tableExists) {
    return { tableExists: false, openFlags: 0, blockingFlags: 0, excludedQuestions: 0 };
  }

  const result = (await client.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'open') AS open_flags,
        COUNT(*) FILTER (WHERE status = 'open' AND severity = 'blocking') AS blocking_flags,
        COUNT(DISTINCT question_id) FILTER (WHERE excluded_from_practice = true) AS excluded_questions
      FROM question_quality_flags
    `,
  )) as QueryRows<{
    open_flags: string | number;
    blocking_flags: string | number;
    excluded_questions: string | number;
  }>;
  const row = result.rows[0];

  return {
    tableExists: true,
    openFlags: Number(row.open_flags),
    blockingFlags: Number(row.blocking_flags),
    excludedQuestions: Number(row.excluded_questions),
  };
}

async function hasTable(client: QueryClient, tableName: string): Promise<boolean> {
  const result = (await client.query(
    'SELECT to_regclass($1) AS table_name',
    [tableName],
  )) as QueryRows<{ table_name: string | null }>;

  return Boolean(result.rows[0]?.table_name);
}

async function countRows(client: QueryClient, sql: string): Promise<number> {
  const result = (await client.query(sql)) as QueryRows<{ count: string | number }>;
  const count = result.rows[0]?.count;
  if (count === undefined) {
    throw new Error('Count query returned no rows.');
  }

  return Number(count);
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
