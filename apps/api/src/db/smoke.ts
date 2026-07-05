import { pathToFileURL } from 'node:url';
import { createPgPool, type PgPool, type QueryClient } from './client.js';

const smokeTables = [
  'classifications',
  'questions',
  'question_options',
  'bank_mappings',
] as const;

type SmokeTable = (typeof smokeTables)[number];

export interface DatabaseSmokeResult {
  ok: true;
  tables: Record<SmokeTable, number>;
}

export interface RunDatabaseSmokeCliOptions {
  env: NodeJS.ProcessEnv;
  createPool?: (databaseUrl: string) => PgPool;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export async function runDatabaseSmoke(client: QueryClient): Promise<DatabaseSmokeResult> {
  const tables = {} as Record<SmokeTable, number>;

  for (const tableName of smokeTables) {
    const result = await client.query(`SELECT COUNT(*) AS count FROM ${tableName}`);
    const count = readCount(result);
    tables[tableName] = Number(count);
  }

  return { ok: true, tables };
}

export async function runDatabaseSmokeCli(
  {
    env,
    createPool = createPgPool,
    log = console.log,
    error = console.error,
  }: RunDatabaseSmokeCliOptions,
): Promise<number> {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    error('DATABASE_URL is required to run database smoke check.');
    return 1;
  }

  const pool = createPool(databaseUrl);

  try {
    const client = await pool.connect();

    try {
      const result = await runDatabaseSmoke(client);
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

function readCount(result: unknown): string | number {
  if (
    typeof result === 'object' &&
    result !== null &&
    'rows' in result &&
    Array.isArray(result.rows) &&
    result.rows[0] &&
    typeof result.rows[0] === 'object' &&
    'count' in result.rows[0]
  ) {
    return result.rows[0].count as string | number;
  }

  throw new Error('Database smoke count query returned an unexpected result.');
}

async function main(): Promise<void> {
  process.exitCode = await runDatabaseSmokeCli({ env: process.env });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((caught: unknown) => {
    console.error(caught instanceof Error ? caught.message : String(caught));
    process.exitCode = 1;
  });
}
