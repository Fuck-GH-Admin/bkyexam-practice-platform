import type { QueryClient } from '../db/client.js';
import { verifyPassword } from '../auth/password.js';
import {
  parseAdminRoles,
  toAdminPrincipal,
  type AdminPrincipal,
  type AdminRole,
} from './rbac.js';

export type AdminUserStatus = 'active' | 'disabled';
export type AdminAuthErrorCode = 'invalid_request' | 'invalid_credentials' | 'disabled' | 'locked';

export class AdminAuthError extends Error {
  constructor(public readonly code: AdminAuthErrorCode, message: string) {
    super(message);
  }
}

export interface AdminAuthRecord {
  id: string;
  loginName: string;
  displayName: string;
  passwordHash: string;
  status: AdminUserStatus;
  roles: AdminRole[];
  lastLoginAt?: Date | null;
  passwordChangedAt?: Date | null;
  failedLoginCount: number;
  failedLoginWindowStartedAt?: Date | null;
  lockedUntil?: Date | null;
}

export interface AdminAuthRepository {
  findByLoginName(loginName: string): Promise<AdminAuthRecord | null>;
  recordSuccessfulLogin(adminId: string, now: Date): Promise<void>;
  recordFailedLogin(adminId: string, failure: AdminLoginFailureState, now: Date): Promise<void>;
}

export interface AdminLoginFailureState {
  failedLoginCount: number;
  failedLoginWindowStartedAt: Date;
  lockedUntil: Date | null;
}

export interface AdminAuthSecurityPolicy {
  maxFailedLoginAttempts: number;
  failedLoginWindowMinutes: number;
  lockMinutes: number;
}

interface QueryRows<T> {
  rows: T[];
}

interface AdminAuthRow {
  id: string;
  login_name: string;
  display_name: string;
  password_hash: string;
  status: string;
  roles: string[] | null;
  last_login_at: Date | string | null;
  password_changed_at: Date | string | null;
  failed_login_count: number | string;
  failed_login_window_started_at: Date | string | null;
  locked_until: Date | string | null;
}

export const defaultAdminAuthSecurityPolicy: AdminAuthSecurityPolicy = {
  maxFailedLoginAttempts: 10,
  failedLoginWindowMinutes: 30,
  lockMinutes: 15,
};

function parseAdminStatus(status: string): AdminUserStatus {
  if (status === 'active' || status === 'disabled') return status;
  throw new Error(`Invalid admin status: ${status}`);
}

function mapAdminAuthRow(row: AdminAuthRow): AdminAuthRecord {
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    status: parseAdminStatus(row.status),
    roles: parseAdminRoles(row.roles ?? []),
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : null,
    passwordChangedAt: row.password_changed_at ? new Date(row.password_changed_at) : null,
    failedLoginCount: Number(row.failed_login_count),
    failedLoginWindowStartedAt: row.failed_login_window_started_at
      ? new Date(row.failed_login_window_started_at)
      : null,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
  };
}

export function createPgAdminAuthRepository(client: QueryClient): AdminAuthRepository {
  return {
    async findByLoginName(loginName) {
      const result = (await client.query(
        `
          SELECT
            admin_users.id,
            admin_users.login_name,
            admin_users.display_name,
            admin_users.password_hash,
            admin_users.status,
            admin_users.last_login_at,
            admin_users.password_changed_at,
            admin_users.failed_login_count,
            admin_users.failed_login_window_started_at,
            admin_users.locked_until,
            COALESCE(
              array_agg(admin_user_roles.role ORDER BY admin_user_roles.role)
                FILTER (WHERE admin_user_roles.role IS NOT NULL),
              ARRAY[]::text[]
            ) AS roles
          FROM admin_users
          LEFT JOIN admin_user_roles ON admin_user_roles.admin_user_id = admin_users.id
          WHERE admin_users.login_name = $1
          GROUP BY admin_users.id
          LIMIT 1
        `,
        [loginName],
      )) as QueryRows<AdminAuthRow>;
      const row = result.rows[0];

      return row ? mapAdminAuthRow(row) : null;
    },

    async recordSuccessfulLogin(adminId, now) {
      await client.query(
        `
          UPDATE admin_users
          SET last_login_at = $2,
              failed_login_count = 0,
              failed_login_window_started_at = NULL,
              locked_until = NULL,
              updated_at = $2
          WHERE id = $1
        `,
        [adminId, now],
      );
    },

    async recordFailedLogin(adminId, failure, now) {
      await client.query(
        `
          UPDATE admin_users
          SET failed_login_count = $2,
              failed_login_window_started_at = $3,
              locked_until = $4,
              updated_at = $5
          WHERE id = $1
        `,
        [
          adminId,
          failure.failedLoginCount,
          failure.failedLoginWindowStartedAt,
          failure.lockedUntil,
          now,
        ],
      );
    },
  };
}

