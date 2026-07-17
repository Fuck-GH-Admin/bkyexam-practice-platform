import { describe, expect, it } from 'vitest';
import type {
  AdminManagedUserV1,
  AdminRoleV1,
  AdminUserListResponseV1,
} from '@bkyexam-practice/shared';
import { createAuditService, createMemoryAuditLogRepository } from '../../src/admin/audit';
import {
  createMemoryAdminUserRepository,
  type AdminUserRepository,
} from '../../src/admin/adminUsers';
import { createMemoryAdminAuthRepository } from '../../src/admin/auth';
import { hashPassword } from '../../src/auth/password';
import { buildApp } from '../../src/app';

const rootId = '50000000-0000-4000-8000-000000000001';
const operatorId = '50000000-0000-4000-8000-000000000002';
const backupRootId = '50000000-0000-4000-8000-000000000003';

async function adminAuthRepository(
  roles: AdminRoleV1[] = ['super_admin'],
  id = rootId,
  loginName = 'root@example.com',
  displayName = 'Root Admin',
) {
  return createMemoryAdminAuthRepository([{
    id,
    loginName,
    displayName,
    passwordHash: await hashPassword('secret123'),
    status: 'active',
    roles,
  }]);
}

async function loginAdmin(
  app: ReturnType<typeof buildApp>,
  loginName = 'root@example.com',
  password = 'secret123',
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/auth/login',
    payload: { loginName, password },
  });
  expect(response.statusCode).toBe(200);
  return String(response.headers['set-cookie']).split(';', 1)[0];
}

