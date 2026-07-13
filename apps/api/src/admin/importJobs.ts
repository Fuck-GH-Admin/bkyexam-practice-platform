import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import type {
  AdminImportJobModeV1,
  AdminImportJobOptionsV1,
  AdminImportJobProgressV1,
  AdminImportJobStatusV1,
  AdminImportJobSummaryV1,
  AdminImportJobV1,
  CreateAdminImportJobRequestV1,
  ListAdminImportJobsRequestV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../db/client.js';
import { loadQuestionBankData } from '../import/loadQuestionBankData.js';
import { generateBankMappings } from '../mapping/generateBankMappings.js';

export type AdminImportJobListFilters = ListAdminImportJobsRequestV1;

export interface AdminImportJobPage {
  jobs: AdminImportJobV1[];
  page: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AdminImportJobActor {
  id: string;
  displayName: string;
  roles: string[];
}

export interface CreateRunningImportJobInput {
  kind: CreateAdminImportJobRequestV1['kind'];
  mode: AdminImportJobModeV1;
  sourceDir: string;
  options: AdminImportJobOptionsV1;
  createdBy: AdminImportJobActor;
}

export type CreateRunningImportJobResult =
  | { status: 'created'; job: AdminImportJobV1 }
  | { status: 'running_conflict' };

export interface AdminImportJobRepository {
  listImportJobs(filters: AdminImportJobListFilters): Promise<AdminImportJobPage>;
  findImportJobById(jobId: string): Promise<AdminImportJobV1 | null>;
  createRunningImportJob(input: CreateRunningImportJobInput): Promise<CreateRunningImportJobResult>;
  completeImportJob(input: {
    jobId: string;
    progress: AdminImportJobProgressV1;
    summary: AdminImportJobSummaryV1;
  }): Promise<AdminImportJobV1>;
  failImportJob(input: { jobId: string; message: string }): Promise<AdminImportJobV1>;
}

export interface AdminImportJobService {
  listImportJobs(filters: AdminImportJobListFilters): Promise<AdminImportJobPage>;
  findImportJobById(jobId: string): Promise<AdminImportJobV1 | null>;
  createImportJob(input: {
    request: CreateAdminImportJobRequestV1;
    actor: AdminImportJobActor;
  }): Promise<
    | { status: 'created'; job: AdminImportJobV1 }
    | { status: 'running_conflict' }
    | { status: 'source_dir_forbidden' }
    | { status: 'import_mode_not_enabled' }
    | { status: 'reset_requires_super_admin' }
  >;
}

export interface AdminImportJobServiceOptions {
  allowedRoots?: readonly string[];
  dryRun?: (sourceDir: string, options: AdminImportJobOptionsV1) => Promise<AdminImportJobSummaryV1>;
}

interface QueryRows<T> {
  rows: T[];
}

interface AdminImportJobRow {
  id: string;
  kind: string;
  mode: string;
  status: string;
  source_dir: string;
  options: unknown;
  progress: unknown;
  summary: unknown;
  error_summary: unknown;
  created_by_admin_id: string | null;
  created_by_display_name: string | null;
  created_at: Date | string;
  started_at: Date | string | null;
  finished_at: Date | string | null;
}

function initialProgress(): AdminImportJobProgressV1 {
  return { phase: 'running', current: 0, total: 0 };
}

export function createMemoryAdminImportJobRepository(
  jobs: readonly AdminImportJobV1[] = [],
): AdminImportJobRepository {
  const records = jobs.map(cloneJob);

  return {
    async listImportJobs(filters) {
      const filtered = records.filter((job) => {
        if (filters.status && job.status !== filters.status) return false;
        if (filters.createdBy && job.createdBy?.id !== filters.createdBy) return false;
        return true;
      });
      const pageItems = filtered.slice(filters.offset, filters.offset + filters.limit + 1);

      return {
        jobs: pageItems.slice(0, filters.limit).map(cloneJob),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: pageItems.length > filters.limit,
        },
      };
    },

    async findImportJobById(jobId) {
      const job = records.find((candidate) => candidate.id === jobId);
      return job ? cloneJob(job) : null;
    },

    async createRunningImportJob(input) {
      if (records.some((job) => job.kind === input.kind && job.status === 'running')) {
        return { status: 'running_conflict' };
      }

      const now = new Date().toISOString();
      const job: AdminImportJobV1 = {
        id: randomUUID(),
        kind: input.kind,
        mode: input.mode,
        status: 'running',
        sourceDir: input.sourceDir,
        options: input.options,
        progress: initialProgress(),
        summary: {},
        errorSummary: [],
        createdBy: { id: input.createdBy.id, displayName: input.createdBy.displayName },
        createdAt: now,
        startedAt: now,
        finishedAt: null,
      };
      records.unshift(cloneJob(job));

      return { status: 'created', job: cloneJob(job) };
    },

    async completeImportJob(input) {
      const index = records.findIndex((job) => job.id === input.jobId);
      if (index < 0) throw new Error(`Import job not found: ${input.jobId}`);

      records[index] = {
        ...records[index],
        status: 'succeeded',
        progress: input.progress,
        summary: input.summary,
        finishedAt: new Date().toISOString(),
      };

      return cloneJob(records[index]);
    },

    async failImportJob(input) {
      const index = records.findIndex((job) => job.id === input.jobId);
      if (index < 0) throw new Error(`Import job not found: ${input.jobId}`);

      records[index] = {
        ...records[index],
        status: 'failed',
        progress: { phase: 'failed', current: 0, total: 0 },
        errorSummary: [{ message: input.message }],
        finishedAt: new Date().toISOString(),
      };

      return cloneJob(records[index]);
    },
  };
}

export function createAdminImportJobService(
  repository: AdminImportJobRepository,
  options: AdminImportJobServiceOptions = {},
): AdminImportJobService {
  const allowedRoots = (options.allowedRoots ?? []).map((root) => resolve(root));
  const dryRun = options.dryRun ?? dryRunQuestionBankImport;

  return {
    listImportJobs(filters) {
      return repository.listImportJobs(filters);
    },

    findImportJobById(jobId) {
      return repository.findImportJobById(jobId);
    },

    async createImportJob({ request, actor }) {
      if (request.mode !== 'dry_run') {
        return { status: 'import_mode_not_enabled' };
      }

      if (request.options.resetBeforeImport && !actor.roles.includes('super_admin')) {
        return { status: 'reset_requires_super_admin' };
      }

      const sourceDir = resolve(request.sourceDir);
      if (!isAllowedSourceDir(sourceDir, allowedRoots)) {
        return { status: 'source_dir_forbidden' };
      }

      const created = await repository.createRunningImportJob({
        kind: request.kind,
        mode: request.mode,
        sourceDir,
        options: request.options,
        createdBy: actor,
      });
      if (created.status !== 'created') {
        return created;
      }

      try {
        const summary = await dryRun(sourceDir, request.options);
        const total = summary.questions ?? 0;
        const job = await repository.completeImportJob({
          jobId: created.job.id,
          progress: { phase: 'done', current: total, total },
          summary,
        });

        return { status: 'created', job };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        const job = await repository.failImportJob({ jobId: created.job.id, message });
        return { status: 'created', job };
      }
    },
  };
}

export function createPgAdminImportJobRepository(client: QueryClient): AdminImportJobRepository {
  return {
    async listImportJobs(filters) {
      const params: unknown[] = [];
      const where: string[] = [];

      if (filters.status) {
        params.push(filters.status);
        where.push(`import_jobs.status = $${params.length}`);
      }
      if (filters.createdBy) {
        params.push(filters.createdBy);
        where.push(`import_jobs.created_by_admin_id = $${params.length}`);
      }

      params.push(filters.limit + 1);
      const limitPlaceholder = `$${params.length}`;
      params.push(filters.offset);
      const offsetPlaceholder = `$${params.length}`;

      const result = (await client.query(
        `
          SELECT
            import_jobs.*,
            admin_users.display_name AS created_by_display_name
          FROM import_jobs
          LEFT JOIN admin_users ON admin_users.id = import_jobs.created_by_admin_id
          WHERE ${where.length > 0 ? where.join(' AND ') : 'TRUE'}
          ORDER BY import_jobs.created_at DESC, import_jobs.id DESC
          LIMIT ${limitPlaceholder}
          OFFSET ${offsetPlaceholder}
        `,
        params,
      )) as QueryRows<AdminImportJobRow>;
      const pageRows = result.rows.slice(0, filters.limit);

      return {
        jobs: pageRows.map(mapImportJobRow),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: result.rows.length > filters.limit,
        },
      };
    },

    async findImportJobById(jobId) {
      return findPgImportJobById(client, jobId);
    },

    async createRunningImportJob(input) {
      const result = (await client.query(
        `
          WITH inserted AS (
            INSERT INTO import_jobs (
              kind,
              mode,
              status,
              source_dir,
              options,
              progress,
              summary,
              error_summary,
              created_by_admin_id,
              started_at
            )
            SELECT
              $1,
              $2,
              'running',
              $3,
              $4::jsonb,
              $5::jsonb,
              '{}'::jsonb,
              '[]'::jsonb,
              $6,
              now()
            WHERE NOT EXISTS (
              SELECT 1
              FROM import_jobs
              WHERE kind = $1
                AND status = 'running'
            )
            RETURNING *
          )
          SELECT
            inserted.*,
            admin_users.display_name AS created_by_display_name
          FROM inserted
          LEFT JOIN admin_users ON admin_users.id = inserted.created_by_admin_id
        `,
        [
          input.kind,
          input.mode,
          input.sourceDir,
          JSON.stringify(input.options),
          JSON.stringify(initialProgress()),
          input.createdBy.id,
        ],
      )) as QueryRows<AdminImportJobRow>;
      const row = result.rows[0];

      return row ? { status: 'created', job: mapImportJobRow(row) } : { status: 'running_conflict' };
    },

    async completeImportJob(input) {
      await client.query(
        `
          UPDATE import_jobs
          SET status = 'succeeded',
              progress = $2::jsonb,
              summary = $3::jsonb,
              error_summary = '[]'::jsonb,
              finished_at = now()
          WHERE id = $1
        `,
        [input.jobId, JSON.stringify(input.progress), JSON.stringify(input.summary)],
      );

      const job = await findPgImportJobById(client, input.jobId);
      if (!job) throw new Error(`Import job not found: ${input.jobId}`);
      return job;
    },

    async failImportJob(input) {
      await client.query(
        `
          UPDATE import_jobs
          SET status = 'failed',
              progress = $2::jsonb,
              error_summary = $3::jsonb,
              finished_at = now()
          WHERE id = $1
        `,
        [
          input.jobId,
          JSON.stringify({ phase: 'failed', current: 0, total: 0 }),
          JSON.stringify([{ message: input.message }]),
        ],
      );

      const job = await findPgImportJobById(client, input.jobId);
      if (!job) throw new Error(`Import job not found: ${input.jobId}`);
      return job;
    },
  };
}

