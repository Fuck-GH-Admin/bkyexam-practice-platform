import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAdminImportJobService,
  createMemoryAdminImportJobRepository,
  createPgAdminImportJobRepository,
  createPgQuestionBankImportRunner,
} from '../../src/admin/importJobs';
import type { AdminImportJobV1 } from '@bkyexam-practice/shared';
import type { PgPool, QueryClient } from '../../src/db/client';
import type { ImportedQuestionBankData } from '../../src/import/loadQuestionBankData';

interface RecordedQuery {
  sql: string;
  params?: readonly unknown[];
}

class FakeQueryClient implements QueryClient {
  queries: RecordedQuery[] = [];

  constructor(private readonly rows: unknown[][] = []) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.queries.push({ sql, params });
    return { rows: this.rows.shift() ?? [] };
  }
}

const jobId = '60000000-0000-4000-8000-000000000001';
const adminId = '50000000-0000-4000-8000-000000000001';
const allowedRoot = resolve('allowed-import-root');
const sourceDir = join(allowedRoot, 'questionbank');

const baseJob: AdminImportJobV1 = {
  id: jobId,
  kind: 'full_corpus_import',
  mode: 'dry_run',
  status: 'running',
  sourceDir,
  options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
  progress: { phase: 'running', current: 0, total: 0 },
  summary: {},
  errorSummary: [],
  createdBy: { id: adminId, displayName: 'Operator' },
  createdAt: '2026-07-13T10:00:00.000Z',
  startedAt: '2026-07-13T10:00:00.000Z',
  finishedAt: null,
};

