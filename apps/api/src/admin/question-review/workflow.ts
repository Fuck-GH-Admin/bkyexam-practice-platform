import type {
  AdminQuestionOverrideDiffEntryV1,
  AdminQuestionOverrideRevisionOptionV1,
  AdminQuestionOverrideRevisionV1,
  AdminQuestionReviewDetailV1,
  UpdateAdminQuestionOverrideRequestV1,
} from '@bkyexam-practice/shared';
import type { QuestionOverrideRevisionRow } from './types.js';
import { toIsoTimestamp } from './mappers.js';

export interface QuestionOverrideSnapshot {
  contentOverride: string | null;
  answerRawOverride: string | null;
  analyzeRawOverride: string | null;
  optionContentOverrides: AdminQuestionOverrideRevisionOptionV1[];
}

export function currentOverrideSnapshot(question: AdminQuestionReviewDetailV1): QuestionOverrideSnapshot {
  return {
    contentOverride: question.override?.contentOverride ?? null,
    answerRawOverride: question.override?.answerRawOverride ?? null,
    analyzeRawOverride: question.override?.analyzeRawOverride ?? null,
    optionContentOverrides: question.options
      .filter((option) => option.overrideContent !== null)
      .map((option) => ({ optionId: option.id, content: option.overrideContent as string })),
  };
}

export function mergeDraftSnapshot(
  question: AdminQuestionReviewDetailV1,
  activeRevision: AdminQuestionOverrideRevisionV1 | null,
  changes: UpdateAdminQuestionOverrideRequestV1,
): QuestionOverrideSnapshot {
  const base = activeRevision?.status === 'draft'
    ? revisionSnapshot(activeRevision)
    : currentOverrideSnapshot(question);
  const optionOverrides = new Map(
    base.optionContentOverrides.map((option) => [option.optionId, option.content]),
  );
  for (const option of changes.optionContentOverrides) {
    optionOverrides.set(option.optionId, option.content);
  }

  return {
    contentOverride: changes.content ?? base.contentOverride,
    answerRawOverride: changes.answerRaw ?? base.answerRawOverride,
    analyzeRawOverride: changes.analyzeRaw === undefined
      ? base.analyzeRawOverride
      : changes.analyzeRaw,
    optionContentOverrides: [...optionOverrides]
      .map(([optionId, content]) => ({ optionId, content }))
      .sort((left, right) => left.optionId.localeCompare(right.optionId)),
  };
}

export function revisionSnapshot(revision: AdminQuestionOverrideRevisionV1): QuestionOverrideSnapshot {
  return {
    contentOverride: revision.contentOverride,
    answerRawOverride: revision.answerRawOverride,
    analyzeRawOverride: revision.analyzeRawOverride,
    optionContentOverrides: revision.optionContentOverrides.map((option) => ({ ...option })),
  };
}

export function attachWorkflow(
  question: AdminQuestionReviewDetailV1,
  revisions: readonly AdminQuestionOverrideRevisionV1[],
): AdminQuestionReviewDetailV1 {
  const cloned = revisions.map(cloneRevision);
  return {
    ...question,
    workflow: {
      activeRevision: cloned.find((revision) => (
        revision.status === 'draft' || revision.status === 'pending_review'
      )) ?? null,
      revisions: cloned,
    },
  };
}

