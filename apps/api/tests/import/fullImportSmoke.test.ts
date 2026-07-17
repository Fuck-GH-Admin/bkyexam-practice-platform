import { describe, expect, it } from 'vitest';
import { currentCorpusBaseline } from '../../src/import/currentCorpusBaseline.js';
import {
  assertCurrentCorpusImportCounts,
  assertCurrentCorpusSummary,
} from '../../src/import/fullImportSmoke.js';

describe('full import smoke baseline', () => {
  it('accepts the recorded current corpus summary', () => {
    expect(() => assertCurrentCorpusSummary({
      classifications: currentCorpusBaseline.classifications,
      questions: currentCorpusBaseline.questions,
      options: currentCorpusBaseline.rawOptions,
      questionTypes: { ...currentCorpusBaseline.questionTypes },
    })).not.toThrow();
  });

  it('rejects corpus count or question-type drift', () => {
    expect(() => assertCurrentCorpusSummary({
      classifications: currentCorpusBaseline.classifications,
      questions: currentCorpusBaseline.questions - 1,
      options: currentCorpusBaseline.rawOptions,
      questionTypes: { ...currentCorpusBaseline.questionTypes },
    })).toThrow('parsed questions changed');

    expect(() => assertCurrentCorpusSummary({
      classifications: currentCorpusBaseline.classifications,
      questions: currentCorpusBaseline.questions,
      options: currentCorpusBaseline.rawOptions,
      questionTypes: {
        ...currentCorpusBaseline.questionTypes,
        single_choice: currentCorpusBaseline.questionTypes.single_choice - 1,
      },
    })).toThrow('parsed question type counts changed');
  });

  it('accepts only the recorded imported and skipped option counts', () => {
    expect(() => assertCurrentCorpusImportCounts({
      classifications: currentCorpusBaseline.classifications,
      questions: currentCorpusBaseline.questions,
      options: currentCorpusBaseline.importedOptions,
      skippedOptions: currentCorpusBaseline.skippedOptions,
      bankMappings: currentCorpusBaseline.bankMappings,
    })).not.toThrow();

    expect(() => assertCurrentCorpusImportCounts({
      classifications: currentCorpusBaseline.classifications,
      questions: currentCorpusBaseline.questions,
      options: currentCorpusBaseline.importedOptions + 1,
      skippedOptions: currentCorpusBaseline.skippedOptions - 1,
      bankMappings: currentCorpusBaseline.bankMappings,
    })).toThrow('import counts changed');
  });
});
