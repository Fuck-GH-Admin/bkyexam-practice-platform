import type { QueryClient } from '../db/client.js';
import { verifyPassword } from '../auth/password.js';
import {
  parseAdminRoles,
  toAdminPrincipal,
  type AdminPrincipal,
  type AdminRole,
} from './rbac.js';

export type AdminUserStatus = 'active' | 'disabled';
export type AdminAuthErrorCode = 'invalid_request' | 'invalid_credentials' | 'disabled';

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
}

export interface AdminAuthRepository {
  findByLoginName(loginName: string): Promise<AdminAuthRecord | null>;
  updateLastLoginAt(adminId: string, now: Date): Promise<void>;
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
}

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

    async updateLastLoginAt(adminId, now) {
      await client.query(
        `
          UPDATE admin_users
          SET last_login_at = $2,
              updated_at = $2
          WHERE id = $1
        `,
        [adminId, now],
      );
    },
  };
}

export function createMemoryAdminAuthRepository(
  initialAdmins: readonly AdminAuthRecord[] = [],
): AdminAuthRepository {
  const admins = new Map(initialAdmins.map((admin) => [admin.loginName, { ...admin }]));

  return {
    async findByLoginName(loginName) {
      const admin = admins.get(loginName);
      return admin ? { ...admin, roles: [...admin.roles] } : null;
    },

    async updateLastLoginAt(adminId, now) {
      for (const admin of admins.values()) {
        if (admin.id === adminId) {
          admin.lastLoginAt = now;
          return;
        }
      }
    },
  };
}

export function createAdminAuthService(repository: AdminAuthRepository) {
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

      const verified = await verifyPassword(password, admin.passwordHash);
      if (!verified) {
        throw new AdminAuthError('invalid_credentials', 'Invalid admin credentials');
      }

      if (admin.status !== 'active') {
        throw new AdminAuthError('disabled', 'Admin user disabled');
      }

      await repository.updateLastLoginAt(admin.id, now);

      return toAdminPrincipal(admin);
    },
  };
}