describe('admin import job service', () => {
  it('runs dry-run jobs and records a completed summary', async () => {
    const repository = createMemoryAdminImportJobRepository();
    const service = createAdminImportJobService(repository, {
      allowedRoots: [allowedRoot],
      dryRun: async () => ({
        classifications: 1,
        questions: 2,
        rawOptions: 3,
        options: 2,
        skippedOptions: 1,
        bankMappings: 1,
        questionTypes: { single_choice: 2 },
      }),
    });

    const result = await service.createImportJob({
      request: {
        kind: 'full_corpus_import',
        mode: 'dry_run',
        sourceDir,
        options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
      },
      actor: { id: adminId, displayName: 'Operator', roles: ['operator'] },
    });

    expect(result).toMatchObject({
      status: 'created',
      job: {
        status: 'succeeded',
        progress: { phase: 'done', current: 2, total: 2 },
        summary: { questions: 2, skippedOptions: 1 },
      },
    });
  });

  it('rejects disallowed source roots, import mode, reset without super admin, and running conflicts', async () => {
    const runningRepository = createMemoryAdminImportJobRepository([baseJob]);
    const service = createAdminImportJobService(runningRepository, {
      allowedRoots: [allowedRoot],
      dryRun: async () => ({}),
    });
    const request = {
      kind: 'full_corpus_import' as const,
      mode: 'dry_run' as const,
      sourceDir,
      options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
    };
    const actor = { id: adminId, displayName: 'Operator', roles: ['operator'] };

    await expect(service.createImportJob({ request, actor })).resolves.toEqual({ status: 'running_conflict' });
    await expect(service.createImportJob({
      request: { ...request, sourceDir: join(resolve('other-import-root'), 'questionbank') },
      actor,
    })).resolves.toEqual({ status: 'source_dir_forbidden' });
    await expect(service.createImportJob({
      request: { ...request, mode: 'import' },
      actor,
    })).resolves.toEqual({ status: 'import_mode_not_enabled' });
    await expect(service.createImportJob({
      request: { ...request, options: { ...request.options, resetBeforeImport: true } },
      actor,
    })).resolves.toEqual({ status: 'reset_requires_super_admin' });
  });

  it('runs enabled import jobs through the write runner', async () => {
    const repository = createMemoryAdminImportJobRepository();
    const calls: Array<{ sourceDir: string; options: unknown }> = [];
    const service = createAdminImportJobService(repository, {
      allowedRoots: [allowedRoot],
      enableImportMode: true,
      importRun: async (receivedSourceDir, receivedOptions) => {
        calls.push({ sourceDir: receivedSourceDir, options: receivedOptions });
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
    });

    const result = await service.createImportJob({
      request: {
        kind: 'full_corpus_import',
        mode: 'import',
        sourceDir,
        options: { batchSize: 2, resetBeforeImport: false, generateMappings: false },
      },
      actor: { id: adminId, displayName: 'Operator', roles: ['operator'] },
    });

    expect(result).toMatchObject({
      status: 'created',
      job: {
        mode: 'import',
        status: 'succeeded',
        progress: { phase: 'done', current: 2, total: 2 },
        summary: { questions: 2, bankMappings: 1 },
      },
    });
    expect(calls).toEqual([{
      sourceDir,
      options: { batchSize: 2, resetBeforeImport: false, generateMappings: false },
    }]);
  });

  it('keeps resetBeforeImport disabled for enabled import mode', async () => {
    const service = createAdminImportJobService(createMemoryAdminImportJobRepository(), {
      allowedRoots: [allowedRoot],
      enableImportMode: true,
      importRun: async () => ({ questions: 0 }),
    });

    const request = {
      kind: 'full_corpus_import' as const,
      mode: 'import' as const,
      sourceDir,
      options: { batchSize: 1000, resetBeforeImport: true, generateMappings: true },
    };

    await expect(service.createImportJob({
      request,
      actor: { id: adminId, displayName: 'Super Admin', roles: ['super_admin'] },
    })).resolves.toEqual({ status: 'reset_import_not_enabled' });

    await expect(service.createImportJob({
      request,
      actor: { id: adminId, displayName: 'Operator', roles: ['operator'] },
    })).resolves.toEqual({ status: 'reset_requires_super_admin' });
  });

  it('records failed import runner errors on the created job', async () => {
    const repository = createMemoryAdminImportJobRepository();
    const service = createAdminImportJobService(repository, {
      allowedRoots: [allowedRoot],
      enableImportMode: true,
      importRun: async () => {
        throw new Error('write importer failed');
      },
    });

    const result = await service.createImportJob({
      request: {
        kind: 'full_corpus_import',
        mode: 'import',
        sourceDir,
        options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
      },
      actor: { id: adminId, displayName: 'Operator', roles: ['operator'] },
    });

    expect(result).toMatchObject({
      status: 'created',
      job: {
        mode: 'import',
        status: 'failed',
        progress: { phase: 'failed', current: 0, total: 0 },
        errorSummary: [{ message: 'write importer failed' }],
      },
    });
  });
});

describe('PostgreSQL question bank import runner', () => {
  it('loads source data, checks out one pool client, imports, and releases the client', async () => {
    const queryClient = new FakeQueryClient();
    const pool: PgPool = {
      async connect() {
        return {
          query: (sql, params) => queryClient.query(sql, params),
          release: () => {
            queryClient.queries.push({ sql: 'RELEASE' });
          },
        };
      },
      async end() {
        queryClient.queries.push({ sql: 'END' });
      },
    };
    const loadedData = questionBankData();
    const runner = createPgQuestionBankImportRunner(pool, {
      loadData: async (receivedSourceDir) => {
        expect(receivedSourceDir).toBe(sourceDir);
        return loadedData;
      },
      importData: async (client, data, options) => {
        await client.query('IMPORT', [options.batchSize, options.generateMappings]);
        expect(data).toBe(loadedData);
        return {
          classifications: 1,
          questions: 2,
          options: 1,
          skippedOptions: 0,
          bankMappings: 0,
        };
      },
    });

    await expect(runner(sourceDir, {
      batchSize: 5,
      resetBeforeImport: false,
      generateMappings: false,
    })).resolves.toEqual({
      classifications: 1,
      questions: 2,
      rawOptions: 3,
      options: 1,
      skippedOptions: 0,
      bankMappings: 0,
      questionTypes: { single_choice: 1, yes_no: 1 },
    });
    expect(queryClient.queries).toEqual([
      { sql: 'IMPORT', params: [5, false] },
      { sql: 'RELEASE' },
    ]);
  });
});

describe('PostgreSQL admin import job repository', () => {
  it('lists import jobs with filters and limit-plus-one pagination', async () => {
    const client = new FakeQueryClient([
      [
        createPgJobRow({ id: jobId }),
        createPgJobRow({ id: '60000000-0000-4000-8000-000000000002' }),
      ],
    ]);
    const repository = createPgAdminImportJobRepository(client);

    await expect(repository.listImportJobs({
      status: 'succeeded',
      createdBy: adminId,
      limit: 1,
      offset: 2,
    })).resolves.toMatchObject({
      jobs: [{ id: jobId }],
      page: { limit: 1, offset: 2, hasMore: true },
    });

    expect(client.queries[0].sql).toContain('FROM import_jobs');
    expect(client.queries[0].sql).toContain('import_jobs.status = $1');
    expect(client.queries[0].sql).toContain('import_jobs.created_by_admin_id = $2');
    expect(client.queries[0].sql).toContain('LIMIT $3');
    expect(client.queries[0].sql).toContain('OFFSET $4');
    expect(client.queries[0].params).toEqual(['succeeded', adminId, 2, 2]);
  });

  it('creates a running job only when no same-kind job is running', async () => {
    const client = new FakeQueryClient([[createPgJobRow({ status: 'running' })]]);
    const repository = createPgAdminImportJobRepository(client);

    await expect(repository.createRunningImportJob({
      kind: 'full_corpus_import',
      mode: 'dry_run',
      sourceDir,
      options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
      createdBy: { id: adminId, displayName: 'Operator', roles: ['operator'] },
    })).resolves.toMatchObject({
      status: 'created',
      job: { status: 'running', createdBy: { id: adminId } },
    });

    expect(client.queries[0].sql).toContain('WHERE NOT EXISTS');
    expect(client.queries[0].sql).toContain("status = 'running'");
  });
});

function createPgJobRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: jobId,
    kind: 'full_corpus_import',
    mode: 'dry_run',
    status: 'succeeded',
    source_dir: sourceDir,
    options: { batchSize: 1000, resetBeforeImport: false, generateMappings: true },
    progress: { phase: 'done', current: 2, total: 2 },
    summary: { classifications: 1, questions: 2, rawOptions: 3, options: 2, skippedOptions: 1, bankMappings: 1 },
    error_summary: [],
    created_by_admin_id: adminId,
    created_by_display_name: 'Operator',
    created_at: new Date('2026-07-13T10:00:00.000Z'),
    started_at: new Date('2026-07-13T10:00:00.000Z'),
    finished_at: new Date('2026-07-13T10:00:01.000Z'),
    ...overrides,
  };
}

