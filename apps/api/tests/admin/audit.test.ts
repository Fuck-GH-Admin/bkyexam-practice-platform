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
});
