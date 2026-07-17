import type {
  AdminQuestionReviewDetailV1,
  AdminQuestionReviewFlagV1,
  AdminQuestionReviewItemV1,
  AdminQuestionReviewOptionV1,
} from '@bkyexam-practice/shared';
import type {
  FlagRow,
  QuestionContextRow,
  QuestionCoreRow,
  QuestionOptionRow,
  QuestionReviewRow,
} from './types.js';

export function cloneFlag(flag: AdminQuestionReviewFlagV1): AdminQuestionReviewFlagV1 {
  return {
    ...flag,
    createdBy: flag.createdBy ? { ...flag.createdBy } : null,
    resolvedBy: flag.resolvedBy ? { ...flag.resolvedBy } : null,
  };
}

export function cloneQuestionItem(question: AdminQuestionReviewItemV1): AdminQuestionReviewItemV1 {
  return {
    ...question,
    flags: question.flags.map(cloneFlag),
  };
}

export function cloneQuestionDetail(question: AdminQuestionReviewDetailV1): AdminQuestionReviewDetailV1 {
  return {
    ...cloneQuestionItem(question),
    content: question.content,
    answerRaw: question.answerRaw,
    analyzeRaw: question.analyzeRaw,
    source: question.source ? { ...question.source } : undefined,
    options: question.options.map((option) => ({ ...option })),
    override: question.override
      ? {
        ...question.override,
        updatedBy: question.override.updatedBy ? { ...question.override.updatedBy } : null,
      }
      : null,
    overrideVersion: question.overrideVersion,
    workflow: question.workflow
      ? {
        activeRevision: question.workflow.activeRevision
          ? {
            ...question.workflow.activeRevision,
            optionContentOverrides: question.workflow.activeRevision.optionContentOverrides.map((option) => ({ ...option })),
            diff: question.workflow.activeRevision.diff.map((entry) => ({ ...entry })),
            createdBy: question.workflow.activeRevision.createdBy ? { ...question.workflow.activeRevision.createdBy } : null,
            reviewedBy: question.workflow.activeRevision.reviewedBy ? { ...question.workflow.activeRevision.reviewedBy } : null,
          }
          : null,
        revisions: question.workflow.revisions.map((revision) => ({
          ...revision,
          optionContentOverrides: revision.optionContentOverrides.map((option) => ({ ...option })),
          diff: revision.diff.map((entry) => ({ ...entry })),
          createdBy: revision.createdBy ? { ...revision.createdBy } : null,
          reviewedBy: revision.reviewedBy ? { ...revision.reviewedBy } : null,
        })),
      }
      : undefined,
  };
}

export function detailFromItem(question: AdminQuestionReviewItemV1): AdminQuestionReviewDetailV1 {
  return {
    ...cloneQuestionItem(question),
    content: question.contentPreview,
    answerRaw: question.answerPreview,
    analyzeRaw: null,
    source: {
      content: question.contentPreview,
      answerRaw: question.answerPreview,
      analyzeRaw: null,
    },
    options: [],
    override: null,
    overrideVersion: 0,
  };
}

export function itemFromDetail(question: AdminQuestionReviewDetailV1): AdminQuestionReviewItemV1 {
  return {
    questionId: question.questionId,
    bankId: question.bankId,
    bankName: question.bankName,
    questionType: question.questionType,
    contentPreview: question.contentPreview,
    optionCount: question.optionCount,
    answerPreview: question.answerPreview,
    flags: question.flags.map(cloneFlag),
    excludedFromPractice: question.excludedFromPractice,
  };
}

export function questionFromContext(
  context: QuestionContextRow,
  flags: AdminQuestionReviewFlagV1[],
): AdminQuestionReviewItemV1 {
  return {
    questionId: context.question_id,
    bankId: context.bank_id,
    bankName: context.bank_name,
    questionType: context.question_type,
    contentPreview: preview(context.content_preview, 160),
    optionCount: Number(context.option_count),
    answerPreview: preview(context.answer_preview, 120),
    flags: flags.map(cloneFlag),
    excludedFromPractice: false,
  };
}