async function findPgImportJobById(client: QueryClient, jobId: string) {
  const result = (await client.query(
    `
      SELECT
        import_jobs.*,
        admin_users.display_name AS created_by_display_name
      FROM import_jobs
      LEFT JOIN admin_users ON admin_users.id = import_jobs.created_by_admin_id
      WHERE import_jobs.id = $1
      LIMIT 1
    `,
    [jobId],
  )) as QueryRows<AdminImportJobRow>;
  const row = result.rows[0];

  return row ? mapImportJobRow(row) : null;
}

async function dryRunQuestionBankImport(
  sourceDir: string,
  _options: AdminImportJobOptionsV1,
): Promise<AdminImportJobSummaryV1> {
  const data = await loadQuestionBankData(sourceDir);
  const bankMappings = generateBankMappings(data.classifications, data.questions);
  const questionIds = new Set(data.questions.map((question) => question.id));
  const importableOptions = data.options.filter((option) => questionIds.has(option.questionId));

  return {
    classifications: data.classifications.length,
    questions: data.questions.length,
    rawOptions: data.options.length,
    options: importableOptions.length,
    skippedOptions: data.options.length - importableOptions.length,
    bankMappings: bankMappings.length,
    questionTypes: data.summary.questionTypes,
  };
}

function mapImportJobRow(row: AdminImportJobRow): AdminImportJobV1 {
  return {
    id: row.id,
    kind: row.kind as AdminImportJobV1['kind'],
    mode: row.mode as AdminImportJobV1['mode'],
    status: row.status as AdminImportJobStatusV1,
    sourceDir: row.source_dir,
    options: toImportJobOptions(row.options),
    progress: toImportJobProgress(row.progress),
    summary: toImportJobSummary(row.summary),
    errorSummary: toImportJobErrorSummary(row.error_summary),
    createdBy: row.created_by_admin_id && row.created_by_display_name
      ? { id: row.created_by_admin_id, displayName: row.created_by_display_name }
      : null,
    createdAt: toIsoTimestamp(row.created_at),
    startedAt: row.started_at ? toIsoTimestamp(row.started_at) : null,
    finishedAt: row.finished_at ? toIsoTimestamp(row.finished_at) : null,
  };
}

