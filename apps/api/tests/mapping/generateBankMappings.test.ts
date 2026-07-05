import { describe, expect, it } from 'vitest';
import { generateBankMappings } from '../../src/mapping/generateBankMappings';
import type { ImportedClassification, ImportedQuestion } from '../../src/import/loadQuestionBankData';

describe('generateBankMappings', () => {
  it('generates persistable bank mappings with direct and descendant question counts', () => {
    const classifications: ImportedClassification[] = [
      classification({ id: 'python-root', name: '2026版Python题库', parentId: null, qGroup: 66 }),
      classification({ id: 'python-single-choice', name: '单选题', parentId: 'python-root', qGroup: 66 }),
      classification({ id: 'empty-bank', name: '空题库', parentId: null, qGroup: 999 }),
    ];
    const questions: ImportedQuestion[] = [
      question({ id: 'question-1', classificationId: 'python-single-choice', qGroup: 66 }),
      question({ id: 'question-2', classificationId: 'python-single-choice', qGroup: 66 }),
    ];

    const mappings = generateBankMappings(classifications, questions);

    expect(mappings.map((mapping) => mapping.bankId)).toEqual(['python-root', 'python-single-choice']);
    expect(mappings.find((mapping) => mapping.bankId === 'python-root')).toMatchObject({
      subjectCategory: '信息技术',
      subjectName: 'Python',
      questionCount: 0,
      descendantQuestionCount: 2,
      visible: true,
      status: 'active',
    });
    expect(mappings.find((mapping) => mapping.bankId === 'python-single-choice')).toMatchObject({
      subjectCategory: '信息技术',
      subjectName: 'Python',
      questionCount: 2,
      descendantQuestionCount: 0,
      visible: false,
      status: 'hidden',
    });
  });
});

function classification(overrides: Partial<ImportedClassification>): ImportedClassification {
  return {
    id: 'classification-id',
    name: '题库',
    parentId: null,
    qGroup: 999,
    sort: 0,
    isDeleted: false,
    ...overrides,
  };
}

function question(overrides: Partial<ImportedQuestion>): ImportedQuestion {
  return {
    id: 'question-id',
    classificationId: 'classification-id',
    qType: 1,
    normalizedType: 'single_choice',
    qGroup: 999,
    content: 'Question content',
    answerRaw: '',
    analyzeRaw: '',
    useCount: 0,
    difficulty: 0,
    searchableText: 'Question content',
    ...overrides,
  };
}
