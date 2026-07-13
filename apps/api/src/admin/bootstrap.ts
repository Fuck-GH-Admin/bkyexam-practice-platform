import { randomUUID } from 'node:crypto';
import { hashPassword } from '../auth/password.js';
import type { QueryClient } from '../db/client.js';
import type { AuditService } from './audit.js';
import {
  parseAdminRoles,
  toAdminPrincipal,
  type AdminPrincipal,
} from './rbac.js';

export type AdminBootstrapStatus = 'created' | 'already_bootstrapped' | 'login_name_conflict';

export interface BootstrapSuperAdminInput {
  loginName: string;
  displayName: string;
  password: string;
}

export interface BootstrapSuperAdminRepositoryInput {
  loginName: string;
  displayName: string;
  passwordHash: string;
  now: Date;
}

export type BootstrapSuperAdminResult =
  | { status: 'created'; admin: AdminPrincipal }
  | { status: 'already_bootstrapped'; admin: AdminPrincipal }
  | { status: 'login_name_conflict' };

export interface AdminBootstrapRepository {
  bootstrapSuperAdmin(input: BootstrapSuperAdminRepositoryInput): Promise<BootstrapSuperAdminResult>;
}

interface AdminBootstrapRecord {
  id: string;
  loginName: string;
  displayName: string;
  passwordHash: string;
  status: 'active' | 'disabled';
  roles: Array<'content_editor' | 'operator' | 'super_admin'>;
  lastLoginAt?: Date | null;
}

interface QueryRows<T> {
  rows: T[];
}

interface AdminBootstrapRow {
  id: string;
  login_name: string;
  display_name: string;
  roles: string[] | null;
}

type TransactionClient = QueryClient & { release?: () => void };

interface ConnectableQueryClient extends QueryClient {
  connect(): Promise<TransactionClient>;
}

export function createAdminBootstrapService(
  repository: AdminBootstrapRepository,
  auditService?: AuditService,
) {
  return {
    async bootstrapSuperAdmin(
      input: BootstrapSuperAdminInput,
      now = new Date(),
    ): Promise<BootstrapSuperAdminResult> {
      const loginName = input.loginName.trim();
      const displayName = input.displayName.trim();
      if (!loginName || !displayName || input.password.length < 8) {
        throw new Error('loginName, displayName, and an 8+ character password are required');
      }

      const result = await repository.bootstrapSuperAdmin({
        loginName,
        displayName,
        passwordHash: await hashPassword(input.password),
        now,
      });

      if (result.status === 'created') {
        await auditService?.record({
          actorAdminId: null,
          action: 'admin_user.bootstrap',
          resourceType: 'admin_user',
          resourceId: result.admin.id,
          after: {
            loginName: result.admin.loginName,
            displayName: result.admin.displayName,
            roles: result.admin.roles,
          },
          metadata: { bootstrap: true },
          result: 'success',
          createdAt: now,
        });
      }

      return result;
    },
  };
}

export function createMemoryAdminBootstrapRepository(
  initialAdmins: readonly AdminBootstrapRecord[] = [],
): AdminBootstrapRepository & { admins: AdminBootstrapRecord[] } {
  const admins = initialAdmins.map((admin) => ({
    ...admin,
    roles: [...admin.roles],
  }));

  return {
    admins,
    async bootstrapSuperAdmin(input) {
      const existingSuperAdmin = admins.find((admin) => admin.roles.includes('super_admin'));
      if (existingSuperAdmin) {
        return { status: 'already_bootstrapped', admin: toAdminPrincipal(existingSuperAdmin) };
      }

      const loginConflict = admins.find((admin) => admin.loginName === input.loginName);
      if (loginConflict) {
        return { status: 'login_name_conflict' };
      }

      const created: AdminBootstrapRecord = {
        id: randomUUID(),
        loginName: input.loginName,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        status: 'active',
        roles: ['super_admin'],
        lastLoginAt: null,
      };
      admins.push(created);

      return { status: 'created', admin: toAdminPrincipal(created) };
    },
  };
}

export function createPgAdminBootstrapRepository(client: QueryClient): AdminBootstrapRepository {
  return {
    async bootstrapSuperAdmin(input) {
      const transactionClient = await checkoutTransactionClient(client);
      let transactionStarted = false;

      try {
        await transactionClient.query('BEGIN');
        transactionStarted = true;

        const existingSuperAdmin = (await transactionClient.query(
          `
            SELECT
              admin_users.id,
              admin_users.login_name,
              admin_users.display_name,
              array_agg(admin_user_roles.role ORDER BY admin_user_roles.role) AS roles
            FROM admin_users
            JOIN admin_user_roles ON admin_user_roles.admin_user_id = admin_users.id
            WHERE admin_user_roles.role = 'super_admin'
            GROUP BY admin_users.id
            ORDER BY admin_users.created_at ASC
            LIMIT 1
          `,
        )) as QueryRows<AdminBootstrapRow>;
        if (existingSuperAdmin.rows[0]) {
          await transactionClient.query('COMMIT');
          transactionStarted = false;
          return { status: 'already_bootstrapped', admin: mapBootstrapRow(existingSuperAdmin.rows[0]) };
        }

        const loginConflict = (await transactionClient.query(
          `
            SELECT id
            FROM admin_users
            WHERE login_name = $1
            LIMIT 1
          `,
          [input.loginName],
        )) as QueryRows<{ id: string }>;
        if (loginConflict.rows[0]) {
          await transactionClient.query('COMMIT');
          transactionStarted = false;
          return { status: 'login_name_conflict' };
        }

        const created = (await transactionClient.query(
          `
            INSERT INTO admin_users (login_name, display_name, password_hash, status, created_at, updated_at)
            VALUES ($1, $2, $3, 'active', $4, $4)
            RETURNING id, login_name, display_name
          `,
          [input.loginName, input.displayName, input.passwordHash, input.now],
        )) as QueryRows<Omit<AdminBootstrapRow, 'roles'>>;
        const createdRow = created.rows[0];
        if (!createdRow) {
          throw new Error('Failed to create bootstrap super_admin');
        }

        await transactionClient.query(
          `
            INSERT INTO admin_user_roles (admin_user_id, role)
            VALUES ($1, 'super_admin')
          `,
          [createdRow.id],
        );

        await transactionClient.query('COMMIT');
        transactionStarted = false;

        return {
          status: 'created',
          admin: toAdminPrincipal({
            id: createdRow.id,
            loginName: createdRow.login_name,
            displayName: createdRow.display_name,
            roles: ['super_admin'],
          }),
        };
      } catch (error) {
        if (transactionStarted) {
          await transactionClient.query('ROLLBACK');
        }

        throw error;
      } finally {
        if (transactionClient !== client) {
          transactionClient.release?.();
        }
      }
    },
  };
}

function mapBootstrapRow(row: AdminBootstrapRow): AdminPrincipal {
  return toAdminPrincipal({
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    roles: parseAdminRoles(row.roles ?? []),
  });
}

async function checkoutTransactionClient(client: QueryClient): Promise<TransactionClient> {
  return isConnectableQueryClient(client) && !('release' in client) ? client.connect() : client;
}

function isConnectableQueryClient(client: QueryClient): client is ConnectableQueryClient {
  return 'connect' in client && typeof client.connect === 'function';
}
