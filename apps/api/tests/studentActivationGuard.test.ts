import { describe, expect, it } from 'vitest';
import type { createSessionService } from '../src/auth/session';
import { buildApp } from '../src/app';

type SessionService = ReturnType<typeof createSessionService>;

function passwordResetSessionService(): SessionService {
  return {
    async createSession() {
      return { token: 'token', expiresAt: new Date('2030-01-01T00:00:00.000Z') };
    },
    async resolveStudent(token) {
      return token
        ? {
            id: 'student-1',
            loginName: 'student-1',
            displayName: 'Student One',
            passwordResetRequired: true,
          }
        : null;
    },
    async revokeSession() {},
  };
}

describe('student activation guard', () => {
  it.each([
    '/api/practice/sessions?status=active',
    '/api/wrong-questions',
    '/api/learning/dashboard',
  ])('blocks protected student API %s until the temporary password is changed', async (url) => {
    const app = buildApp({ sessionService: passwordResetSessionService() });

    const response = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: 'bky_session=token' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'Password change required',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  });

  it('keeps activation and public catalog endpoints available', async () => {
    const app = buildApp({ sessionService: passwordResetSessionService() });

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: 'bky_session=token' },
    });
    const banks = await app.inject({
      method: 'GET',
      url: '/api/banks',
      headers: { cookie: 'bky_session=token' },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      student: { id: 'student-1' },
      passwordResetRequired: true,
    });
    expect(banks.statusCode).toBe(200);
  });
});
