import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMigrateCli, runMigrations } from '../../src/db/migrate';
import type { PgPool, QueryClient } from '../../src/db/client';

class FakeQueryClient implements QueryClient {
  readonly queries: Array<{ sql: string; params?: readonly unknown[] }> = [];
  readonly ledger = new Map<string, string>();

  constructor(private readonly failOnSql?: string) {}

  async query(sql: string, params?: readonly unknown[]): Promise<unknown> {
    this.queries.push({ sql, params });

    if (this.failOnSql === sql) {
      throw new Error(`failed: ${sql}`);
    }

    if (sql === 'SELECT filename, checksum FROM schema_migrations ORDER BY filename') {
      return {
        rows: [...this.ledger.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([filename, checksum]) => ({ filename, checksum })),
      };
    }

    if (sql.includes('INSERT INTO schema_migrations')) {
      this.ledger.set(String(params?.[0]), String(params?.[1]));
    }

    return { rows: [] };
  }
}

describe('runMigrations', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function createMigrations(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'bkyexam-migrations-'));
    tempDirs.push(dir);

    await Promise.all(
      Object.entries(files).map(([fileName, sql]) => writeFile(join(dir, fileName), sql)),
    );

    return dir;
  }

  it('executes untracked migration SQL files in sorted filename order and records checksums', async () => {
    const migrationsDir = await createMigrations({
      '002_second.sql': 'SELECT 2;',
      '001_first.sql': 'SELECT 1;',
      'readme.txt': 'not sql',
    });
    const client = new FakeQueryClient();

    const result = await runMigrations(client, migrationsDir);

    expect(result).toEqual({
      files: ['001_first.sql', '002_second.sql'],
      appliedFiles: ['001_first.sql', '002_second.sql'],
      skippedFiles: [],
    });
    expect(client.queries.map((query) => query.sql).filter((sql) => sql.startsWith('SELECT '))).toEqual([
      'SELECT filename, checksum FROM schema_migrations ORDER BY filename',
      'SELECT 1;',
      'SELECT 2;',
    ]);
    expect(client.ledger.size).toBe(2);
  });

  it('rolls back and rethrows when a migration fails', async () => {
    const migrationsDir = await createMigrations({
      '001_first.sql': 'SELECT 1;',
      '002_second.sql': 'SELECT fail;',
    });
    const client = new FakeQueryClient('SELECT fail;');

    await expect(runMigrations(client, migrationsDir)).rejects.toThrow('failed: SELECT fail;');
    expect(client.queries.at(-1)?.sql).toBe('ROLLBACK');
    expect(client.queries.some((query) => query.sql === 'COMMIT')).toBe(false);
  });

  it('skips migrations already recorded with the same checksum', async () => {
    const migrationsDir = await createMigrations({ '001_init.sql': 'SELECT 1;' });
    const client = new FakeQueryClient();

    await runMigrations(client, migrationsDir);
    client.queries.length = 0;
    const result = await runMigrations(client, migrationsDir);

    expect(result.appliedFiles).toEqual([]);
    expect(result.skippedFiles).toEqual(['001_init.sql']);
    expect(client.queries.some((query) => query.sql === 'SELECT 1;')).toBe(false);
  });

  it('fails closed when an applied migration file checksum changes', async () => {
    const migrationsDir = await createMigrations({ '001_init.sql': 'SELECT 1;' });
    const client = new FakeQueryClient();
    await runMigrations(client, migrationsDir);
    await writeFile(join(migrationsDir, '001_init.sql'), 'SELECT changed;');

    await expect(runMigrations(client, migrationsDir)).rejects.toThrow(
      'Migration checksum drift detected: 001_init.sql',
    );
    expect(client.queries.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('fails closed when the release omits an applied migration file', async () => {
    const migrationsDir = await createMigrations({ '001_init.sql': 'SELECT 1;' });
    const client = new FakeQueryClient();
    client.ledger.set('000_missing.sql', 'checksum');

    await expect(runMigrations(client, migrationsDir)).rejects.toThrow(
      'Applied migration file is missing from this release: 000_missing.sql',
    );
    expect(client.queries.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('migration CLI runs migrations on one checked-out client and releases it', async () => {
    const dbClient = new FakeQueryClient();
    const release = vi.fn();
    const poolQuery = vi.fn();
    const pool: PgPool & QueryClient = {
      query: poolQuery,
      connect: vi.fn(async () => Object.assign(dbClient, { release })),
      end: vi.fn(async () => undefined),
    };
    const migrationsDir = await createMigrations({ '001_init.sql': 'SELECT 1;' });

    const exitCode = await runMigrateCli({
      env: { DATABASE_URL: 'postgres://test' },
      createPool: () => pool,
      migrationsDir,
      log: vi.fn(),
      error: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(pool.connect).toHaveBeenCalledOnce();
    expect(poolQuery).not.toHaveBeenCalled();
    expect(dbClient.queries.some((query) => query.sql === 'SELECT 1;')).toBe(true);
    expect(dbClient.queries.at(-1)?.sql).toBe('COMMIT');
    expect(release).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
  });
});
