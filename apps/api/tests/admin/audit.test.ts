import { describe, expect, it } from 'vitest';
import {
  createAuditService,
  createMemoryAuditLogRepository,
  createPgAuditLogRepository,
} from '../../src/admin/audit';
import type { QueryClient } from '../../src/db/client';

interface RecordedQuery {
  sql: string;
  params?: readonly unknown[];
}

function createFakeQueryClient() {
  const queries: RecordedQuery[] = [];
  const client: QueryClient = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };

  return { client, queries };
}

describe('admin audit service', () => {
  it('records normalized audit entries with success as the default result', async () => {
    const repository = createMemoryAuditLogRepository();
    const service = createAuditService(repository);
    const now = new Date('2026-07-13T10:00:00.000Z');

    await service.record({
      actorAdminId: 'admin-1',
      action: 'bank_mapping.update',
      resourceType: 'bank_mapping',
      resourceId: 'bank-1',
      before: { visible: false },
      after: { visible: true },
      metadata: { ip: '127.0.0.1' },
    }, now);

    expect(repository.entries).toEqual([{
      actorAdminId: 'admin-1',
      action: 'bank_mapping.update',
      resourceType: 'bank_mapping',
      resourceId: 'bank-1',
      before: { visible: false },
      after: { visible: true },
      metadata: { ip: '127.0.0.1' },
      result: 'success',
      createdAt: now,
    }]);
  });

  it('rejects entries without resource identity', async () => {
    const service = createAuditService(createMemoryAuditLogRepository());

    await expect(service.record({
      action: '   ',
      resourceType: 'bank_mapping',
      resourceId: 'bank-1',
    })).rejects.toThrow('action is required');
  });

  it('lists memory audit entries with filters and stable pagination', async () => {
    const repository = createMemoryAuditLogRepository([
      {
        actorAdminId: '50000000-0000-4000-8000-000000000001',
        action: 'bank_mapping.update',
        resourceType: 'bank_mapping',
        resourceId: 'bank-1',
        before: { visible: false },
        after: { visible: true },
        metadata: { ip: '127.0.0.1' },
        result: 'success',
        createdAt: new Date('2026-07-13T10:00:00.000Z'),
      },
      {
        actorAdminId: '50000000-0000-4000-8000-000000000001',
        action: 'bank_mapping.update',
        resourceType: 'bank_mapping',
        resourceId: 'bank-2',
        before: { visible: true },
        after: { visible: false },
        metadata: {},
        result: 'success',
        createdAt: new Date('2026-07-13T11:00:00.000Z'),
      },
    ]);

    const page = await repository.listAuditLogs({
      action: 'bank_mapping.update',
      limit: 1,
      offset: 0,
    });

    expect(page.auditLogs).toEqual([
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000002',
        action: 'bank_mapping.update',
        resourceId: 'bank-2',
        actor: expect.objectContaining({
          id: '50000000-0000-4000-8000-000000000001',
        }),
      }),
    ]);
    expect(page.page).toEqual({ limit: 1, offset: 0, hasMore: true });
  });
});

describe('PostgreSQL audit repository', () => {
  it('inserts JSON snapshots and request metadata into audit_logs', async () => {
    const { client, queries } = createFakeQueryClient();
    const repository = createPgAuditLogRepository(client);
    const createdAt = new Date('2026-07-13T10:00:00.000Z');

    await repository.append({
      actorAdminId: 'admin-1',
      action: 'admin.auth.login',
      resourceType: 'admin_user',
      resourceId: 'admin-1',
      before: null,
      after: { loginName: 'operator@example.com' },
      metadata: { userAgent: 'test' },
      result: 'success',
      createdAt,
    });

    expect(queries[0].sql).toContain('INSERT INTO audit_logs');
    expect(queries[0].sql).toContain('\"before\"');
    expect(queries[0].sql).toContain('\"after\"');
    expect(queries[0].params).toEqual([
      'admin-1',
      'admin.auth.login',
      'admin_user',
      'admin-1',
      'null',
      JSON.stringify({ loginName: 'operator@example.com' }),
      JSON.stringify({ userAgent: 'test' }),
      'success',
      createdAt,
    ]);
  });

  it('lists audit logs with actor joins, filters, and cursor-safe limit plus one', async () => {
    const { client, queries } = createFakeQueryClient();
    client.query = async (sql, params) => {
      queries.push({ sql, params });
      return {
        rows: [{
          id: '90000000-0000-4000-8000-000000000001',
          actor_admin_id: '50000000-0000-4000-8000-000000000001',
          actor_login_name: 'operator@example.com',
          actor_display_name: 'Operator',
          action: 'bank_mapping.update',
          resource_type: 'bank_mapping',
          resource_id: 'bank-1',
          before: { visible: false },
          after: { visible: true },
          metadata: { ip: '127.0.0.1' },
          result: 'success',
          created_at: new Date('2026-07-13T10:00:00.000Z'),
        }],
      };
    };
    const repository = createPgAuditLogRepository(client);

    const page = await repository.listAuditLogs({
      actorAdminId: '50000000-0000-4000-8000-000000000001',
      action: 'bank_mapping.update',
      resourceType: 'bank_mapping',
      result: 'success',
      createdFrom: '2026-07-13T00:00:00.000Z',
      limit: 20,
      offset: 5,
    });

    expect(queries[0].sql).toContain('FROM audit_logs');
    expect(queries[0].sql).toContain('LEFT JOIN admin_users actor');
    expect(queries[0].sql).toContain('audit_logs.actor_admin_id = $1');
    expect(queries[0].sql).toContain('audit_logs.created_at >= $5::timestamptz');
    expect(queries[0].sql).toContain('LIMIT $6');
    expect(queries[0].sql).toContain('OFFSET $7');
    expect(queries[0].params).toEqual([
      '50000000-0000-4000-8000-000000000001',
      'bank_mapping.update',
      'bank_mapping',
      'success',
      '2026-07-13T00:00:00.000Z',
      21,
      5,
    ]);
    expect(page.auditLogs[0]).toMatchObject({
      id: '90000000-0000-4000-8000-000000000001',
      actor: {
        id: '50000000-0000-4000-8000-000000000001',
        loginName: 'operator@example.com',
        displayName: 'Operator',
      },
      action: 'bank_mapping.update',
    });
  });
});
