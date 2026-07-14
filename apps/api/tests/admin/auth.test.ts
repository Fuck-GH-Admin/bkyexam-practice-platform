import { describe, expect, it } from 'vitest';
import {
  AdminAuthError,
  createAdminAuthService,
  createMemoryAdminAuthRepository,
  createPgAdminAuthRepository,
} from '../../src/admin/auth';
import { hashPassword } from '../../src/auth/password';
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

describe('admin auth service', () => {
  it('requires a password and rejects passwordless admin login', async () => {
    const service = createAdminAuthService(createMemoryAdminAuthRepository());

    await expect(service.login({ loginName: 'operator@example.com', password: '' }))
      .rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('verifies password, status, roles, permissions, and last-login update', async () => {
    const passwordHash = await hashPassword('secret');
    const repository = createMemoryAdminAuthRepository([{
      id: 'admin-1',
      loginName: 'operator@example.com',
      displayName: 'Operator',
      passwordHash,
      status: 'active',
      roles: ['operator'],
    }]);
    const service = createAdminAuthService(repository);
    const now = new Date('2026-07-13T10:00:00.000Z');

    await expect(service.login({
      loginName: ' operator@example.com ',
      password: 'secret',
    }, now)).resolves.toEqual({
      id: 'admin-1',
      loginName: 'operator@example.com',
      displayName: 'Operator',
      roles: ['operator'],
      permissions: [
        'admin:self:read',
        'bank_mapping:read',
        'import_job:read',
        'import_job:create',
        'system_status:read',
        'student_account:read',
        'student_account:write',
        'student_account:reset_password',
        'student_account:revoke_session',
      ],
    });

    await expect(repository.findByLoginName('operator@example.com'))
      .resolves.toMatchObject({ lastLoginAt: now });
  });

  it('rejects invalid credentials and disabled admin users with stable error codes', async () => {
    const passwordHash = await hashPassword('secret');
    const service = createAdminAuthService(createMemoryAdminAuthRepository([{
      id: 'admin-1',
      loginName: 'operator@example.com',
      displayName: 'Operator',
      passwordHash,
      status: 'disabled',
      roles: ['operator'],
    }]));

    await expect(service.login({ loginName: 'missing@example.com', password: 'secret' }))
      .rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(service.login({ loginName: 'operator@example.com', password: 'wrong' }))
      .rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(service.login({ loginName: 'operator@example.com', password: 'secret' }))
      .rejects.toBeInstanceOf(AdminAuthError);
    await expect(service.login({ loginName: 'operator@example.com', password: 'secret' }))
      .rejects.toMatchObject({ code: 'disabled' });
  });
});

describe('PostgreSQL admin auth repository', () => {
  it('finds admin users with aggregated roles', async () => {
    const { client, queries } = createFakeQueryClient([{
      id: 'admin-1',
      login_name: 'operator@example.com',
      display_name: 'Operator',
      password_hash: 'hash',
      status: 'active',
      roles: ['operator'],
      last_login_at: null,
    }]);
    const repository = createPgAdminAuthRepository(client);

    await expect(repository.findByLoginName('operator@example.com')).resolves.toEqual({
      id: 'admin-1',
      loginName: 'operator@example.com',
      displayName: 'Operator',
      passwordHash: 'hash',
      status: 'active',
      roles: ['operator'],
      lastLoginAt: null,
    });

    expect(queries[0].sql).toContain('FROM admin_users');
    expect(queries[0].sql).toContain('LEFT JOIN admin_user_roles');
    expect(queries[0].sql).toContain('WHERE admin_users.login_name = $1');
    expect(queries[0].params).toEqual(['operator@example.com']);
  });

  it('updates last_login_at after a successful login', async () => {
    const { client, queries } = createFakeQueryClient();
    const repository = createPgAdminAuthRepository(client);
    const now = new Date('2026-07-13T10:00:00.000Z');

    await repository.updateLastLoginAt('admin-1', now);

    expect(queries[0].sql).toContain('UPDATE admin_users');
    expect(queries[0].sql).toContain('last_login_at = $2');
    expect(queries[0].params).toEqual(['admin-1', now]);
  });
});
