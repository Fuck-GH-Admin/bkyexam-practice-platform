import { isAbsolute, relative, resolve } from 'node:path';
import type { AdminImportJobStatusV1, CreateAdminImportJobRequestV1 } from '@bkyexam-practice/shared';
import { isImportCancelledError } from '../../import/cancellation.js';
import { dryRunQuestionBankImport } from './runner.js';
import type {
  AdminImportJobActor,
  AdminImportJobRepository,
  AdminImportJobRunContext,
  AdminImportJobRunner,
  AdminImportJobService,
  AdminImportJobServiceOptions,
  CancelImportJobResult,
  RetryImportJobResult,
} from './types.js';

export function createAdminImportJobService(
  repository: AdminImportJobRepository,
  options: AdminImportJobServiceOptions = {},
): AdminImportJobService {
  const allowedRoots = (options.allowedRoots ?? []).map((root) => resolve(root));
  const dryRun = options.dryRun ?? dryRunQuestionBankImport;
  const importRun = options.importRun;
  const enableImportMode = options.enableImportMode ?? false;
  const enableResetMode = options.enableResetMode ?? false;
  const executionMode = options.executionMode ?? 'inline';

  async function createImportJob({
    request,
    actor,
  }: {
    request: CreateAdminImportJobRequestV1;
    actor: AdminImportJobActor;
  }) {
    if (request.mode === 'import' && (!enableImportMode || (executionMode === 'inline' && !importRun))) {
      return { status: 'import_mode_not_enabled' as const };
    }

    if (request.options.resetBeforeImport && !actor.roles.includes('super_admin')) {
      return { status: 'reset_requires_super_admin' as const };
    }
    if (request.options.resetBeforeImport && !enableResetMode) {
      return { status: 'reset_mode_not_enabled' as const };
    }

    const sourceDir = resolve(request.sourceDir);
    if (!isAllowedSourceDir(sourceDir, allowedRoots)) {
      return { status: 'source_dir_forbidden' as const };
    }

    const created = await (executionMode === 'queued'
      ? repository.createQueuedImportJob({
        kind: request.kind,
        mode: request.mode,
        sourceDir,
        options: request.options,
        createdBy: actor,
      })
      : repository.createRunningImportJob({
        kind: request.kind,
        mode: request.mode,
        sourceDir,
        options: request.options,
        createdBy: actor,
      }));
    if (created.status !== 'created') {
      return created;
    }

    if (executionMode === 'queued') {
      return created;
    }

    const runner = request.mode === 'dry_run' ? dryRun : importRun;
    if (!runner) {
      return { status: 'import_mode_not_enabled' as const };
    }

    return executeImportJob(repository, created.job.id, sourceDir, request, runner);
  }

  return {
    listImportJobs(filters) {
      return repository.listImportJobs(filters);
    },

    findImportJobById(jobId) {
      return repository.findImportJobById(jobId);
    },

    createImportJob,

    async cancelImportJob(jobId): Promise<CancelImportJobResult> {
      const before = await repository.findImportJobById(jobId);
      if (!before) {
        return { status: 'not_found' };
      }
      if (before.status === 'cancelled') {
        return { status: 'cancelled', beforeStatus: before.status, job: before };
      }
      if (!isRunnableStatus(before.status)) {
        return { status: 'not_cancelable', job: before };
      }

      const cancelled = await repository.cancelImportJob({ jobId });
      if (cancelled) {
        return { status: 'cancelled', beforeStatus: before.status, job: cancelled };
      }

      const current = await repository.findImportJobById(jobId);
      if (!current) {
        return { status: 'not_found' };
      }
      if (current.status === 'cancelled') {
        return { status: 'cancelled', beforeStatus: before.status, job: current };
      }

      return { status: 'not_cancelable', job: current };
    },

    async retryImportJob({ jobId, actor }): Promise<RetryImportJobResult> {
      const sourceJob = await repository.findImportJobById(jobId);
      if (!sourceJob) {
        return { status: 'not_found' };
      }
      if (sourceJob.status !== 'failed' && sourceJob.status !== 'cancelled') {
        return { status: 'not_retryable', job: sourceJob };
      }

      const result = await createImportJob({
        request: {
          kind: sourceJob.kind,
          mode: sourceJob.mode,
          sourceDir: sourceJob.sourceDir,
          options: sourceJob.options,
        },
        actor,
      });

      return { ...result, sourceJob };
    },
  };
}

async function executeImportJob(
  repository: AdminImportJobRepository,
  jobId: string,
  sourceDir: string,
  request: CreateAdminImportJobRequestV1,
  runner: AdminImportJobRunner,
) {
  const context: AdminImportJobRunContext = {
    jobId,
    shouldAbort: async () => {
      const current = await repository.findImportJobById(jobId);
      return current?.status === 'cancelled';
    },
    reportProgress: async (progress) => {
      const current = await repository.updateImportJobProgress({ jobId, progress });
      if (!current) {
        throw new Error(`Import job is no longer running: ${jobId}`);
      }
    },
  };

  try {
    const summary = await runner(sourceDir, request.options, context);
    const total = summary.questions ?? 0;
    const job = await repository.completeImportJob({
      jobId,
      progress: { phase: 'done', current: total, total },
      summary,
    });

    if (job) {
      return { status: 'created' as const, job };
    }

    const current = await repository.findImportJobById(jobId);
    if (current?.status === 'cancelled') {
      return { status: 'created' as const, job: current };
    }
    throw new Error(`Import job could not be completed: ${jobId}`);
  } catch (caught) {
    if (isImportCancelledError(caught)) {
      const job = await repository.cancelImportJob({ jobId }) ?? await repository.findImportJobById(jobId);
      if (job) {
        return { status: 'created' as const, job };
      }
      throw new Error(`Import job not found: ${jobId}`);
    }

    const message = caught instanceof Error ? caught.message : String(caught);
    const failed = await repository.failImportJob({ jobId, message });
    if (failed) {
      return { status: 'created' as const, job: failed };
    }

    const current = await repository.findImportJobById(jobId);
    if (current?.status === 'cancelled') {
      return { status: 'created' as const, job: current };
    }
    throw new Error(`Import job could not be failed: ${jobId}`);
  }
}

function isAllowedSourceDir(sourceDir: string, allowedRoots: readonly string[]) {
  return allowedRoots.some((root) => {
    const relativePath = relative(root, sourceDir);
    return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
  });
}

function isRunnableStatus(status: AdminImportJobStatusV1): boolean {
  return status === 'queued' || status === 'running';
}
