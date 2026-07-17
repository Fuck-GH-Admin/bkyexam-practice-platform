import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAuditService, createPgAuditLogRepository, type AuditLogRepository } from '../admin/audit.js';
import { hashPassword } from '../auth/password.js';
import { createPgPool, type PgPool, type QueryClient } from '../db/client.js';

export interface LegacyStudentMigrationCandidate {
  id: string;
  loginName: string;
  displayName: string;
  className: string | null;
  groupName: string | null;
  status: 'active' | 'disabled';
  createdAt: string;
}

export interface LegacyStudentMigrationResultItem extends LegacyStudentMigrationCandidate {
  revokedSessions: number;
}

export interface LegacyStudentPasswordMigrationReport {
  ok: boolean;
  mode: 'dry-run' | 'apply';
  generatedAt: string;
  limit: number;
  revokeExistingSessions: boolean;
  candidates: LegacyStudentMigrationCandidate[];
  migrated: LegacyStudentMigrationResultItem[];
  skipped: Array<LegacyStudentMigrationCandidate & { reason: string }>;
  credentialsOut: string | null;
  plaintextPasswordsReturned: false;
}

export interface LegacyStudentPasswordMigrationRepository {
  listLegacyStudents(input: {
    limit: number;
    lockForUpdate: boolean;
  }): Promise<LegacyStudentMigrationCandidate[]>;
  migrateStudent(input: {
    studentId: string;
    passwordHash: string;
    revokeExistingSessions: boolean;
    now: Date;
  }): Promise<{ migrated: boolean; revokedSessions: number }>;
}

export interface RunLegacyStudentPasswordMigrationOptions {
  repository: LegacyStudentPasswordMigrationRepository;
  auditRepository?: AuditLogRepository;
  now?: Date;
  apply?: boolean;
  limit?: number;
  revokeExistingSessions?: boolean;
  temporaryPassword?: string;
  credentialsOut?: string | null;
}

export interface RunLegacyStudentPasswordMigrationCliOptions {
  env: NodeJS.ProcessEnv;
  args?: readonly string[];
  createPool?: (databaseUrl: string) => PgPool;
  now?: Date;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

interface StudentRow {
  id: string;
  login_name: string;
  display_name: string;
  class_name: string | null;
  group_name: string | null;
  status: string;
  created_at: Date | string;
}

interface QueryRows<T> {
  rows: T[];
}

type TransactionClient = QueryClient & { release?: () => void };

const defaultLimit = 200;
const maxLimit = 1000;
const defaultPasswordEnv = 'STUDENT_MIGRATION_TEMP_PASSWORD';

export async function runLegacyStudentPasswordMigration({
  repository,
  auditRepository,
  now = new Date(),
  apply = false,
  limit = defaultLimit,
  revokeExistingSessions = true,
  temporaryPassword,
  credentialsOut = null,
}: RunLegacyStudentPasswordMigrationOptions): Promise<LegacyStudentPasswordMigrationReport> {
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new Error(`limit must be an integer between 1 and ${maxLimit}.`);
  }

  const candidates = await repository.listLegacyStudents({
    limit,
    lockForUpdate: apply,
  });
  const migrated: LegacyStudentMigrationResultItem[] = [];
  const skipped: LegacyStudentPasswordMigrationReport['skipped'] = [];

  if (!apply) {
    return {
      ok: true,
      mode: 'dry-run',
      generatedAt: now.toISOString(),
      limit,
      revokeExistingSessions,
      candidates,
      migrated,
      skipped,
      credentialsOut: null,
      plaintextPasswordsReturned: false,
    };
  }

  if (temporaryPassword && credentialsOut) {
    throw new Error('Use either a shared temporary password or --credentials-out generated passwords, not both.');
  }
  if (!temporaryPassword && !credentialsOut) {
    throw new Error(`${defaultPasswordEnv} or --credentials-out is required when --apply is used.`);
  }
  if (temporaryPassword && temporaryPassword.length < 8) {
    throw new Error('Temporary password must be at least 8 characters.');
  }

