import { describe, expect, it } from 'vitest';
import {
  createAdminSessionService,
  createMemoryAdminSessionRepository,
  createPgAdminSessionRepository,
} from '../../src/admin/session';
import { hashSessionToken } from '../../src/auth/session';
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

const admin = {
  id: 'admin-1',
  loginName: 'operator@example.com',
  displayName: 'Operator',
  roles: ['operator'] as const,
  permissions: [
    'admin:self:read',
    'bank_mapping:read',
    'import_job:read',
    'import_job:create',
    'import_job:cancel',
    'import_job:retry',
    'system_status:read',
  ] as const,
};

describe('admin session service', () => {
  it('creates, resolves, and revokes isolated admin sessions', async () => {
    const repository = createMemoryAdminSessionRepository();
    const service = createAdminSessionService(repository, { ttlHours: 8 });
    const now = new Date('2026-07-13T10:00:00.000Z');

    const session = await service.createSession(admin, now);
    expect(session.token).toEqual(expect.any(String));
    expect(session.expiresAt.toISOString()).toBe('2026-07-13T18:00:00.000Z');

    await expect(service.resolveAdmin(session.token, now)).resolves.toMatchObject({
      admin: { id: 'admin-1', loginName: 'operator@example.com' },
      expiresAt: session.expiresAt,
    });

    await service.revokeSession(session.token, now);
    await expect(service.resolveAdmin(session.token, now)).resolves.toBeNull();
  });
});

describe('PostgreSQL admin session repository', () => {
  it('inserts admin sessions into admin_sessions', async () => {
    const { client, queries } = createFakeQueryClient();
    const repository = createPgAdminSessionRepository(client);
    const expiresAt = new Date('2026-07-13T18:00:00.000Z');

    await repository.createSession({ admin, tokenHash: 'hash-1', expiresAt });

    expect(queries[0].sql).toContain('INSERT INTO admin_sessions');
    expect(queries[0].params).toEqual(['admin-1', 'hash-1', expiresAt]);
  });

  it('finds active unexpired admin sessions and derives permissions', async () => {
    const now = new Date('2026-07-13T10:00:00.000Z');
    const expiresAt = new Date('2026-07-13T18:00:00.000Z');
    const { client, queries } = createFakeQueryClient([{
      id: 'admin-1',
      login_name: 'operator@example.com',
      display_name: 'Operator',
      roles: ['operator'],
      expires_at: expiresAt,
    }]);
    const repository = createPgAdminSessionRepository(client);

    await expect(repository.findAdminByTokenHash(hashSessionToken('raw-token'), now))
      .resolves.toMatchObject({
        admin: {
          id: 'admin-1',
          roles: ['operator'],
          permissions: expect.arrayContaining(['admin:self:read', 'import_job:create']),
        },
        expiresAt,
      });

    expect(queries[0].sql).toContain('JOIN admin_users');
    expect(queries[0].sql).toContain('JOIN admin_users ON admin_users.id = admin_sessions.admin_user_id');
    expect(queries[0].sql).toContain('admin_sessions.revoked_at IS NULL');
    expect(queries[0].sql).toContain('admin_sessions.expires_at > $2');
    expect(queries[0].sql).toContain("admin_users.status = 'active'");
  });

  it('revokes active admin sessions by token hash', async () => {
    const now = new Date('2026-07-13T10:00:00.000Z');
    const { client, queries } = createFakeQueryClient();
    const repository = createPgAdminSessionRepository(client);

    await repository.revokeSession('hash-1', now);

    expect(queries[0].sql).toContain('UPDATE admin_sessions');
    expect(queries[0].sql).toContain('revoked_at = $2');
    expect(queries[0].params).toEqual(['hash-1', now]);
  });
});
