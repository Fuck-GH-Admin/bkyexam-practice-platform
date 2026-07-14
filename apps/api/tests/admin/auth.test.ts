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
      failedLoginCount: 2,
      failedLoginWindowStartedAt: new Date('2026-07-13T09:50:00.000Z'),
      lockedUntil: null,
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
      .resolves.toMatchObject({
        lastLoginAt: now,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
      });
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

  it('records failed attempts, locks temporarily, and refuses locked admins', async () => {
    const passwordHash = await hashPassword('secret');
    const repository = createMemoryAdminAuthRepository([{
      id: 'admin-1',
      loginName: 'operator@example.com',
      displayName: 'Operator',
      passwordHash,
      status: 'active',
      roles: ['operator'],
      failedLoginCount: 1,
      failedLoginWindowStartedAt: new Date('2026-07-13T09:50:00.000Z'),
    }]);
    const service = createAdminAuthService(repository, {
      maxFailedLoginAttempts: 2,
      failedLoginWindowMinutes: 30,
      lockMinutes: 15,
    });
    const now = new Date('2026-07-13T10:00:00.000Z');

    await expect(service.login({ loginName: 'operator@example.com', password: 'wrong' }, now))
      .rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(repository.findByLoginName('operator@example.com')).resolves.toMatchObject({
      failedLoginCount: 2,
      failedLoginWindowStartedAt: new Date('2026-07-13T09:50:00.000Z'),
      lockedUntil: new Date('2026-07-13T10:15:00.000Z'),
    });
    await expect(service.login({ loginName: 'operator@example.com', password: 'secret' }, now))
      .rejects.toMatchObject({ code: 'locked' });
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
      password_changed_at: new Date('2026-07-13T00:00:00.000Z'),
      failed_login_count: 0,
      failed_login_window_started_at: null,
      locked_until: null,
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
      passwordChangedAt: new Date('2026-07-13T00:00:00.000Z'),
      failedLoginCount: 0,
      failedLoginWindowStartedAt: null,
      lockedUntil: null,
    });

    expect(queries[0].sql).toContain('FROM admin_users');
    expect(queries[0].sql).toContain('LEFT JOIN admin_user_roles');
    expect(queries[0].sql).toContain('WHERE admin_users.login_name = $1');
    expect(queries[0].params).toEqual(['operator@example.com']);
  });

  it('updates last_login_at and clears failure state after a successful login', async () => {
    const { client, queries } = createFakeQueryClient();
    const repository = createPgAdminAuthRepository(client);
    const now = new Date('2026-07-13T10:00:00.000Z');

    await repository.recordSuccessfulLogin('admin-1', now);

    expect(queries[0].sql).toContain('UPDATE admin_users');
    expect(queries[0].sql).toContain('last_login_at = $2');
    expect(queries[0].sql).toContain('failed_login_count = 0');
    expect(queries[0].sql).toContain('locked_until = NULL');
    expect(queries[0].params).toEqual(['admin-1', now]);
  });

  it('updates admin failed login and lock state', async () => {
    const { client, queries } = createFakeQueryClient();
    const repository = createPgAdminAuthRepository(client);
    const now = new Date('2026-07-13T10:00:00.000Z');
    const lockedUntil = new Date('2026-07-13T10:15:00.000Z');

    await repository.recordFailedLogin('admin-1', {
      failedLoginCount: 10,
      failedLoginWindowStartedAt: new Date('2026-07-13T09:50:00.000Z'),
      lockedUntil,
    }, now);

    expect(queries[0].sql).toContain('failed_login_count = $2');
    expect(queries[0].sql).toContain('locked_until = $4');
    expect(queries[0].params).toEqual([
      'admin-1',
      10,
      new Date('2026-07-13T09:50:00.000Z'),
      lockedUntil,
      now,
    ]);
  });
});
