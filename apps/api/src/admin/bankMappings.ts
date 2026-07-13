import type {
  AdminBankMappingDetailV1,
  AdminBankMappingListItemV1,
  BulkUpdateAdminBankMappingStatusChangesV1,
  BulkUpdateAdminBankMappingStatusRequestV1,
  ListAdminBankMappingsRequestV1,
  UpdateAdminBankMappingChangesV1,
  UpdateAdminBankMappingRequestV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../db/client.js';

export type AdminBankMappingListFilters = ListAdminBankMappingsRequestV1;
export type AdminBankMappingUpdateChanges = UpdateAdminBankMappingChangesV1;
export type AdminBankMappingBulkStatusChanges = BulkUpdateAdminBankMappingStatusChangesV1;

export interface AdminBankMappingActor {
  id: string;
  displayName: string;
}

export interface UpdateAdminBankMappingInput {
  bankId: string;
  expectedVersion: number;
  changes: AdminBankMappingUpdateChanges;
  actor: AdminBankMappingActor;
}

export type UpdateAdminBankMappingResult =
  | {
    status: 'updated';
    before: AdminBankMappingDetailV1;
    after: AdminBankMappingDetailV1;
  }
  | { status: 'not_found' }
  | { status: 'version_conflict' }
  | { status: 'active_without_objective_questions' };

export interface BulkUpdateAdminBankMappingStatusInput {
  items: BulkUpdateAdminBankMappingStatusRequestV1['items'];
  changes: AdminBankMappingBulkStatusChanges;
  actor: AdminBankMappingActor;
}

export interface BulkUpdateAdminBankMappingStatusResult {
  updated: Array<{
    bankId: string;
    version: number;
    before: AdminBankMappingDetailV1;
    after: AdminBankMappingDetailV1;
  }>;
  failed: Array<{ bankId: string; error: string }>;
}

export interface AdminBankMappingPage {
  bankMappings: AdminBankMappingListItemV1[];
  page: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AdminBankMappingRepository {
  listBankMappings(filters: AdminBankMappingListFilters): Promise<AdminBankMappingPage>;
  findBankMappingById(bankId: string): Promise<AdminBankMappingDetailV1 | null>;
  updateBankMapping(input: UpdateAdminBankMappingInput): Promise<UpdateAdminBankMappingResult>;
  bulkUpdateBankMappingStatus(
    input: BulkUpdateAdminBankMappingStatusInput,
  ): Promise<BulkUpdateAdminBankMappingStatusResult>;
}

interface QueryRows<T> {
  rows: T[];
}

interface AdminBankMappingRow {
  bank_id: string;
  raw_name: string;
  bank_name: string;
  subject_category: string;
  subject_name: string;
  parent_id: string | null;
  parent_name?: string | null;
  q_group: number | string;
  visible: boolean;
  status: string;
  difficulty: string;
  exam_purpose: string;
  question_types: unknown;
  audience: string;
  keywords: unknown;
  description: string;
  notes: string;
  question_count: number | string;
  descendant_question_count: number | string;
  objective_question_count: number | string | null;
  question_type_counts?: unknown;
  version: number | string;
  updated_at: Date | string;
  updated_by_admin_id: string | null;
  updated_by_display_name: string | null;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function toQuestionTypeCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, count]) => [key, Number(count)]),
  );
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function studentPreviewFor(input: { visible: boolean; status: string; objectiveQuestionCount: number }) {
  if (!input.visible) {
    return { visibleInStudentCatalog: false, reason: 'bank hidden' };
  }

  if (input.status !== 'active') {
    return { visibleInStudentCatalog: false, reason: `status is ${input.status}` };
  }

  if (input.objectiveQuestionCount <= 0) {
    return { visibleInStudentCatalog: false, reason: 'no objective questions' };
  }

  return { visibleInStudentCatalog: true, reason: 'visible active bank with objective questions' };
}

