import { describe, expect, it } from 'vitest';
import type {
  AdminRoleV1,
  AdminStudentListResponseV1,
  AdminStudentV1,
} from '@bkyexam-practice/shared';
import {
  createMemoryAdminStudentRepository,
  type AdminStudentRepository,
} from '../../src/admin/adminStudents';
import { createAuditService, createMemoryAuditLogRepository } from '../../src/admin/audit';
import { createMemoryAdminAuthRepository } from '../../src/admin/auth';
import { hashPassword } from '../../src/auth/password';
import { buildApp } from '../../src/app';

const rootId = '50000000-0000-4000-8000-000000000001';
const operatorId = '50000000-0000-4000-8000-000000000002';
const studentId = '60000000-0000-4000-8000-000000000001';
const secondStudentId = '60000000-0000-4000-8000-000000000002';

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

function studentFixture(overrides: Partial<AdminStudentV1> = {}): AdminStudentV1 {
  return {
    id: studentId,
    loginName: '202502040201',
    displayName: 'Student 201',
    className: '2班',
    groupName: null,
    status: 'active',
    passwordResetRequired: true,
    passwordChangedAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdBy: { id: rootId, displayName: 'Root Admin' },
    createdAt: '2026-07-15T10:00:00.000Z',
    updatedAt: '2026-07-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('admin student routes', () => {
  it('requires an admin session before listing students', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/admin/students' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthenticated' });
  });

  it('requires student account permissions', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['content_editor']),
      adminStudentRepository: createMemoryAdminStudentRepository(),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/students',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });

  it('lists students with filters and reads detail', async () => {
    const repository = createMemoryAdminStudentRepository([
      {
        id: studentId,
        loginName: '202502040201',
        displayName: 'Student 201',
        className: '2班',
        groupName: 'A组',
        status: 'active',
        passwordResetRequired: true,
        createdAt: new Date('2026-07-15T10:00:00.000Z'),
        createdByAdminId: rootId,
        createdByAdminDisplayName: 'Root Admin',
      },
      {
        id: secondStudentId,
        loginName: '202502040301',
        displayName: 'Student 301',
        className: null,
        groupName: null,
        status: 'disabled',
        passwordResetRequired: false,
        createdAt: new Date('2026-07-15T09:00:00.000Z'),
      },
    ]);
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminStudentRepository: repository,
    });
    const cookie = await loginAdmin(app);

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/students?status=active&className=2%E7%8F%AD&groupName=A%E7%BB%84&passwordResetRequired=true&keyword=201&limit=10&offset=0',
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      students: [{
        id: studentId,
        loginName: '202502040201',
        displayName: 'Student 201',
        className: '2班',
        groupName: 'A组',
        status: 'active',
        passwordResetRequired: true,
        createdBy: { id: rootId, displayName: 'Root Admin' },
      }],
      page: { limit: 10, offset: 0, hasMore: false },
    });
    expect(JSON.stringify(list.json())).not.toContain('passwordHash');

    const detail = await app.inject({
      method: 'GET',
      url: `/api/admin/students/${studentId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().student.id).toBe(studentId);
  });

  it('creates students, rejects duplicate loginName, and writes audit', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const repository = createMemoryAdminStudentRepository();
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminStudentRepository: repository,
      auditService: createAuditService(auditLogRepository),
    });
    const cookie = await loginAdmin(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/students',
      headers: { cookie },
      payload: {
        loginName: '202502040230',
        displayName: 'Student 230',
        initialPassword: 'temporary123',
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      student: {
        loginName: '202502040230',
        displayName: 'Student 230',
        className: '2班',
        status: 'active',
        passwordResetRequired: true,
        createdBy: { id: rootId, displayName: 'Root Admin' },
      },
    });
    expect(JSON.stringify(created.json())).not.toContain('temporary123');
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      actorAdminId: rootId,
      action: 'student_account.create',
      resourceType: 'student',
      after: {
        loginName: '202502040230',
        displayName: 'Student 230',
        className: '2班',
        groupName: null,
        status: 'active',
        passwordResetRequired: true,
      },
      metadata: { passwordSet: true },
    });

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/admin/students',
      headers: { cookie },
      payload: {
        loginName: '202502040230',
        initialPassword: 'temporary123',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: 'Student loginName already exists' });
  });

  it('bulk creates students with partial skipped/failed results and writes aggregate audit', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const repository = createMemoryAdminStudentRepository([{
      id: studentId,
      loginName: 'existing-student',
      displayName: 'Existing Student',
    }]);
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminStudentRepository: repository,
      auditService: createAuditService(auditLogRepository),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/students/bulk-create',
      headers: { cookie },
      payload: {
        students: [
          { loginName: '202502040201', displayName: 'Student 201' },
          { loginName: 'existing-student' },
          { loginName: '202502040201' },
        ],
        options: {
          defaultInitialPassword: 'temporary123',
          passwordResetRequired: true,
          skipExisting: true,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      created: [{ loginName: '202502040201', className: '2班' }],
      skipped: [{ loginName: 'existing-student', reason: 'loginName already exists' }],
      failed: [{ loginName: '202502040201', error: 'Duplicate loginName in request' }],
    });
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      actorAdminId: rootId,
      action: 'student_account.bulk_create',
      resourceType: 'student',
      resourceId: 'bulk',
      metadata: {
        requested: 3,
        created: 1,
        skipped: 1,
        failed: 1,
        skipExisting: true,
      },
    });
  });

  it('updates students, resets passwords, revokes sessions, and writes audit', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const repository = createMemoryAdminStudentRepository([{
      id: studentId,
      loginName: 'student-1',
      displayName: 'Student One',
      className: '1班',
      groupName: null,
      status: 'active',
      passwordResetRequired: false,
      activeSessionCount: 2,
    }]);
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminStudentRepository: repository,
      auditService: createAuditService(auditLogRepository),
    });
    const cookie = await loginAdmin(app);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/admin/students/${studentId}`,
      headers: { cookie },
      payload: {
        displayName: 'Student One Disabled',
        status: 'disabled',
        className: null,
        groupName: 'B组',
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      student: {
        id: studentId,
        displayName: 'Student One Disabled',
        status: 'disabled',
        className: null,
        groupName: 'B组',
      },
    });
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      actorAdminId: rootId,
      action: 'student_account.update',
      resourceId: studentId,
    });

    const reset = await app.inject({
      method: 'POST',
      url: `/api/admin/students/${studentId}/reset-password`,
      headers: { cookie },
      payload: {
        newPassword: 'newtemporary123',
        revokeExistingSessions: true,
      },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({
      student: {
        id: studentId,
        passwordResetRequired: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      revokedSessions: 2,
    });
    expect(JSON.stringify(reset.json())).not.toContain('newtemporary123');
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      actorAdminId: rootId,
      action: 'student_account.reset_password',
      resourceId: studentId,
      metadata: { passwordResetRequired: true, revokedSessions: 2 },
    });

    repository.students[0]!.activeSessionCount = 1;
    const revoke = await app.inject({
      method: 'POST',
      url: `/api/admin/students/${studentId}/revoke-sessions`,
      headers: { cookie },
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json()).toEqual({ studentId, revokedSessions: 1 });
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      actorAdminId: rootId,
      action: 'student_account.revoke_sessions',
      resourceId: studentId,
      metadata: { revokedSessions: 1 },
    });
  });

  it('returns 400/404 for invalid requests and missing students', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminStudentRepository: createMemoryAdminStudentRepository(),
    });
    const cookie = await loginAdmin(app);

    const invalidQuery = await app.inject({
      method: 'GET',
      url: '/api/admin/students?status=locked',
      headers: { cookie },
    });
    expect(invalidQuery.statusCode).toBe(400);
    expect(invalidQuery.json()).toEqual({ error: 'Invalid student account query' });

    const invalidId = await app.inject({
      method: 'GET',
      url: '/api/admin/students/not-a-uuid',
      headers: { cookie },
    });
    expect(invalidId.statusCode).toBe(400);
    expect(invalidId.json()).toEqual({ error: 'Invalid student id' });

    const missing = await app.inject({
      method: 'GET',
      url: `/api/admin/students/${studentId}`,
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'Student account not found' });

    const invalidCreate = await app.inject({
      method: 'POST',
      url: '/api/admin/students',
      headers: { cookie },
      payload: { loginName: 'student', initialPassword: 'short' },
    });
    expect(invalidCreate.statusCode).toBe(400);
    expect(invalidCreate.json()).toEqual({ error: 'Invalid student account request' });

    const invalidBulk = await app.inject({
      method: 'POST',
      url: '/api/admin/students/bulk-create',
      headers: { cookie },
      payload: { students: [{ loginName: 'student-without-password' }] },
    });
    expect(invalidBulk.statusCode).toBe(400);
    expect(invalidBulk.json()).toEqual({ error: 'Invalid bulk student account request' });

    const emptyPatch = await app.inject({
      method: 'PATCH',
      url: `/api/admin/students/${studentId}`,
      headers: { cookie },
      payload: {},
    });
    expect(emptyPatch.statusCode).toBe(400);
    expect(emptyPatch.json()).toEqual({ error: 'Invalid student account request' });

    const missingReset = await app.inject({
      method: 'POST',
      url: `/api/admin/students/${studentId}/reset-password`,
      headers: { cookie },
      payload: { newPassword: 'newtemporary123' },
    });
    expect(missingReset.statusCode).toBe(404);
    expect(missingReset.json()).toEqual({ error: 'Student account not found' });
  });

  it('fails closed when a repository returns an invalid student payload', async () => {
    const repository: AdminStudentRepository = {
      async listStudents(filters): Promise<AdminStudentListResponseV1> {
        return {
          students: [studentFixture({ id: 'not-a-uuid' })],
          page: { limit: filters.limit, offset: filters.offset, hasMore: false },
        } as AdminStudentListResponseV1;
      },
      async findStudentById() {
        return studentFixture({ id: 'not-a-uuid' });
      },
      async createStudent() {
        return { status: 'created', student: studentFixture({ id: 'not-a-uuid' }) };
      },
      async updateStudent() {
        return {
          status: 'updated',
          before: studentFixture(),
          after: studentFixture({ id: 'not-a-uuid' }),
        };
      },
      async resetStudentPassword() {
        return {
          status: 'updated',
          student: studentFixture({ id: 'not-a-uuid' }),
          revokedSessions: 0,
        };
      },
      async revokeStudentSessions() {
        return {
          status: 'revoked',
          student: studentFixture({ id: 'not-a-uuid' }),
          studentId: 'not-a-uuid',
          revokedSessions: 0,
        };
      },
    };
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminStudentRepository: repository,
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/students',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(500);
  });
});
