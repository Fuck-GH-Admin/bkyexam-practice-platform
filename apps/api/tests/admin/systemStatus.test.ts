import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createMemoryAdminSystemStatusRepository,
  createPgAdminSystemStatusRepository,
} from '../../src/admin/systemStatus';
import type { QueryClient } from '../../src/db/client';

class SystemStatusQueryClient implements QueryClient {
  queries: Array<{ sql: string; params?: readonly unknown[] }> = [];

  constructor(private readonly options: {
    importJobsTable?: boolean;
    qualityFlagsTable?: boolean;
  } = {}) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.queries.push({ sql, params });
    const compactSql = sql.replace(/\s+/g, ' ').trim();

    if (compactSql === 'SELECT 1 AS ok') {
      return { rows: [{ ok: 1 }] };
    }
    if (compactSql === 'SELECT to_regclass($1) AS table_name') {
      if (params?.[0] === 'public.import_jobs') {
        return { rows: [{ table_name: this.options.importJobsTable ? 'import_jobs' : null }] };
      }
      if (params?.[0] === 'public.question_quality_flags') {
        return { rows: [{ table_name: this.options.qualityFlagsTable ? 'question_quality_flags' : null }] };
      }
    }
    if (compactSql === 'SELECT COUNT(*) AS count FROM classifications') {
      return { rows: [{ count: '3' }] };
    }
    if (compactSql === 'SELECT COUNT(*) AS count FROM questions') {
      return { rows: [{ count: '5' }] };
    }
    if (compactSql === 'SELECT COUNT(*) AS count FROM question_options') {
      return { rows: [{ count: '8' }] };
    }
    if (compactSql === 'SELECT COUNT(*) AS count FROM bank_mappings') {
      return { rows: [{ count: '2' }] };
    }
    if (sql.includes('WITH RECURSIVE base_banks')) {
      return { rows: [{ count: '1' }] };
    }
    if (compactSql.includes('FROM import_jobs') && compactSql.includes("status = 'running'")) {
      return { rows: [{ id: '60000000-0000-4000-8000-000000000001' }] };
    }
    if (compactSql.includes('FROM import_jobs') && compactSql.includes('finished_at')) {
      return {
        rows: [{
          id: '60000000-0000-4000-8000-000000000002',
          status: 'succeeded',
          finished_at: new Date('2026-07-13T10:00:00.000Z'),
        }],
      };
    }
    if (compactSql.includes('FROM question_quality_flags')) {
      return { rows: [{ open_flags: '12', blocking_flags: '2', excluded_questions: '2' }] };
    }

    throw new Error(`Unexpected query: ${compactSql}`);
  }
}

describe('memory admin system status repository', () => {
  it('returns an isolated status snapshot', async () => {
    const repository = createMemoryAdminSystemStatusRepository({
      api: { ok: true, service: 'bkyexam-practice-api', version: '0.1.0' },
      database: { ok: false, migrationCount: 0, currentMigration: null },
      corpus: { classifications: 1, questions: 2, questionOptions: 3, bankMappings: 4, visibleBanks: 5 },
      imports: { tableExists: false, runningJobId: null, lastJob: null },
      quality: { tableExists: false, openFlags: 0, blockingFlags: 0, excludedQuestions: 0 },
    });

    await expect(repository.getSystemStatus()).resolves.toMatchObject({
      corpus: { classifications: 1, visibleBanks: 5 },
    });
  });
});

describe('PostgreSQL admin system status repository', () => {
  it('loads readiness, migration summary, corpus counts, and gracefully missing future tables', async () => {
    const migrationsDir = await createMigrationsDir(['0001_initial.sql', '0002_next.sql']);
    const client = new SystemStatusQueryClient();
    const repository = createPgAdminSystemStatusRepository(client, { migrationsDir, serviceVersion: '0.1.0-test' });

    await expect(repository.getSystemStatus()).resolves.toEqual({
      api: { ok: true, service: 'bkyexam-practice-api', version: '0.1.0-test' },
      database: { ok: true, migrationCount: 2, currentMigration: '0002_next.sql' },
      corpus: { classifications: 3, questions: 5, questionOptions: 8, bankMappings: 2, visibleBanks: 1 },
      imports: { tableExists: false, runningJobId: null, lastJob: null },
      quality: { tableExists: false, openFlags: 0, blockingFlags: 0, excludedQuestions: 0 },
    });
    expect(client.queries.some((query) => query.sql.includes('WITH RECURSIVE base_banks'))).toBe(true);
  });

  it('includes import job and quality summaries when future tables exist', async () => {
    const migrationsDir = await createMigrationsDir(['0001_initial.sql']);
    const client = new SystemStatusQueryClient({ importJobsTable: true, qualityFlagsTable: true });
    const repository = createPgAdminSystemStatusRepository(client, { migrationsDir });

    await expect(repository.getSystemStatus()).resolves.toMatchObject({
      imports: {
        tableExists: true,
        runningJobId: '60000000-0000-4000-8000-000000000001',
        lastJob: {
          id: '60000000-0000-4000-8000-000000000002',
          status: 'succeeded',
          finishedAt: '2026-07-13T10:00:00.000Z',
        },
      },
      quality: {
        tableExists: true,
        openFlags: 12,
        blockingFlags: 2,
        excludedQuestions: 2,
      },
    });
  });
});

async function createMigrationsDir(fileNames: string[]) {
  const dir = await mkdtemp(join(tmpdir(), 'bkyexam-system-status-migrations-'));
  await Promise.all(fileNames.map((fileName) => writeFile(join(dir, fileName), 'SELECT 1;', 'utf8')));
  return dir;
}
