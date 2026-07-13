import { generateSessionToken, hashSessionToken } from '../auth/session.js';
import type { QueryClient } from '../db/client.js';
import {
  parseAdminRoles,
  toAdminPrincipal,
  type AdminPrincipal,
  type AdminRole,
} from './rbac.js';

export interface ResolvedAdminSession {
  admin: AdminPrincipal;
  expiresAt: Date;
}

export interface AdminSessionRepository {
  createSession(input: { admin: AdminPrincipal; tokenHash: string; expiresAt: Date }): Promise<void>;
  findAdminByTokenHash(tokenHash: string, now: Date): Promise<ResolvedAdminSession | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
}

interface QueryRows<T> {
  rows: T[];
}

interface AdminSessionRow {
  id: string;
  login_name: string;
  display_name: string;
  roles: string[] | null;
  expires_at: Date | string;
}

function mapAdminSessionRow(row: AdminSessionRow): ResolvedAdminSession {
  const roles = parseAdminRoles(row.roles ?? []) as AdminRole[];
  return {
    admin: toAdminPrincipal({
      id: row.id,
      loginName: row.login_name,
      displayName: row.display_name,
      roles,
    }),
    expiresAt: new Date(row.expires_at),
  };
}

export function createAdminSessionService(
  repository: AdminSessionRepository,
  options: { ttlHours: number },
) {
  return {
    async createSession(admin: AdminPrincipal, now = new Date()) {
      const token = generateSessionToken();
      const expiresAt = new Date(now.getTime() + options.ttlHours * 60 * 60 * 1000);
      await repository.createSession({ admin, tokenHash: hashSessionToken(token), expiresAt });

      return { token, expiresAt };
    },

    async resolveAdmin(token: string | undefined, now = new Date()) {
      if (!token) return null;

      return repository.findAdminByTokenHash(hashSessionToken(token), now);
    },

    async revokeSession(token: string | undefined, now = new Date()) {
      if (!token) return;

      await repository.revokeSession(hashSessionToken(token), now);
    },
  };
}

export function createMemoryAdminSessionRepository(): AdminSessionRepository {
  const sessions = new Map<
    string,
    { admin: AdminPrincipal; expiresAt: Date; revokedAt?: Date }
  >();

  return {
    async createSession({ admin, tokenHash, expiresAt }) {
      sessions.set(tokenHash, { admin, expiresAt });
    },

    async findAdminByTokenHash(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (!session || session.revokedAt || session.expiresAt <= now) {
        return null;
      }

      return {
        admin: {
          ...session.admin,
          roles: [...session.admin.roles],
          permissions: [...session.admin.permissions],
        },
        expiresAt: session.expiresAt,
      };
    },

    async revokeSession(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (session && !session.revokedAt) {
        session.revokedAt = now;
      }
    },
  };
}

export function createPgAdminSessionRepository(client: QueryClient): AdminSessionRepository {
  return {
    async createSession({ admin, tokenHash, expiresAt }) {
      await client.query(
        `
          INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at)
          VALUES ($1, $2, $3)
        `,
        [admin.id, tokenHash, expiresAt],
      );
    },

    async findAdminByTokenHash(tokenHash, now) {
      const result = (await client.query(
        `
          SELECT
            admin_users.id,
            admin_users.login_name,
            admin_users.display_name,
            admin_sessions.expires_at,
            COALESCE(
              array_agg(admin_user_roles.role ORDER BY admin_user_roles.role)
                FILTER (WHERE admin_user_roles.role IS NOT NULL),
              ARRAY[]::text[]
            ) AS roles
          FROM admin_sessions
          JOIN admin_users ON admin_users.id = admin_sessions.admin_user_id
          LEFT JOIN admin_user_roles ON admin_user_roles.admin_user_id = admin_users.id
          WHERE admin_sessions.token_hash = $1
            AND admin_sessions.revoked_at IS NULL
            AND admin_sessions.expires_at > $2
            AND admin_users.status = 'active'
          GROUP BY admin_users.id, admin_sessions.expires_at
          LIMIT 1
        `,
        [tokenHash, now],
      )) as QueryRows<AdminSessionRow>;
      const row = result.rows[0];

      return row ? mapAdminSessionRow(row) : null;
    },

    async revokeSession(tokenHash, now) {
      await client.query(
        `
          UPDATE admin_sessions
          SET revoked_at = $2
          WHERE token_hash = $1
            AND revoked_at IS NULL
        `,
        [tokenHash, now],
      );
    },
  };
}
