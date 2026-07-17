import { describe, expect, it } from 'vitest';
import type { AdminAuditLogListResponseV1 } from '@bkyexam-practice/shared';
import { createMemoryAuditLogRepository, type AuditLogReadRepository, type AuditLogRepository } from '../../src/admin/audit';
import { createMemoryAdminAuthRepository } from '../../src/admin/auth';
import { hashPassword } from '../../src/auth/password';
import { buildApp } from '../../src/app';

const superAdminId = '50000000-0000-4000-8000-000000000001';
const operatorId = '50000000-0000-4000-8000-000000000002';

async function adminAuthRepository(roles: Array<'operator' | 'super_admin'> = ['super_admin']) {
  return createMemoryAdminAuthRepository([{
    id: superAdminId,
    loginName: 'root@example.com',
    displayName: 'Root Admin',
    passwordHash: await hashPassword('secret123'),
    status: 'active',
    roles,
  }]);
}

async function loginAdmin(app: ReturnType<typeof buildApp>) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/auth/login',
    payload: { loginName: 'root@example.com', password: 'secret123' },
  });
  expect(response.statusCode).toBe(200);
  return String(response.headers['set-cookie']).split(';', 1)[0];
}

describe('admin audit log routes', () => {
  it('requires an admin session before listing audit logs', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/admin/audit-logs' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthenticated' });
  });

  it('requires audit_log:read permission', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      auditLogRepository: createMemoryAuditLogRepository(),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-logs',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });

  it('lists audit logs with filters and pagination', async () => {
    const auditLogRepository = createMemoryAuditLogRepository([
      {
        actorAdminId: superAdminId,
        action: 'bank_mapping.update',
        resourceType: 'bank_mapping',
        resourceId: 'bank-1',
        before: { visible: false },
        after: { visible: true },
        metadata: { ip: '127.0.0.1' },
        result: 'success',
        createdAt: new Date('2026-07-14T10:00:00.000Z'),
      },
      {
        actorAdminId: operatorId,
        action: 'import_job.create',
        resourceType: 'import_job',
        resourceId: 'job-1',
        before: null,
        after: { status: 'succeeded' },
        metadata: {},
        result: 'success',
        createdAt: new Date('2026-07-14T11:00:00.000Z'),
      },
    ]);
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      auditLogRepository,
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-logs?action=bank_mapping.update&limit=1&offset=0',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      auditLogs: [{
        id: '00000000-0000-4000-8000-000000000001',
        actor: {
          id: superAdminId,
          loginName: 'unknown',
          displayName: 'Unknown admin',
        },
        action: 'bank_mapping.update',
        resourceType: 'bank_mapping',
        resourceId: 'bank-1',
        before: { visible: false },
        after: { visible: true },
        metadata: { ip: '127.0.0.1' },
        result: 'success',
        createdAt: '2026-07-14T10:00:00.000Z',
      }],
      page: { limit: 1, offset: 0, hasMore: false },
    });
  });

  it('rejects invalid audit query and fails closed on invalid repository payload', async () => {
    const invalidRepository: AuditLogReadRepository & AuditLogRepository = {
      async append() {},
      async listAuditLogs(): Promise<AdminAuditLogListResponseV1> {
        return {
          auditLogs: [{
            id: 'not-a-uuid',
            actor: null,
            action: 'bank_mapping.update',
            resourceType: 'bank_mapping',
            resourceId: 'bank-1',
            before: null,
            after: null,
            metadata: {},
            result: 'success',
            createdAt: '2026-07-14T10:00:00.000Z',
          }],
          page: { limit: 20, offset: 0, hasMore: false },
        } as AdminAuditLogListResponseV1;
      },
    };
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      auditLogRepository: createMemoryAuditLogRepository(),
    });
    const cookie = await loginAdmin(app);

    const invalidQuery = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-logs?actorAdminId=not-a-uuid',
      headers: { cookie },
    });
    expect(invalidQuery.statusCode).toBe(400);
    expect(invalidQuery.json()).toEqual({ error: 'Invalid audit log query' });

    const failClosedApp = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      auditLogRepository: invalidRepository,
    });
    const failClosedCookie = await loginAdmin(failClosedApp);
    const failClosed = await failClosedApp.inject({
      method: 'GET',
      url: '/api/admin/audit-logs',
      headers: { cookie: failClosedCookie },
    });
    expect(failClosed.statusCode).toBe(500);
  });
});