  const credentialRows: CredentialRow[] = [];
  for (const student of candidates) {
    const studentTemporaryPassword = temporaryPassword ?? generateTemporaryPassword();
    const passwordHash = await hashPassword(studentTemporaryPassword);
    const result = await repository.migrateStudent({
      studentId: student.id,
      passwordHash,
      revokeExistingSessions,
      now,
    });

    if (!result.migrated) {
      skipped.push({ ...student, reason: 'password_hash changed before migration update' });
      continue;
    }

    migrated.push({ ...student, revokedSessions: result.revokedSessions });
    if (credentialsOut) {
      credentialRows.push({
        loginName: student.loginName,
        displayName: student.displayName,
        className: student.className,
        groupName: student.groupName,
        temporaryPassword: studentTemporaryPassword,
      });
    }
  }

  if (credentialsOut) {
    await writeCredentialCsv(credentialsOut, credentialRows);
  }

  if (auditRepository && (migrated.length > 0 || skipped.length > 0)) {
    await createAuditService(auditRepository).record({
      actorAdminId: null,
      action: 'student_account.legacy_password_migration',
      resourceType: 'student',
      resourceId: 'legacy-passwordless',
      after: {
        migratedLoginNames: migrated.map((student) => student.loginName),
        skippedLoginNames: skipped.map((student) => student.loginName),
      },
      metadata: {
        limit,
        candidateCount: candidates.length,
        migrated: migrated.length,
        skipped: skipped.length,
        revokeExistingSessions,
        revokedSessions: migrated.reduce((sum, student) => sum + student.revokedSessions, 0),
        passwordMode: temporaryPassword ? 'shared_secret_input' : 'generated_credentials_file',
        credentialsOut: credentialsOut ? resolve(credentialsOut) : null,
        plaintextPasswordsReturned: false,
      },
      result: skipped.length > 0 ? 'failure' : 'success',
      createdAt: now,
    }, now);
  }

  return {
    ok: skipped.length === 0,
    mode: 'apply',
    generatedAt: now.toISOString(),
    limit,
    revokeExistingSessions,
    candidates,
    migrated,
    skipped,
    credentialsOut: credentialsOut ? resolve(credentialsOut) : null,
    plaintextPasswordsReturned: false,
  };
}

export function createPgLegacyStudentPasswordMigrationRepository(
  client: QueryClient,
): LegacyStudentPasswordMigrationRepository {
  return {
    async listLegacyStudents({ limit, lockForUpdate }) {
      const result = (await client.query(
        `
          SELECT
            id,
            login_name,
            display_name,
            class_name,
            group_name,
            status,
            created_at
          FROM students
          WHERE password_hash IS NULL
          ORDER BY login_name ASC, id ASC
          LIMIT $1
          ${lockForUpdate ? 'FOR UPDATE SKIP LOCKED' : ''}
        `,
        [limit],
      )) as QueryRows<StudentRow>;

      return result.rows.map(mapStudentRow);
    },

    async migrateStudent({ studentId, passwordHash, revokeExistingSessions, now }) {
      const updateResult = (await client.query(
        `
          UPDATE students
          SET password_hash = $2,
              password_reset_required = true,
              password_changed_at = NULL,
              failed_login_count = 0,
              failed_login_window_started_at = NULL,
              locked_until = NULL,
              updated_at = $3
          WHERE id = $1
            AND password_hash IS NULL
          RETURNING id
        `,
        [studentId, passwordHash, now],
      )) as QueryRows<{ id: string }>;

      if (!updateResult.rows[0]) {
        return { migrated: false, revokedSessions: 0 };
      }

      const revokedSessions = revokeExistingSessions
        ? await revokeStudentSessions(client, studentId, now)
        : 0;

      return { migrated: true, revokedSessions };
    },
  };
}