export function mapQuestionDetail(
  row: QuestionCoreRow,
  flags: AdminQuestionReviewFlagV1[],
  options: QuestionOptionRow[],
): AdminQuestionReviewDetailV1 {
  const item = questionFromContext({
    question_id: row.question_id,
    bank_id: row.bank_id,
    bank_name: row.bank_name,
    question_type: row.question_type,
    content_preview: row.effective_content,
    option_count: row.option_count,
    answer_preview: row.effective_answer_raw,
  }, flags);
  const overrideVersion = Number(row.override_version ?? 0);

  return {
    ...item,
    excludedFromPractice: Boolean(row.excluded_from_practice),
    content: row.effective_content,
    answerRaw: row.effective_answer_raw,
    analyzeRaw: row.effective_analyze_raw,
    source: {
      content: row.source_content,
      answerRaw: row.source_answer_raw,
      analyzeRaw: row.source_analyze_raw,
    },
    options: options.map(mapQuestionOptionRow),
    override: overrideVersion > 0 && row.override_updated_at
      ? {
        version: overrideVersion,
        contentOverride: row.content_override,
        answerRawOverride: row.answer_raw_override,
        analyzeRawOverride: row.analyze_raw_override,
        note: row.override_note ?? '',
        updatedBy: row.override_updated_by_admin_id && row.override_updated_by_display_name
          ? { id: row.override_updated_by_admin_id, displayName: row.override_updated_by_display_name }
          : null,
        updatedAt: toIsoTimestamp(row.override_updated_at),
      }
      : null,
    overrideVersion,
  };
}

export function mapQuestionOptionRow(row: QuestionOptionRow): AdminQuestionReviewOptionV1 {
  return {
    id: row.id,
    sort: Number(row.sort),
    content: row.content,
    overrideContent: row.override_content,
    effectiveContent: row.override_content ?? row.content,
  };
}

export function mapQuestionReviewRow(row: QuestionReviewRow): AdminQuestionReviewItemV1 {
  return {
    questionId: row.question_id,
    bankId: row.bank_id,
    bankName: row.bank_name,
    questionType: row.question_type,
    contentPreview: preview(row.content_preview, 160),
    optionCount: Number(row.option_count),
    answerPreview: preview(row.answer_preview, 120),
    flags: toFlags(row.flags),
    excludedFromPractice: Boolean(row.excluded_from_practice),
  };
}

export function mapFlagRow(row: FlagRow | undefined): AdminQuestionReviewFlagV1 {
  if (!row) {
    throw new Error('Expected question quality flag row.');
  }

  return {
    id: row.id,
    type: row.flag_type as AdminQuestionReviewFlagV1['type'],
    severity: row.severity as AdminQuestionReviewFlagV1['severity'],
    status: row.status as AdminQuestionReviewFlagV1['status'],
    note: row.note,
    createdAt: toIsoTimestamp(row.created_at),
    createdBy: row.created_by_admin_id && row.created_by_display_name
      ? { id: row.created_by_admin_id, displayName: row.created_by_display_name }
      : null,
    resolvedAt: row.resolved_at ? toIsoTimestamp(row.resolved_at) : null,
    resolvedBy: row.resolved_by_admin_id && row.resolved_by_display_name
      ? { id: row.resolved_by_admin_id, displayName: row.resolved_by_display_name }
      : null,
  };
}

function toFlags(value: unknown): AdminQuestionReviewFlagV1[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error('Invalid question review flag payload.');
    return {
      id: String(entry.id),
      type: String(entry.type) as AdminQuestionReviewFlagV1['type'],
      severity: String(entry.severity) as AdminQuestionReviewFlagV1['severity'],
      status: String(entry.status) as AdminQuestionReviewFlagV1['status'],
      note: String(entry.note ?? ''),
      createdAt: toIsoTimestamp(String(entry.createdAt)),
      createdBy: toActor(entry.createdBy),
      resolvedAt: entry.resolvedAt ? toIsoTimestamp(String(entry.resolvedAt)) : null,
      resolvedBy: toActor(entry.resolvedBy),
    };
  });
}

function toActor(value: unknown): AdminQuestionReviewFlagV1['createdBy'] {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.displayName !== 'string') return null;
  return { id: value.id, displayName: value.displayName };
}

export function preview(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
