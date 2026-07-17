import { randomUUID } from 'node:crypto';
import type {
  AddAdminQuestionReviewFlagV1,
  AdminQuestionOverrideRevisionV1,
  AdminQuestionReviewDetailV1,
  AdminQuestionReviewFlagV1,
  AdminQuestionReviewItemV1,
} from '@bkyexam-practice/shared';
import type {
  AdminQuestionReviewActor,
  AdminQuestionReviewListFilters,
  AdminQuestionReviewRepository,
} from './types.js';
import {
  cloneFlag,
  cloneQuestionDetail,
  detailFromItem,
  itemFromDetail,
  preview,
} from './mappers.js';
import {
  attachWorkflow,
  buildOverrideDiff,
  cloneRevision,
  mergeDraftSnapshot,
  revisionSnapshot,
  type QuestionOverrideSnapshot,
} from './workflow.js';

export function createMemoryAdminQuestionReviewRepository(
  questions: readonly (AdminQuestionReviewItemV1 | AdminQuestionReviewDetailV1)[] = [],
): AdminQuestionReviewRepository {
  const records = questions.map((question) => (
    attachWorkflow(
      'options' in question ? cloneQuestionDetail(question) : detailFromItem(question),
      'options' in question ? question.workflow?.revisions ?? [] : [],
    )
  ));

  return {
    async listQuestionReviews(filters) {
      const filtered = records
        .map((question) => ({
          ...cloneQuestionDetail(question),
          flags: question.flags.filter((flag) => flagMatchesFilters(flag, filters)),
        }))
        .filter((question) => {
          if (question.flags.length === 0) return false;
          if (filters.bankId && question.bankId !== filters.bankId) return false;
          if (filters.questionType && question.questionType !== filters.questionType) return false;
          if (filters.keyword) {
            const keyword = filters.keyword.toLocaleLowerCase();
            return [
              question.bankName,
              question.contentPreview,
              question.answerPreview,
              question.content,
              question.answerRaw,
            ].some((value) => value.toLocaleLowerCase().includes(keyword));
          }

          return true;
        });
      const pageItems = filtered.slice(filters.offset, filters.offset + filters.limit + 1);

      return {
        questions: pageItems.slice(0, filters.limit).map(itemFromDetail),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: pageItems.length > filters.limit,
        },
      };
    },

    async getQuestionReview(questionId) {
      const question = records.find((candidate) => candidate.questionId === questionId);
      return question ? cloneQuestionDetail(question) : null;
    },

    async updateQuestionReview(input) {
      const index = records.findIndex((question) => question.questionId === input.questionId);
      if (index < 0) return { status: 'question_not_found' };

      const before = cloneQuestionDetail(records[index]);
      const flagIds = new Set(before.flags.map((flag) => flag.id));
      if (
        input.changes.resolveFlagIds.some((flagId) => !flagIds.has(flagId))
        || input.changes.ignoredFlagIds.some((flagId) => !flagIds.has(flagId))
      ) {
        return { status: 'flag_not_found' };
      }

      const now = new Date().toISOString();
      const addedFlags = input.changes.addFlags.map((flag) => createMemoryFlag(flag, input.actor, now));
      const resolvedIds = new Set(input.changes.resolveFlagIds);
      const ignoredIds = new Set(input.changes.ignoredFlagIds);
      let nextFlags = before.flags.map((flag) => {
        if (resolvedIds.has(flag.id)) {
          return {
            ...flag,
            status: 'resolved' as const,
            resolvedAt: now,
            resolvedBy: { id: input.actor.id, displayName: input.actor.displayName },
          };
        }
        if (ignoredIds.has(flag.id)) {
          return {
            ...flag,
            status: 'ignored' as const,
            resolvedAt: now,
            resolvedBy: { id: input.actor.id, displayName: input.actor.displayName },
          };
        }
        return flag;
      });
      nextFlags = [...nextFlags, ...addedFlags];

      const after: AdminQuestionReviewDetailV1 = {
        ...before,
        flags: nextFlags,
        excludedFromPractice: input.changes.excludedFromPractice ?? before.excludedFromPractice,
      };
      records[index] = cloneQuestionDetail(after);

      return {
        status: 'updated',
        before,
        after: cloneQuestionDetail(after),
        addedFlags,
        resolvedFlags: nextFlags.filter((flag) => resolvedIds.has(flag.id)).map(cloneFlag),
        ignoredFlags: nextFlags.filter((flag) => ignoredIds.has(flag.id)).map(cloneFlag),
      };
    },

    async updateQuestionOverride(input) {
      const index = records.findIndex((question) => question.questionId === input.questionId);
      if (index < 0) return { status: 'question_not_found' };

      const before = cloneQuestionDetail(records[index]);
      if (before.overrideVersion !== input.changes.expectedVersion) {
        return { status: 'version_conflict', current: before };
      }
      const activeRevision = before.workflow?.activeRevision ?? null;
      if (activeRevision?.status === 'pending_review') {
        return { status: 'revision_not_editable', current: before };
      }
      if ((activeRevision?.version ?? 0) !== input.changes.expectedDraftVersion) {
        return { status: 'draft_version_conflict', current: before };
      }

      const optionIds = new Set(before.options.map((option) => option.id));
      if (input.changes.optionContentOverrides.some((option) => !optionIds.has(option.optionId))) {
        return { status: 'option_not_found' };
      }

      const now = new Date().toISOString();
      const snapshot = mergeDraftSnapshot(before, activeRevision, input.changes);
      const revision: AdminQuestionOverrideRevisionV1 = activeRevision?.status === 'draft'
        ? {
          ...cloneRevision(activeRevision),
          version: activeRevision.version + 1,
          baseVersion: before.overrideVersion,
          contentOverride: snapshot.contentOverride,
          answerRawOverride: snapshot.answerRawOverride,
          analyzeRawOverride: snapshot.analyzeRawOverride,
          optionContentOverrides: snapshot.optionContentOverrides,
          note: input.changes.note,
          diff: buildOverrideDiff(before, snapshot),
          updatedAt: now,
        }
        : {
          id: randomUUID(),
          questionId: before.questionId,
          version: 1,
          baseVersion: before.overrideVersion,
          status: 'draft',
          contentOverride: snapshot.contentOverride,
          answerRawOverride: snapshot.answerRawOverride,
          analyzeRawOverride: snapshot.analyzeRawOverride,
          optionContentOverrides: snapshot.optionContentOverrides,
          note: input.changes.note,
          diff: buildOverrideDiff(before, snapshot),
          createdBy: { id: input.actor.id, displayName: input.actor.displayName },
          createdAt: now,
          updatedAt: now,
          submittedAt: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: '',
          appliedVersion: null,
          rollbackFromRevisionId: null,
        };
      const revisions = replaceRevision(before.workflow?.revisions ?? [], revision);
      const after = attachWorkflow(before, revisions);
      records[index] = cloneQuestionDetail(after);

      return { status: 'updated', before, after: cloneQuestionDetail(after), revision: cloneRevision(revision) };
    },

    async submitQuestionOverride(input) {
      const index = records.findIndex((question) => question.questionId === input.questionId);
      if (index < 0) return { status: 'question_not_found' };
      const before = cloneQuestionDetail(records[index]);
      const revision = before.workflow?.activeRevision;
      if (!revision || revision.id !== input.request.revisionId) return { status: 'revision_not_found' };
      if (revision.status !== 'draft') return { status: 'revision_not_editable', current: before };
      if (revision.version !== input.request.expectedDraftVersion) {
        return { status: 'draft_version_conflict', current: before };
      }
      const now = new Date().toISOString();
      const submitted = {
        ...cloneRevision(revision),
        status: 'pending_review' as const,
        submittedAt: now,
        updatedAt: now,
      };
      const after = attachWorkflow(before, replaceRevision(before.workflow?.revisions ?? [], submitted));
      records[index] = cloneQuestionDetail(after);
      return { status: 'updated', before, after: cloneQuestionDetail(after), revision: submitted };
    },

    async approveQuestionOverride(input) {
      const index = records.findIndex((question) => question.questionId === input.questionId);
      if (index < 0) return { status: 'question_not_found' };
      const before = cloneQuestionDetail(records[index]);
      const revision = findMemoryRevision(before, input.request.revisionId);
      if (!revision) return { status: 'revision_not_found' };
      if (revision.status !== 'pending_review') return { status: 'revision_not_editable', current: before };
      if (before.overrideVersion !== input.request.expectedVersion || revision.baseVersion !== before.overrideVersion) {
        return { status: 'version_conflict', current: before };
      }
      const now = new Date().toISOString();
      const appliedVersion = before.overrideVersion + 1;
      const approved = {
        ...cloneRevision(revision),
        status: 'approved' as const,
        reviewedBy: { id: input.actor.id, displayName: input.actor.displayName },
        reviewedAt: now,
        reviewNote: input.request.reviewNote,
        appliedVersion,
        updatedAt: now,
      };
      const effective = applyMemorySnapshot(before, revisionSnapshot(revision), {
        actor: input.actor,
        note: revision.note,
        now,
      });
      const after = attachWorkflow(effective, replaceRevision(before.workflow?.revisions ?? [], approved));
      records[index] = cloneQuestionDetail(after);
      return { status: 'updated', before, after: cloneQuestionDetail(after), revision: approved };
    },

    async rejectQuestionOverride(input) {
      const index = records.findIndex((question) => question.questionId === input.questionId);
      if (index < 0) return { status: 'question_not_found' };
      const before = cloneQuestionDetail(records[index]);
      const revision = findMemoryRevision(before, input.request.revisionId);
      if (!revision) return { status: 'revision_not_found' };
      if (revision.status !== 'pending_review') return { status: 'revision_not_editable', current: before };
      if (before.overrideVersion !== input.request.expectedVersion) {
        return { status: 'version_conflict', current: before };
      }
      const now = new Date().toISOString();
      const rejected = {
        ...cloneRevision(revision),
        status: 'rejected' as const,
        reviewedBy: { id: input.actor.id, displayName: input.actor.displayName },
        reviewedAt: now,
        reviewNote: input.request.reviewNote,
        updatedAt: now,
      };
      const after = attachWorkflow(before, replaceRevision(before.workflow?.revisions ?? [], rejected));
      records[index] = cloneQuestionDetail(after);
      return { status: 'updated', before, after: cloneQuestionDetail(after), revision: rejected };
    },

    async rollbackQuestionOverride(input) {
      const index = records.findIndex((question) => question.questionId === input.questionId);
      if (index < 0) return { status: 'question_not_found' };
      const before = cloneQuestionDetail(records[index]);
      const target = findMemoryRevision(before, input.request.revisionId);
      if (!target || target.status !== 'approved') return { status: 'revision_not_found' };
      if (before.workflow?.activeRevision) return { status: 'revision_not_editable', current: before };
      if (before.overrideVersion !== input.request.expectedVersion) {
        return { status: 'version_conflict', current: before };
      }
      const now = new Date().toISOString();
      const snapshot = revisionSnapshot(target);
      const diff = buildOverrideDiff(before, snapshot);
      if (diff.length === 0) {
        return { status: 'no_change', current: before };
      }
      const effective = applyMemorySnapshot(before, snapshot, {
        actor: input.actor,
        note: input.request.note,
        now,
      });
      const rollback: AdminQuestionOverrideRevisionV1 = {
        id: randomUUID(),
        questionId: before.questionId,
        version: 1,
        baseVersion: before.overrideVersion,
        status: 'approved',
        ...snapshot,
        note: input.request.note,
        diff,
        createdBy: { id: input.actor.id, displayName: input.actor.displayName },
        createdAt: now,
        updatedAt: now,
        submittedAt: now,
        reviewedBy: { id: input.actor.id, displayName: input.actor.displayName },
        reviewedAt: now,
        reviewNote: input.request.note,
        appliedVersion: before.overrideVersion + 1,
        rollbackFromRevisionId: target.id,
      };
      const after = attachWorkflow(effective, [rollback, ...(before.workflow?.revisions ?? [])]);
      records[index] = cloneQuestionDetail(after);
      return { status: 'updated', before, after: cloneQuestionDetail(after), revision: rollback };
    },
  };
}

