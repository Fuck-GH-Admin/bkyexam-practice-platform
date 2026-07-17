import type { AdminBankMappingDetailV1 } from '@bkyexam-practice/shared';
import type {
  AdminBankMappingActor,
  AdminBankMappingUpdateChanges,
  UpdateAdminBankMappingResult,
} from './types.js';
import { cloneMapping, studentPreviewFor } from './mappers.js';

export function applyChanges(
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

export function wouldBeVisibleActiveWithoutObjectiveQuestions(
  mapping: AdminBankMappingDetailV1,
  changes: AdminBankMappingUpdateChanges,
): boolean {
  const nextVisible = changes.visible ?? mapping.visible;
  const nextStatus = changes.status ?? mapping.status;
  return nextVisible && nextStatus === 'active' && mapping.objectiveQuestionCount <= 0;
}

export function bulkFailureMessage(status: Exclude<UpdateAdminBankMappingResult['status'], 'updated'>) {
  if (status === 'not_found') return 'Bank mapping not found';
  if (status === 'version_conflict') return 'Bank mapping version conflict';
  return 'Cannot publish bank mapping without objective questions';
}