function cloneMapping(mapping: AdminBankMappingDetailV1): AdminBankMappingDetailV1 {
  return {
    ...mapping,
    questionTypes: [...mapping.questionTypes],
    keywords: [...mapping.keywords],
    questionTypeCounts: { ...mapping.questionTypeCounts },
    studentPreview: { ...mapping.studentPreview },
    updatedBy: mapping.updatedBy ? { ...mapping.updatedBy } : null,
  };
}

function applyChanges(
  mapping: AdminBankMappingDetailV1,
  changes: AdminBankMappingUpdateChanges,
  actor: AdminBankMappingActor,
): AdminBankMappingDetailV1 {
  const next: AdminBankMappingDetailV1 = {
    ...cloneMapping(mapping),
    ...changes,
    keywords: changes.keywords ? [...changes.keywords] : [...mapping.keywords],
    version: mapping.version + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: { id: actor.id, displayName: actor.displayName },
  };

  next.studentPreview = studentPreviewFor({
    visible: next.visible,
    status: next.status,
    objectiveQuestionCount: next.objectiveQuestionCount,
  });

  return next;
}

function wouldBeVisibleActiveWithoutObjectiveQuestions(
  mapping: AdminBankMappingDetailV1,
  changes: AdminBankMappingUpdateChanges,
): boolean {
  const nextVisible = changes.visible ?? mapping.visible;
  const nextStatus = changes.status ?? mapping.status;
  return nextVisible && nextStatus === 'active' && mapping.objectiveQuestionCount <= 0;
}

function bulkFailureMessage(status: Exclude<UpdateAdminBankMappingResult['status'], 'updated'>) {
  if (status === 'not_found') return 'Bank mapping not found';
  if (status === 'version_conflict') return 'Bank mapping version conflict';
  return 'Cannot publish bank mapping without objective questions';
}

function mapListRow(row: AdminBankMappingRow): AdminBankMappingListItemV1 {
  const updatedBy = row.updated_by_admin_id && row.updated_by_display_name
    ? { id: row.updated_by_admin_id, displayName: row.updated_by_display_name }
    : null;

  return {
    bankId: row.bank_id,
    rawName: row.raw_name,
    bankName: row.bank_name,
    subjectCategory: row.subject_category,
    subjectName: row.subject_name,
    parentId: row.parent_id,
    qGroup: Number(row.q_group),
    visible: row.visible,
    status: row.status as AdminBankMappingListItemV1['status'],
    difficulty: row.difficulty,
    examPurpose: row.exam_purpose,
    questionTypes: toStringArray(row.question_types),
    audience: row.audience,
    keywords: toStringArray(row.keywords),
    description: row.description,
    notes: row.notes,
    questionCount: Number(row.question_count),
    descendantQuestionCount: Number(row.descendant_question_count),
    objectiveQuestionCount: Number(row.objective_question_count ?? 0),
    version: Number(row.version),
    updatedAt: toIsoTimestamp(row.updated_at),
    updatedBy,
  };
}

function mapDetailRow(row: AdminBankMappingRow): AdminBankMappingDetailV1 {
  const listItem = mapListRow(row);
  return {
    ...listItem,
    parentName: row.parent_name ?? null,
    questionTypeCounts: toQuestionTypeCounts(row.question_type_counts),
    studentPreview: studentPreviewFor({
      visible: listItem.visible,
      status: listItem.status,
      objectiveQuestionCount: listItem.objectiveQuestionCount,
    }),
  };
}

