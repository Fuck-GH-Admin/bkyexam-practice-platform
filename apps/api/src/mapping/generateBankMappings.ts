import type { ImportedClassification, ImportedQuestion } from '../import/loadQuestionBankData.js';
import { generateBankMapping, type BankMapping } from './bankMapping.js';

export function generateBankMappings(
  classifications: readonly ImportedClassification[],
  questions: readonly ImportedQuestion[],
): BankMapping[] {
  const classificationsById = new Map(classifications.map((classification) => [classification.id, classification]));
  const questionCounts = new Map<string, number>();
  const descendantQuestionCounts = new Map<string, number>();

  for (const question of questions) {
    questionCounts.set(question.classificationId, (questionCounts.get(question.classificationId) ?? 0) + 1);
  }

  for (const [classificationId, count] of questionCounts) {
    const visited = new Set<string>();
    let parentId = classificationsById.get(classificationId)?.parentId ?? null;

    while (parentId !== null && !visited.has(parentId)) {
      visited.add(parentId);
      descendantQuestionCounts.set(parentId, (descendantQuestionCounts.get(parentId) ?? 0) + count);
      parentId = classificationsById.get(parentId)?.parentId ?? null;
    }
  }

  return classifications
    .map((classification) => ({
      classification,
      questionCount: questionCounts.get(classification.id) ?? 0,
      descendantQuestionCount: descendantQuestionCounts.get(classification.id) ?? 0,
    }))
    .filter(({ questionCount, descendantQuestionCount }) => questionCount > 0 || descendantQuestionCount > 0)
    .map(({ classification, questionCount, descendantQuestionCount }) =>
      generateBankMapping({
        id: classification.id,
        name: classification.name,
        parentId: classification.parentId,
        qGroup: classification.qGroup,
        level: getClassificationLevel(classification, classificationsById),
        questionCount,
        descendantQuestionCount,
      }),
    );
}

function getClassificationLevel(
  classification: ImportedClassification,
  classificationsById: ReadonlyMap<string, ImportedClassification>,
): number {
  let level = 0;
  let parentId = classification.parentId;
  const visited = new Set<string>();

  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = classificationsById.get(parentId);
    if (!parent) break;

    level += 1;
    parentId = parent.parentId;
  }

  return level;
}
