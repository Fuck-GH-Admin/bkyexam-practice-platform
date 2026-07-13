import { randomUUID } from 'node:crypto';
import type {
  AdminManagedUserV1,
  AdminRoleV1,
  AdminUserListResponseV1,
  CreateAdminUserRequestV1,
  ListAdminUsersRequestV1,
  UpdateAdminUserRequestV1,
} from '@bkyexam-practice/shared';
import { hashPassword } from '../auth/password.js';
import type { QueryClient } from '../db/client.js';
import { parseAdminRoles, permissionsForRoles } from './rbac.js';

export type CreateAdminUserResult =
  | { status: 'created'; adminUser: AdminManagedUserV1 }
  | { status: 'login_name_conflict' };

export type UpdateAdminUserResult =
  | { status: 'updated'; before: AdminManagedUserV1; after: AdminManagedUserV1; passwordChanged: boolean }
  | { status: 'not_found' }
  | { status: 'last_super_admin' };

export interface AdminUserCreateInput {
  loginName: string;
  displayName: string;
  passwordHash: string;
  roles: AdminRoleV1[];
  now: Date;
}

export interface AdminUserUpdateInput {
  adminId: string;
  changes: {
    displayName?: string;
    status?: AdminManagedUserV1['status'];
    roles?: AdminRoleV1[];
    passwordHash?: string;
  };
  now: Date;
}

export interface AdminUserRepository {
  listAdminUsers(filters: ListAdminUsersRequestV1): Promise<AdminUserListResponseV1>;
  findAdminUserById(adminId: string): Promise<AdminManagedUserV1 | null>;
  createAdminUser(input: AdminUserCreateInput): Promise<CreateAdminUserResult>;
  updateAdminUser(input: AdminUserUpdateInput): Promise<UpdateAdminUserResult>;
}

interface MemoryAdminUserRecord {
  id: string;
  loginName: string;
  displayName: string;
  passwordHash: string;
  status: AdminManagedUserV1['status'];
  roles: AdminRoleV1[];
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date | null;
}

interface QueryRows<T> {
  rows: T[];
}

interface AdminUserRow {
  id: string;
  login_name: string;
  display_name: string;
  status: string;
  roles: string[] | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_login_at: Date | string | null;
}

type TransactionClient = QueryClient & { release?: () => void };

interface ConnectableQueryClient extends QueryClient {
  connect(): Promise<TransactionClient>;
}

export function createAdminUserService(repository: AdminUserRepository) {
  return {
    listAdminUsers(filters: ListAdminUsersRequestV1) {
      return repository.listAdminUsers(filters);
    },

    findAdminUserById(adminId: string) {
      return repository.findAdminUserById(adminId);
    },

    async createAdminUser(request: CreateAdminUserRequestV1, now = new Date()) {
      return repository.createAdminUser({
        loginName: request.loginName.trim(),
        displayName: request.displayName.trim(),
        passwordHash: await hashPassword(request.password),
        roles: [...new Set(request.roles)].sort(),
        now,
      });
    },

    async updateAdminUser(adminId: string, request: UpdateAdminUserRequestV1, now = new Date()) {
      return repository.updateAdminUser({
        adminId,
        changes: {
          displayName: request.displayName?.trim(),
          status: request.status,
          roles: request.roles ? [...new Set(request.roles)].sort() : undefined,
          passwordHash: request.password ? await hashPassword(request.password) : undefined,
        },
        now,
      });
    },
  };
}

