import { randomUUID } from 'node:crypto';
import type {
  AddAdminQuestionReviewFlagV1,
  AdminQuestionReviewDetailV1,
  AdminQuestionReviewFlagV1,
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
  QuestionReviewRow,
  TransactionClient,
  UpdateAdminQuestionOverrideInput,
} from './types.js';
import {
  mapFlagRow,
  mapQuestionDetail,
  mapQuestionReviewRow,
} from './mappers.js';

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
        if (!await allOptionsBelongToQuestion(transactionClient, input.questionId, input.changes.optionContentOverrides.map((option) => option.optionId))) {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'option_not_found' };
        }

        await upsertQuestionOverride(transactionClient, input);
        for (const option of input.changes.optionContentOverrides) {
          await upsertQuestionOptionOverride(transactionClient, input.questionId, option.optionId, option.content, input.actor.id);
        }

        const after = await loadQuestionDetail(transactionClient, input.questionId);
        if (!after) {
          throw new Error(`Question review disappeared after override update: ${input.questionId}`);
        }

        await transactionClient.query('COMMIT');
        transactionStarted = false;

        return { status: 'updated', before, after };
      } catch (error) {
        if (transactionStarted) {
          await transactionClient.query('ROLLBACK');
        }

        throw error;
      } finally {
        transactionClient.release?.();
      }
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

  return mapQuestionDetail(core, flags, options);
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

async function upsertQuestionOverride(
  client: QueryClient,
  input: UpdateAdminQuestionOverrideInput,
): Promise<void> {
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
      VALUES (
        $1,
        CASE WHEN $3::boolean THEN $2::text ELSE NULL END,
        CASE WHEN $5::boolean THEN $4::text ELSE NULL END,
        CASE WHEN $7::boolean THEN $6::text ELSE NULL END,
        $8,
        1,
        $9
      )
      ON CONFLICT (question_id) DO UPDATE SET
        content_override = CASE WHEN $3::boolean THEN $2::text ELSE question_overrides.content_override END,
        answer_raw_override = CASE WHEN $5::boolean THEN $4::text ELSE question_overrides.answer_raw_override END,
        analyze_raw_override = CASE WHEN $7::boolean THEN $6::text ELSE question_overrides.analyze_raw_override END,
        note = $8,
        version = question_overrides.version + 1,
        updated_by_admin_id = $9,
        updated_at = now()
    `,
    [
      input.questionId,
      input.changes.content ?? null,
      input.changes.content !== undefined,
      input.changes.answerRaw ?? null,
      input.changes.answerRaw !== undefined,
      input.changes.analyzeRaw ?? null,
      input.changes.analyzeRaw !== undefined,
      input.changes.note,
      input.actor.id,
    ],
  );
}

async function upsertQuestionOptionOverride(
  client: QueryClient,
  questionId: string,
  optionId: string,
  content: string,
  actorId: string,
): Promise<void> {
  await client.query(
    `
      INSERT INTO question_option_overrides (
        option_id,
        question_id,
        content_override,
        updated_by_admin_id
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (option_id) DO UPDATE SET
        question_id = EXCLUDED.question_id,
        content_override = EXCLUDED.content_override,
        updated_by_admin_id = EXCLUDED.updated_by_admin_id,
        updated_at = now()
    `,
    [optionId, questionId, content, actorId],
  );
}
