import { describe, expect, it, vi } from 'vitest';
import { runDatabaseSmoke, runDatabaseSmokeCli } from '../../src/db/smoke';
import type { PgPool, QueryClient } from '../../src/db/client';

class FakeQueryClient implements QueryClient {
  readonly queries: string[] = [];

  constructor(private readonly counts: Record<string, string> = {}) {}

  async query(sql: string): Promise<{ rows: Array<{ count: string }> }> {
    this.queries.push(sql);
    const tableName = sql.match(/FROM (\w+)/)?.[1];

    return { rows: [{ count: tableName ? this.counts[tableName] : '0' }] };
  }
}

describe('runDatabaseSmoke', () => {
  it('queries core import tables and maps string counts to numbers', async () => {
    const client = new FakeQueryClient({
      classifications: '12',
      questions: '34',
      question_options: '56',
      bank_mappings: '78',
    });

    const result = await runDatabaseSmoke(client);

    expect(client.queries).toEqual([
      'SELECT COUNT(*) AS count FROM classifications',
      'SELECT COUNT(*) AS count FROM questions',
      'SELECT COUNT(*) AS count FROM question_options',
      'SELECT COUNT(*) AS count FROM bank_mappings',
    ]);
    expect(result).toEqual({
      ok: true,
      tables: {
        classifications: 12,
        questions: 34,
        question_options: 56,
        bank_mappings: 78,
      },
    });
  });
});

describe('runDatabaseSmokeCli', () => {
  it('requires DATABASE_URL', async () => {
    const createPool = vi.fn();
    const error = vi.fn();

    const exitCode = await runDatabaseSmokeCli({
      env: {},
      createPool,
      log: vi.fn(),
      error,
    });

    expect(exitCode).toBe(1);
    expect(createPool).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('DATABASE_URL is required to run database smoke check.');
  });

  it('prints pretty JSON and closes the pool after a successful smoke check', async () => {
    const client = new FakeQueryClient({
      classifications: '1',
      questions: '2',
      question_options: '3',
      bank_mappings: '4',
    });
    const pool: PgPool = {
      connect: vi.fn(async () => Object.assign(client, { release: vi.fn() })),
      end: vi.fn(async () => undefined),
    };
    const log = vi.fn();

    const exitCode = await runDatabaseSmokeCli({
      env: { DATABASE_URL: 'postgres://test' },
      createPool: () => pool,
      log,
      error: vi.fn(),
    });

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify(
        {
          ok: true,
          tables: {
            classifications: 1,
            questions: 2,
            question_options: 3,
            bank_mappings: 4,
          },
        },
        null,
        2,
      ),
    );
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it('closes the pool and exits nonzero when smoke check fails', async () => {
    const pool: PgPool = {
      connect: vi.fn(async () => {
        throw new Error('connection failed');
      }),
      end: vi.fn(async () => undefined),
    };
    const error = vi.fn();

    const exitCode = await runDatabaseSmokeCli({
      env: { DATABASE_URL: 'postgres://test' },
      createPool: () => pool,
      log: vi.fn(),
      error,
    });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith('connection failed');
    expect(pool.end).toHaveBeenCalledOnce();
  });
});