export function createMemoryAdminUserRepository(
  initialUsers: readonly (MemoryAdminUserRecord | {
    id: string;
    loginName: string;
    displayName: string;
    passwordHash: string;
    status: AdminManagedUserV1['status'];
    roles: AdminRoleV1[];
    createdAt?: Date;
    updatedAt?: Date;
    lastLoginAt?: Date | null;
  })[] = [],
): AdminUserRepository & { users: MemoryAdminUserRecord[] } {
  const users: MemoryAdminUserRecord[] = initialUsers.map((user) => ({
    ...user,
    roles: [...user.roles],
    createdAt: user.createdAt ?? new Date('2026-07-14T00:00:00.000Z'),
    updatedAt: user.updatedAt ?? new Date('2026-07-14T00:00:00.000Z'),
    lastLoginAt: user.lastLoginAt ?? null,
  }));

  return {
    users,
    async listAdminUsers(filters) {
      const filtered = users
        .filter((user) => {
          if (filters.status && user.status !== filters.status) return false;
          if (filters.role && !user.roles.includes(filters.role)) return false;
          if (filters.keyword) {
            const keyword = filters.keyword.toLocaleLowerCase();
            if (
              !user.loginName.toLocaleLowerCase().includes(keyword)
              && !user.displayName.toLocaleLowerCase().includes(keyword)
            ) return false;
          }
          return true;
        })
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      const pageItems = filtered.slice(filters.offset, filters.offset + filters.limit + 1);

      return {
        adminUsers: pageItems.slice(0, filters.limit).map(mapMemoryUser),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: pageItems.length > filters.limit,
        },
      };
    },

    async findAdminUserById(adminId) {
      const user = users.find((candidate) => candidate.id === adminId);
      return user ? mapMemoryUser(user) : null;
    },

    async createAdminUser(input) {
      if (users.some((user) => user.loginName === input.loginName)) {
        return { status: 'login_name_conflict' };
      }

      const created: MemoryAdminUserRecord = {
        id: randomUUID(),
        loginName: input.loginName,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        status: 'active',
        roles: [...input.roles],
        createdAt: input.now,
        updatedAt: input.now,
        lastLoginAt: null,
      };
      users.push(created);

      return { status: 'created', adminUser: mapMemoryUser(created) };
    },

    async updateAdminUser(input) {
      const index = users.findIndex((user) => user.id === input.adminId);
      if (index < 0) return { status: 'not_found' };

      const beforeRecord = users[index];
      const before = mapMemoryUser(beforeRecord);
      const nextStatus = input.changes.status ?? beforeRecord.status;
      const nextRoles = input.changes.roles ?? beforeRecord.roles;
      if (
        beforeRecord.status === 'active'
        && beforeRecord.roles.includes('super_admin')
        && (nextStatus !== 'active' || !nextRoles.includes('super_admin'))
        && countOtherActiveSuperAdmins(users, beforeRecord.id) === 0
      ) {
        return { status: 'last_super_admin' };
      }

      users[index] = {
        ...beforeRecord,
        displayName: input.changes.displayName ?? beforeRecord.displayName,
        status: nextStatus,
        roles: [...nextRoles],
        passwordHash: input.changes.passwordHash ?? beforeRecord.passwordHash,
        updatedAt: input.now,
      };

      return {
        status: 'updated',
        before,
        after: mapMemoryUser(users[index]),
        passwordChanged: Boolean(input.changes.passwordHash),
      };
    },
  };
}

