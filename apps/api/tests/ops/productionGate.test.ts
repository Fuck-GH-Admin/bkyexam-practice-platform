import { describe, expect, it, vi } from 'vitest';
import {
  buildProductionGateReport,
  createPgStudentIdentityMigrationRepository,
  evaluateProductionEnvironment,
  evaluateStudentIdentityMigration,
  runProductionGateCli,
  type StudentIdentityMigrationSummary,
} from '../../src/ops/productionGate';
import type { PgPool, QueryClient } from '../../src/db/client';

const productionEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://prod',
  USE_DATABASE: 'true',
  COOKIE_SECRET: 'long-random-cookie-secret-for-production',
  COOKIE_SECURE: 'true',
  STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED: 'false',
  RATE_LIMIT_ENABLED: 'true',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX: '300',
  CSRF_ORIGIN_CHECK_ENABLED: 'true',
  CSRF_ALLOWED_ORIGINS: 'https://student.example.com;https://admin.example.com',
  ADMIN_IMPORT_ENABLE_WRITE: 'false',
};

class FakeQueryClient implements QueryClient {
  readonly queries: Array<{ sql: string; params?: readonly unknown[] }> = [];

  async query(sql: string, params?: readonly unknown[]) {
    this.queries.push({ sql, params });
    if (sql.includes('COUNT(*) AS total_students')) {
      return {
        rows: [{
          total_students: '4',
          active_students: '3',
          disabled_students: '1',
          password_protected_students: '2',
          legacy_passwordless_students: '2',
          password_reset_required_students: '1',
          locked_students: '1',
        }],
      };
    }

    if (sql.includes('password_hash IS NULL')) {
      return { rows: [sampleRow({ login_name: 'legacy-student', password_reset_required: true })] };
    }
    if (sql.includes('password_reset_required = true')) {
      return { rows: [sampleRow({ login_name: 'reset-student', password_reset_required: true })] };
    }
    if (sql.includes('locked_until IS NOT NULL')) {
      return { rows: [sampleRow({ login_name: 'locked-student', locked_until: new Date('2026-07-15T11:00:00.000Z') })] };
    }

    return { rows: [] };
  }
}

function sampleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '60000000-0000-4000-8000-000000000001',
    login_name: 'student-1',
    display_name: 'Student One',
    status: 'active',
    class_name: null,
    group_name: null,
    password_reset_required: false,
    locked_until: null,
    created_at: new Date('2026-07-15T10:00:00.000Z'),
    updated_at: new Date('2026-07-15T10:05:00.000Z'),
    ...overrides,
  };
}

function migrationSummary(overrides: Partial<StudentIdentityMigrationSummary> = {}): StudentIdentityMigrationSummary {
  return {
    generatedAt: '2026-07-15T10:00:00.000Z',
    totalStudents: 10,
    activeStudents: 9,
    disabledStudents: 1,
    passwordProtectedStudents: 10,
    legacyPasswordlessStudents: 0,
    passwordResetRequiredStudents: 0,
    lockedStudents: 0,
    samples: {
      legacyPasswordless: [],
      passwordResetRequired: [],
      locked: [],
    },
    ...overrides,
  };
}

describe('evaluateProductionEnvironment', () => {
  it('passes production-critical environment checks', () => {
    const checks = evaluateProductionEnvironment(productionEnv);

    expect(checks).toHaveLength(11);
    expect(checks.every((check) => check.status === 'pass')).toBe(true);
  });

  it('fails closed for unsafe production settings and warns for leftover bootstrap/import env', () => {
    const checks = evaluateProductionEnvironment({
      NODE_ENV: 'development',
      DATABASE_URL: '',
      USE_DATABASE: 'false',
      COOKIE_SECRET: 'dev-cookie-secret-change-me',
      COOKIE_SECURE: 'false',
      STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED: 'true',
      RATE_LIMIT_ENABLED: 'false',
      CSRF_ORIGIN_CHECK_ENABLED: 'true',
      CSRF_ALLOWED_ORIGINS: 'http://localhost:5173',
      ADMIN_BOOTSTRAP_PASSWORD: 'secret123',
      ADMIN_IMPORT_ENABLE_WRITE: 'true',
      STUDENT_MIGRATION_TEMP_PASSWORD: 'temporary123',
    });

    expect(checks.filter((check) => check.status === 'fail').map((check) => check.id)).toEqual([
      'database_url_present',
      'use_database_enabled',
      'cookie_secret_strong',
      'cookie_secure_enabled',
      'legacy_passwordless_disabled',
      'rate_limit_enabled',
      'csrf_origin_check_enabled',
    ]);
    expect(checks.filter((check) => check.status === 'warn').map((check) => check.id)).toEqual([
      'node_env_production',
      'admin_bootstrap_env_cleared',
      'admin_import_write_explicit',
      'student_migration_temp_password_cleared',
    ]);
  });
});