type MemoryAdminAuthInput = Omit<
  AdminAuthRecord,
  'failedLoginCount' | 'failedLoginWindowStartedAt' | 'lockedUntil' | 'passwordChangedAt'
> & Partial<Pick<
  AdminAuthRecord,
  'failedLoginCount' | 'failedLoginWindowStartedAt' | 'lockedUntil' | 'passwordChangedAt'
>>;

export function createMemoryAdminAuthRepository(
  initialAdmins: readonly MemoryAdminAuthInput[] = [],
): AdminAuthRepository {
  const admins = new Map(initialAdmins.map((admin) => [
    admin.loginName,
    normalizeAdminAuthRecordForRead({
      ...admin,
      failedLoginCount: admin.failedLoginCount ?? 0,
    }),
  ]));

  return {
    async findByLoginName(loginName) {
      const admin = admins.get(loginName);
      return admin ? normalizeAdminAuthRecordForRead(admin) : null;
    },

    async recordSuccessfulLogin(adminId, now) {
      for (const admin of admins.values()) {
        if (admin.id === adminId) {
          admin.lastLoginAt = now;
          admin.failedLoginCount = 0;
          admin.failedLoginWindowStartedAt = null;
          admin.lockedUntil = null;
          return;
        }
      }
    },

    async recordFailedLogin(adminId, failure) {
      for (const admin of admins.values()) {
        if (admin.id === adminId) {
          admin.failedLoginCount = failure.failedLoginCount;
          admin.failedLoginWindowStartedAt = failure.failedLoginWindowStartedAt;
          admin.lockedUntil = failure.lockedUntil;
          return;
        }
      }
    },
  };
}

export function createAdminAuthService(
  repository: AdminAuthRepository,
  policy: AdminAuthSecurityPolicy = defaultAdminAuthSecurityPolicy,
) {
  return {
    async login(
      { loginName, password }: { loginName: string; password: string },
      now = new Date(),
    ): Promise<AdminPrincipal> {
      const normalizedLoginName = loginName.trim();
      if (!normalizedLoginName || !password) {
        throw new AdminAuthError('invalid_request', 'loginName and password are required');
      }

      const admin = await repository.findByLoginName(normalizedLoginName);
      if (!admin) {
        throw new AdminAuthError('invalid_credentials', 'Invalid admin credentials');
      }

      if (admin.status !== 'active') {
        throw new AdminAuthError('disabled', 'Admin user disabled');
      }

      if (isAdminLocked(admin, now)) {
        throw new AdminAuthError('locked', 'Admin user temporarily locked');
      }

      const verified = await verifyPassword(password, admin.passwordHash);
      if (!verified) {
        const failure = nextFailureState(admin, now, policy);
        await repository.recordFailedLogin(admin.id, failure, now);
        throw new AdminAuthError('invalid_credentials', 'Invalid admin credentials');
      }

      await repository.recordSuccessfulLogin(admin.id, now);

      return toAdminPrincipal(admin);
    },
  };
}

function normalizeAdminAuthRecordForRead(admin: AdminAuthRecord): AdminAuthRecord {
  return {
    ...admin,
    roles: [...admin.roles],
    lastLoginAt: admin.lastLoginAt ?? null,
    passwordChangedAt: admin.passwordChangedAt ?? null,
    failedLoginCount: admin.failedLoginCount ?? 0,
    failedLoginWindowStartedAt: admin.failedLoginWindowStartedAt ?? null,
    lockedUntil: admin.lockedUntil ?? null,
  };
}

function isAdminLocked(admin: AdminAuthRecord, now: Date) {
  return Boolean(admin.lockedUntil && admin.lockedUntil > now);
}

function nextFailureState(
  admin: AdminAuthRecord,
  now: Date,
  policy: AdminAuthSecurityPolicy,
): AdminLoginFailureState {
  const windowMs = policy.failedLoginWindowMinutes * 60 * 1000;
  const lockMs = policy.lockMinutes * 60 * 1000;
  const windowStartedAt = admin.failedLoginWindowStartedAt ?? now;
  const withinWindow = now.getTime() - windowStartedAt.getTime() <= windowMs;
  const failedLoginCount = withinWindow ? admin.failedLoginCount + 1 : 1;
  const nextWindowStartedAt = withinWindow ? windowStartedAt : now;

  return {
    failedLoginCount,
    failedLoginWindowStartedAt: nextWindowStartedAt,
    lockedUntil: failedLoginCount >= policy.maxFailedLoginAttempts
      ? new Date(now.getTime() + lockMs)
      : null,
  };
}