export function createPgAdminUserRepository(client: QueryClient): AdminUserRepository {
  return {
    async listAdminUsers(filters) {
      const params: unknown[] = [];
      const where: string[] = [];

      if (filters.status) {
        addFilter(params, where, (placeholder) => `admin_users.status = ${placeholder}`, filters.status);
      }
      if (filters.role) {
        addFilter(
          params,
          where,
          (placeholder) => `EXISTS (
            SELECT 1
            FROM admin_user_roles role_filter
            WHERE role_filter.admin_user_id = admin_users.id
              AND role_filter.role = ${placeholder}
          )`,
          filters.role,
        );
      }
      if (filters.keyword) {
        addFilter(
          params,
          where,
          (placeholder) => `(
            lower(admin_users.login_name) LIKE ${placeholder} ESCAPE '\\'
            OR lower(admin_users.display_name) LIKE ${placeholder} ESCAPE '\\'
          )`,
          `%${escapeLikePattern(filters.keyword.toLocaleLowerCase())}%`,
        );
      }

      params.push(filters.limit + 1);
      const limitPlaceholder = `$${params.length}`;
      params.push(filters.offset);
      const offsetPlaceholder = `$${params.length}`;

      const result = (await client.query(
        `
          SELECT
            admin_users.id,
            admin_users.login_name,
            admin_users.display_name,
            admin_users.status,
            admin_users.created_at,
            admin_users.updated_at,
            admin_users.last_login_at,
            COALESCE(
              array_agg(admin_user_roles.role ORDER BY admin_user_roles.role)
                FILTER (WHERE admin_user_roles.role IS NOT NULL),
              ARRAY[]::text[]
            ) AS roles
          FROM admin_users
          LEFT JOIN admin_user_roles ON admin_user_roles.admin_user_id = admin_users.id
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          GROUP BY admin_users.id
          ORDER BY admin_users.created_at DESC, admin_users.id DESC
          LIMIT ${limitPlaceholder}
          OFFSET ${offsetPlaceholder}
        `,
        params,
      )) as QueryRows<AdminUserRow>;
      const pageRows = result.rows.slice(0, filters.limit);

      return {
        adminUsers: pageRows.map(mapAdminUserRow),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: result.rows.length > filters.limit,
        },
      };
    },

    async findAdminUserById(adminId) {
      return findPgAdminUserById(client, adminId);
    },

    async createAdminUser(input) {
      const transactionClient = await checkoutTransactionClient(client);
      let transactionStarted = false;

      try {
        await transactionClient.query('BEGIN');
        transactionStarted = true;

        const conflict = (await transactionClient.query(
          'SELECT id FROM admin_users WHERE login_name = $1 LIMIT 1',
          [input.loginName],
        )) as QueryRows<{ id: string }>;
        if (conflict.rows[0]) {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'login_name_conflict' };
        }

        const created = (await transactionClient.query(
          `
            INSERT INTO admin_users (login_name, display_name, password_hash, status, created_at, updated_at)
            VALUES ($1, $2, $3, 'active', $4, $4)
            RETURNING id
          `,
          [input.loginName, input.displayName, input.passwordHash, input.now],
        )) as QueryRows<{ id: string }>;
        const adminId = created.rows[0]?.id;
        if (!adminId) throw new Error('Failed to create admin user');

        for (const role of input.roles) {
          await transactionClient.query(
            'INSERT INTO admin_user_roles (admin_user_id, role) VALUES ($1, $2)',
            [adminId, role],
          );
        }

        const adminUser = await findPgAdminUserById(transactionClient, adminId);
        if (!adminUser) throw new Error(`Created admin user not found: ${adminId}`);

        await transactionClient.query('COMMIT');
        transactionStarted = false;

        return { status: 'created', adminUser };
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

    async updateAdminUser(input) {
      const transactionClient = await checkoutTransactionClient(client);
      let transactionStarted = false;

      try {
        await transactionClient.query('BEGIN');
        transactionStarted = true;

        const lockResult = (await transactionClient.query(
          'SELECT id FROM admin_users WHERE id = $1 FOR UPDATE',
          [input.adminId],
        )) as QueryRows<{ id: string }>;
        if (!lockResult.rows[0]) {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'not_found' };
        }

        const before = await findPgAdminUserById(transactionClient, input.adminId);
        if (!before) {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'not_found' };
        }

        const nextStatus = input.changes.status ?? before.status;
        const nextRoles = input.changes.roles ?? before.roles;
        if (
          before.status === 'active'
          && before.roles.includes('super_admin')
          && (nextStatus !== 'active' || !nextRoles.includes('super_admin'))
        ) {
          const remaining = (await transactionClient.query(
            `
              SELECT COUNT(*) AS count
              FROM admin_users
              JOIN admin_user_roles ON admin_user_roles.admin_user_id = admin_users.id
              WHERE admin_users.id <> $1
                AND admin_users.status = 'active'
                AND admin_user_roles.role = 'super_admin'
            `,
            [input.adminId],
          )) as QueryRows<{ count: string }>;
          if (Number(remaining.rows[0]?.count ?? 0) === 0) {
            await transactionClient.query('ROLLBACK');
            transactionStarted = false;
            return { status: 'last_super_admin' };
          }
        }

        const assignments: string[] = [];
        const params: unknown[] = [];
        if (input.changes.displayName !== undefined) {
          params.push(input.changes.displayName);
          assignments.push(`display_name = $${params.length}`);
        }
        if (input.changes.status !== undefined) {
          params.push(input.changes.status);
          assignments.push(`status = $${params.length}`);
        }
        if (input.changes.passwordHash !== undefined) {
          params.push(input.changes.passwordHash);
          assignments.push(`password_hash = $${params.length}`);
        }
        params.push(input.now);
        assignments.push(`updated_at = $${params.length}`);
        params.push(input.adminId);
        await transactionClient.query(
          `UPDATE admin_users SET ${assignments.join(', ')} WHERE id = $${params.length}`,
          params,
        );

        if (input.changes.roles !== undefined) {
          await transactionClient.query('DELETE FROM admin_user_roles WHERE admin_user_id = $1', [input.adminId]);
          for (const role of input.changes.roles) {
            await transactionClient.query(
              'INSERT INTO admin_user_roles (admin_user_id, role) VALUES ($1, $2)',
              [input.adminId, role],
            );
          }
        }

        const after = await findPgAdminUserById(transactionClient, input.adminId);
        if (!after) throw new Error(`Updated admin user not found: ${input.adminId}`);

        await transactionClient.query('COMMIT');
        transactionStarted = false;

        return {
          status: 'updated',
          before,
          after,
          passwordChanged: Boolean(input.changes.passwordHash),
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

async function findPgAdminUserById(client: QueryClient, adminId: string) {
  const result = (await client.query(
    `
      SELECT
        admin_users.id,
        admin_users.login_name,
        admin_users.display_name,
        admin_users.status,
        admin_users.created_at,
        admin_users.updated_at,
        admin_users.last_login_at,
        COALESCE(
          array_agg(admin_user_roles.role ORDER BY admin_user_roles.role)
            FILTER (WHERE admin_user_roles.role IS NOT NULL),
          ARRAY[]::text[]
        ) AS roles
      FROM admin_users
      LEFT JOIN admin_user_roles ON admin_user_roles.admin_user_id = admin_users.id
      WHERE admin_users.id = $1
      GROUP BY admin_users.id
      LIMIT 1
    `,
    [adminId],
  )) as QueryRows<AdminUserRow>;
  const row = result.rows[0];
  return row ? mapAdminUserRow(row) : null;
}

function mapMemoryUser(user: MemoryAdminUserRecord): AdminManagedUserV1 {
  const roles = [...new Set(user.roles)].sort();
  return {
    id: user.id,
    loginName: user.loginName,
    displayName: user.displayName,
    status: user.status,
    roles,
    permissions: permissionsForRoles(roles),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

function mapAdminUserRow(row: AdminUserRow): AdminManagedUserV1 {
  const roles = parseAdminRoles(row.roles ?? []);
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    status: row.status === 'disabled' ? 'disabled' : 'active',
    roles,
    permissions: permissionsForRoles(roles),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    lastLoginAt: row.last_login_at ? toIsoTimestamp(row.last_login_at) : null,
  };
}

function countOtherActiveSuperAdmins(users: readonly MemoryAdminUserRecord[], adminId: string) {
  return users.filter((user) => (
    user.id !== adminId
    && user.status === 'active'
    && user.roles.includes('super_admin')
  )).length;
}

function addFilter(
  params: unknown[],
  where: string[],
  condition: (placeholder: string) => string,
  value: unknown,
) {
  params.push(value);
  where.push(condition(`$${params.length}`));
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function checkoutTransactionClient(client: QueryClient): Promise<TransactionClient> {
  return isConnectableQueryClient(client) && !('release' in client) ? client.connect() : client;
}

function isConnectableQueryClient(client: QueryClient): client is ConnectableQueryClient {
  return 'connect' in client && typeof client.connect === 'function';
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
