import { randomUUID } from 'node:crypto';
import type { AdminImportJobStatusV1, AdminImportJobV1 } from '@bkyexam-practice/shared';
import {
  initialProgress,
  type AdminImportJobRepository,
  type CreateRunningImportJobInput,
} from './types.js';
import { cloneJob } from './jobMapper.js';


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

    async createQueuedImportJob(input) {
      if (records.some((job) => job.kind === input.kind && isActiveStatus(job.status))) {
        return { status: 'running_conflict' };
      }

      const job = createMemoryImportJob(input, 'queued');
      records.unshift(cloneJob(job));

      return { status: 'created', job: cloneJob(job) };
    },

    async createRunningImportJob(input) {
      if (records.some((job) => job.kind === input.kind && isActiveStatus(job.status))) {
        return { status: 'running_conflict' };
      }

      const job = createMemoryImportJob(input, 'running');
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
        workerId: null,
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
        workerId: null,
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
        workerId: null,
      };

      return cloneJob(records[index]);
    },

    async claimNextImportJob(input) {
      const runningKind = new Set(records.filter((job) => job.status === 'running').map((job) => job.kind));
      const queued = records
        .map((job, index) => ({ job, index }))
        .filter(({ job }) => job.status === 'queued' && !runningKind.has(job.kind))
        .sort((left, right) => left.job.createdAt.localeCompare(right.job.createdAt));
      const next = queued[0];
      if (!next) return null;

      const now = new Date().toISOString();
      records[next.index] = {
        ...records[next.index],
        status: 'running',
        progress: { ...records[next.index].progress, phase: 'running' },
        startedAt: records[next.index].startedAt ?? now,
        workerId: input.workerId,
        heartbeatAt: now,
      };

      return cloneJob(records[next.index]);
    },

    async heartbeatImportJob(input) {
      const index = records.findIndex((job) => (
        job.id === input.jobId
        && job.status === 'running'
        && job.workerId === input.workerId
      ));
      if (index < 0) return null;

      records[index] = {
        ...records[index],
        heartbeatAt: new Date().toISOString(),
      };

      return cloneJob(records[index]);
    },

    async recoverStaleImportJobs(input) {
      const now = input.now ?? new Date();
      const message = input.message ?? 'Import job heartbeat timed out';
      const recovered: AdminImportJobV1[] = [];

      for (let index = 0; index < records.length; index += 1) {
        const job = records[index];
        if (job.status !== 'running') continue;

        const lastSeenAt = new Date(job.heartbeatAt ?? job.startedAt ?? job.createdAt);
        if (now.getTime() - lastSeenAt.getTime() <= input.staleAfterMs) continue;

        records[index] = {
          ...job,
          status: 'failed',
          progress: { ...job.progress, phase: 'failed' },
          errorSummary: [{ message }],
          finishedAt: now.toISOString(),
          workerId: null,
        };
        recovered.push(cloneJob(records[index]));
      }

      return recovered;
    },
  };
}

function createMemoryImportJob(
  input: CreateRunningImportJobInput,
  status: 'queued' | 'running',
): AdminImportJobV1 {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    kind: input.kind,
    mode: input.mode,
    status,
    sourceDir: input.sourceDir,
    options: input.options,
    progress: initialProgress(status),
    summary: {},
    errorSummary: [],
    createdBy: { id: input.createdBy.id, displayName: input.createdBy.displayName },
    createdAt: now,
    startedAt: status === 'running' ? now : null,
    finishedAt: null,
    workerId: null,
    heartbeatAt: status === 'running' ? now : null,
  };
}

function isRunnableStatus(status: AdminImportJobStatusV1): boolean {
  return status === 'queued' || status === 'running';
}

function isActiveStatus(status: AdminImportJobStatusV1): boolean {
  return status === 'queued' || status === 'running';
}
