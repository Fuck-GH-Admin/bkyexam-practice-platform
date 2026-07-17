import type {
  AdminImportJobOptionsV1,
  AdminImportJobStatusV1,
  AdminImportJobSummaryV1,
  AdminImportJobV1,
} from '@bkyexam-practice/shared';
import type { AdminImportJobRow } from './types.js';

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
    workerId: row.worker_id ?? null,
    heartbeatAt: row.heartbeat_at ? toIsoTimestamp(row.heartbeat_at) : null,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