export async function runLegacyStudentPasswordMigrationCli({
  env,
  args = [],
  createPool = createPgPool,
  now = new Date(),
  log = console.log,
  error = console.error,
}: RunLegacyStudentPasswordMigrationCliOptions): Promise<number> {
  let options: ReturnType<typeof parseArgs>;
  try {
    options = parseArgs(args, env);
  } catch (caught) {
    error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  }
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    error('DATABASE_URL is required to run legacy student password migration.');
    return 1;
  }

  const pool = createPool(databaseUrl);
  let client: (QueryClient & { release(): void }) | undefined;
  let transactionStarted = false;

  try {
    client = await pool.connect();
    if (options.apply) {
      await client.query('BEGIN');
      transactionStarted = true;
    }

    const report = await runLegacyStudentPasswordMigration({
      repository: createPgLegacyStudentPasswordMigrationRepository(client),
      auditRepository: options.apply ? createPgAuditLogRepository(client) : undefined,
      now,
      apply: options.apply,
      limit: options.limit,
      revokeExistingSessions: options.revokeExistingSessions,
      temporaryPassword: options.temporaryPassword,
      credentialsOut: options.credentialsOut,
    });

    if (options.apply) {
      await client.query('COMMIT');
      transactionStarted = false;
    }

    log(JSON.stringify(report, null, 2));
    return report.ok ? 0 : 2;
  } catch (caught) {
    if (transactionStarted && client) {
      await client.query('ROLLBACK');
    }
    error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  } finally {
    client?.release();
    await pool.end();
  }
}

function parseArgs(args: readonly string[], env: NodeJS.ProcessEnv) {
  let apply = false;
  let limit = defaultLimit;
  let revokeExistingSessions = true;
  let credentialsOut: string | null = null;
  let passwordEnv = defaultPasswordEnv;
  let temporaryPasswordFromArg: string | undefined;

  for (const arg of args) {
    if (arg === '--apply') {
      apply = true;
    } else if (arg.startsWith('--limit=')) {
      limit = parseLimit(arg.slice('--limit='.length));
    } else if (arg === '--no-revoke-sessions') {
      revokeExistingSessions = false;
    } else if (arg.startsWith('--credentials-out=')) {
      credentialsOut = requireNonEmptyArg(arg, '--credentials-out=');
    } else if (arg.startsWith('--password-env=')) {
      passwordEnv = requireNonEmptyArg(arg, '--password-env=');
    } else if (arg.startsWith('--temporary-password=')) {
      temporaryPasswordFromArg = requireNonEmptyArg(arg, '--temporary-password=');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    apply,
    limit,
    revokeExistingSessions,
    credentialsOut,
    temporaryPassword: temporaryPasswordFromArg ?? env[passwordEnv],
  };
}

function parseLimit(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxLimit) {
    throw new Error(`--limit must be an integer between 1 and ${maxLimit}.`);
  }
  return parsed;
}

function requireNonEmptyArg(arg: string, prefix: string) {
  const value = arg.slice(prefix.length).trim();
  if (!value) {
    throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  }
  return value;
}

async function revokeStudentSessions(client: QueryClient, studentId: string, now: Date) {
  const result = (await client.query(
    `
      UPDATE student_sessions
      SET revoked_at = $2
      WHERE student_id = $1
        AND revoked_at IS NULL
        AND expires_at > $2
      RETURNING id
    `,
    [studentId, now],
  )) as QueryRows<{ id: string }>;

  return result.rows.length;
}

function mapStudentRow(row: StudentRow): LegacyStudentMigrationCandidate {
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    className: row.class_name,
    groupName: row.group_name,
    status: row.status === 'disabled' ? 'disabled' : 'active',
    createdAt: toIsoTimestamp(row.created_at),
  };
}

function generateTemporaryPassword() {
  return `Bky-${randomBytes(9).toString('base64url')}`;
}

interface CredentialRow {
  loginName: string;
  displayName: string;
  className: string | null;
  groupName: string | null;
  temporaryPassword: string;
}

async function writeCredentialCsv(filePath: string, credentialRows: readonly CredentialRow[]) {
  const resolvedPath = resolve(filePath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  const header = 'loginName,displayName,className,groupName,temporaryPassword\n';
  const body = credentialRows.map((row) => [
    row.loginName,
    row.displayName,
    row.className ?? '',
    row.groupName ?? '',
    row.temporaryPassword,
  ].map(csvCell).join(',')).join('\n');
  await writeFile(resolvedPath, `${header}${body}${body ? '\n' : ''}`, 'utf8');
}

function csvCell(value: string) {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function toIsoTimestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function main(): Promise<void> {
  process.exitCode = await runLegacyStudentPasswordMigrationCli({
    env: process.env,
    args: process.argv.slice(2),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((caught: unknown) => {
    console.error(caught instanceof Error ? caught.message : String(caught));
    process.exitCode = 1;
  });
}
