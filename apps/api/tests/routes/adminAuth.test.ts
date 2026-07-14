import { describe, expect, it } from 'vitest';
import { createAdminAuthService, createMemoryAdminAuthRepository } from '../../src/admin/auth';
import { createAuditService, createMemoryAuditLogRepository } from '../../src/admin/audit';
import { createAdminSessionService } from '../../src/admin/session';
import { hashPassword } from '../../src/auth/password';
import { buildApp } from '../../src/app';

type AdminSessionService = ReturnType<typeof createAdminSessionService>;

async function adminRepository(status: 'active' | 'disabled' = 'active') {
  return createMemoryAdminAuthRepository([{
    id: 'admin-1',
    loginName: 'operator@example.com',
    displayName: 'Operator',
    passwordHash: await hashPassword('secret'),
    status,
    roles: ['operator'],
  }]);
}

describe('admin auth routes', () => {
  it('logs in an admin, restores /api/admin/me, and keeps student/admin cookies isolated', async () => {
    const auditRepository = createMemoryAuditLogRepository();
    const app = buildApp({
      adminAuthRepository: await adminRepository(),
      auditService: createAuditService(auditRepository),
      adminSessionTtlHours: 8,
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { loginName: 'operator@example.com', password: 'secret' },
    });
    const cookie = String(login.headers['set-cookie']);

    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({
      admin: {
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
      },
      expiresAt: expect.any(String),
    });
    expect(cookie).toContain('bky_admin_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).not.toContain('bky_session=');

    const adminMe = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie },
    });

    expect(adminMe.statusCode).toBe(200);
    expect(adminMe.json()).toMatchObject({
      admin: { id: 'admin-1', loginName: 'operator@example.com' },
      expiresAt: expect.any(String),
    });

    const studentMeWithAdminCookie = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(studentMeWithAdminCookie.statusCode).toBe(401);

    const adminMeWithStudentCookie = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: 'bky_session=student-session-token' },
    });
    expect(adminMeWithStudentCookie.statusCode).toBe(401);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/logout',
      headers: { cookie },
    });

    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ success: true });
    expect(String(logout.headers['set-cookie'])).toContain('bky_admin_session=');
    expect(String(logout.headers['set-cookie'])).toContain('Max-Age=0');

    const afterLogout = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie },
    });
    expect(afterLogout.statusCode).toBe(401);

    expect(auditRepository.entries.map((entry) => [entry.action, entry.result, entry.actorAdminId])).toEqual([
      ['admin.auth.login', 'success', 'admin-1'],
      ['admin.auth.logout', 'success', 'admin-1'],
    ]);
  });

  it('returns 400 when admin password is missing', async () => {
    const app = buildApp({ adminAuthRepository: await adminRepository() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { loginName: 'operator@example.com' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid admin login request' });
  });

  it('returns 401 and writes failure audit for invalid admin credentials', async () => {
    const auditRepository = createMemoryAuditLogRepository();
    const app = buildApp({
      adminAuthRepository: await adminRepository(),
      auditService: createAuditService(auditRepository),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { loginName: 'operator@example.com', password: 'wrong' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Invalid admin credentials' });
    expect(auditRepository.entries).toMatchObject([{
      actorAdminId: null,
      action: 'admin.auth.login',
      resourceType: 'admin_user',
      resourceId: 'operator@example.com',
      result: 'failure',
      metadata: { loginName: 'operator@example.com', reason: 'invalid_credentials' },
    }]);
  });

  it('returns 403 for disabled admin users', async () => {
    const app = buildApp({ adminAuthRepository: await adminRepository('disabled') });

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { loginName: 'operator@example.com', password: 'secret' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Admin user disabled' });
  });

  it('returns 403 when a valid admin session lacks the required permission', async () => {
    const forbiddenSessionService: AdminSessionService = {
      async createSession(admin) {
        return { token: `token-for-${admin.id}`, expiresAt: new Date('2030-01-01T00:00:00.000Z') };
      },
      async resolveAdmin(token) {
        if (!token) return null;
        return {
          admin: {
            id: 'admin-1',
            loginName: 'no-role@example.com',
            displayName: 'No Role',
            roles: [],
            permissions: [],
          },
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        };
      },
      async revokeSession() {},
    };
    const app = buildApp({ adminSessionService: forbiddenSessionService });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: 'bky_admin_session=token' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });

  it('keeps unauthenticated admin logout idempotent', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'POST', url: '/api/admin/auth/logout' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(String(response.headers['set-cookie'])).toContain('bky_admin_session=');
    expect(String(response.headers['set-cookie'])).toContain('Max-Age=0');
  });

  it('does not create a default admin in local memory mode', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { loginName: 'operator@example.com', password: 'secret' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('admin route dependencies', () => {
  it('can use the admin auth service with an injected repository', async () => {
    const repository = await adminRepository();
    const service = createAdminAuthService(repository);

    await expect(service.login({
      loginName: 'operator@example.com',
      password: 'secret',
    })).resolves.toMatchObject({
      id: 'admin-1',
      permissions: expect.arrayContaining(['admin:self:read']),
    });
  });
});
