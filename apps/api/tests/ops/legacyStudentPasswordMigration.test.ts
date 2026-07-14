import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryAuditLogRepository } from '../../src/admin/audit';
import { verifyPassword } from '../../src/auth/password';
import type { PgPool, QueryClient } from '../../src/db/client';
import {
  createPgLegacyStudentPasswordMigrationRepository,
  runLegacyStudentPasswordMigration,
  runLegacyStudentPasswordMigrationCli,
  type LegacyStudentMigrationCandidate,
  type LegacyStudentPasswordMigrationRepository,
} from '../../src/ops/legacyStudentPasswordMigration';

interface RecordedQuery {
  sql: string;
  params?: readonly unknown[];
}

const candidate: LegacyStudentMigrationCandidate = {
  id: '00000000-0000-4000-8000-000000000001',
  loginName: '202502040201',
  displayName: 'Student 201',
  className: '2班',
  groupName: null,
  status: 'active',
  createdAt: '2026-07-13T00:00:00.000Z',
};

function createMemoryMigrationRepository(
  candidates: readonly LegacyStudentMigrationCandidate[] = [candidate],
) {
  const migrated: Array<{
    studentId: string;
    passwordHash: string;
    revokeExistingSessions: boolean;
    now: Date;
  }> = [];
  const listCalls: Array<{ limit: number; lockForUpdate: boolean }> = [];
  const repository: LegacyStudentPasswordMigrationRepository = {
    async listLegacyStudents(input) {
      listCalls.push(input);
      return candidates.slice(0, input.limit);
    },
    async migrateStudent(input) {
      migrated.push(input);
      return { migrated: true, revokedSessions: input.revokeExistingSessions ? 2 : 0 };
    },
  };

  return { repository, migrated, listCalls };
}

describe('legacy student password migration operation', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('defaults to dry-run and never requires or writes temporary passwords', async () => {
    const { repository, migrated, listCalls } = createMemoryMigrationRepository();

    const report = await runLegacyStudentPasswordMigration({
      repository,
      now: new Date('2026-07-15T10:00:00.000Z'),
    });

    expect(report).toMatchObject({
      ok: true,
      mode: 'dry-run',
      limit: 200,
      candidates: [candidate],
      migrated: [],
      skipped: [],
      credentialsOut: null,
      plaintextPasswordsReturned: false,
    });
    expect(listCalls).toEqual([{ limit: 200, lockForUpdate: false }]);
    expect(migrated).toEqual([]);
  });

  it('applies a shared temporary password, forces reset, revokes sessions, and audits without plaintext', async () => {
    const { repository, migrated, listCalls } = createMemoryMigrationRepository();
    const auditRepository = createMemoryAuditLogRepository();

    const report = await runLegacyStudentPasswordMigration({
      repository,
      auditRepository,
      apply: true,
      temporaryPassword: 'temporary123',
      now: new Date('2026-07-15T10:00:00.000Z'),
    });

    expect(report).toMatchObject({
      ok: true,
      mode: 'apply',
      migrated: [{ loginName: '202502040201', revokedSessions: 2 }],
      plaintextPasswordsReturned: false,
    });
    expect(JSON.stringify(report)).not.toContain('temporary123');
    expect(listCalls).toEqual([{ limit: 200, lockForUpdate: true }]);
    expect(migrated).toHaveLength(1);
    expect(await verifyPassword('temporary123', migrated[0]?.passwordHash ?? '')).toBe(true);
    expect(auditRepository.entries).toMatchObject([{
      action: 'student_account.legacy_password_migration',
      resourceType: 'student',
      resourceId: 'legacy-passwordless',
      result: 'success',
      metadata: {
        migrated: 1,
        skipped: 0,
        revokedSessions: 2,
        passwordMode: 'shared_secret_input',
        plaintextPasswordsReturned: false,
      },
    }]);
    expect(JSON.stringify(auditRepository.entries)).not.toContain('temporary123');
  });

  it('can generate per-student credentials into an explicit ignored output file', async () => {
    const { repository, migrated } = createMemoryMigrationRepository();
    const dir = await mkdtemp(join(tmpdir(), 'bky-legacy-migration-'));
    tempDirs.push(dir);
    const credentialsOut = join(dir, 'credentials.csv');

    const report = await runLegacyStudentPasswordMigration({
      repository,
      apply: true,
      credentialsOut,
      now: new Date('2026-07-15T10:00:00.000Z'),
    });
    const csv = await readFile(credentialsOut, 'utf8');

    expect(report.credentialsOut).toBe(credentialsOut);
    expect(report.plaintextPasswordsReturned).toBe(false);
    expect(csv).toContain('loginName,displayName,className,groupName,temporaryPassword');
    expect(csv).toContain('202502040201');
    const generatedPassword = csv.trim().split('\n')[1]?.split(',')[4] ?? '';
    expect(generatedPassword.length).toBeGreaterThanOrEqual(8);
    expect(JSON.stringify(report)).not.toContain(generatedPassword);
    expect(await verifyPassword(generatedPassword, migrated[0]?.passwordHash ?? '')).toBe(true);
  });

  it('rejects apply mode without a shared password or credentials output', async () => {
    const { repository } = createMemoryMigrationRepository();

    await expect(runLegacyStudentPasswordMigration({
      repository,
      apply: true,
    })).rejects.toThrow('STUDENT_MIGRATION_TEMP_PASSWORD or --credentials-out is required');
  });
});

