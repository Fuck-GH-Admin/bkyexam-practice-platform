import { describe, expect, it } from 'vitest';
import {
  createAdminUserService,
  createMemoryAdminUserRepository,
  createPgAdminUserRepository,
} from '../../src/admin/adminUsers';
import type { QueryClient } from '../../src/db/client';

interface RecordedQuery {
  sql: string;
  params?: readonly unknown[];
}

function createFakeQueryClient(rows: unknown[] = []) {
  const queries: RecordedQuery[] = [];
  const client: QueryClient = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows };
    },
  };

  return { client, queries };
}

describe('admin user service', () => {
  it('creates users with hashed passwords and management-safe DTOs', async () => {
    const repository = createMemoryAdminUserRepository();
    const service = createAdminUserService(repository);
    const now = new Date('2026-07-14T10:00:00.000Z');

    const result = await service.createAdminUser({
      loginName: ' operator@example.com ',
      displayName: ' Operator ',
      password: 'secret123',
      roles: ['operator'],
    }, now);

    expect(result).toMatchObject({
      status: 'created',
      adminUser: {
        loginName: 'operator@example.com',
        displayName: 'Operator',
        status: 'active',
        roles: ['operator'],
        permissions: expect.arrayContaining(['import_job:create']),
      },
    });
    expect(repository.users[0]?.passwordHash).not.toBe('secret123');
    expect(repository.users[0]?.createdAt).toBe(now);
  });

  it('updates users and prevents disabling the last active super_admin', async () => {
    const repository = createMemoryAdminUserRepository([{
      id: '50000000-0000-4000-8000-000000000001',
      loginName: 'root@example.com',
      displayName: 'Root Admin',
      passwordHash: 'hash',
      status: 'active',
      roles: ['super_admin'],
    }]);
    const service = createAdminUserService(repository);

    await expect(service.updateAdminUser('50000000-0000-4000-8000-000000000001', {
      status: 'disabled',
    })).resolves.toEqual({ status: 'last_super_admin' });

    await service.createAdminUser({
      loginName: 'backup@example.com',
      displayName: 'Backup Admin',
      password: 'secret123',
      roles: ['super_admin'],
    });
    await expect(service.updateAdminUser('50000000-0000-4000-8000-000000000001', {
      status: 'disabled',
      roles: ['operator'],
      password: 'newsecret123',
    }, new Date('2026-07-14T11:00:00.000Z'))).resolves.toMatchObject({
      status: 'updated',
      before: { status: 'active', roles: ['super_admin'] },
      after: { status: 'disabled', roles: ['operator'] },
      passwordChanged: true,
    });
  });
});

describe('PostgreSQL admin user repository', () => {
  it('lists users with role and keyword filters', async () => {
    const { client, queries } = createFakeQueryClient([{
      id: '50000000-0000-4000-8000-000000000001',
      login_name: 'operator@example.com',
      display_name: 'Operator',
      status: 'active',
      roles: ['operator'],
      created_at: new Date('2026-07-14T10:00:00.000Z'),
      updated_at: new Date('2026-07-14T10:00:00.000Z'),
      last_login_at: null,
    }]);
    const repository = createPgAdminUserRepository(client);

    const page = await repository.listAdminUsers({
      status: 'active',
      role: 'operator',
      keyword: 'op',
      limit: 20,
      offset: 0,
    });

    expect(queries[0].sql).toContain('FROM admin_users');
    expect(queries[0].sql).toContain('EXISTS (');
    expect(queries[0].sql).toContain('lower(admin_users.login_name) LIKE $3');
    expect(queries[0].params).toEqual(['active', 'operator', '%op%', 21, 0]);
    expect(page.adminUsers[0]).toMatchObject({
      id: '50000000-0000-4000-8000-000000000001',
      loginName: 'operator@example.com',
      roles: ['operator'],
    });
  });

  it('inserts users and roles inside a transaction', async () => {
    const queries: RecordedQuery[] = [];
    const client: QueryClient = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (sql.includes('INSERT INTO admin_users')) {
          return { rows: [{ id: '50000000-0000-4000-8000-000000000001' }] };
        }
        if (sql.includes('WHERE admin_users.id = $1')) {
          return {
            rows: [{
              id: '50000000-0000-4000-8000-000000000001',
              login_name: 'operator@example.com',
              display_name: 'Operator',
              status: 'active',
              roles: ['operator'],
              created_at: new Date('2026-07-14T10:00:00.000Z'),
              updated_at: new Date('2026-07-14T10:00:00.000Z'),
              last_login_at: null,
            }],
          };
        }
        return { rows: [] };
      },
    };
    const repository = createPgAdminUserRepository(client);
    const now = new Date('2026-07-14T10:00:00.000Z');

    await expect(repository.createAdminUser({
      loginName: 'operator@example.com',
      displayName: 'Operator',
      passwordHash: 'hash',
      roles: ['operator'],
      now,
    })).resolves.toMatchObject({ status: 'created' });

    expect(queries.map((query) => query.sql.trim().split(/\s+/, 2).join(' '))).toEqual([
      'BEGIN',
      'SELECT id',
      'INSERT INTO',
      'INSERT INTO',
      'SELECT admin_users.id,',
      'COMMIT',
    ]);
  });
});
