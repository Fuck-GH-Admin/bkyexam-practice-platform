import { describe, expect, it } from 'vitest';
import { createAuditService, createMemoryAuditLogRepository } from '../../src/admin/audit';
import {
  createAdminBootstrapService,
  createMemoryAdminBootstrapRepository,
  createPgAdminBootstrapRepository,
} from '../../src/admin/bootstrap';
import { createAdminAuthService, createMemoryAdminAuthRepository } from '../../src/admin/auth';
import type { QueryClient } from '../../src/db/client';

interface RecordedQuery {
  sql: string;
  params?: readonly unknown[];
}

function createFakeBootstrapClient() {
  const queries: RecordedQuery[] = [];
  const client: QueryClient = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('INSERT INTO admin_users')) {
        return {
          rows: [{
            id: '50000000-0000-4000-8000-000000000001',
            login_name: params?.[0],
            display_name: params?.[1],
          }],
        };
      }
      return { rows: [] };
    },
  };
  return { client, queries };
}

describe('admin bootstrap service', () => {
  it('creates the first super_admin once and records audit without storing plaintext password', async () => {
    const auditRepository = createMemoryAuditLogRepository();
    const bootstrapRepository = createMemoryAdminBootstrapRepository();
    const service = createAdminBootstrapService(
      bootstrapRepository,
      createAuditService(auditRepository),
    );
    const now = new Date('2026-07-14T10:00:00.000Z');

    const result = await service.bootstrapSuperAdmin({
      loginName: ' root@example.com ',
      displayName: ' Root Admin ',
      password: 'secret123',
    }, now);

    expect(result).toMatchObject({
      status: 'created',
      admin: {
        loginName: 'root@example.com',
        displayName: 'Root Admin',
        roles: ['super_admin'],
        permissions: expect.arrayContaining(['audit_log:read', 'admin_user:manage']),
      },
    });
    expect(bootstrapRepository.admins[0]?.passwordHash).not.toBe('secret123');
    await expect(createAdminAuthService(
      createMemoryAdminAuthRepository(bootstrapRepository.admins),
    ).login({ loginName: 'root@example.com', password: 'secret123' })).resolves.toMatchObject({
      loginName: 'root@example.com',
      roles: ['super_admin'],
    });
    expect(auditRepository.entries).toEqual([
      expect.objectContaining({
        actorAdminId: null,
        action: 'admin_user.bootstrap',
        resourceType: 'admin_user',
        after: {
          loginName: 'root@example.com',
          displayName: 'Root Admin',
          roles: ['super_admin'],
        },
        metadata: { bootstrap: true },
        createdAt: now,
      }),
    ]);
  });

  it('refuses weak requests, existing super_admin, and login conflicts', async () => {
    const emptyService = createAdminBootstrapService(createMemoryAdminBootstrapRepository());
    await expect(emptyService.bootstrapSuperAdmin({
      loginName: '',
      displayName: 'Root Admin',
      password: 'short',
    })).rejects.toThrow('8+ character password');

    const existingSuperAdmin = createMemoryAdminBootstrapRepository([{
      id: '50000000-0000-4000-8000-000000000001',
      loginName: 'root@example.com',
      displayName: 'Root Admin',
      passwordHash: 'hash',
      status: 'active',
      roles: ['super_admin'],
    }]);
    await expect(createAdminBootstrapService(existingSuperAdmin).bootstrapSuperAdmin({
      loginName: 'other@example.com',
      displayName: 'Other Admin',
      password: 'secret123',
    })).resolves.toMatchObject({ status: 'already_bootstrapped' });

    const loginConflict = createMemoryAdminBootstrapRepository([{
      id: '50000000-0000-4000-8000-000000000002',
      loginName: 'operator@example.com',
      displayName: 'Operator',
      passwordHash: 'hash',
      status: 'active',
      roles: ['operator'],
    }]);
    await expect(createAdminBootstrapService(loginConflict).bootstrapSuperAdmin({
      loginName: 'operator@example.com',
      displayName: 'Root Admin',
      password: 'secret123',
    })).resolves.toEqual({ status: 'login_name_conflict' });
  });
});

describe('PostgreSQL admin bootstrap repository', () => {
  it('creates admin_users and super_admin role in a transaction', async () => {
    const { client, queries } = createFakeBootstrapClient();
    const repository = createPgAdminBootstrapRepository(client);
    const now = new Date('2026-07-14T10:00:00.000Z');

    const result = await repository.bootstrapSuperAdmin({
      loginName: 'root@example.com',
      displayName: 'Root Admin',
      passwordHash: 'hash',
      now,
    });

    expect(result).toMatchObject({
      status: 'created',
      admin: {
        id: '50000000-0000-4000-8000-000000000001',
        loginName: 'root@example.com',
        roles: ['super_admin'],
      },
    });
    expect(queries.map((query) => query.sql.trim().split(/\s+/, 2).join(' '))).toEqual([
      'BEGIN',
      'SELECT admin_users.id,',
      'SELECT id',
      'INSERT INTO',
      'INSERT INTO',
      'COMMIT',
    ]);
    expect(queries[3].params).toEqual(['root@example.com', 'Root Admin', 'hash', now]);
    expect(queries[4].params).toEqual(['50000000-0000-4000-8000-000000000001']);
  });

  it('does not create another super_admin when one already exists', async () => {
    const queries: RecordedQuery[] = [];
    const client: QueryClient = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (sql.includes("WHERE admin_user_roles.role = 'super_admin'")) {
          return {
            rows: [{
              id: '50000000-0000-4000-8000-000000000001',
              login_name: 'root@example.com',
              display_name: 'Root Admin',
              roles: ['super_admin'],
            }],
          };
        }
        return { rows: [] };
      },
    };

    await expect(createPgAdminBootstrapRepository(client).bootstrapSuperAdmin({
      loginName: 'other@example.com',
      displayName: 'Other Admin',
      passwordHash: 'hash',
      now: new Date('2026-07-14T10:00:00.000Z'),
    })).resolves.toMatchObject({
      status: 'already_bootstrapped',
      admin: { loginName: 'root@example.com', roles: ['super_admin'] },
    });
    expect(queries.some((query) => query.sql.includes('INSERT INTO admin_users'))).toBe(false);
    expect(queries.at(-1)?.sql).toBe('COMMIT');
  });
});