export function createMemoryAdminBankMappingRepository(
  mappings: readonly AdminBankMappingDetailV1[] = [],
): AdminBankMappingRepository {
  const records = mappings.map(cloneMapping);

  async function updateBankMapping(
    input: UpdateAdminBankMappingInput,
  ): Promise<UpdateAdminBankMappingResult> {
    const index = records.findIndex((mapping) => mapping.bankId === input.bankId);
    if (index < 0) {
      return { status: 'not_found' };
    }

    const before = cloneMapping(records[index]);
    if (before.version !== input.expectedVersion) {
      return { status: 'version_conflict' };
    }

    if (wouldBeVisibleActiveWithoutObjectiveQuestions(before, input.changes)) {
      return { status: 'active_without_objective_questions' };
    }

    const after = applyChanges(before, input.changes, input.actor);
    records[index] = after;

    return { status: 'updated', before, after: cloneMapping(after) };
  }

  return {
    async listBankMappings(filters) {
      const filtered = records.filter((mapping) => {
        if (filters.status && mapping.status !== filters.status) return false;
        if (filters.visible !== undefined && mapping.visible !== filters.visible) return false;
        if (filters.subjectCategory && mapping.subjectCategory !== filters.subjectCategory) return false;
        if (filters.subjectName && mapping.subjectName !== filters.subjectName) return false;
        if (filters.qGroup !== undefined && mapping.qGroup !== filters.qGroup) return false;
        if (filters.parentId && mapping.parentId !== filters.parentId) return false;
        if (
          filters.hasObjectiveQuestions !== undefined
          && (mapping.objectiveQuestionCount > 0) !== filters.hasObjectiveQuestions
        ) {
          return false;
        }
        if (!filters.keyword) return true;

        const keyword = filters.keyword.toLocaleLowerCase();
        return [
          mapping.bankName,
          mapping.rawName,
          mapping.subjectCategory,
          mapping.subjectName,
          ...mapping.keywords,
        ].some((value) => value.toLocaleLowerCase().includes(keyword));
      });
      const pageItems = filtered.slice(filters.offset, filters.offset + filters.limit + 1);
      const hasMore = pageItems.length > filters.limit;

      return {
        bankMappings: pageItems
          .slice(0, filters.limit)
          .map(({ parentName, questionTypeCounts, studentPreview, ...item }) => item),
        page: { limit: filters.limit, offset: filters.offset, hasMore },
      };
    },

    async findBankMappingById(bankId) {
      const mapping = records.find((candidate) => candidate.bankId === bankId);
      return mapping ? cloneMapping(mapping) : null;
    },

    updateBankMapping,

    async bulkUpdateBankMappingStatus(input) {
      const updated: BulkUpdateAdminBankMappingStatusResult['updated'] = [];
      const failed: BulkUpdateAdminBankMappingStatusResult['failed'] = [];

      for (const item of input.items) {
        const result = await updateBankMapping({
          bankId: item.bankId,
          expectedVersion: item.expectedVersion,
          changes: input.changes,
          actor: input.actor,
        });

        if (result.status === 'updated') {
          updated.push({
            bankId: result.after.bankId,
            version: result.after.version,
            before: result.before,
            after: result.after,
          });
        } else {
          failed.push({ bankId: item.bankId, error: bulkFailureMessage(result.status) });
        }
      }

      return { updated, failed };
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

type TransactionClient = QueryClient & { release?: () => void };

interface ConnectableQueryClient extends QueryClient {
  connect(): Promise<TransactionClient>;
}

async function checkoutTransactionClient(client: QueryClient): Promise<TransactionClient> {
  return isConnectableQueryClient(client) ? client.connect() : client;
}

function isConnectableQueryClient(client: QueryClient): client is ConnectableQueryClient {
  return 'connect' in client && typeof client.connect === 'function';
}

const updateColumnByField = {
  bankName: 'bank_name',
  subjectCategory: 'subject_category',
  subjectName: 'subject_name',
  visible: 'visible',
  status: 'status',
  difficulty: 'difficulty',
  examPurpose: 'exam_purpose',
  audience: 'audience',
  keywords: 'keywords',
  description: 'description',
  notes: 'notes',
} as const satisfies Record<keyof AdminBankMappingUpdateChanges, string>;

function sqlValueForUpdateField(
  field: keyof AdminBankMappingUpdateChanges,
  value: AdminBankMappingUpdateChanges[keyof AdminBankMappingUpdateChanges],
) {
  return field === 'keywords' ? JSON.stringify(value) : value;
}

function assignmentForUpdateField(
  field: keyof AdminBankMappingUpdateChanges,
  placeholder: string,
) {
  const column = updateColumnByField[field];
  return field === 'keywords'
    ? `${column} = ${placeholder}::jsonb`
    : `${column} = ${placeholder}`;
}

export function createPgAdminBankMappingRepository(client: QueryClient): AdminBankMappingRepository {
  async function findBankMappingById(bankId: string, queryClient: QueryClient = client) {
    const result = (await queryClient.query(
      `
        WITH RECURSIVE bank_tree AS (
          SELECT classifications.id AS classification_id
          FROM classifications
          WHERE classifications.id = $1
          UNION ALL
          SELECT classifications.id AS classification_id
          FROM classifications
          JOIN bank_tree ON classifications.parent_id = bank_tree.classification_id
        ), objective_counts AS (
          SELECT count(*) AS objective_question_count
          FROM bank_tree
          JOIN questions ON questions.classification_id = bank_tree.classification_id
          WHERE questions.normalized_type IN ('single_choice', 'multiple_choice', 'yes_no')
        ), question_type_counts AS (
          SELECT COALESCE(jsonb_object_agg(normalized_type, type_count), '{}'::jsonb) AS counts
          FROM (
            SELECT questions.normalized_type, count(*) AS type_count
            FROM bank_tree
            JOIN questions ON questions.classification_id = bank_tree.classification_id
            GROUP BY questions.normalized_type
          ) grouped_question_types
        )
        SELECT
          bank_mappings.bank_id,
          bank_mappings.raw_name,
          bank_mappings.bank_name,
          bank_mappings.subject_category,
          bank_mappings.subject_name,
          bank_mappings.parent_id,
          parent_classification.name AS parent_name,
          bank_mappings.q_group,
          bank_mappings.visible,
          bank_mappings.status,
          bank_mappings.difficulty,
          bank_mappings.exam_purpose,
          bank_mappings.question_types,
          bank_mappings.audience,
          bank_mappings.keywords,
          bank_mappings.description,
          bank_mappings.notes,
          bank_mappings.question_count,
          bank_mappings.descendant_question_count,
          COALESCE(objective_counts.objective_question_count, 0) AS objective_question_count,
          question_type_counts.counts AS question_type_counts,
          bank_mappings.version,
          bank_mappings.updated_at,
          bank_mappings.updated_by_admin_id,
          updated_by.display_name AS updated_by_display_name
        FROM bank_mappings
        LEFT JOIN classifications parent_classification ON parent_classification.id = bank_mappings.parent_id
        LEFT JOIN admin_users updated_by ON updated_by.id = bank_mappings.updated_by_admin_id
        CROSS JOIN objective_counts
        CROSS JOIN question_type_counts
        WHERE bank_mappings.bank_id = $1
        LIMIT 1
      `,
      [bankId],
    )) as QueryRows<AdminBankMappingRow>;
    const row = result.rows[0];

    return row ? mapDetailRow(row) : null;
  }

  async function updateBankMapping(
    input: UpdateAdminBankMappingInput,
  ): Promise<UpdateAdminBankMappingResult> {
    const transactionClient = await checkoutTransactionClient(client);
    let transactionStarted = false;

    try {
      await transactionClient.query('BEGIN');
      transactionStarted = true;

      const lockResult = (await transactionClient.query(
        `
          SELECT bank_id
          FROM bank_mappings
          WHERE bank_id = $1
          FOR UPDATE
        `,
        [input.bankId],
      )) as QueryRows<{ bank_id: string }>;

      if (!lockResult.rows[0]) {
        await transactionClient.query('ROLLBACK');
        transactionStarted = false;
        return { status: 'not_found' };
      }

      const before = await findBankMappingById(input.bankId, transactionClient);
      if (!before) {
        await transactionClient.query('ROLLBACK');
        transactionStarted = false;
        return { status: 'not_found' };
      }

      if (before.version !== input.expectedVersion) {
        await transactionClient.query('ROLLBACK');
        transactionStarted = false;
        return { status: 'version_conflict' };
      }

      if (wouldBeVisibleActiveWithoutObjectiveQuestions(before, input.changes)) {
        await transactionClient.query('ROLLBACK');
        transactionStarted = false;
        return { status: 'active_without_objective_questions' };
      }

      const fields = Object.keys(input.changes) as Array<keyof AdminBankMappingUpdateChanges>;
      const params: unknown[] = [];
      const assignments = fields.map((field) => {
        params.push(sqlValueForUpdateField(field, input.changes[field]));
        return assignmentForUpdateField(field, `$${params.length}`);
      });
      params.push(input.actor.id);
      const actorPlaceholder = `$${params.length}`;
      params.push(input.bankId);
      const bankIdPlaceholder = `$${params.length}`;
      params.push(input.expectedVersion);
      const expectedVersionPlaceholder = `$${params.length}`;

      const updateResult = (await transactionClient.query(
        `
          UPDATE bank_mappings
          SET
            ${assignments.join(', ')},
            version = version + 1,
            updated_at = now(),
            updated_by_admin_id = ${actorPlaceholder}
          WHERE bank_id = ${bankIdPlaceholder}
            AND version = ${expectedVersionPlaceholder}
          RETURNING bank_id
        `,
        params,
      )) as QueryRows<{ bank_id: string }>;

      if (!updateResult.rows[0]) {
        await transactionClient.query('ROLLBACK');
        transactionStarted = false;
        return { status: 'version_conflict' };
      }

      const after = await findBankMappingById(input.bankId, transactionClient);
      if (!after) {
        throw new Error(`Bank mapping disappeared after update: ${input.bankId}`);
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
  }

  return {
    async listBankMappings(filters) {
      const params: unknown[] = [];
      const where: string[] = [];
      const objectiveWhere: string[] = [];

      if (filters.status) {
        addFilter(params, where, (placeholder) => `bank_mappings.status = ${placeholder}`, filters.status);
      }
      if (filters.visible !== undefined) {
        addFilter(params, where, (placeholder) => `bank_mappings.visible = ${placeholder}`, filters.visible);
      }
      if (filters.subjectCategory) {
        addFilter(params, where, (placeholder) => `bank_mappings.subject_category = ${placeholder}`, filters.subjectCategory);
      }
      if (filters.subjectName) {
        addFilter(params, where, (placeholder) => `bank_mappings.subject_name = ${placeholder}`, filters.subjectName);
      }
      if (filters.qGroup !== undefined) {
        addFilter(params, where, (placeholder) => `bank_mappings.q_group = ${placeholder}`, filters.qGroup);
      }
      if (filters.parentId) {
        addFilter(params, where, (placeholder) => `bank_mappings.parent_id = ${placeholder}`, filters.parentId);
      }
      if (filters.keyword) {
        const pattern = `%${escapeLikePattern(filters.keyword.toLocaleLowerCase())}%`;
        addFilter(params, where, (placeholder) => `(
          lower(bank_mappings.bank_name) LIKE ${placeholder} ESCAPE '\\'
          OR lower(bank_mappings.raw_name) LIKE ${placeholder} ESCAPE '\\'
          OR lower(bank_mappings.subject_name) LIKE ${placeholder} ESCAPE '\\'
          OR lower(bank_mappings.subject_category) LIKE ${placeholder} ESCAPE '\\'
          OR lower(bank_mappings.keywords::text) LIKE ${placeholder} ESCAPE '\\'
        )`, pattern);
      }
      if (filters.hasObjectiveQuestions !== undefined) {
        objectiveWhere.push(
          filters.hasObjectiveQuestions
            ? 'COALESCE(objective_counts.objective_question_count, 0) > 0'
            : 'COALESCE(objective_counts.objective_question_count, 0) = 0',
        );
      }

      params.push(filters.limit + 1);
      const limitPlaceholder = `$${params.length}`;
      params.push(filters.offset);
      const offsetPlaceholder = `$${params.length}`;

      const result = (await client.query(
        `
          WITH RECURSIVE filtered_mappings AS (
            SELECT
              bank_mappings.*,
              updated_by.display_name AS updated_by_display_name
            FROM bank_mappings
            LEFT JOIN admin_users updated_by ON updated_by.id = bank_mappings.updated_by_admin_id
            WHERE ${where.length > 0 ? where.join(' AND ') : 'TRUE'}
          ), bank_classifications AS (
            SELECT filtered_mappings.bank_id, classifications.id AS classification_id
            FROM filtered_mappings
            JOIN classifications ON classifications.id = filtered_mappings.bank_id
            UNION ALL
            SELECT bank_classifications.bank_id, classifications.id AS classification_id
            FROM classifications
            JOIN bank_classifications ON classifications.parent_id = bank_classifications.classification_id
          ), objective_counts AS (
            SELECT bank_classifications.bank_id, count(*) AS objective_question_count
            FROM bank_classifications
            JOIN questions ON questions.classification_id = bank_classifications.classification_id
            WHERE questions.normalized_type IN ('single_choice', 'multiple_choice', 'yes_no')
            GROUP BY bank_classifications.bank_id
          )
          SELECT
            filtered_mappings.bank_id,
            filtered_mappings.raw_name,
            filtered_mappings.bank_name,
            filtered_mappings.subject_category,
            filtered_mappings.subject_name,
            filtered_mappings.parent_id,
            filtered_mappings.q_group,
            filtered_mappings.visible,
            filtered_mappings.status,
            filtered_mappings.difficulty,
            filtered_mappings.exam_purpose,
            filtered_mappings.question_types,
            filtered_mappings.audience,
            filtered_mappings.keywords,
            filtered_mappings.description,
            filtered_mappings.notes,
            filtered_mappings.question_count,
            filtered_mappings.descendant_question_count,
            COALESCE(objective_counts.objective_question_count, 0) AS objective_question_count,
            filtered_mappings.version,
            filtered_mappings.updated_at,
            filtered_mappings.updated_by_admin_id,
            filtered_mappings.updated_by_display_name
          FROM filtered_mappings
          LEFT JOIN objective_counts ON objective_counts.bank_id = filtered_mappings.bank_id
          WHERE ${objectiveWhere.length > 0 ? objectiveWhere.join(' AND ') : 'TRUE'}
          ORDER BY subject_category, subject_name, bank_name, bank_id
          LIMIT ${limitPlaceholder}
          OFFSET ${offsetPlaceholder}
        `,
        params,
      )) as QueryRows<AdminBankMappingRow>;

      const pageRows = result.rows.slice(0, filters.limit);
      return {
        bankMappings: pageRows.map(mapListRow),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: result.rows.length > filters.limit,
        },
      };
    },

    findBankMappingById,
    updateBankMapping,

    async bulkUpdateBankMappingStatus(input) {
      const updated: BulkUpdateAdminBankMappingStatusResult['updated'] = [];
      const failed: BulkUpdateAdminBankMappingStatusResult['failed'] = [];

      for (const item of input.items) {
        const result = await updateBankMapping({
          bankId: item.bankId,
          expectedVersion: item.expectedVersion,
          changes: input.changes,
          actor: input.actor,
        });

        if (result.status === 'updated') {
          updated.push({
            bankId: result.after.bankId,
            version: result.after.version,
            before: result.before,
            after: result.after,
          });
        } else {
          failed.push({ bankId: item.bankId, error: bulkFailureMessage(result.status) });
        }
      }

      return { updated, failed };
    },
  };
}
