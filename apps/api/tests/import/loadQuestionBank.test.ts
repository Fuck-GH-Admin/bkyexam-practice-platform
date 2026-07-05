import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadQuestionBankSummary } from '../../src/import/loadQuestionBank';

describe('loadQuestionBankSummary', () => {
  it('counts classifications, options, compact qtype filenames, and normalized question types', async () => {
    const questionBankDir = fileURLToPath(new URL('fixtures/compact-qtype/', import.meta.url));

    const summary = await loadQuestionBankSummary(questionBankDir);

    expect(summary.classifications).toBe(1);
    expect(summary.options).toBe(1);
    expect(summary.questions).toBe(2);
    expect(summary.questionTypes.single_choice).toBe(1);
    expect(summary.questionTypes.yes_no).toBe(1);
  });
});