describe('student identity migration summary', () => {
  it('summarizes PostgreSQL student password migration state and samples', async () => {
    const client = new FakeQueryClient();
    const repository = createPgStudentIdentityMigrationRepository(client);
    const now = new Date('2026-07-15T10:30:00.000Z');

    const summary = await repository.summarize(now, 5);

    expect(summary).toMatchObject({
      generatedAt: '2026-07-15T10:30:00.000Z',
      totalStudents: 4,
      activeStudents: 3,
      disabledStudents: 1,
      passwordProtectedStudents: 2,
      legacyPasswordlessStudents: 2,
      passwordResetRequiredStudents: 1,
      lockedStudents: 1,
    });
    expect(summary.samples.legacyPasswordless[0]).toMatchObject({
      loginName: 'legacy-student',
      passwordResetRequired: true,
      createdAt: '2026-07-15T10:00:00.000Z',
    });
    expect(summary.samples.locked[0]?.lockedUntil).toBe('2026-07-15T11:00:00.000Z');
    expect(client.queries[0].params).toEqual([now]);
    expect(client.queries.at(-1)?.params).toEqual([now, 5]);
  });

  it('marks legacy passwordless students as a production-blocking migration failure', () => {
    const checks = evaluateStudentIdentityMigration(migrationSummary({
      legacyPasswordlessStudents: 2,
      passwordResetRequiredStudents: 1,
      lockedStudents: 1,
    }));

    expect(checks.find((check) => check.id === 'legacy_passwordless_accounts_migrated')).toMatchObject({
      status: 'fail',
      message: '2 students still have NULL password_hash.',
    });
    expect(checks.find((check) => check.id === 'password_reset_queue_reviewed')?.status).toBe('warn');
    expect(checks.find((check) => check.id === 'locked_students_reviewed')?.status).toBe('warn');
  });
});

describe('buildProductionGateReport', () => {
  it('combines env and migration checks into an ok report', async () => {
    const report = await buildProductionGateReport({
      env: productionEnv,
      repository: { summarize: vi.fn(async () => migrationSummary()) },
      now: new Date('2026-07-15T10:00:00.000Z'),
    });

    expect(report.ok).toBe(true);
    expect(report.generatedAt).toBe('2026-07-15T10:00:00.000Z');
    expect(report.studentIdentityMigration?.legacyPasswordlessStudents).toBe(0);
  });
});

describe('runProductionGateCli', () => {
  it('requires DATABASE_URL unless --skip-db is used', async () => {
    const error = vi.fn();

    const exitCode = await runProductionGateCli({
      env: {},
      createPool: vi.fn(),
      log: vi.fn(),
      error,
    });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith('DATABASE_URL is required unless --skip-db is used.');
  });

  it('prints JSON without opening a database when --skip-db is used', async () => {
    const log = vi.fn();
    const createPool = vi.fn();

    const exitCode = await runProductionGateCli({
      env: productionEnv,
      args: ['--skip-db'],
      createPool,
      log,
      error: vi.fn(),
      now: new Date('2026-07-15T10:00:00.000Z'),
    });

    expect(exitCode).toBe(0);
    expect(createPool).not.toHaveBeenCalled();
    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({ ok: true, environment: 'production' });
  });

  it('closes the pool and exits with 2 when production gate checks fail', async () => {
    const client = new FakeQueryClient();
    const release = vi.fn();
    const pool: PgPool = {
      connect: vi.fn(async () => Object.assign(client, { release })),
      end: vi.fn(async () => undefined),
    };
    const log = vi.fn();

    const exitCode = await runProductionGateCli({
      env: productionEnv,
      args: ['--sample-limit=5'],
      createPool: () => pool,
      log,
      error: vi.fn(),
      now: new Date('2026-07-15T10:30:00.000Z'),
    });

    expect(exitCode).toBe(2);
    expect(release).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
      ok: false,
      studentIdentityMigration: { legacyPasswordlessStudents: 2 },
    });
  });
});
