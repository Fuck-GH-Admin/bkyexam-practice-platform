import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPgPool, type PgPool, type QueryClient } from './client.js';

export interface RunMigrateCliOptions {
  env: NodeJS.ProcessEnv;
  createPool?: (databaseUrl: string) => PgPool;
  migrationsDir?: string;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export async function runMigrations(
  client: QueryClient,
  migrationsDir: string,
): Promise<{ files: string[] }> {
  const files = (await readdir(migrationsDir))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  await client.query('BEGIN');

  try {
    for (const fileName of files) {
      const sql = await readFile(join(migrationsDir, fileName), 'utf8');
      await client.query(sql);
    }

    await client.query('COMMIT');
    return { files };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runMigrateCli({ env: process.env });
}

export async function runMigrateCli({
  env,
  createPool = createPgPool,
  migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations'),
  log = console.log,
  error = console.error,
}: RunMigrateCliOptions): Promise<number> {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    error('DATABASE_URL is required to run database migrations.');
    return 1;
  }

  const pool = createPool(databaseUrl);

  try {
    const client = await pool.connect();

    try {
      const { files } = await runMigrations(client, migrationsDir);
      log(`Applied migrations: ${files.length > 0 ? files.join(', ') : 'none'}`);
    } finally {
      client.release();
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
