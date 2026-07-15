import { randomUUID } from 'node:crypto';
import type {
  AdminImportJobOptionsV1,
  AdminImportJobStatusV1,
  AdminImportJobSummaryV1,
  AdminImportJobV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../../db/client.js';
import {
  initialProgress,
  type AdminImportJobRepository,
  type AdminImportJobRow,
  type CreateRunningImportJobInput,
  type QueryRows,
} from './types.js';

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
      if (!isRunnableStatus(records[index].status)) return null;

      records[index] = {
        ...records[index],
        status: 'succeeded',
        progress: input.progress,
        summary: input.summary,
        errorSummary: [],
        finishedAt: new Date().toISOString(),
      };

      return cloneJob(records[index]);
    },

    async failImportJob(input) {
      const index = records.findIndex((job) => job.id === input.jobId);
      if (index < 0) throw new Error(`Import job not found: ${input.jobId}`);
      if (!isRunnableStatus(records[index].status)) return null;

      records[index] = {
        ...records[index],
        status: 'failed',
        progress: { phase: 'failed', current: 0, total: 0 },
        errorSummary: [{ message: input.message }],
        finishedAt: new Date().toISOString(),
      };

      return cloneJob(records[index]);
    },

    async cancelImportJob(input) {
      const index = records.findIndex((job) => job.id === input.jobId);
      if (index < 0) return null;
      if (records[index].status === 'cancelled') return cloneJob(records[index]);
      if (!isRunnableStatus(records[index].status)) return null;

      records[index] = {
        ...records[index],
        status: 'cancelled',
        progress: { ...records[index].progress, phase: 'cancelled' },
        finishedAt: new Date().toISOString(),
      };

      return cloneJob(records[index]);
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
      const result = (await client.query(
        `
          WITH updated AS (
            UPDATE import_jobs
            SET status = 'succeeded',
                progress = $2::jsonb,
                summary = $3::jsonb,
                error_summary = '[]'::jsonb,
                finished_at = now()
            WHERE id = $1
              AND status IN ('queued', 'running')
            RETURNING *
          )
          SELECT
            updated.*,
            admin_users.display_name AS created_by_display_name
          FROM updated
          LEFT JOIN admin_users ON admin_users.id = updated.created_by_admin_id
        `,
        [input.jobId, JSON.stringify(input.progress), JSON.stringify(input.summary)],
      )) as QueryRows<AdminImportJobRow>;

      const row = result.rows[0];
      if (row) return mapImportJobRow(row);

      const job = await findPgImportJobById(client, input.jobId);
      if (!job) throw new Error(`Import job not found: ${input.jobId}`);
      return null;
    },

    async failImportJob(input) {
      const result = (await client.query(
        `
          WITH updated AS (
            UPDATE import_jobs
            SET status = 'failed',
                progress = $2::jsonb,
                error_summary = $3::jsonb,
                finished_at = now()
            WHERE id = $1
              AND status IN ('queued', 'running')
            RETURNING *
          )
          SELECT
            updated.*,
            admin_users.display_name AS created_by_display_name
          FROM updated
          LEFT JOIN admin_users ON admin_users.id = updated.created_by_admin_id
        `,
        [
          input.jobId,
          JSON.stringify({ phase: 'failed', current: 0, total: 0 }),
          JSON.stringify([{ message: input.message }]),
        ],
      )) as QueryRows<AdminImportJobRow>;

      const row = result.rows[0];
      if (row) return mapImportJobRow(row);

      const job = await findPgImportJobById(client, input.jobId);
      if (!job) throw new Error(`Import job not found: ${input.jobId}`);
      return null;
    },

    async cancelImportJob(input) {
      const before = await findPgImportJobById(client, input.jobId);
      if (!before) return null;
      if (before.status === 'cancelled') return before;
      if (!isRunnableStatus(before.status)) return null;

      await client.query(
        `
          UPDATE import_jobs
          SET status = 'cancelled',
              progress = jsonb_set(progress, '{phase}', '"cancelled"'::jsonb, true),
              finished_at = now()
          WHERE id = $1
            AND status IN ('queued', 'running')
        `,
        [input.jobId],
      );

      const after = await findPgImportJobById(client, input.jobId);
      if (!after) throw new Error(`Import job not found: ${input.jobId}`);
      return after.status === 'cancelled' ? after : null;
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

export function mapImportJobRow(row: AdminImportJobRow): AdminImportJobV1 {
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

function toImportJobProgress(value: unknown) {
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

export function cloneJob(job: AdminImportJobV1): AdminImportJobV1 {
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

function isRunnableStatus(status: AdminImportJobStatusV1): boolean {
  return status === 'queued' || status === 'running';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
