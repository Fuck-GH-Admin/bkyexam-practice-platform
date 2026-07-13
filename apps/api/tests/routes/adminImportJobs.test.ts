import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMemoryAuditLogRepository } from '../../src/admin/audit';
import { createMemoryAdminAuthRepository } from '../../src/admin/auth';
import { createMemoryAdminImportJobRepository } from '../../src/admin/importJobs';
import { hashPassword } from '../../src/auth/password';
import { buildApp } from '../../src/app';
import type { AdminImportJobV1 } from '@bkyexam-practice/shared';

const fixtureDir = resolve(fileURLToPath(new URL('../import/fixtures/compact-qtype/', import.meta.url)));
const adminId = '50000000-0000-4000-8000-000000000001';

async function adminAuthRepository(roles: Array<'content_editor' | 'operator' | 'super_admin'> = ['operator']) {
  return createMemoryAdminAuthRepository([{
    id: adminId,
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

describe('admin import job routes', () => {
  it('requires an admin session before listing import jobs', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/admin/import-jobs' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthenticated' });
  });

  it('creates a dry-run import job, writes audit, and reads it back', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const repository = createMemoryAdminImportJobRepository();
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminImportJobRepository: repository,
      adminImportAllowedRoots: [fixtureDir],
      auditService: { record: (input) => auditLogRepository.append({
        actorAdminId: input.actorAdminId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        before: input.before ?? null,
        after: input.after ?? null,
        metadata: input.metadata ?? {},
        result: input.result ?? 'success',
        createdAt: new Date('2026-07-13T10:00:00.000Z'),
      }) },
    });
    const cookie = await loginAdmin(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/import-jobs',
      headers: { cookie },
      payload: {
        kind: 'full_corpus_import',
        mode: 'dry_run',
        sourceDir: fixtureDir,
        options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
      },
    });

    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      job: {
        kind: 'full_corpus_import',
        mode: 'dry_run',
        status: 'succeeded',
        sourceDir: fixtureDir,
        progress: { phase: 'done', current: 2, total: 2 },
        summary: {
          classifications: 1,
          questions: 2,
          rawOptions: 1,
          options: 1,
          skippedOptions: 0,
          bankMappings: 1,
          questionTypes: { single_choice: 1, yes_no: 1 },
        },
        errorSummary: [],
        createdBy: { id: adminId, displayName: 'Operator' },
      },
    });
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      actorAdminId: adminId,
      action: 'import_job.create',
      resourceType: 'import_job',
      after: { kind: 'full_corpus_import', mode: 'dry_run', status: 'succeeded' },
      metadata: {
        options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
      },
    });

    const jobId = created.json().job.id as string;
    const detail = await app.inject({
      method: 'GET',
      url: `/api/admin/import-jobs/${jobId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().job.id).toBe(jobId);

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/import-jobs?status=succeeded&limit=10&offset=0',
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      jobs: [{ id: jobId, status: 'succeeded' }],
      page: { limit: 10, offset: 0, hasMore: false },
    });
  });

  it('returns 409 when a same-kind import job is already running', async () => {
    const runningJob: AdminImportJobV1 = {
      id: '60000000-0000-4000-8000-000000000001',
      kind: 'full_corpus_import',
      mode: 'dry_run',
      status: 'running',
      sourceDir: fixtureDir,
      options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
      progress: { phase: 'running', current: 0, total: 0 },
      summary: {},
      errorSummary: [],
      createdBy: { id: adminId, displayName: 'Operator' },
      createdAt: '2026-07-13T10:00:00.000Z',
      startedAt: '2026-07-13T10:00:00.000Z',
      finishedAt: null,
    };
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminImportJobRepository: createMemoryAdminImportJobRepository([runningJob]),
      adminImportAllowedRoots: [fixtureDir],
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/import-jobs',
      headers: { cookie },
      payload: {
        kind: 'full_corpus_import',
        mode: 'dry_run',
        sourceDir: fixtureDir,
        options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'Import job already running' });
  });

  it('returns 403 for disallowed roots and resetBeforeImport without super_admin', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminImportJobRepository: createMemoryAdminImportJobRepository(),
      adminImportAllowedRoots: [fixtureDir],
    });
    const cookie = await loginAdmin(app);

    const forbiddenRoot = await app.inject({
      method: 'POST',
      url: '/api/admin/import-jobs',
      headers: { cookie },
      payload: {
        kind: 'full_corpus_import',
        mode: 'dry_run',
        sourceDir: `${fixtureDir}-other`,
        options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
      },
    });
    expect(forbiddenRoot.statusCode).toBe(403);
    expect(forbiddenRoot.json()).toEqual({ error: 'Import source directory is not allowed' });

    const reset = await app.inject({
      method: 'POST',
      url: '/api/admin/import-jobs',
      headers: { cookie },
      payload: {
        kind: 'full_corpus_import',
        mode: 'dry_run',
        sourceDir: fixtureDir,
        options: { batchSize: 1000, resetBeforeImport: true, generateMappings: true },
      },
    });
    expect(reset.statusCode).toBe(403);
    expect(reset.json()).toEqual({ error: 'resetBeforeImport requires super_admin' });
  });

  it('returns 422 for import mode until the write importer is enabled', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminImportJobRepository: createMemoryAdminImportJobRepository(),
      adminImportAllowedRoots: [fixtureDir],
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/import-jobs',
      headers: { cookie },
      payload: {
        kind: 'full_corpus_import',
        mode: 'import',
        sourceDir: fixtureDir,
        options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: 'Import mode is not enabled yet' });
  });
});