function adminUserFixture(overrides: Partial<AdminManagedUserV1> = {}): AdminManagedUserV1 {
  return {
    id: rootId,
    loginName: 'root@example.com',
    displayName: 'Root Admin',
    status: 'active',
    roles: ['super_admin'],
    permissions: [
      'admin:self:read',
      'bank_mapping:read',
      'bank_mapping:write',
      'bank_mapping:publish',
      'question_review:read',
      'question_review:write',
      'import_job:read',
      'import_job:create',
      'import_job:cancel',
      'import_job:retry',
      'system_status:read',
      'audit_log:read',
      'admin_user:manage',
    ],
    createdAt: '2026-07-14T10:00:00.000Z',
    updatedAt: '2026-07-14T10:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

describe('admin user routes', () => {
  it('requires an admin session before listing users', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/admin/users' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthenticated' });
  });

  it('requires admin_user:manage permission', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminUserRepository: createMemoryAdminUserRepository(),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });

  it('lists users with filters and reads detail', async () => {
    const repository = createMemoryAdminUserRepository([
      {
        id: rootId,
        loginName: 'root@example.com',
        displayName: 'Root Admin',
        passwordHash: 'hash',
        status: 'active',
        roles: ['super_admin'],
        createdAt: new Date('2026-07-14T10:00:00.000Z'),
      },
      {
        id: operatorId,
        loginName: 'operator@example.com',
        displayName: 'Import Operator',
        passwordHash: 'hash',
        status: 'active',
        roles: ['operator'],
        createdAt: new Date('2026-07-14T11:00:00.000Z'),
        lastLoginAt: new Date('2026-07-14T12:00:00.000Z'),
      },
    ]);
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminUserRepository: repository,
    });
    const cookie = await loginAdmin(app);

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/users?role=operator&status=active&keyword=import&limit=10&offset=0',
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      adminUsers: [{
        id: operatorId,
        loginName: 'operator@example.com',
        displayName: 'Import Operator',
        status: 'active',
        roles: ['operator'],
        permissions: expect.arrayContaining(['import_job:create']),
        lastLoginAt: '2026-07-14T12:00:00.000Z',
      }],
      page: { limit: 10, offset: 0, hasMore: false },
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/admin/users/${operatorId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().adminUser.id).toBe(operatorId);
    expect(JSON.stringify(detail.json())).not.toContain('passwordHash');
  });

  it('creates users, rejects duplicate loginName, and writes audit', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const repository = createMemoryAdminUserRepository([{
      id: rootId,
      loginName: 'root@example.com',
      displayName: 'Root Admin',
      passwordHash: 'hash',
      status: 'active',
      roles: ['super_admin'],
    }]);
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminUserRepository: repository,
      auditService: createAuditService(auditLogRepository),
    });
    const cookie = await loginAdmin(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie },
      payload: {
        loginName: 'operator2@example.com',
        displayName: 'Operator Two',
        password: 'secret123',
        roles: ['operator'],
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      adminUser: {
        loginName: 'operator2@example.com',
        displayName: 'Operator Two',
        status: 'active',
        roles: ['operator'],
        permissions: expect.arrayContaining(['import_job:create']),
      },
    });
    expect(JSON.stringify(created.json())).not.toContain('secret123');
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      actorAdminId: rootId,
      action: 'admin_user.create',
      resourceType: 'admin_user',
      after: {
        loginName: 'operator2@example.com',
        displayName: 'Operator Two',
        status: 'active',
        roles: ['operator'],
      },
      metadata: { passwordSet: true },
    });

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie },
      payload: {
        loginName: 'operator2@example.com',
        displayName: 'Operator Two',
        password: 'secret123',
        roles: ['operator'],
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: 'Admin loginName already exists' });
  });

  it('updates users, protects the last super_admin, and writes audit', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const repository = createMemoryAdminUserRepository([
      {
        id: rootId,
        loginName: 'root@example.com',
        displayName: 'Root Admin',
        passwordHash: 'hash',
        status: 'active',
        roles: ['super_admin'],
      },
      {
        id: backupRootId,
        loginName: 'backup@example.com',
        displayName: 'Backup Root',
        passwordHash: 'hash',
        status: 'disabled',
        roles: ['super_admin'],
      },
    ]);
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminUserRepository: repository,
      auditService: createAuditService(auditLogRepository),
    });
    const cookie = await loginAdmin(app);

    const blocked = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${rootId}`,
      headers: { cookie },
      payload: { status: 'disabled' },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ error: 'Cannot remove or disable the last active super_admin' });

    const backupEnabled = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${backupRootId}`,
      headers: { cookie },
      payload: { status: 'active' },
    });
    expect(backupEnabled.statusCode).toBe(200);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${rootId}`,
      headers: { cookie },
      payload: {
        displayName: 'Root Disabled',
        status: 'disabled',
        roles: ['operator'],
        password: 'newsecret123',
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      adminUser: {
        id: rootId,
        displayName: 'Root Disabled',
        status: 'disabled',
        roles: ['operator'],
      },
    });
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      actorAdminId: rootId,
      action: 'admin_user.update',
      resourceType: 'admin_user',
      resourceId: rootId,
      before: { displayName: 'Root Admin', status: 'active', roles: ['super_admin'] },
      after: { displayName: 'Root Disabled', status: 'disabled', roles: ['operator'] },
      metadata: { passwordChanged: true },
    });
  });

  it('returns 400/404 for invalid requests and missing users', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminUserRepository: createMemoryAdminUserRepository(),
    });
    const cookie = await loginAdmin(app);

    const invalidQuery = await app.inject({
      method: 'GET',
      url: '/api/admin/users?status=locked',
      headers: { cookie },
    });
    expect(invalidQuery.statusCode).toBe(400);
    expect(invalidQuery.json()).toEqual({ error: 'Invalid admin user query' });

    const invalidId = await app.inject({
      method: 'GET',
      url: '/api/admin/users/not-a-uuid',
      headers: { cookie },
    });
    expect(invalidId.statusCode).toBe(400);
    expect(invalidId.json()).toEqual({ error: 'Invalid admin user id' });

    const missing = await app.inject({
      method: 'GET',
      url: `/api/admin/users/${operatorId}`,
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'Admin user not found' });

    const invalidCreate = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie },
      payload: { loginName: 'bad@example.com', displayName: 'Bad', password: 'short', roles: ['operator'] },
    });
    expect(invalidCreate.statusCode).toBe(400);
    expect(invalidCreate.json()).toEqual({ error: 'Invalid admin user request' });

    const emptyPatch = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${operatorId}`,
      headers: { cookie },
      payload: {},
    });
    expect(emptyPatch.statusCode).toBe(400);
    expect(emptyPatch.json()).toEqual({ error: 'Invalid admin user request' });
  });

  it('fails closed when a repository returns an invalid admin user payload', async () => {
    const repository: AdminUserRepository = {
      async listAdminUsers(filters): Promise<AdminUserListResponseV1> {
        return {
          adminUsers: [adminUserFixture({ id: 'not-a-uuid' })],
          page: { limit: filters.limit, offset: filters.offset, hasMore: false },
        } as AdminUserListResponseV1;
      },
      async findAdminUserById() {
        return adminUserFixture({ id: 'not-a-uuid' });
      },
      async createAdminUser() {
        return { status: 'created', adminUser: adminUserFixture({ id: 'not-a-uuid' }) };
      },
      async updateAdminUser() {
        return {
          status: 'updated',
          before: adminUserFixture(),
          after: adminUserFixture({ id: 'not-a-uuid' }),
          passwordChanged: false,
        };
      },
    };
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminUserRepository: repository,
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(500);
  });
});