describe('PostgreSQL legacy student password migration repository and CLI', () => {
  it('selects only passwordless students and writes reset-required state', async () => {
    const queries: RecordedQuery[] = [];
    const client: QueryClient = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (String(sql).includes('FROM students')) {
          return {
            rows: [{
              id: candidate.id,
              login_name: candidate.loginName,
              display_name: candidate.displayName,
              class_name: candidate.className,
              group_name: candidate.groupName,
              status: candidate.status,
              created_at: new Date(candidate.createdAt),
            }],
          };
        }
        if (String(sql).includes('UPDATE students')) {
          return { rows: [{ id: candidate.id }] };
        }
        if (String(sql).includes('UPDATE student_sessions')) {
          return { rows: [{ id: 'session-1' }] };
        }
        return { rows: [] };
      },
    };
    const repository = createPgLegacyStudentPasswordMigrationRepository(client);

    await expect(repository.listLegacyStudents({ limit: 10, lockForUpdate: true }))
      .resolves.toEqual([candidate]);
    await expect(repository.migrateStudent({
      studentId: candidate.id,
      passwordHash: 'hash',
      revokeExistingSessions: true,
      now: new Date('2026-07-15T10:00:00.000Z'),
    })).resolves.toEqual({ migrated: true, revokedSessions: 1 });

    expect(queries[0].sql).toContain('WHERE password_hash IS NULL');
    expect(queries[0].sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(queries[1].sql).toContain('password_reset_required = true');
    expect(queries[1].sql).toContain('failed_login_count = 0');
    expect(queries[1].sql).toContain('AND password_hash IS NULL');
    expect(queries[2].sql).toContain('UPDATE student_sessions');
  });

  it('runs CLI apply inside a transaction and does not print plaintext', async () => {
    const queries: RecordedQuery[] = [];
    const logs: string[] = [];
    const client = {
      async query(sql: string, params?: readonly unknown[]) {
        queries.push({ sql, params });
        if (sql.includes('FROM students')) {
          return {
            rows: [{
              id: candidate.id,
              login_name: candidate.loginName,
              display_name: candidate.displayName,
              class_name: candidate.className,
              group_name: candidate.groupName,
              status: candidate.status,
              created_at: new Date(candidate.createdAt),
            }],
          };
        }
        if (sql.includes('UPDATE students')) return { rows: [{ id: candidate.id }] };
        if (sql.includes('UPDATE student_sessions')) return { rows: [] };
        return { rows: [] };
      },
      release() {},
    };
    const pool: PgPool = {
      async connect() {
        return client;
      },
      async end() {},
    };

    await expect(runLegacyStudentPasswordMigrationCli({
      env: { DATABASE_URL: 'postgres://prod', STUDENT_MIGRATION_TEMP_PASSWORD: 'temporary123' },
      args: ['--apply', '--limit=1'],
      createPool: () => pool,
      now: new Date('2026-07-15T10:00:00.000Z'),
      log: (message) => logs.push(message),
      error: (message) => logs.push(message),
    })).resolves.toBe(0);

    expect(queries.map((query) => query.sql.trim()).join('\n')).toContain('BEGIN');
    expect(queries.map((query) => query.sql.trim()).join('\n')).toContain('COMMIT');
    expect(JSON.stringify(logs)).not.toContain('temporary123');
  });
});