export function mapRevisionRow(
  row: QuestionOverrideRevisionRow,
  question: AdminQuestionReviewDetailV1,
): AdminQuestionOverrideRevisionV1 {
  const revision: AdminQuestionOverrideRevisionV1 = {
    id: row.id,
    questionId: row.question_id,
    version: Number(row.version),
    baseVersion: Number(row.base_version),
    status: row.status as AdminQuestionOverrideRevisionV1['status'],
    contentOverride: row.content_override,
    answerRawOverride: row.answer_raw_override,
    analyzeRawOverride: row.analyze_raw_override,
    optionContentOverrides: parseOptionOverrides(row.option_content_overrides),
    note: row.note,
    diff: parseDiff(row.diff),
    createdBy: row.created_by_admin_id && row.created_by_display_name
      ? { id: row.created_by_admin_id, displayName: row.created_by_display_name }
      : null,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    submittedAt: row.submitted_at ? toIsoTimestamp(row.submitted_at) : null,
    reviewedBy: row.reviewed_by_admin_id && row.reviewed_by_display_name
      ? { id: row.reviewed_by_admin_id, displayName: row.reviewed_by_display_name }
      : null,
    reviewedAt: row.reviewed_at ? toIsoTimestamp(row.reviewed_at) : null,
    reviewNote: row.review_note,
    appliedVersion: row.applied_version === null ? null : Number(row.applied_version),
    rollbackFromRevisionId: row.rollback_from_revision_id,
  };
  if (revision.diff.length === 0 && (revision.status === 'draft' || revision.status === 'pending_review')) {
    revision.diff = buildOverrideDiff(question, revision);
  }
  return revision;
}

export function buildOverrideDiff(
  question: AdminQuestionReviewDetailV1,
  snapshot: QuestionOverrideSnapshot,
): AdminQuestionOverrideDiffEntryV1[] {
  const source = question.source ?? {
    content: question.override?.contentOverride === null ? question.content : question.content,
    answerRaw: question.override?.answerRawOverride === null ? question.answerRaw : question.answerRaw,
    analyzeRaw: question.override?.analyzeRawOverride === null ? question.analyzeRaw : question.analyzeRaw,
  };
  const entries: AdminQuestionOverrideDiffEntryV1[] = [];

  addDiff(entries, 'content', '题干', question.content, snapshot.contentOverride ?? source.content);
  addDiff(entries, 'answerRaw', '答案原文', question.answerRaw, snapshot.answerRawOverride ?? source.answerRaw);
  addDiff(entries, 'analyzeRaw', '解析', question.analyzeRaw, snapshot.analyzeRawOverride ?? source.analyzeRaw);

  const proposedOptions = new Map(
    snapshot.optionContentOverrides.map((option) => [option.optionId, option.content]),
  );
  for (const option of question.options) {
    addDiff(
      entries,
      `option:${option.id}`,
      `选项 ${option.sort}`,
      option.effectiveContent,
      proposedOptions.get(option.id) ?? option.content,
    );
  }

  return entries;
}

export function cloneRevision(revision: AdminQuestionOverrideRevisionV1): AdminQuestionOverrideRevisionV1 {
  return {
    ...revision,
    optionContentOverrides: revision.optionContentOverrides.map((option) => ({ ...option })),
    diff: revision.diff.map((entry) => ({ ...entry })),
    createdBy: revision.createdBy ? { ...revision.createdBy } : null,
    reviewedBy: revision.reviewedBy ? { ...revision.reviewedBy } : null,
  };
}

function parseOptionOverrides(value: unknown): AdminQuestionOverrideRevisionOptionV1[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is { optionId: string; content: string } => (
      typeof entry === 'object'
      && entry !== null
      && typeof (entry as { optionId?: unknown }).optionId === 'string'
      && typeof (entry as { content?: unknown }).content === 'string'
    ))
    .map((entry) => ({ optionId: entry.optionId, content: entry.content }));
}

function parseDiff(value: unknown): AdminQuestionOverrideDiffEntryV1[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is {
      field: string;
      label: string;
      before: string | null;
      after: string | null;
    } => (
      typeof entry === 'object'
      && entry !== null
      && typeof (entry as { field?: unknown }).field === 'string'
      && typeof (entry as { label?: unknown }).label === 'string'
      && ((entry as { before?: unknown }).before === null || typeof (entry as { before?: unknown }).before === 'string')
      && ((entry as { after?: unknown }).after === null || typeof (entry as { after?: unknown }).after === 'string')
    ))
    .map((entry) => ({ ...entry }));
}

function addDiff(
  entries: AdminQuestionOverrideDiffEntryV1[],
  field: string,
  label: string,
  before: string | null,
  after: string | null,
) {
  if (before === after) return;
  entries.push({ field, label, before, after });
}
