import {
  AdminImportJobV1Schema,
  type AdminImportJobEventTypeV1,
  type AdminImportJobEventV1,
  type AdminImportJobStatusV1,
  type AdminImportJobV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../../db/client.js';
import {
  initialProgress,
  type AdminImportJobRepository,
  type AdminImportJobEventRow,
  type AdminImportJobRow,
  type QueryRows,
} from './types.js';
import { mapImportJobRow } from './jobMapper.js';

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

    async createQueuedImportJob(input) {
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
              created_by_admin_id
            )
            SELECT
              $1,
              $2,
              'queued',
              $3,
              $4::jsonb,
              $5::jsonb,
              '{}'::jsonb,
              '[]'::jsonb,
              $6
            WHERE NOT EXISTS (
              SELECT 1
              FROM import_jobs
              WHERE kind = $1
                AND status IN ('queued', 'running')
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
          JSON.stringify(initialProgress('queued')),
          input.createdBy.id,
        ],
      )) as QueryRows<AdminImportJobRow>;
      const row = result.rows[0];

      if (!row) return { status: 'running_conflict' };
      const job = mapImportJobRow(row);
      await appendPgImportJobEvent(client, job, 'queued');
      return { status: 'created', job };
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
              started_at,
              heartbeat_at
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
              now(),
              now()
            WHERE NOT EXISTS (
              SELECT 1
              FROM import_jobs
              WHERE kind = $1
                AND status IN ('queued', 'running')
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

      if (!row) return { status: 'running_conflict' };
      const job = mapImportJobRow(row);
      await appendPgImportJobEvent(client, job, 'running');
      return { status: 'created', job };
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
                worker_id = NULL,
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
      if (row) {
        const job = mapImportJobRow(row);
        await appendPgImportJobEvent(client, job, 'succeeded');
        return job;
      }

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
                worker_id = NULL,
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
      if (row) {
        const job = mapImportJobRow(row);
        await appendPgImportJobEvent(client, job, 'failed');
        return job;
      }

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
              worker_id = NULL,
              finished_at = now()
          WHERE id = $1
            AND status IN ('queued', 'running')
        `,
        [input.jobId],
      );

      const after = await findPgImportJobById(client, input.jobId);
      if (!after) throw new Error(`Import job not found: ${input.jobId}`);
      if (after.status === 'cancelled') {
        await appendPgImportJobEvent(client, after, 'cancelled');
      }
      return after.status === 'cancelled' ? after : null;
    },

    async claimNextImportJob(input) {
      const result = (await client.query(
        `
          WITH candidate AS (
            SELECT import_jobs.id
            FROM import_jobs
            WHERE import_jobs.status = 'queued'
              AND NOT EXISTS (
                SELECT 1
                FROM import_jobs running
                WHERE running.kind = import_jobs.kind
                  AND running.status = 'running'
              )
            ORDER BY import_jobs.created_at ASC, import_jobs.id ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          ),
          updated AS (
            UPDATE import_jobs
            SET status = 'running',
                progress = jsonb_set(progress, '{phase}', '"running"'::jsonb, true),
                started_at = COALESCE(started_at, now()),
                worker_id = $1,
                heartbeat_at = now()
            WHERE id = (SELECT id FROM candidate)
            RETURNING *
          )
          SELECT
            updated.*,
            admin_users.display_name AS created_by_display_name
          FROM updated
          LEFT JOIN admin_users ON admin_users.id = updated.created_by_admin_id
        `,
        [input.workerId],
      )) as QueryRows<AdminImportJobRow>;
      const row = result.rows[0];

      if (!row) return null;
      const job = mapImportJobRow(row);
      await appendPgImportJobEvent(client, job, 'running');
      return job;
    },

    async heartbeatImportJob(input) {
      const result = (await client.query(
        `
          WITH updated AS (
            UPDATE import_jobs
            SET heartbeat_at = now()
            WHERE id = $1
              AND status = 'running'
              AND worker_id = $2
            RETURNING *
          )
          SELECT
            updated.*,
            admin_users.display_name AS created_by_display_name
          FROM updated
          LEFT JOIN admin_users ON admin_users.id = updated.created_by_admin_id
        `,
        [input.jobId, input.workerId],
      )) as QueryRows<AdminImportJobRow>;
      const row = result.rows[0];

      return row ? mapImportJobRow(row) : null;
    },

    async updateImportJobProgress(input) {
      const result = (await client.query(
        `
          WITH updated AS (
            UPDATE import_jobs
            SET progress = $2::jsonb
            WHERE id = $1
              AND status = 'running'
            RETURNING *
          )
          SELECT
            updated.*,
            admin_users.display_name AS created_by_display_name
          FROM updated
          LEFT JOIN admin_users ON admin_users.id = updated.created_by_admin_id
        `,
        [input.jobId, JSON.stringify(input.progress)],
      )) as QueryRows<AdminImportJobRow>;
      const row = result.rows[0];
      if (!row) return null;
      const job = mapImportJobRow(row);
      await appendPgImportJobEvent(client, job, 'progress');
      return job;
    },

    async listImportJobEvents(input) {
      const result = (await client.query(
        `
          SELECT id, job_id, event_type, payload, created_at
          FROM import_job_events
          WHERE job_id = $1
            AND id > $2::bigint
          ORDER BY id ASC
          LIMIT $3
        `,
        [input.jobId, input.afterEventId, input.limit],
      )) as QueryRows<AdminImportJobEventRow>;

      return result.rows.map(mapImportJobEventRow);
    },

    async recoverStaleImportJobs(input) {
      const message = input.message ?? 'Import job heartbeat timed out';
      const result = (await client.query(
        `
          WITH updated AS (
            UPDATE import_jobs
            SET status = 'failed',
                progress = jsonb_set(progress, '{phase}', '"failed"'::jsonb, true),
                error_summary = $2::jsonb,
                worker_id = NULL,
                finished_at = now()
            WHERE status = 'running'
              AND COALESCE(heartbeat_at, started_at, created_at) < now() - ($1::double precision * interval '1 millisecond')
            RETURNING *
          )
          SELECT
            updated.*,
            admin_users.display_name AS created_by_display_name
          FROM updated
          LEFT JOIN admin_users ON admin_users.id = updated.created_by_admin_id
        `,
        [input.staleAfterMs, JSON.stringify([{ message }])],
      )) as QueryRows<AdminImportJobRow>;

      const jobs = result.rows.map(mapImportJobRow);
      for (const job of jobs) {
        await appendPgImportJobEvent(client, job, 'recovered');
      }
      return jobs;
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

async function appendPgImportJobEvent(
  client: QueryClient,
  job: AdminImportJobV1,
  type: AdminImportJobEventTypeV1,
): Promise<void> {
  await client.query(
    `
      INSERT INTO import_job_events (job_id, event_type, payload)
      VALUES ($1, $2, $3::jsonb)
    `,
    [job.id, type, JSON.stringify({ job })],
  );
}

function mapImportJobEventRow(row: AdminImportJobEventRow): AdminImportJobEventV1 {
  const payload = isRecord(row.payload) ? row.payload : {};
  return {
    id: String(row.id),
    jobId: row.job_id,
    type: row.event_type,
    job: AdminImportJobV1Schema.parse(payload.job),
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRunnableStatus(status: AdminImportJobStatusV1): boolean {
  return status === 'queued' || status === 'running';
}