function toImportJobOptions(value: unknown): AdminImportJobOptionsV1 {
  const options = isRecord(value) ? value : {};
  return {
    batchSize: Number(options.batchSize ?? 1_000),
    resetBeforeImport: Boolean(options.resetBeforeImport ?? false),
    generateMappings: Boolean(options.generateMappings ?? true),
  };
}

function toImportJobProgress(value: unknown): AdminImportJobProgressV1 {
  const progress = isRecord(value) ? value : {};
  return {
    phase: String(progress.phase ?? 'queued'),
    current: Number(progress.current ?? 0),
    total: Number(progress.total ?? 0),
  };
}

function toImportJobSummary(value: unknown): AdminImportJobSummaryV1 {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === 'questionTypes' && isRecord(entry)
        ? Object.fromEntries(Object.entries(entry).map(([type, count]) => [type, Number(count)]))
        : Number(entry),
    ]),
  ) as AdminImportJobSummaryV1;
}

function toImportJobErrorSummary(value: unknown): AdminImportJobV1['errorSummary'] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (isRecord(entry) && typeof entry.message === 'string') return { ...entry, message: entry.message };
    return { message: String(entry) };
  });
}

function cloneJob(job: AdminImportJobV1): AdminImportJobV1 {
  return {
    ...job,
    options: { ...job.options },
    progress: { ...job.progress },
    summary: {
      ...job.summary,
      questionTypes: job.summary.questionTypes ? { ...job.summary.questionTypes } : undefined,
    },
    errorSummary: job.errorSummary.map((entry) => ({ ...entry })),
    createdBy: job.createdBy ? { ...job.createdBy } : null,
  };
}

function isAllowedSourceDir(sourceDir: string, allowedRoots: readonly string[]) {
  return allowedRoots.some((root) => {
    const relativePath = relative(root, sourceDir);
    return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
