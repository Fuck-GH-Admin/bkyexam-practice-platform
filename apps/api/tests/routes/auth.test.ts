import { describe, expect, it } from 'vitest';
import type { createSessionService } from '../../src/auth/session';
import { hashPassword } from '../../src/auth/password';
import { buildApp } from '../../src/app';
import type { StudentAuthRecord, StudentAuthRepository } from '../../src/auth/studentAuth';

type SessionService = ReturnType<typeof createSessionService>;

function fakeSessionService(student = { id: 'student-1', loginName: 'alice', displayName: 'Alice' }) {
  const revokedTokens: string[] = [];
  const createdSessionStudentIds: string[] = [];
  const service: SessionService = {
    async createSession(studentId) {
      createdSessionStudentIds.push(studentId);
      return { token: 'session-token', expiresAt: new Date('2030-01-01T00:00:00.000Z') };
    },
    async resolveStudent(token) {
      return token ? student : null;
    },
    async revokeSession(token) {
      if (token) revokedTokens.push(token);
    },
  };

  return { service, createdSessionStudentIds, revokedTokens };
}

function createTestStudentAuthRepository(initialStudents: StudentAuthRecord[] = []): StudentAuthRepository {
  const students = new Map<string, StudentAuthRecord>();
  for (const student of initialStudents) {
    students.set(student.loginName, {
      id: student.id ?? student.loginName,
      className: null,
      groupName: null,
      status: 'active',
      passwordResetRequired: false,
      failedLoginCount: 0,
      failedLoginWindowStartedAt: null,
      lockedUntil: null,
      lastLoginAt: null,
      ...student,
    });
  }

  return {
    async findByLoginName(loginName) {
      return students.get(loginName) ?? null;
    },
    async findById(studentId) {
      return [...students.values()].find((student) => student.id === studentId) ?? null;
    },
    async createStudent(student) {
      const created: StudentAuthRecord = {
        id: student.loginName,
        loginName: student.loginName,
        displayName: student.displayName,
        passwordHash: student.passwordHash,
        className: student.className ?? null,
        groupName: student.groupName ?? null,
        status: 'active',
        passwordResetRequired: student.passwordResetRequired ?? false,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        lastLoginAt: null,
      };
      students.set(created.loginName, created);
      return created;
    },
    async recordLoginFailure(input) {
      const student = students.get(input.loginName);
      if (!student) return;
      students.set(input.loginName, {
        ...student,
        failedLoginCount: input.failedLoginCount,
        failedLoginWindowStartedAt: input.failedLoginWindowStartedAt,
        lockedUntil: input.lockedUntil,
      });
    },
    async recordLoginSuccess(input) {
      const student = students.get(input.loginName);
      if (!student) return;
      students.set(input.loginName, {
        ...student,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        lastLoginAt: input.now,
      });
    },
    async updateStudentPassword(input) {
      const student = [...students.values()].find((candidate) => candidate.id === input.studentId);
      if (!student) return null;
      const updated: StudentAuthRecord = {
        ...student,
        passwordHash: input.passwordHash,
        passwordResetRequired: false,
        passwordChangedAt: input.passwordChangedAt,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
      };
      students.set(updated.loginName, updated);
      return updated;
    },
  };
}

async function aliceRepository(overrides: Partial<StudentAuthRecord> = {}) {
  return createTestStudentAuthRepository([{
    id: 'alice',
    loginName: 'alice',
    displayName: 'Alice',
    passwordHash: await hashPassword('secret123'),
    className: null,
    groupName: null,
    status: 'active',
    passwordResetRequired: false,
    ...overrides,
  }]);
}

