import { randomUUID } from 'node:crypto';
import type {
  AddAdminQuestionReviewFlagV1,
  AdminQuestionReviewDetailV1,
  AdminQuestionReviewFlagV1,
  AdminQuestionOverrideRevisionV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../../db/client.js';
import type {
  AdminQuestionReviewActor,
  AdminQuestionReviewRepository,
  ConnectableQueryClient,
  FlagRow,
  QueryRows,
  QuestionContextRow,
  QuestionCoreRow,
  QuestionOptionRow,
  QuestionOverrideRevisionRow,
  QuestionReviewRow,
  QuestionOverrideWorkflowResult,
  TransactionClient,
  UpdateAdminQuestionOverrideInput,
} from './types.js';
import {
  mapFlagRow,
  mapQuestionDetail,
  mapQuestionReviewRow,
} from './mappers.js';
import {
  attachWorkflow,
  buildOverrideDiff,
  mapRevisionRow,
  mergeDraftSnapshot,
  revisionSnapshot,
  type QuestionOverrideSnapshot,
} from './workflow.js';

export function createPgAdminQuestionReviewRepository(client: QueryClient): AdminQuestionReviewRepository {
  return {
    async listQuestionReviews(filters) {
      const params: unknown[] = [];
      const flagWhere: string[] = [];
      const questionWhere: string[] = [];

      addFilter(params, flagWhere, (placeholder) => `question_quality_flags.status = ${placeholder}`, filters.status);
      if (filters.flagType) {
        addFilter(params, flagWhere, (placeholder) => `question_quality_flags.flag_type = ${placeholder}`, filters.flagType);
      }
      if (filters.severity) {
        addFilter(params, flagWhere, (placeholder) => `question_quality_flags.severity = ${placeholder}`, filters.severity);
      }
      if (filters.bankId) {
        addFilter(params, flagWhere, (placeholder) => `question_quality_flags.bank_id = ${placeholder}`, filters.bankId);
      }
      if (filters.questionType) {
        addFilter(params, questionWhere, (placeholder) => `questions.normalized_type = ${placeholder}`, filters.questionType);
      }
      if (filters.keyword) {
        const pattern = `%${escapeLikePattern(filters.keyword.toLocaleLowerCase())}%`;
        addFilter(params, questionWhere, (placeholder) => `(
          lower(COALESCE(question_overrides.content_override, questions.content)) LIKE ${placeholder} ESCAPE '\\'
          OR lower(COALESCE(question_overrides.answer_raw_override, questions.answer_raw)) LIKE ${placeholder} ESCAPE '\\'
          OR lower(questions.searchable_text) LIKE ${placeholder} ESCAPE '\\'
        )`, pattern);
      }

      params.push(filters.limit + 1);
      const limitPlaceholder = `$${params.length}`;
      params.push(filters.offset);
      const offsetPlaceholder = `$${params.length}`;

      const result = (await client.query(
        `
          WITH filtered_flags AS (
            SELECT
              question_quality_flags.*,
              created_by.display_name AS created_by_display_name,
              resolved_by.display_name AS resolved_by_display_name
            FROM question_quality_flags
            LEFT JOIN admin_users created_by ON created_by.id = question_quality_flags.created_by_admin_id
            LEFT JOIN admin_users resolved_by ON resolved_by.id = question_quality_flags.resolved_by_admin_id
            WHERE ${flagWhere.join(' AND ')}
          ), matching_questions AS (
            SELECT questions.id AS question_id, max(filtered_flags.updated_at) AS last_reviewed_at
            FROM questions
            JOIN filtered_flags ON filtered_flags.question_id = questions.id
            LEFT JOIN question_overrides ON question_overrides.question_id = questions.id
            WHERE ${questionWhere.length > 0 ? questionWhere.join(' AND ') : 'TRUE'}
            GROUP BY questions.id
            ORDER BY max(filtered_flags.updated_at) DESC, questions.id DESC
            LIMIT ${limitPlaceholder}
            OFFSET ${offsetPlaceholder}
          ), option_counts AS (
            SELECT question_id, count(*) AS option_count
            FROM question_options
            WHERE question_id IN (SELECT question_id FROM matching_questions)
            GROUP BY question_id
          ), question_exclusions AS (
            SELECT question_id, bool_or(excluded_from_practice) AS excluded_from_practice
            FROM question_quality_flags
            WHERE question_id IN (SELECT question_id FROM matching_questions)
              AND status = 'open'
            GROUP BY question_id
          )
          SELECT
            questions.id AS question_id,
            COALESCE((array_agg(filtered_flags.bank_id ORDER BY filtered_flags.created_at DESC))[1], questions.classification_id) AS bank_id,
            COALESCE((array_agg(bank_mappings.bank_name ORDER BY filtered_flags.created_at DESC))[1], '未映射题库') AS bank_name,
            questions.normalized_type AS question_type,
            COALESCE(question_overrides.content_override, questions.content) AS content_preview,
            COALESCE(option_counts.option_count, 0) AS option_count,
            COALESCE(question_overrides.answer_raw_override, questions.answer_raw) AS answer_preview,
            COALESCE(question_exclusions.excluded_from_practice, false) AS excluded_from_practice,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', filtered_flags.id,
              'type', filtered_flags.flag_type,
              'severity', filtered_flags.severity,
              'status', filtered_flags.status,
              'note', filtered_flags.note,
              'createdAt', to_jsonb(filtered_flags.created_at),
              'createdBy', CASE
                WHEN filtered_flags.created_by_admin_id IS NULL THEN NULL
                ELSE jsonb_build_object(
                  'id', filtered_flags.created_by_admin_id,
                  'displayName', filtered_flags.created_by_display_name
                )
              END,
              'resolvedAt', to_jsonb(filtered_flags.resolved_at),
              'resolvedBy', CASE
                WHEN filtered_flags.resolved_by_admin_id IS NULL THEN NULL
                ELSE jsonb_build_object(
                  'id', filtered_flags.resolved_by_admin_id,
                  'displayName', filtered_flags.resolved_by_display_name
                )
              END
            ) ORDER BY filtered_flags.created_at DESC, filtered_flags.id DESC), '[]'::jsonb) AS flags
          FROM matching_questions
          JOIN questions ON questions.id = matching_questions.question_id
          JOIN filtered_flags ON filtered_flags.question_id = questions.id
          LEFT JOIN question_overrides ON question_overrides.question_id = questions.id
          LEFT JOIN bank_mappings ON bank_mappings.bank_id = filtered_flags.bank_id
          LEFT JOIN option_counts ON option_counts.question_id = questions.id
          LEFT JOIN question_exclusions ON question_exclusions.question_id = questions.id
          GROUP BY
            questions.id,
            questions.classification_id,
            questions.normalized_type,
            questions.content,
            questions.answer_raw,
            question_overrides.content_override,
            question_overrides.answer_raw_override,
            option_counts.option_count,
            question_exclusions.excluded_from_practice,
            matching_questions.last_reviewed_at
          ORDER BY matching_questions.last_reviewed_at DESC, questions.id DESC
        `,
        params,
      )) as QueryRows<QuestionReviewRow>;
      const pageRows = result.rows.slice(0, filters.limit);

      return {
        questions: pageRows.map(mapQuestionReviewRow),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: result.rows.length > filters.limit,
        },
      };
    },

    async getQuestionReview(questionId) {
      return loadQuestionDetail(client, questionId);
    },

    async updateQuestionReview(input) {
      const transactionClient = await checkoutTransactionClient(client);
      let transactionStarted = false;

      try {
        await transactionClient.query('BEGIN');
        transactionStarted = true;

        const context = await loadQuestionContext(transactionClient, input.questionId);
        if (!context) {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'question_not_found' };
        }

        const before = await loadQuestionDetail(transactionClient, input.questionId);
        if (!before) {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'question_not_found' };
        }
        const currentExcluded = before.excludedFromPractice;
        const addedFlags: AdminQuestionReviewFlagV1[] = [];
        const resolvedFlags: AdminQuestionReviewFlagV1[] = [];
        const ignoredFlags: AdminQuestionReviewFlagV1[] = [];
        const newFlagExcluded = input.changes.excludedFromPractice ?? currentExcluded;

        for (const flag of input.changes.addFlags) {
          const inserted = await insertFlag(transactionClient, {
            questionId: input.questionId,
            bankId: context.bank_id,
            flag,
            excludedFromPractice: newFlagExcluded,
            actor: input.actor,
          });
          addedFlags.push(inserted);
        }

        if (input.changes.resolveFlagIds.length > 0) {
          const updated = await updateFlagsStatus(transactionClient, {
            questionId: input.questionId,
            flagIds: input.changes.resolveFlagIds,
            status: 'resolved',
            actor: input.actor,
          });
          if (updated.length !== input.changes.resolveFlagIds.length) {
            await transactionClient.query('ROLLBACK');
            transactionStarted = false;
            return { status: 'flag_not_found' };
          }
          resolvedFlags.push(...updated);
        }

        if (input.changes.ignoredFlagIds.length > 0) {
          const updated = await updateFlagsStatus(transactionClient, {
            questionId: input.questionId,
            flagIds: input.changes.ignoredFlagIds,
            status: 'ignored',
            actor: input.actor,
          });
          if (updated.length !== input.changes.ignoredFlagIds.length) {
            await transactionClient.query('ROLLBACK');
            transactionStarted = false;
            return { status: 'flag_not_found' };
          }
          ignoredFlags.push(...updated);
        }

        if (input.changes.excludedFromPractice !== undefined) {
          const openFlagCount = await countOpenFlags(transactionClient, input.questionId);
          if (openFlagCount === 0 && input.changes.excludedFromPractice) {
            const inserted = await insertFlag(transactionClient, {
              questionId: input.questionId,
              bankId: context.bank_id,
              flag: {
                type: 'needs_manual_review',
                severity: 'blocking',
                note: 'Excluded from practice',
              },
              excludedFromPractice: true,
              actor: input.actor,
            });
            addedFlags.push(inserted);
          } else {
            await transactionClient.query(
              `
                UPDATE question_quality_flags
                SET excluded_from_practice = $2,
                    updated_at = now()
                WHERE question_id = $1
                  AND status = 'open'
              `,
              [input.questionId, input.changes.excludedFromPractice],
            );
          }
        }

        const after = await loadQuestionDetail(transactionClient, input.questionId);
        if (!after) {
          throw new Error(`Question review disappeared after update: ${input.questionId}`);
        }

        await transactionClient.query('COMMIT');
        transactionStarted = false;

        return {
          status: 'updated',
          before,
          after,
          addedFlags,
          resolvedFlags,
          ignoredFlags,
        };
      } catch (error) {
        if (transactionStarted) {
          await transactionClient.query('ROLLBACK');
        }

        throw error;
      } finally {
        transactionClient.release?.();
      }
    },

    async updateQuestionOverride(input) {
      const transactionClient = await checkoutTransactionClient(client);
      let transactionStarted = false;

      try {
        await transactionClient.query('BEGIN');
        transactionStarted = true;
        await lockQuestion(transactionClient, input.questionId);

        const before = await loadQuestionDetail(transactionClient, input.questionId);
        if (!before) {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'question_not_found' };
        }
        if (before.overrideVersion !== input.changes.expectedVersion) {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'version_conflict', current: before };
        }
        const activeRevision = before.workflow?.activeRevision ?? null;
        if (activeRevision?.status === 'pending_review') {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'revision_not_editable', current: before };
        }
        if ((activeRevision?.version ?? 0) !== input.changes.expectedDraftVersion) {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'draft_version_conflict', current: before };
        }
        if (!await allOptionsBelongToQuestion(transactionClient, input.questionId, input.changes.optionContentOverrides.map((option) => option.optionId))) {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'option_not_found' };
        }

        const snapshot = mergeDraftSnapshot(before, activeRevision, input.changes);
        const revisionId = await upsertDraftRevision(transactionClient, {
          questionId: input.questionId,
          activeRevision,
          baseVersion: before.overrideVersion,
          snapshot,
          diff: buildOverrideDiff(before, snapshot),
          note: input.changes.note,
          actorId: input.actor.id,
        });

        const after = await loadQuestionDetail(transactionClient, input.questionId);
        if (!after) {
          throw new Error(`Question review disappeared after override update: ${input.questionId}`);
        }

        await transactionClient.query('COMMIT');
        transactionStarted = false;

        const revision = findRevision(after, revisionId);
        return { status: 'updated', before, after, revision };
      } catch (error) {
        if (transactionStarted) {
          await transactionClient.query('ROLLBACK');
        }

        throw error;
      } finally {
        transactionClient.release?.();
      }
    },

    async submitQuestionOverride(input) {
      return runWorkflowTransaction(client, input.questionId, async (transactionClient, before) => {
        const revision = before.workflow?.activeRevision;
        if (!revision || revision.id !== input.request.revisionId) {
          return { status: 'revision_not_found' as const };
        }
        if (revision.status !== 'draft') {
          return { status: 'revision_not_editable' as const, current: before };
        }
        if (revision.version !== input.request.expectedDraftVersion) {
          return { status: 'draft_version_conflict' as const, current: before };
        }

        await transactionClient.query(
          `
            UPDATE question_override_revisions
            SET status = 'pending_review',
                submitted_at = now(),
                updated_at = now()
            WHERE id = $1
              AND question_id = $2
              AND status = 'draft'
              AND version = $3
          `,
          [revision.id, input.questionId, revision.version],
        );
        const after = await requireQuestionDetail(transactionClient, input.questionId);
        return { status: 'updated' as const, before, after, revision: findRevision(after, revision.id) };
      });
    },

    async approveQuestionOverride(input) {
      return runWorkflowTransaction(client, input.questionId, async (transactionClient, before) => {
        const revision = findRevisionOrNull(before, input.request.revisionId);
        if (!revision) return { status: 'revision_not_found' as const };
        if (revision.status !== 'pending_review') {
          return { status: 'revision_not_editable' as const, current: before };
        }
        if (before.overrideVersion !== input.request.expectedVersion || revision.baseVersion !== before.overrideVersion) {
          return { status: 'version_conflict' as const, current: before };
        }

        const appliedVersion = await applyOverrideSnapshot(
          transactionClient,
          input.questionId,
          revisionSnapshot(revision),
          input.actor.id,
          before.overrideVersion,
          revision.note,
        );
        await transactionClient.query(
          `
            UPDATE question_override_revisions
            SET status = 'approved',
                reviewed_by_admin_id = $2,
                reviewed_at = now(),
                review_note = $3,
                applied_version = $4,
                updated_at = now()
            WHERE id = $1
          `,
          [revision.id, input.actor.id, input.request.reviewNote, appliedVersion],
        );
        const after = await requireQuestionDetail(transactionClient, input.questionId);
        return { status: 'updated' as const, before, after, revision: findRevision(after, revision.id) };
      });
    },

    async rejectQuestionOverride(input) {
      return runWorkflowTransaction(client, input.questionId, async (transactionClient, before) => {
        const revision = findRevisionOrNull(before, input.request.revisionId);
        if (!revision) return { status: 'revision_not_found' as const };
        if (revision.status !== 'pending_review') {
          return { status: 'revision_not_editable' as const, current: before };
        }
        if (before.overrideVersion !== input.request.expectedVersion) {
          return { status: 'version_conflict' as const, current: before };
        }

        await transactionClient.query(
          `
            UPDATE question_override_revisions
            SET status = 'rejected',
                reviewed_by_admin_id = $2,
                reviewed_at = now(),
                review_note = $3,
                updated_at = now()
            WHERE id = $1
          `,
          [revision.id, input.actor.id, input.request.reviewNote],
        );
        const after = await requireQuestionDetail(transactionClient, input.questionId);
        return { status: 'updated' as const, before, after, revision: findRevision(after, revision.id) };
      });
    },

    async rollbackQuestionOverride(input) {
      return runWorkflowTransaction(client, input.questionId, async (transactionClient, before) => {
        const target = findRevisionOrNull(before, input.request.revisionId);
        if (!target || target.status !== 'approved') {
          return { status: 'revision_not_found' as const };
        }
        if (before.workflow?.activeRevision) {
          return { status: 'revision_not_editable' as const, current: before };
        }
        if (before.overrideVersion !== input.request.expectedVersion) {
          return { status: 'version_conflict' as const, current: before };
        }

        const snapshot = revisionSnapshot(target);
        const diff = buildOverrideDiff(before, snapshot);
        const appliedVersion = await applyOverrideSnapshot(
          transactionClient,
          input.questionId,
          snapshot,
          input.actor.id,
          before.overrideVersion,
          input.request.note,
        );
        const revisionId = randomUUID();
        await transactionClient.query(
          `
            INSERT INTO question_override_revisions (
              id,
              question_id,
              version,
              base_version,
              status,
              content_override,
              answer_raw_override,
              analyze_raw_override,
              option_content_overrides,
              diff,
              note,
              created_by_admin_id,
              submitted_at,
              reviewed_by_admin_id,
              reviewed_at,
              review_note,
              applied_version,
              rollback_from_revision_id
            )
            VALUES ($1, $2, 1, $3, 'approved', $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, now(), $10, now(), $9, $11, $12)
          `,
          [
            revisionId,
            input.questionId,
            before.overrideVersion,
            snapshot.contentOverride,
            snapshot.answerRawOverride,
            snapshot.analyzeRawOverride,
            JSON.stringify(snapshot.optionContentOverrides),
            JSON.stringify(diff),
            input.request.note,
            input.actor.id,
            appliedVersion,
            target.id,
          ],
        );
        const after = await requireQuestionDetail(transactionClient, input.questionId);
        return { status: 'updated' as const, before, after, revision: findRevision(after, revisionId) };
      });
    },
  };
}

