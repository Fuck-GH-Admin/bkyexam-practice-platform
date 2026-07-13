import { describe, expect, it } from 'vitest';
import type { AdminSystemStatusRepository } from '../../src/admin/systemStatus';
import { createMemoryAdminSystemStatusRepository } from '../../src/admin/systemStatus';
import { createMemoryAdminAuthRepository } from '../../src/admin/auth';
import { hashPassword } from '../../src/auth/password';
import { buildApp } from '../../src/app';
import type { AdminSystemStatusResponseV1 } from '@bkyexam-practice/shared';

const systemStatus: AdminSystemStatusResponseV1 = {
  api: { ok: true, service: 'bkyexam-practice-api', version: '0.1.0' },
  database: { ok: true, migrationCount: 5, currentMigration: '0005_admin_foundation.sql' },
  corpus: {
    classifications: 3,
    questions: 5,
    questionOptions: 8,
    bankMappings: 2,
    visibleBanks: 1,
  },
  imports: { tableExists: false, runningJobId: null, lastJob: null },
  quality: { tableExists: false, openFlags: 0, blockingFlags: 0, excludedQuestions: 0 },
};

async function adminAuthRepository(roles: Array<'content_editor' | 'operator' | 'super_admin'> = ['operator']) {
  return createMemoryAdminAuthRepository([{
    id: '50000000-0000-4000-8000-000000000001',
    loginName: 'operator@example.com',
    displayName: 'Operator',
    passwordHash: await hashPassword('secret'),
    status: 'active',
    roles,
  }]);
}

async function loginAdmin(app: ReturnType<typeof buildApp>) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/auth/login',
    payload: { loginName: 'operator@example.com', password: 'secret' },
  });
  expect(response.statusCode).toBe(200);
  return String(response.headers['set-cookie']).split(';', 1)[0];
}

describe('admin system status routes', () => {
  it('requires an admin session', async () => {
    const app = buildApp({
      adminSystemStatusRepository: createMemoryAdminSystemStatusRepository(systemStatus),
    });

    const response = await app.inject({ method: 'GET', url: '/api/admin/system/status' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthenticated' });
  });

  it('returns system status for admins with system_status:read', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminSystemStatusRepository: createMemoryAdminSystemStatusRepository(systemStatus),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/system/status',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(systemStatus);
  });

  it('returns 403 when the admin lacks system_status:read', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['content_editor']),
      adminSystemStatusRepository: createMemoryAdminSystemStatusRepository(systemStatus),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/system/status',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });

  it('fails closed when repository returns an invalid status payload', async () => {
    const repository: AdminSystemStatusRepository = {
      async getSystemStatus() {
        return {
          ...systemStatus,
          corpus: { ...systemStatus.corpus, questions: -1 },
        } as never;
      },
    };
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminSystemStatusRepository: repository,
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/system/status',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(500);
  });
});