describe('auth route', () => {
  it('rejects passwordless login by default', async () => {
    const app = buildApp({ authRepository: await aliceRepository() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Student password is required' });
  });

  it('logs in a managed password student', async () => {
    const app = buildApp({ authRepository: await aliceRepository() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice', password: 'secret123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      student: {
        loginName: 'alice',
        displayName: 'Alice',
        className: null,
        groupName: null,
      },
      passwordResetRequired: false,
    });
  });

  it('allows legacy passwordless login only when the explicit flag is enabled', async () => {
    const app = buildApp({
      authRepository: createTestStudentAuthRepository([{ loginName: 'legacy', displayName: 'Legacy Student' }]),
      studentAuthOptions: { legacyPasswordlessLoginEnabled: true },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'legacy' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      student: { loginName: 'legacy', displayName: 'Legacy Student' },
      passwordResetRequired: false,
    });
  });

  it('returns the known className for the 202502040201-202502040230 student range', async () => {
    const app = buildApp({
      authRepository: createTestStudentAuthRepository([{
        id: '202502040230',
        loginName: '202502040230',
        displayName: 'Student 230',
        passwordHash: await hashPassword('temporary123'),
        className: '2班',
        groupName: null,
      }]),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: '202502040230', password: 'temporary123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      student: {
        loginName: '202502040230',
        displayName: 'Student 230',
        className: '2班',
        groupName: null,
      },
      passwordResetRequired: false,
    });
  });

  it('allows credentialed browser auth requests from the local web origin', async () => {
    const app = buildApp({ authRepository: await aliceRepository() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'http://localhost:5173' },
      payload: { loginName: 'alice', password: 'secret123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('resolves /api/auth/me after a password login', async () => {
    const app = buildApp({ authRepository: await aliceRepository() });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice', password: 'secret123' },
    });
    const cookie = String(login.headers['set-cookie']);

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({
      student: { id: 'alice', loginName: 'alice', displayName: 'alice' },
      passwordResetRequired: false,
    });
  });

  it('returns 400 for an empty login name', async () => {
    const app = buildApp({ authRepository: await aliceRepository() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: '   ', password: 'secret123' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('fails closed when the auth repository returns an invalid student payload', async () => {
    const app = buildApp({
      authRepository: createTestStudentAuthRepository([{
        id: 'student-1',
        loginName: 'alice',
        displayName: '',
        passwordHash: await hashPassword('secret123'),
      }]),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice', password: 'secret123' },
    });

    expect(response.statusCode).toBe(500);
  });

  it('sets a httpOnly session cookie on login and returns /api/auth/me', async () => {
    const { service, createdSessionStudentIds } = fakeSessionService();
    const app = buildApp({ authRepository: await aliceRepository({ id: 'student-1' }), sessionService: service });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice', password: 'secret123' },
    });
    const cookie = String(login.headers['set-cookie']);

    expect(login.statusCode).toBe(200);
    expect(login.json()).toEqual({
      student: { loginName: 'alice', displayName: 'Alice', className: null, groupName: null },
      passwordResetRequired: false,
    });
    expect(createdSessionStudentIds).toEqual(['student-1']);
    expect(cookie).toContain('bky_session=');
    expect(cookie).toContain('HttpOnly');

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({
      student: { id: 'student-1', loginName: 'alice', displayName: 'Alice' },
      passwordResetRequired: false,
    });
  });

  it('changes the current student password and clears reset-required state', async () => {
    const { service } = fakeSessionService({
      id: 'student-1',
      loginName: 'alice',
      displayName: 'Alice',
      passwordResetRequired: true,
    });
    const repository = await aliceRepository({ id: 'student-1', passwordResetRequired: true });
    const app = buildApp({ authRepository: repository, sessionService: service });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/password/change',
      headers: { cookie: 'bky_session=session-token' },
      payload: { currentPassword: 'secret123', newPassword: 'newsecret123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, passwordResetRequired: false });

    const oldPasswordLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice', password: 'secret123' },
    });
    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice', password: 'newsecret123' },
    });
    expect(newPasswordLogin.statusCode).toBe(200);
    expect(newPasswordLogin.json().passwordResetRequired).toBe(false);
  });

  it('requires a session and valid body for password change', async () => {
    const app = buildApp({ authRepository: await aliceRepository() });

    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/api/auth/password/change',
      payload: { currentPassword: 'secret123', newPassword: 'newsecret123' },
    });
    expect(unauthenticated.statusCode).toBe(401);

    const { service } = fakeSessionService();
    const sessionApp = buildApp({ authRepository: await aliceRepository({ id: 'student-1' }), sessionService: service });
    const invalid = await sessionApp.inject({
      method: 'POST',
      url: '/api/auth/password/change',
      headers: { cookie: 'bky_session=session-token' },
      payload: { currentPassword: 'secret123', newPassword: 'short' },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('returns 401 from /api/auth/me without a valid session cookie', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/auth/me' });

    expect(response.statusCode).toBe(401);
  });

  it('clears the session cookie and revokes the current session on logout', async () => {
    const { service, revokedTokens } = fakeSessionService();
    const app = buildApp({ sessionService: service });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: 'bky_session=session-token' },
    });
    const cookie = String(response.headers['set-cookie']);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(revokedTokens).toEqual(['session-token']);
    expect(cookie).toContain('bky_session=');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
  });

  it('rejects the same default local session cookie after logout', async () => {
    const app = buildApp({ authRepository: await aliceRepository() });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice', password: 'secret123' },
    });
    const cookie = String(login.headers['set-cookie']);

    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });

    expect(me.statusCode).toBe(401);
  });

  it('returns success for unauthenticated logout', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'POST', url: '/api/auth/logout' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
  });
});