function addFilter(
  params: unknown[],
  where: string[],
  condition: (placeholder: string) => string,
  value: unknown,
) {
  params.push(value);
  where.push(condition(`$${params.length}`));
}

async function checkoutTransactionClient(client: QueryClient): Promise<TransactionClient> {
  return isConnectableQueryClient(client) ? client.connect() : client;
}

function isConnectableQueryClient(client: QueryClient): client is ConnectableQueryClient {
  return 'connect' in client && typeof client.connect === 'function';
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function loadQuestionContext(
  client: QueryClient,
  questionId: string,
): Promise<QuestionContextRow | null> {
  const result = (await client.query(
    `
      WITH RECURSIVE ancestors AS (
        SELECT classifications.id, classifications.name, classifications.parent_id, 0 AS depth
        FROM questions
        JOIN classifications ON classifications.id = questions.classification_id
        WHERE questions.id = $1
        UNION ALL
        SELECT classifications.id, classifications.name, classifications.parent_id, ancestors.depth + 1
        FROM classifications
        JOIN ancestors ON ancestors.parent_id = classifications.id
      ), bank_for_question AS (
        SELECT bank_mappings.bank_id, bank_mappings.bank_name
        FROM ancestors
        JOIN bank_mappings ON bank_mappings.bank_id = ancestors.id
        ORDER BY ancestors.depth ASC
        LIMIT 1
      ), fallback_classification AS (
        SELECT ancestors.id, ancestors.name
        FROM ancestors
        ORDER BY ancestors.depth ASC
        LIMIT 1
      ), option_counts AS (
        SELECT question_id, count(*) AS option_count
        FROM question_options
        WHERE question_id = $1
        GROUP BY question_id
      )
      SELECT
        questions.id AS question_id,
        COALESCE(bank_for_question.bank_id, fallback_classification.id) AS bank_id,
        COALESCE(bank_for_question.bank_name, fallback_classification.name, '未映射题库') AS bank_name,
        questions.normalized_type AS question_type,
        COALESCE(question_overrides.content_override, questions.content) AS content_preview,
        COALESCE(option_counts.option_count, 0) AS option_count,
        COALESCE(question_overrides.answer_raw_override, questions.answer_raw) AS answer_preview
      FROM questions
      LEFT JOIN question_overrides ON question_overrides.question_id = questions.id
      LEFT JOIN bank_for_question ON true
      LEFT JOIN fallback_classification ON true
      LEFT JOIN option_counts ON option_counts.question_id = questions.id
      WHERE questions.id = $1
      LIMIT 1
    `,
    [questionId],
  )) as QueryRows<QuestionContextRow>;

  return result.rows[0] ?? null;
}

async function loadQuestionDetail(
  client: QueryClient,
  questionId: string,
): Promise<AdminQuestionReviewDetailV1 | null> {
  const core = await loadQuestionCore(client, questionId);
  if (!core) return null;
  const flags = await loadQuestionFlags(client, questionId);
  const options = await loadQuestionOptions(client, questionId);
  const question = mapQuestionDetail(core, flags, options);
  const revisions = await loadQuestionOverrideRevisions(client, questionId, question);

  return attachWorkflow(question, revisions);
}

async function loadQuestionCore(client: QueryClient, questionId: string): Promise<QuestionCoreRow | null> {
  const result = (await client.query(
    `
      WITH RECURSIVE ancestors AS (
        SELECT classifications.id, classifications.name, classifications.parent_id, 0 AS depth
        FROM questions
        JOIN classifications ON classifications.id = questions.classification_id
        WHERE questions.id = $1
        UNION ALL
        SELECT classifications.id, classifications.name, classifications.parent_id, ancestors.depth + 1
        FROM classifications
        JOIN ancestors ON ancestors.parent_id = classifications.id
      ), bank_for_question AS (
        SELECT bank_mappings.bank_id, bank_mappings.bank_name
        FROM ancestors
        JOIN bank_mappings ON bank_mappings.bank_id = ancestors.id
        ORDER BY ancestors.depth ASC
        LIMIT 1
      ), fallback_classification AS (
        SELECT ancestors.id, ancestors.name
        FROM ancestors
        ORDER BY ancestors.depth ASC
        LIMIT 1
      ), option_counts AS (
        SELECT question_id, count(*) AS option_count
        FROM question_options
        WHERE question_id = $1
        GROUP BY question_id
      )
      SELECT
        questions.id AS question_id,
        COALESCE(bank_for_question.bank_id, fallback_classification.id) AS bank_id,
        COALESCE(bank_for_question.bank_name, fallback_classification.name, '未映射题库') AS bank_name,
        questions.normalized_type AS question_type,
        COALESCE(option_counts.option_count, 0) AS option_count,
        COALESCE(question_overrides.content_override, questions.content) AS effective_content,
        COALESCE(question_overrides.answer_raw_override, questions.answer_raw) AS effective_answer_raw,
        COALESCE(question_overrides.analyze_raw_override, questions.analyze_raw) AS effective_analyze_raw,
        questions.content AS source_content,
        questions.answer_raw AS source_answer_raw,
        questions.analyze_raw AS source_analyze_raw,
        question_overrides.version AS override_version,
        question_overrides.content_override,
        question_overrides.answer_raw_override,
        question_overrides.analyze_raw_override,
        question_overrides.note AS override_note,
        question_overrides.updated_at AS override_updated_at,
        question_overrides.updated_by_admin_id AS override_updated_by_admin_id,
        admin_users.display_name AS override_updated_by_display_name,
        COALESCE((
          SELECT bool_or(question_quality_flags.excluded_from_practice)
          FROM question_quality_flags
          WHERE question_quality_flags.question_id = questions.id
            AND question_quality_flags.status = 'open'
        ), false) AS excluded_from_practice
      FROM questions
      LEFT JOIN question_overrides ON question_overrides.question_id = questions.id
      LEFT JOIN admin_users ON admin_users.id = question_overrides.updated_by_admin_id
      LEFT JOIN bank_for_question ON true
      LEFT JOIN fallback_classification ON true
      LEFT JOIN option_counts ON option_counts.question_id = questions.id
      WHERE questions.id = $1
      LIMIT 1
    `,
    [questionId],
  )) as QueryRows<QuestionCoreRow>;

  return result.rows[0] ?? null;
}

async function loadQuestionFlags(client: QueryClient, questionId: string): Promise<AdminQuestionReviewFlagV1[]> {
  const result = (await client.query(
    `
      SELECT
        question_quality_flags.id,
        question_quality_flags.flag_type,
        question_quality_flags.severity,
        question_quality_flags.status,
        question_quality_flags.note,
        question_quality_flags.created_at,
        question_quality_flags.created_by_admin_id,
        created_by.display_name AS created_by_display_name,
        question_quality_flags.resolved_at,
        question_quality_flags.resolved_by_admin_id,
        resolved_by.display_name AS resolved_by_display_name
      FROM question_quality_flags
      LEFT JOIN admin_users created_by ON created_by.id = question_quality_flags.created_by_admin_id
      LEFT JOIN admin_users resolved_by ON resolved_by.id = question_quality_flags.resolved_by_admin_id
      WHERE question_quality_flags.question_id = $1
      ORDER BY question_quality_flags.created_at DESC, question_quality_flags.id DESC
    `,
    [questionId],
  )) as QueryRows<FlagRow>;

  return result.rows.map(mapFlagRow);
}

async function loadQuestionOptions(client: QueryClient, questionId: string): Promise<QuestionOptionRow[]> {
  const result = (await client.query(
    `
      SELECT
        question_options.id,
        question_options.question_id,
        question_options.sort,
        question_options.content,
        question_option_overrides.content_override AS override_content
      FROM question_options
      LEFT JOIN question_option_overrides ON question_option_overrides.option_id = question_options.id
      WHERE question_options.question_id = $1
      ORDER BY question_options.sort, question_options.id
    `,
    [questionId],
  )) as QueryRows<QuestionOptionRow>;

  return result.rows;
}

async function loadQuestionOverrideRevisions(
  client: QueryClient,
  questionId: string,
  question: AdminQuestionReviewDetailV1,
): Promise<AdminQuestionOverrideRevisionV1[]> {
  const result = (await client.query(
    `
      SELECT
        revisions.*,
        created_by.display_name AS created_by_display_name,
        reviewed_by.display_name AS reviewed_by_display_name
      FROM question_override_revisions revisions
      LEFT JOIN admin_users created_by ON created_by.id = revisions.created_by_admin_id
      LEFT JOIN admin_users reviewed_by ON reviewed_by.id = revisions.reviewed_by_admin_id
      WHERE revisions.question_id = $1
      ORDER BY revisions.created_at DESC, revisions.id DESC
      LIMIT 50
    `,
    [questionId],
  )) as QueryRows<QuestionOverrideRevisionRow>;

  return result.rows.map((row) => mapRevisionRow(row, question));
}

async function insertFlag(
  client: QueryClient,
  input: {
    questionId: string;
    bankId: string;
    flag: AddAdminQuestionReviewFlagV1;
    excludedFromPractice: boolean;
    actor: AdminQuestionReviewActor;
  },
): Promise<AdminQuestionReviewFlagV1> {
  const flagId = randomUUID();
  const result = (await client.query(
    `
      INSERT INTO question_quality_flags (
        id,
        question_id,
        bank_id,
        flag_type,
        severity,
        status,
        note,
        excluded_from_practice,
        created_by_admin_id
      )
      VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8)
      RETURNING
        question_quality_flags.id,
        question_quality_flags.flag_type,
        question_quality_flags.severity,
        question_quality_flags.status,
        question_quality_flags.note,
        question_quality_flags.created_at,
        question_quality_flags.created_by_admin_id,
        $9::text AS created_by_display_name,
        question_quality_flags.resolved_at,
        question_quality_flags.resolved_by_admin_id,
        NULL::text AS resolved_by_display_name
    `,
    [
      flagId,
      input.questionId,
      input.bankId,
      input.flag.type,
      input.flag.severity,
      input.flag.note,
      input.excludedFromPractice,
      input.actor.id,
      input.actor.displayName,
    ],
  )) as QueryRows<FlagRow>;

  return mapFlagRow(result.rows[0]);
}

async function updateFlagsStatus(
  client: QueryClient,
  input: {
    questionId: string;
    flagIds: readonly string[];
    status: 'resolved' | 'ignored';
    actor: AdminQuestionReviewActor;
  },
): Promise<AdminQuestionReviewFlagV1[]> {
  const result = (await client.query(
    `
      UPDATE question_quality_flags
      SET status = $3,
          resolved_by_admin_id = $4,
          resolved_at = now(),
          updated_at = now()
      WHERE question_id = $1
        AND id = ANY($2::uuid[])
      RETURNING
        question_quality_flags.id,
        question_quality_flags.flag_type,
        question_quality_flags.severity,
        question_quality_flags.status,
        question_quality_flags.note,
        question_quality_flags.created_at,
        question_quality_flags.created_by_admin_id,
        (
          SELECT display_name
          FROM admin_users
          WHERE admin_users.id = question_quality_flags.created_by_admin_id
        ) AS created_by_display_name,
        question_quality_flags.resolved_at,
        question_quality_flags.resolved_by_admin_id,
        $5::text AS resolved_by_display_name
    `,
    [input.questionId, input.flagIds, input.status, input.actor.id, input.actor.displayName],
  )) as QueryRows<FlagRow>;

  return result.rows.map(mapFlagRow);
}

async function countOpenFlags(client: QueryClient, questionId: string): Promise<number> {
  const result = (await client.query(
    `
      SELECT COUNT(*) AS count
      FROM question_quality_flags
      WHERE question_id = $1
        AND status = 'open'
    `,
    [questionId],
  )) as QueryRows<{ count: string | number }>;

  return Number(result.rows[0]?.count ?? 0);
}

async function allOptionsBelongToQuestion(
  client: QueryClient,
  questionId: string,
  optionIds: readonly string[],
): Promise<boolean> {
  if (optionIds.length === 0) return true;
  const result = (await client.query(
    `
      SELECT id
      FROM question_options
      WHERE question_id = $1
        AND id = ANY($2::uuid[])
    `,
    [questionId, optionIds],
  )) as QueryRows<{ id: string }>;
  const found = new Set(result.rows.map((row) => row.id));
  return optionIds.every((optionId) => found.has(optionId));
}

async function lockQuestion(client: QueryClient, questionId: string): Promise<void> {
  await client.query('SELECT id FROM questions WHERE id = $1 FOR UPDATE', [questionId]);
}

async function requireQuestionDetail(
  client: QueryClient,
  questionId: string,
): Promise<AdminQuestionReviewDetailV1> {
  const question = await loadQuestionDetail(client, questionId);
  if (!question) throw new Error(`Question review disappeared: ${questionId}`);
  return question;
}

function findRevision(
  question: AdminQuestionReviewDetailV1,
  revisionId: string,
): AdminQuestionOverrideRevisionV1 {
  const revision = findRevisionOrNull(question, revisionId);
  if (!revision) throw new Error(`Question override revision disappeared: ${revisionId}`);
  return revision;
}

function findRevisionOrNull(
  question: AdminQuestionReviewDetailV1,
  revisionId: string,
): AdminQuestionOverrideRevisionV1 | null {
  return question.workflow?.revisions.find((revision) => revision.id === revisionId) ?? null;
}

async function upsertDraftRevision(
  client: QueryClient,
  input: {
    questionId: string;
    activeRevision: AdminQuestionOverrideRevisionV1 | null;
    baseVersion: number;
    snapshot: QuestionOverrideSnapshot;
    diff: AdminQuestionOverrideRevisionV1['diff'];
    note: string;
    actorId: string;
  },
): Promise<string> {
  if (input.activeRevision?.status === 'draft') {
    await client.query(
      `
        UPDATE question_override_revisions
        SET version = version + 1,
            base_version = $2,
            content_override = $3,
            answer_raw_override = $4,
            analyze_raw_override = $5,
            option_content_overrides = $6::jsonb,
            diff = $7::jsonb,
            note = $8,
            updated_at = now()
        WHERE id = $1
          AND status = 'draft'
      `,
      [
        input.activeRevision.id,
        input.baseVersion,
        input.snapshot.contentOverride,
        input.snapshot.answerRawOverride,
        input.snapshot.analyzeRawOverride,
        JSON.stringify(input.snapshot.optionContentOverrides),
        JSON.stringify(input.diff),
        input.note,
      ],
    );
    return input.activeRevision.id;
  }

  const revisionId = randomUUID();
  await client.query(
    `
      INSERT INTO question_override_revisions (
        id,
        question_id,
        version,
        base_version,
        status,
        content_override,
        answer_raw_override,
        analyze_raw_override,
        option_content_overrides,
        diff,
        note,
        created_by_admin_id
      )
      VALUES ($1, $2, 1, $3, 'draft', $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
    `,
    [
      revisionId,
      input.questionId,
      input.baseVersion,
      input.snapshot.contentOverride,
      input.snapshot.answerRawOverride,
      input.snapshot.analyzeRawOverride,
      JSON.stringify(input.snapshot.optionContentOverrides),
      JSON.stringify(input.diff),
      input.note,
      input.actorId,
    ],
  );
  return revisionId;
}

async function applyOverrideSnapshot(
  client: QueryClient,
  questionId: string,
  snapshot: QuestionOverrideSnapshot,
  actorId: string,
  expectedVersion: number,
  note: string,
): Promise<number> {
  const nextVersion = expectedVersion + 1;
  if (expectedVersion === 0) {
    await client.query(
      `
        INSERT INTO question_overrides (
          question_id,
          content_override,
          answer_raw_override,
          analyze_raw_override,
          note,
          version,
          updated_by_admin_id
        )
        VALUES ($1, $2, $3, $4, $5, 1, $6)
      `,
      [
        questionId,
        snapshot.contentOverride,
        snapshot.answerRawOverride,
        snapshot.analyzeRawOverride,
        note,
        actorId,
      ],
    );
  } else {
    const updated = await client.query(
      `
        UPDATE question_overrides
        SET content_override = $2,
            answer_raw_override = $3,
            analyze_raw_override = $4,
            note = $5,
            version = version + 1,
            updated_by_admin_id = $6,
            updated_at = now()
        WHERE question_id = $1
          AND version = $7
      `,
      [
        questionId,
        snapshot.contentOverride,
        snapshot.answerRawOverride,
        snapshot.analyzeRawOverride,
        note,
        actorId,
        expectedVersion,
      ],
    ) as { rowCount?: number };
    if (updated.rowCount !== 1) {
      throw new Error(`Question override version conflict while applying revision: ${questionId}`);
    }
  }

  await client.query('DELETE FROM question_option_overrides WHERE question_id = $1', [questionId]);
  if (snapshot.optionContentOverrides.length > 0) {
    await client.query(
      `
        INSERT INTO question_option_overrides (
          option_id,
          question_id,
          content_override,
          updated_by_admin_id
        )
        SELECT
          (entry->>'optionId')::uuid,
          $1,
          entry->>'content',
          $2
        FROM jsonb_array_elements($3::jsonb) entry
      `,
      [questionId, actorId, JSON.stringify(snapshot.optionContentOverrides)],
    );
  }

  return nextVersion;
}

async function runWorkflowTransaction(
  client: QueryClient,
  questionId: string,
  operation: (
    transactionClient: TransactionClient,
    before: AdminQuestionReviewDetailV1,
  ) => Promise<QuestionOverrideWorkflowResult>,
): Promise<QuestionOverrideWorkflowResult> {
  const transactionClient = await checkoutTransactionClient(client);
  let transactionStarted = false;
  try {
    await transactionClient.query('BEGIN');
    transactionStarted = true;
    await lockQuestion(transactionClient, questionId);
    const before = await loadQuestionDetail(transactionClient, questionId);
    if (!before) {
      await transactionClient.query('ROLLBACK');
      transactionStarted = false;
      return { status: 'question_not_found' };
    }

    const result = await operation(transactionClient, before);
    await transactionClient.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) await transactionClient.query('ROLLBACK');
    throw error;
  } finally {
    transactionClient.release?.();
  }
}