function questionBankData(): ImportedQuestionBankData {
  return {
    classifications: [{
      id: '11000000-0000-4000-8000-000000000001',
      name: 'Runner Test Bank',
      parentId: null,
      qGroup: 1,
      sort: 1,
      isDeleted: false,
    }],
    questions: [
      {
        id: '12000000-0000-4000-8000-000000000001',
        classificationId: '11000000-0000-4000-8000-000000000001',
        qType: 1,
        normalizedType: 'single_choice',
        qGroup: 1,
        content: 'Runner question',
        answerRaw: '13000000-0000-4000-8000-000000000001',
        analyzeRaw: '',
        useCount: 1,
        difficulty: 0.1,
        searchableText: 'Runner question',
      },
      {
        id: '12000000-0000-4000-8000-000000000002',
        classificationId: '11000000-0000-4000-8000-000000000001',
        qType: 3,
        normalizedType: 'yes_no',
        qGroup: 1,
        content: 'Runner yes no',
        answerRaw: 'true',
        analyzeRaw: '',
        useCount: 1,
        difficulty: 0.1,
        searchableText: 'Runner yes no',
      },
    ],
    options: [
      {
        id: '13000000-0000-4000-8000-000000000001',
        questionId: '12000000-0000-4000-8000-000000000001',
        sort: 1,
        content: 'A',
      },
      {
        id: '13000000-0000-4000-8000-000000000002',
        questionId: '12000000-0000-4000-8000-000000000001',
        sort: 2,
        content: 'B',
      },
      {
        id: '13000000-0000-4000-8000-000000000003',
        questionId: '12000000-0000-4000-8000-000000000099',
        sort: 1,
        content: 'Orphan',
      },
    ],
    summary: {
      classifications: 1,
      questions: 2,
      options: 3,
      questionTypes: { single_choice: 1, yes_no: 1 },
    },
  };
}
