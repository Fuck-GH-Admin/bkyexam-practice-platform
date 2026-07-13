import { describe, expect, it } from 'vitest';
import type { createSessionService } from '../../src/auth/session';
import { buildApp } from '../../src/app';
import type { StudentAuthRepository } from '../../src/auth/studentAuth';

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

function fakeStudentAuthRepository(): StudentAuthRepository {
  return {
    async findByLoginName(loginName) {
      return { id: 'student-1', loginName, displayName: 'Alice' };
    },
    async createStudent(student) {
      return { id: 'student-1', ...student };
    },
  };
}

describe('auth route', () => {
  it('creates and logs in a student', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      student: {
        loginName: 'alice',
        displayName: 'alice',
      },
    });
  });

  it('allows credentialed browser auth requests from the local web origin', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'http://localhost:5173' },
      payload: { loginName: 'alice' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('resolves /api/auth/me after a default local login', async () => {
    const app = buildApp();

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice' },
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
    });
  });

  it('returns 400 for an empty login name', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: '   ' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('fails closed when the auth repository returns an invalid student payload', async () => {
    const repository: StudentAuthRepository = {
      async findByLoginName(loginName) {
        return { loginName, displayName: '' };
      },
      async createStudent(student) {
        return student;
      },
    };
    const app = buildApp({ authRepository: repository });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice' },
    });

    expect(response.statusCode).toBe(500);
  });

  it('sets a httpOnly session cookie on login and returns /api/auth/me', async () => {
    const { service, createdSessionStudentIds } = fakeSessionService();
    const app = buildApp({ authRepository: fakeStudentAuthRepository(), sessionService: service });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice' },
    });
    const cookie = String(login.headers['set-cookie']);

    expect(login.statusCode).toBe(200);
    expect(login.json()).toEqual({ student: { loginName: 'alice', displayName: 'Alice' } });
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
    });
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
    const app = buildApp();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { loginName: 'alice' },
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
