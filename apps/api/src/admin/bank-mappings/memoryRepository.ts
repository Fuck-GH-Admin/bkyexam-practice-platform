import type { AdminBankMappingDetailV1 } from '@bkyexam-practice/shared';
import type {
  AdminBankMappingRepository,
  BulkUpdateAdminBankMappingStatusResult,
  UpdateAdminBankMappingInput,
  UpdateAdminBankMappingResult,
} from './types.js';
import { cloneMapping } from './mappers.js';
import { applyChanges, bulkFailureMessage, wouldBeVisibleActiveWithoutObjectiveQuestions } from './rules.js';

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
