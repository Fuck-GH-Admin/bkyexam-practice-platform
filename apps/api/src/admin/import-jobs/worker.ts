import { randomUUID } from 'node:crypto';
import type { AdminImportJobSummaryV1, AdminImportJobV1 } from '@bkyexam-practice/shared';
import { isImportCancelledError } from '../../import/cancellation.js';
import { dryRunQuestionBankImport } from './runner.js';
import type {
  AdminImportJobRepository,
  AdminImportJobRunContext,
  AdminImportJobRunner,
} from './types.js';

export interface AdminImportJobWorker {
  readonly workerId: string;
  start(): void;
  stop(): Promise<void>;
  runOnce(): Promise<AdminImportJobV1 | null>;
  recoverStaleJobs(): Promise<AdminImportJobV1[]>;
}

export interface AdminImportJobWorkerOptions {
  workerId?: string;
  dryRun?: AdminImportJobRunner;
  importRun?: AdminImportJobRunner;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  staleAfterMs?: number;
  log?: (message: string, metadata?: Record<string, unknown>) => void;
}

export function createAdminImportJobWorker(
  repository: AdminImportJobRepository,
  options: AdminImportJobWorkerOptions = {},
): AdminImportJobWorker {
  const workerId = options.workerId ?? `import-worker-${randomUUID()}`;
  const dryRun = options.dryRun ?? dryRunQuestionBankImport;
  const importRun = options.importRun;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000;
  const staleAfterMs = options.staleAfterMs ?? 5 * 60_000;
  const log = options.log ?? (() => undefined);

  let stopped = true;
  let timer: NodeJS.Timeout | null = null;
  let activeTick: Promise<void> | null = null;

  async function recoverStaleJobs() {
    const recovered = await repository.recoverStaleImportJobs({ staleAfterMs });
    if (recovered.length > 0) {
      log('Recovered stale import jobs', { workerId, count: recovered.length });
    }
    return recovered;
  }

  async function runOnce() {
    await recoverStaleJobs();
    const job = await repository.claimNextImportJob({ workerId });
    if (!job) return null;

    return executeClaimedImportJob(repository, job, {
      workerId,
      dryRun,
      importRun,
      heartbeatIntervalMs,
      log,
    });
  }

  function schedule(delayMs: number) {
    if (stopped) return;
    timer = setTimeout(() => {
      activeTick = runOnce()
        .catch((error: unknown) => {
          log('Import job worker tick failed', {
            workerId,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .then(() => {
          activeTick = null;
          schedule(pollIntervalMs);
        });
    }, delayMs);
    timer.unref?.();
  }

  return {
    workerId,

    start() {
      if (!stopped) return;
      stopped = false;
      schedule(0);
    },

    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (activeTick) {
        await activeTick;
      }
    },

    runOnce,
    recoverStaleJobs,
  };
}

async function executeClaimedImportJob(
  repository: AdminImportJobRepository,
  job: AdminImportJobV1,
  options: {
    workerId: string;
    dryRun: AdminImportJobRunner;
    importRun?: AdminImportJobRunner;
    heartbeatIntervalMs: number;
    log: (message: string, metadata?: Record<string, unknown>) => void;
  },
): Promise<AdminImportJobV1> {
  const runner = job.mode === 'dry_run' ? options.dryRun : options.importRun;
  if (!runner) {
    const failed = await repository.failImportJob({
      jobId: job.id,
      message: 'Import mode is not enabled for import worker',
    });
    if (failed) return failed;
    throw new Error(`Import job could not be failed: ${job.id}`);
  }

  let heartbeatLost = false;
  const heartbeat = async () => {
    const current = await repository.heartbeatImportJob({ jobId: job.id, workerId: options.workerId });
    heartbeatLost = current === null;
  };
  await heartbeat();

  const heartbeatTimer = setInterval(() => {
    void heartbeat().catch((error: unknown) => {
      heartbeatLost = true;
      options.log('Import job heartbeat failed', {
        workerId: options.workerId,
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, options.heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  const context: AdminImportJobRunContext = {
    jobId: job.id,
    shouldAbort: async () => {
      if (heartbeatLost) return true;
      const current = await repository.findImportJobById(job.id);
      return current?.status === 'cancelled';
    },
  };

  try {
    const summary = await runner(job.sourceDir, job.options, context);
    return await completeImportJob(repository, job.id, summary);
  } catch (caught) {
    if (isImportCancelledError(caught)) {
      const cancelled = await repository.cancelImportJob({ jobId: job.id }) ?? await repository.findImportJobById(job.id);
      if (cancelled) return cancelled;
      throw new Error(`Import job not found: ${job.id}`);
    }

    const message = caught instanceof Error ? caught.message : String(caught);
    const failed = await repository.failImportJob({ jobId: job.id, message });
    if (failed) return failed;

    const current = await repository.findImportJobById(job.id);
    if (current?.status === 'cancelled') return current;
    throw new Error(`Import job could not be failed: ${job.id}`);
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function completeImportJob(
  repository: AdminImportJobRepository,
  jobId: string,
  summary: AdminImportJobSummaryV1,
): Promise<AdminImportJobV1> {
  const total = summary.questions ?? 0;
  const job = await repository.completeImportJob({
    jobId,
    progress: { phase: 'done', current: total, total },
    summary,
  });

  if (job) return job;

  const current = await repository.findImportJobById(jobId);
  if (current?.status === 'cancelled') return current;
  throw new Error(`Import job could not be completed: ${jobId}`);
}
