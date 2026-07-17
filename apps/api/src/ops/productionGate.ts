import { pathToFileURL } from 'node:url';
import { createPgPool, type PgPool, type QueryClient } from '../db/client.js';

export type ProductionGateStatus = 'pass' | 'warn' | 'fail';

export interface ProductionGateCheck {
  id: string;
  label: string;
  status: ProductionGateStatus;
  message: string;
  recommendation?: string;
}

export interface StudentIdentityMigrationSample {
  id: string;
  loginName: string;
  displayName: string;
  status: 'active' | 'disabled';
  className: string | null;
  groupName: string | null;
  passwordResetRequired: boolean;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface StudentIdentityMigrationSummary {
  generatedAt: string;
  totalStudents: number;
  activeStudents: number;
  disabledStudents: number;
  passwordProtectedStudents: number;
  legacyPasswordlessStudents: number;
  passwordResetRequiredStudents: number;
  lockedStudents: number;
  samples: {
    legacyPasswordless: StudentIdentityMigrationSample[];
    passwordResetRequired: StudentIdentityMigrationSample[];
    locked: StudentIdentityMigrationSample[];
  };
}

export interface StudentIdentityMigrationRepository {
  summarize(now: Date, sampleLimit: number): Promise<StudentIdentityMigrationSummary>;
}

export interface ProductionGateReport {
  ok: boolean;
  generatedAt: string;
  environment: string;
  checks: ProductionGateCheck[];
  studentIdentityMigration?: StudentIdentityMigrationSummary;
}

export interface RunProductionGateCliOptions {
  env: NodeJS.ProcessEnv;
  args?: readonly string[];
  createPool?: (databaseUrl: string) => PgPool;
  now?: Date;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

interface SummaryRow {
  total_students: string | number;
  active_students: string | number;
  disabled_students: string | number;
  password_protected_students: string | number;
  legacy_passwordless_students: string | number;
  password_reset_required_students: string | number;
  locked_students: string | number;
}

interface StudentSampleRow {
  id: string;
  login_name: string;
  display_name: string;
  status: string;
  class_name: string | null;
  group_name: string | null;
  password_reset_required: boolean;
  locked_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string | null;
}

export function evaluateProductionEnvironment(env: NodeJS.ProcessEnv): ProductionGateCheck[] {
  const checks: ProductionGateCheck[] = [];
  const allowedOrigins = parseOriginList(env.CSRF_ALLOWED_ORIGINS);

  checks.push(check(
    'node_env_production',
    'NODE_ENV is production',
    env.NODE_ENV === 'production' ? 'pass' : 'warn',
    env.NODE_ENV === 'production'
      ? 'NODE_ENV=production.'
      : `NODE_ENV is ${env.NODE_ENV || '<unset>'}; production launch should set NODE_ENV=production.`,
    'Set NODE_ENV=production on the production service.',
  ));

  checks.push(check(
    'database_url_present',
    'DATABASE_URL is configured',
    hasText(env.DATABASE_URL) ? 'pass' : 'fail',
    hasText(env.DATABASE_URL) ? 'DATABASE_URL is present.' : 'DATABASE_URL is missing.',
    'Set DATABASE_URL to the migrated production PostgreSQL database.',
  ));

  checks.push(check(
    'use_database_enabled',
    'USE_DATABASE=true',
    env.USE_DATABASE === 'true' ? 'pass' : 'fail',
    env.USE_DATABASE === 'true'
      ? 'USE_DATABASE=true.'
      : `USE_DATABASE is ${env.USE_DATABASE || '<unset>'}; production must not run in memory mode.`,
    'Set USE_DATABASE=true.',
  ));

  const cookieSecret = env.COOKIE_SECRET ?? '';
  const cookieSecretOk = cookieSecret.length >= 24 && cookieSecret !== 'dev-cookie-secret-change-me';
  checks.push(check(
    'cookie_secret_strong',
    'COOKIE_SECRET is production-grade',
    cookieSecretOk ? 'pass' : 'fail',
    cookieSecretOk
      ? 'COOKIE_SECRET is present and not the development default.'
      : 'COOKIE_SECRET is missing, too short, or still uses the development default.',
    'Use a long random COOKIE_SECRET and keep it outside source control.',
  ));

  checks.push(check(
    'cookie_secure_enabled',
    'COOKIE_SECURE=true',
    env.COOKIE_SECURE === 'true' ? 'pass' : 'fail',
    env.COOKIE_SECURE === 'true'
      ? 'COOKIE_SECURE=true.'
      : `COOKIE_SECURE is ${env.COOKIE_SECURE || '<unset>'}; production cookies must be HTTPS-only.`,
    'Set COOKIE_SECURE=true behind HTTPS.',
  ));

  checks.push(check(
    'legacy_passwordless_disabled',
    'Legacy passwordless login disabled',
    env.STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED === 'true' ? 'fail' : 'pass',
    env.STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED === 'true'
      ? 'STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED=true would allow old no-password login.'
      : 'Legacy passwordless login is disabled by default.',
    'Keep STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED=false for public production.',
  ));

  checks.push(check(
    'rate_limit_enabled',
    'Rate limit enabled',
    env.RATE_LIMIT_ENABLED === 'true' ? 'pass' : 'fail',
    env.RATE_LIMIT_ENABLED === 'true'
      ? `RATE_LIMIT_ENABLED=true; window=${env.RATE_LIMIT_WINDOW_MS || 'default'}, max=${env.RATE_LIMIT_MAX || 'default'}.`
      : 'RATE_LIMIT_ENABLED is not true.',
    'Set RATE_LIMIT_ENABLED=true and tune RATE_LIMIT_WINDOW_MS/RATE_LIMIT_MAX.',
  ));

  const csrfOk = env.CSRF_ORIGIN_CHECK_ENABLED === 'true'
    && allowedOrigins.length > 0
    && allowedOrigins.every((origin) => origin.startsWith('https://') && !origin.includes('localhost'));
  checks.push(check(
    'csrf_origin_check_enabled',
    'CSRF origin check enabled with production origins',
    csrfOk ? 'pass' : 'fail',
    csrfOk
      ? `CSRF origin check is enabled for ${allowedOrigins.join(', ')}.`
      : 'CSRF origin check is disabled, empty, or still allows non-production origins.',
    'Set CSRF_ORIGIN_CHECK_ENABLED=true and CSRF_ALLOWED_ORIGINS to semicolon-separated HTTPS production origins.',
  ));

  checks.push(check(
    'admin_bootstrap_env_cleared',
    'Admin bootstrap secrets cleared from runtime env',
    hasAnyBootstrapEnv(env) ? 'warn' : 'pass',
    hasAnyBootstrapEnv(env)
      ? 'One or more ADMIN_BOOTSTRAP_* variables are still present in the runtime environment.'
      : 'ADMIN_BOOTSTRAP_* variables are absent from runtime env.',
    'Run npm run admin:bootstrap as a one-time operation, then remove ADMIN_BOOTSTRAP_* from the service environment.',
  ));

  checks.push(check(
    'admin_import_write_explicit',
    'Admin true import write mode is explicit',
    env.ADMIN_IMPORT_ENABLE_WRITE === 'true' ? 'warn' : 'pass',
    env.ADMIN_IMPORT_ENABLE_WRITE === 'true'
      ? 'ADMIN_IMPORT_ENABLE_WRITE=true; true import writes are enabled.'
      : 'ADMIN_IMPORT_ENABLE_WRITE is not enabled by default.',
    'Keep ADMIN_IMPORT_ENABLE_WRITE=false except during controlled import windows.',
  ));

  checks.push(check(
    'admin_import_reset_disabled',
    'Destructive Admin import reset is disabled',
    env.ADMIN_IMPORT_ENABLE_RESET === 'true' ? 'fail' : 'pass',
    env.ADMIN_IMPORT_ENABLE_RESET === 'true'
      ? 'ADMIN_IMPORT_ENABLE_RESET=true; destructive corpus reset is enabled.'
      : 'ADMIN_IMPORT_ENABLE_RESET is disabled by default.',
    'Keep ADMIN_IMPORT_ENABLE_RESET=false outside an explicitly approved restore-capable maintenance window.',
  ));

  checks.push(check(
    'student_migration_temp_password_cleared',
    'Legacy migration temporary password cleared from runtime env',
    hasText(env.STUDENT_MIGRATION_TEMP_PASSWORD) ? 'warn' : 'pass',
    hasText(env.STUDENT_MIGRATION_TEMP_PASSWORD)
      ? 'STUDENT_MIGRATION_TEMP_PASSWORD is still present in the runtime environment.'
      : 'STUDENT_MIGRATION_TEMP_PASSWORD is absent from runtime env.',
    'Use STUDENT_MIGRATION_TEMP_PASSWORD only for the controlled migration CLI invocation, then remove it from service runtime env.',
  ));

  return checks;
}

export function evaluateStudentIdentityMigration(summary: StudentIdentityMigrationSummary): ProductionGateCheck[] {
  return [
    check(
      'student_accounts_exist',
      'Student accounts exist',
      summary.totalStudents > 0 ? 'pass' : 'warn',
      summary.totalStudents > 0
        ? `${summary.totalStudents} student accounts found.`
        : 'No student accounts found; this may be valid before initial operation but should be intentional.',
      'Create or import managed student accounts before launch.',
    ),
    check(
      'legacy_passwordless_accounts_migrated',
      'Legacy passwordless accounts migrated',
      summary.legacyPasswordlessStudents === 0 ? 'pass' : 'fail',
      summary.legacyPasswordlessStudents === 0
        ? 'No students with NULL password_hash remain.'
        : `${summary.legacyPasswordlessStudents} students still have NULL password_hash.`,
      'Assign temporary passwords through Admin Student reset/bulk migration and keep passwordResetRequired=true.',
    ),
    check(
      'password_reset_queue_reviewed',
      'Password reset queue reviewed',
      summary.passwordResetRequiredStudents === 0 ? 'pass' : 'warn',
      summary.passwordResetRequiredStudents === 0
        ? 'No student currently requires password reset.'
        : `${summary.passwordResetRequiredStudents} students currently require password reset/change.`,
      'Confirm operators know these students must change password after login.',
    ),
    check(
      'locked_students_reviewed',
      'Locked students reviewed',
      summary.lockedStudents === 0 ? 'pass' : 'warn',
      summary.lockedStudents === 0
        ? 'No students are temporarily locked.'
        : `${summary.lockedStudents} students are currently temporarily locked.`,
      'Review locked accounts before launch or wait for lock expiry.',
    ),
  ];
}

export async function buildProductionGateReport({
  env,
  repository,
  now = new Date(),
  sampleLimit = 20,
}: {
  env: NodeJS.ProcessEnv;
  repository?: StudentIdentityMigrationRepository;
  now?: Date;
  sampleLimit?: number;
}): Promise<ProductionGateReport> {
  const checks = [...evaluateProductionEnvironment(env)];
  const studentIdentityMigration = repository
    ? await repository.summarize(now, sampleLimit)
    : undefined;

  if (studentIdentityMigration) {
    checks.push(...evaluateStudentIdentityMigration(studentIdentityMigration));
  }

  return {
    ok: checks.every((entry) => entry.status !== 'fail'),
    generatedAt: now.toISOString(),
    environment: env.NODE_ENV || 'unknown',
    checks,
    ...(studentIdentityMigration ? { studentIdentityMigration } : {}),
  };
}

export function createPgStudentIdentityMigrationRepository(client: QueryClient): StudentIdentityMigrationRepository {
  return {
    async summarize(now, sampleLimit) {
      const summaryResult = await client.query(
        `
          SELECT
            COUNT(*) AS total_students,
            COUNT(*) FILTER (WHERE status = 'active') AS active_students,
            COUNT(*) FILTER (WHERE status = 'disabled') AS disabled_students,
            COUNT(*) FILTER (WHERE password_hash IS NOT NULL) AS password_protected_students,
            COUNT(*) FILTER (WHERE password_hash IS NULL) AS legacy_passwordless_students,
            COUNT(*) FILTER (WHERE password_reset_required = true) AS password_reset_required_students,
            COUNT(*) FILTER (WHERE locked_until IS NOT NULL AND locked_until > $1) AS locked_students
          FROM students
        `,
        [now],
      );
      const row = firstRow<SummaryRow>(summaryResult);

      // A connected pg Client executes one query at a time. Keep these reads
      // sequential so the production CLI remains compatible with pg 9.
      const legacyPasswordless = await selectStudentSamples(
        client,
        'password_hash IS NULL',
        [],
        sampleLimit,
      );
      const passwordResetRequired = await selectStudentSamples(
        client,
        'password_reset_required = true',
        [],
        sampleLimit,
      );
      const locked = await selectStudentSamples(
        client,
        'locked_until IS NOT NULL AND locked_until > $1',
        [now],
        sampleLimit,
      );

      return {
        generatedAt: now.toISOString(),
        totalStudents: toNumber(row.total_students),
        activeStudents: toNumber(row.active_students),
        disabledStudents: toNumber(row.disabled_students),
        passwordProtectedStudents: toNumber(row.password_protected_students),
        legacyPasswordlessStudents: toNumber(row.legacy_passwordless_students),
        passwordResetRequiredStudents: toNumber(row.password_reset_required_students),
        lockedStudents: toNumber(row.locked_students),
        samples: {
          legacyPasswordless,
          passwordResetRequired,
          locked,
        },
      };
    },
  };
}

export async function runProductionGateCli({
  env,
  args = [],
  createPool = createPgPool,
  now = new Date(),
  log = console.log,
  error = console.error,
}: RunProductionGateCliOptions): Promise<number> {
  const options = parseArgs(args);
  const databaseUrl = env.DATABASE_URL;

  if (!options.skipDb && !databaseUrl) {
    error('DATABASE_URL is required unless --skip-db is used.');
    return 1;
  }

  let pool: PgPool | undefined;
  try {
    let repository: StudentIdentityMigrationRepository | undefined;
    let clientWithRelease: (QueryClient & { release(): void }) | undefined;

    if (!options.skipDb && databaseUrl) {
      pool = createPool(databaseUrl);
      clientWithRelease = await pool.connect();
      repository = createPgStudentIdentityMigrationRepository(clientWithRelease);
    }

    try {
      const report = await buildProductionGateReport({
        env,
        repository,
        now,
        sampleLimit: options.sampleLimit,
      });
      log(JSON.stringify(report, null, 2));
      return report.ok ? 0 : 2;
    } finally {
      clientWithRelease?.release();
    }
  } catch (caught) {
    error(caught instanceof Error ? caught.message : String(caught));
    return 1;
  } finally {
    await pool?.end();
  }
}

async function selectStudentSamples(
  client: QueryClient,
  whereSql: string,
  params: readonly unknown[],
  limit: number,
): Promise<StudentIdentityMigrationSample[]> {
  const result = await client.query(
    `
      SELECT
        id,
        login_name,
        display_name,
        status,
        class_name,
        group_name,
        password_reset_required,
        locked_until,
        created_at,
        updated_at
      FROM students
      WHERE ${whereSql}
      ORDER BY created_at ASC, id ASC
      LIMIT $${params.length + 1}
    `,
    [...params, limit],
  );

  return rows<StudentSampleRow>(result).map(mapStudentSampleRow);
}

function mapStudentSampleRow(row: StudentSampleRow): StudentIdentityMigrationSample {
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    status: row.status === 'disabled' ? 'disabled' : 'active',
    className: row.class_name,
    groupName: row.group_name,
    passwordResetRequired: row.password_reset_required,
    lockedUntil: row.locked_until ? toIsoTimestamp(row.locked_until) : null,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: row.updated_at ? toIsoTimestamp(row.updated_at) : null,
  };
}

function check(
  id: string,
  label: string,
  status: ProductionGateStatus,
  message: string,
  recommendation?: string,
): ProductionGateCheck {
  return { id, label, status, message, ...(recommendation ? { recommendation } : {}) };
}

function parseArgs(args: readonly string[]) {
  let skipDb = false;
  let sampleLimit = 20;

  for (const arg of args) {
    if (arg === '--skip-db') {
      skipDb = true;
    } else if (arg.startsWith('--sample-limit=')) {
      const parsed = Number.parseInt(arg.slice('--sample-limit='.length), 10);
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= 100) {
        sampleLimit = parsed;
      }
    }
  }

  return { skipDb, sampleLimit };
}

function parseOriginList(value: string | undefined) {
  if (!value) return [];
  return value.split(';').map((entry) => entry.trim()).filter(Boolean);
}

function hasText(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasAnyBootstrapEnv(env: NodeJS.ProcessEnv) {
  return hasText(env.ADMIN_BOOTSTRAP_LOGIN_NAME)
    || hasText(env.ADMIN_BOOTSTRAP_DISPLAY_NAME)
    || hasText(env.ADMIN_BOOTSTRAP_PASSWORD);
}

function firstRow<T>(result: unknown): T {
  const resultRows = rows<T>(result);
  if (!resultRows[0]) {
    throw new Error('Expected query to return at least one row.');
  }
  return resultRows[0];
}

function rows<T>(result: unknown): T[] {
  if (
    typeof result === 'object'
    && result !== null
    && 'rows' in result
    && Array.isArray(result.rows)
  ) {
    return result.rows as T[];
  }

  throw new Error('Database query returned an unexpected result shape.');
}

function toNumber(value: string | number) {
  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

function toIsoTimestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function main(): Promise<void> {
  process.exitCode = await runProductionGateCli({
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
