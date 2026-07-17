import { createHash } from 'node:crypto';
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
): Promise<{ files: string[]; appliedFiles: string[]; skippedFiles: string[] }> {
  const files = (await readdir(migrationsDir))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();
  const migrations = await Promise.all(files.map(async (fileName) => {
    const sql = await readFile(join(migrationsDir, fileName), 'utf8');
    return {
      fileName,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    };
  }));

  await client.query('BEGIN');

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');

    const ledgerResult = await client.query(
      'SELECT filename, checksum FROM schema_migrations ORDER BY filename',
    ) as { rows?: Array<{ filename: string; checksum: string }> };
    const applied = new Map(
      (ledgerResult.rows ?? []).map((row) => [row.filename, row.checksum]),
    );
    const availableFiles = new Set(files);

    for (const [fileName] of applied) {
      if (!availableFiles.has(fileName)) {
        throw new Error(`Applied migration file is missing from this release: ${fileName}`);
      }
    }

    const appliedFiles: string[] = [];
    const skippedFiles: string[] = [];

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.fileName);
      if (existingChecksum !== undefined) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(`Migration checksum drift detected: ${migration.fileName}`);
        }
        skippedFiles.push(migration.fileName);
        continue;
      }

      await client.query(migration.sql);
      await client.query(
        `
          INSERT INTO schema_migrations (filename, checksum)
          VALUES ($1, $2)
        `,
        [migration.fileName, migration.checksum],
      );
      appliedFiles.push(migration.fileName);
    }

    await client.query('COMMIT');
    return { files, appliedFiles, skippedFiles };
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
      const { files, appliedFiles, skippedFiles } = await runMigrations(client, migrationsDir);
      log(`Migration files: ${files.length > 0 ? files.join(', ') : 'none'}`);
      log(`Applied migrations: ${appliedFiles.length > 0 ? appliedFiles.join(', ') : 'none'}`);
      log(`Skipped migrations: ${skippedFiles.length > 0 ? skippedFiles.join(', ') : 'none'}`);
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
