import type {
  AdminImportJobModeV1,
  AdminImportJobEventTypeV1,
  AdminImportJobEventV1,
  AdminImportJobOptionsV1,
  AdminImportJobProgressV1,
  AdminImportJobStatusV1,
  AdminImportJobSummaryV1,
  AdminImportJobV1,
  CreateAdminImportJobRequestV1,
  ListAdminImportJobsRequestV1,
} from '@bkyexam-practice/shared';

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

export type AdminImportJobExecutionMode = 'inline' | 'queued';

export type CancelImportJobResult =
  | { status: 'cancelled'; beforeStatus: AdminImportJobStatusV1; job: AdminImportJobV1 }
  | { status: 'not_found' }
  | { status: 'not_cancelable'; job: AdminImportJobV1 };

export type RetryImportJobResult =
  | { status: 'created'; sourceJob: AdminImportJobV1; job: AdminImportJobV1 }
  | { status: 'running_conflict'; sourceJob: AdminImportJobV1 }
  | { status: 'source_dir_forbidden'; sourceJob: AdminImportJobV1 }
  | { status: 'import_mode_not_enabled'; sourceJob: AdminImportJobV1 }
  | { status: 'reset_mode_not_enabled'; sourceJob: AdminImportJobV1 }
  | { status: 'reset_requires_super_admin'; sourceJob: AdminImportJobV1 }
  | { status: 'not_found' }
  | { status: 'not_retryable'; job: AdminImportJobV1 };

export interface AdminImportJobRepository {
  listImportJobs(filters: AdminImportJobListFilters): Promise<AdminImportJobPage>;
  findImportJobById(jobId: string): Promise<AdminImportJobV1 | null>;
  createQueuedImportJob(input: CreateRunningImportJobInput): Promise<CreateRunningImportJobResult>;
  createRunningImportJob(input: CreateRunningImportJobInput): Promise<CreateRunningImportJobResult>;
  completeImportJob(input: {
    jobId: string;
    progress: AdminImportJobProgressV1;
    summary: AdminImportJobSummaryV1;
  }): Promise<AdminImportJobV1 | null>;
  failImportJob(input: { jobId: string; message: string }): Promise<AdminImportJobV1 | null>;
  cancelImportJob(input: { jobId: string }): Promise<AdminImportJobV1 | null>;
  claimNextImportJob(input: { workerId: string }): Promise<AdminImportJobV1 | null>;
  heartbeatImportJob(input: { jobId: string; workerId: string }): Promise<AdminImportJobV1 | null>;
  updateImportJobProgress(input: {
    jobId: string;
    progress: AdminImportJobProgressV1;
  }): Promise<AdminImportJobV1 | null>;
  listImportJobEvents(input: {
    jobId: string;
    afterEventId: string;
    limit: number;
  }): Promise<AdminImportJobEventV1[]>;
  recoverStaleImportJobs(input: { staleAfterMs: number; now?: Date; message?: string }): Promise<AdminImportJobV1[]>;
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
    | { status: 'reset_mode_not_enabled' }
    | { status: 'reset_requires_super_admin' }
  >;
  cancelImportJob(jobId: string): Promise<CancelImportJobResult>;
  retryImportJob(input: {
    jobId: string;
    actor: AdminImportJobActor;
  }): Promise<RetryImportJobResult>;
}

export interface AdminImportJobRunContext {
  jobId: string;
  shouldAbort: () => boolean | Promise<boolean>;
  reportProgress?: (progress: AdminImportJobProgressV1) => void | Promise<void>;
}

export type AdminImportJobRunner = (
  sourceDir: string,
  options: AdminImportJobOptionsV1,
  context?: AdminImportJobRunContext,
) => Promise<AdminImportJobSummaryV1>;

export interface AdminImportJobServiceOptions {
  allowedRoots?: readonly string[];
  dryRun?: AdminImportJobRunner;
  importRun?: AdminImportJobRunner;
  enableImportMode?: boolean;
  enableResetMode?: boolean;
  executionMode?: AdminImportJobExecutionMode;
}

export interface QueryRows<T> {
  rows: T[];
}

export interface AdminImportJobRow {
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
  worker_id?: string | null;
  heartbeat_at?: Date | string | null;
}

export interface AdminImportJobEventRow {
  id: string | number;
  job_id: string;
  event_type: AdminImportJobEventTypeV1;
  payload: unknown;
  created_at: Date | string;
}

export function initialProgress(phase: 'queued' | 'running' = 'running'): AdminImportJobProgressV1 {
  return { phase, current: 0, total: 0 };
}