function replaceRevision(
  revisions: readonly AdminQuestionOverrideRevisionV1[],
  revision: AdminQuestionOverrideRevisionV1,
): AdminQuestionOverrideRevisionV1[] {
  const others = revisions.filter((candidate) => candidate.id !== revision.id).map(cloneRevision);
  return [cloneRevision(revision), ...others];
}

function findMemoryRevision(
  question: AdminQuestionReviewDetailV1,
  revisionId: string,
): AdminQuestionOverrideRevisionV1 | null {
  return question.workflow?.revisions.find((revision) => revision.id === revisionId) ?? null;
}

function applyMemorySnapshot(
  question: AdminQuestionReviewDetailV1,
  snapshot: QuestionOverrideSnapshot,
  input: {
    actor: AdminQuestionReviewActor;
    note: string;
    now: string;
  },
): AdminQuestionReviewDetailV1 {
  const source = question.source ?? {
    content: question.content,
    answerRaw: question.answerRaw,
    analyzeRaw: question.analyzeRaw,
  };
  const optionOverrides = new Map(
    snapshot.optionContentOverrides.map((option) => [option.optionId, option.content]),
  );
  const nextVersion = question.overrideVersion + 1;
  const after: AdminQuestionReviewDetailV1 = {
    ...question,
    content: snapshot.contentOverride ?? source.content,
    answerRaw: snapshot.answerRawOverride ?? source.answerRaw,
    analyzeRaw: snapshot.analyzeRawOverride ?? source.analyzeRaw,
    options: question.options.map((option) => ({
      ...option,
      overrideContent: optionOverrides.get(option.id) ?? null,
      effectiveContent: optionOverrides.get(option.id) ?? option.content,
    })),
    overrideVersion: nextVersion,
    override: {
      version: nextVersion,
      contentOverride: snapshot.contentOverride,
      answerRawOverride: snapshot.answerRawOverride,
      analyzeRawOverride: snapshot.analyzeRawOverride,
      note: input.note,
      updatedBy: { id: input.actor.id, displayName: input.actor.displayName },
      updatedAt: input.now,
    },
  };
  after.contentPreview = preview(after.content, 160);
  after.answerPreview = preview(after.answerRaw, 120);
  return after;
}

function createMemoryFlag(
  flag: AddAdminQuestionReviewFlagV1,
  actor: AdminQuestionReviewActor,
  now: string,
): AdminQuestionReviewFlagV1 {
  return {
    id: randomUUID(),
    type: flag.type,
    severity: flag.severity,
    status: 'open',
    note: flag.note,
    createdAt: now,
    createdBy: { id: actor.id, displayName: actor.displayName },
    resolvedAt: null,
    resolvedBy: null,
  };
}

function flagMatchesFilters(flag: AdminQuestionReviewFlagV1, filters: AdminQuestionReviewListFilters) {
  if (flag.status !== filters.status) return false;
  if (filters.flagType && flag.type !== filters.flagType) return false;
  if (filters.severity && flag.severity !== filters.severity) return false;
  return true;
}
