import { randomUUID } from 'node:crypto';
import type {
  AddAdminQuestionReviewFlagV1,
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

export function createMemoryAdminQuestionReviewRepository(
  questions: readonly (AdminQuestionReviewItemV1 | AdminQuestionReviewDetailV1)[] = [],
): AdminQuestionReviewRepository {
  const records = questions.map((question) => (
    'options' in question ? cloneQuestionDetail(question) : detailFromItem(question)
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

      const optionIds = new Set(before.options.map((option) => option.id));
      if (input.changes.optionContentOverrides.some((option) => !optionIds.has(option.optionId))) {
        return { status: 'option_not_found' };
      }

      const now = new Date().toISOString();
      const nextOptions = before.options.map((option) => {
        const override = input.changes.optionContentOverrides.find((candidate) => candidate.optionId === option.id);
        if (!override) return { ...option };
        return {
          ...option,
          overrideContent: override.content,
          effectiveContent: override.content,
        };
      });
      const after: AdminQuestionReviewDetailV1 = {
        ...before,
        content: input.changes.content ?? before.content,
        answerRaw: input.changes.answerRaw ?? before.answerRaw,
        analyzeRaw: input.changes.analyzeRaw === undefined ? before.analyzeRaw : input.changes.analyzeRaw,
        options: nextOptions,
        overrideVersion: before.overrideVersion + 1,
        override: {
          version: before.overrideVersion + 1,
          contentOverride: input.changes.content ?? before.override?.contentOverride ?? null,
          answerRawOverride: input.changes.answerRaw ?? before.override?.answerRawOverride ?? null,
          analyzeRawOverride: input.changes.analyzeRaw === undefined
            ? before.override?.analyzeRawOverride ?? null
            : input.changes.analyzeRaw,
          note: input.changes.note,
          updatedBy: { id: input.actor.id, displayName: input.actor.displayName },
          updatedAt: now,
        },
      };
      after.contentPreview = preview(after.content, 160);
      after.answerPreview = preview(after.answerRaw, 120);
      records[index] = cloneQuestionDetail(after);

      return { status: 'updated', before, after: cloneQuestionDetail(after) };
    },
  };
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
