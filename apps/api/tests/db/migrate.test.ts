import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMigrateCli, runMigrations } from '../../src/db/migrate';
import type { PgPool, QueryClient } from '../../src/db/client';

class FakeQueryClient implements QueryClient {
  readonly queries: string[] = [];

  constructor(private readonly failOnSql?: string) {}

  async query(sql: string): Promise<unknown> {
    this.queries.push(sql);

    if (this.failOnSql === sql) {
      throw new Error(`failed: ${sql}`);
    }

    return undefined;
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

  it('executes migration SQL files in sorted filename order inside one transaction', async () => {
    const migrationsDir = await createMigrations({
      '002_second.sql': 'SELECT 2;',
      '001_first.sql': 'SELECT 1;',
      'readme.txt': 'not sql',
    });
    const client = new FakeQueryClient();

    const result = await runMigrations(client, migrationsDir);

    expect(result.files).toEqual(['001_first.sql', '002_second.sql']);
    expect(client.queries).toEqual(['BEGIN', 'SELECT 1;', 'SELECT 2;', 'COMMIT']);
  });

  it('rolls back and rethrows when a migration fails', async () => {
    const migrationsDir = await createMigrations({
      '001_first.sql': 'SELECT 1;',
      '002_second.sql': 'SELECT fail;',
    });
    const client = new FakeQueryClient('SELECT fail;');

    await expect(runMigrations(client, migrationsDir)).rejects.toThrow('failed: SELECT fail;');
    expect(client.queries).toEqual(['BEGIN', 'SELECT 1;', 'SELECT fail;', 'ROLLBACK']);
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
    expect(dbClient.queries).toEqual(['BEGIN', 'SELECT 1;', 'COMMIT']);
    expect(release).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
  });
});
