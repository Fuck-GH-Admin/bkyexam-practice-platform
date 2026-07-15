import type { AdminBankMappingDetailV1, AdminBankMappingListItemV1 } from '@bkyexam-practice/shared';
import type { AdminBankMappingRow } from './types.js';

export function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function toQuestionTypeCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, count]) => [key, Number(count)]),
  );
}

export function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function studentPreviewFor(input: { visible: boolean; status: string; objectiveQuestionCount: number }) {
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

export function cloneMapping(mapping: AdminBankMappingDetailV1): AdminBankMappingDetailV1 {
  return {
    ...mapping,
    questionTypes: [...mapping.questionTypes],
    keywords: [...mapping.keywords],
    questionTypeCounts: { ...mapping.questionTypeCounts },
    studentPreview: { ...mapping.studentPreview },
    updatedBy: mapping.updatedBy ? { ...mapping.updatedBy } : null,
  };
}
export function mapListRow(row: AdminBankMappingRow): AdminBankMappingListItemV1 {
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

export function mapDetailRow(row: AdminBankMappingRow): AdminBankMappingDetailV1 {
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
