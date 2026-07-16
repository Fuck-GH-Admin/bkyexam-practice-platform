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

    const events = await app.inject({
      method: 'GET',
      url: `/api/admin/import-jobs/${jobId}/events?afterEventId=0&limit=100`,
      headers: { cookie, accept: 'application/json' },
    });
    expect(events.statusCode).toBe(200);
    expect(events.json().events).toEqual(expect.arrayContaining([
      expect.objectContaining({ jobId, type: 'running' }),
      expect.objectContaining({ jobId, type: 'progress' }),
      expect.objectContaining({ jobId, type: 'succeeded', job: expect.objectContaining({ status: 'succeeded' }) }),
    ]));
    expect(Number(events.json().lastEventId)).toBeGreaterThan(0);

    const errors = await app.inject({
      method: 'GET',
      url: `/api/admin/import-jobs/${jobId}/errors`,
      headers: { cookie },
    });
    expect(errors.statusCode).toBe(200);
    expect(errors.json()).toEqual({
      jobId,
      status: 'succeeded',
      errorSummary: [],
    });

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
    expect(response.json()).toEqual({ error: 'Import job already queued or running' });
  });

  it('can create queued jobs for the durable worker execution mode', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminImportJobRepository: createMemoryAdminImportJobRepository(),
      adminImportAllowedRoots: [fixtureDir],
      adminImportExecutionMode: 'queued',
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

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      job: {
        mode: 'dry_run',
        status: 'queued',
        progress: { phase: 'queued', current: 0, total: 0 },
        startedAt: null,
      },
    });
  });

  it('honors generateMappings=false in dry-run summaries', async () => {
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
        mode: 'dry_run',
        sourceDir: fixtureDir,
        options: { batchSize: 1000, resetBeforeImport: false, generateMappings: false },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      job: {
        mode: 'dry_run',
        status: 'succeeded',
        summary: { questions: 2, bankMappings: 0 },
      },
    });
  });

  it('reads failed import job error reports', async () => {
    const failedJob: AdminImportJobV1 = {
      id: '60000000-0000-4000-8000-000000000002',
      kind: 'full_corpus_import',
      mode: 'dry_run',
      status: 'failed',
      sourceDir: fixtureDir,
      options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
      progress: { phase: 'failed', current: 0, total: 0 },
      summary: {},
      errorSummary: [{ message: 'Failed to parse source file', file: 'questions.xlsx' }],
      createdBy: { id: adminId, displayName: 'Operator' },
      createdAt: '2026-07-13T10:00:00.000Z',
      startedAt: '2026-07-13T10:00:00.000Z',
      finishedAt: '2026-07-13T10:00:01.000Z',
    };
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminImportJobRepository: createMemoryAdminImportJobRepository([failedJob]),
      adminImportAllowedRoots: [fixtureDir],
    });
    const cookie = await loginAdmin(app);

    const report = await app.inject({
      method: 'GET',
      url: `/api/admin/import-jobs/${failedJob.id}/errors`,
      headers: { cookie },
    });
    expect(report.statusCode).toBe(200);
    expect(report.json()).toEqual({
      jobId: failedJob.id,
      status: 'failed',
      errorSummary: [{ message: 'Failed to parse source file', file: 'questions.xlsx' }],
    });

    const missing = await app.inject({
      method: 'GET',
      url: '/api/admin/import-jobs/60000000-0000-4000-8000-000000000099/errors',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'Import job not found' });
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

  it('creates enabled import jobs through the configured import runner', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const repository = createMemoryAdminImportJobRepository();
    const calls: Array<{ sourceDir: string; options: unknown }> = [];
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminImportJobRepository: repository,
      adminImportAllowedRoots: [fixtureDir],
      adminImportModeEnabled: true,
      adminImportRunner: async (sourceDir, options) => {
        calls.push({ sourceDir, options });
        return {
          classifications: 1,
          questions: 2,
          rawOptions: 1,
          options: 1,
          skippedOptions: 0,
          bankMappings: 1,
          questionTypes: { single_choice: 1, yes_no: 1 },
        };
      },
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

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/import-jobs',
      headers: { cookie },
      payload: {
        kind: 'full_corpus_import',
        mode: 'import',
        sourceDir: fixtureDir,
        options: { batchSize: 10, resetBeforeImport: false, generateMappings: true },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      job: {
        mode: 'import',
        status: 'succeeded',
        progress: { phase: 'done', current: 2, total: 2 },
        summary: { classifications: 1, questions: 2, bankMappings: 1 },
      },
    });
    expect(calls).toEqual([{
      sourceDir: fixtureDir,
      options: { batchSize: 10, resetBeforeImport: false, generateMappings: true },
    }]);
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      actorAdminId: adminId,
      action: 'import_job.create',
      after: { kind: 'full_corpus_import', mode: 'import', status: 'succeeded' },
    });
  });

  it('allows resetBeforeImport for enabled import mode and super_admin', async () => {
    const calls: Array<{ sourceDir: string; options: unknown }> = [];
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminImportJobRepository: createMemoryAdminImportJobRepository(),
      adminImportAllowedRoots: [fixtureDir],
      adminImportModeEnabled: true,
      adminImportResetEnabled: true,
      adminImportRunner: async (sourceDir, options) => {
        calls.push({ sourceDir, options });
        return { questions: 0 };
      },
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
        options: { batchSize: 1000, resetBeforeImport: true, generateMappings: true },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      job: {
        mode: 'import',
        status: 'succeeded',
        options: { resetBeforeImport: true },
      },
    });
    expect(calls).toEqual([{
      sourceDir: fixtureDir,
      options: { batchSize: 1000, resetBeforeImport: true, generateMappings: true },
    }]);
  });

  it('returns 422 for resetBeforeImport until the separate maintenance gate is enabled', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminImportJobRepository: createMemoryAdminImportJobRepository(),
      adminImportAllowedRoots: [fixtureDir],
      adminImportModeEnabled: true,
      adminImportRunner: async () => ({ questions: 0 }),
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
        options: { batchSize: 1000, resetBeforeImport: true, generateMappings: true },
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: 'Import reset mode is not enabled' });
  });

  it('cancels running import jobs and retries cancelled jobs', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const runningJob: AdminImportJobV1 = {
      id: '60000000-0000-4000-8000-000000000003',
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

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/admin/import-jobs/${runningJob.id}/cancel`,
      headers: { cookie },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({
      job: {
        id: runningJob.id,
        status: 'cancelled',
        progress: { phase: 'cancelled' },
      },
    });
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      action: 'import_job.cancel',
      resourceId: runningJob.id,
      before: { status: 'running' },
      after: { status: 'cancelled' },
    });

    const retried = await app.inject({
      method: 'POST',
      url: `/api/admin/import-jobs/${runningJob.id}/retry`,
      headers: { cookie },
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toMatchObject({
      job: {
        mode: 'dry_run',
        status: 'succeeded',
        summary: { questions: 2, bankMappings: 1 },
      },
    });
    expect(retried.json().job.id).not.toBe(runningJob.id);
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      action: 'import_job.retry',
      metadata: {
        sourceJobId: runningJob.id,
        sourceStatus: 'cancelled',
      },
    });
  });
});
