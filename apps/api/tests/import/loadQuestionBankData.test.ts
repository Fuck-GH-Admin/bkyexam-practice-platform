import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadQuestionBankData } from '../../src/import/loadQuestionBankData';

describe('loadQuestionBankData', () => {
  it('loads parsed import records and summary counts from a question bank directory', async () => {
    const questionBankDir = await mkdtemp(join(tmpdir(), 'questionbank-'));
    const classificationId = '919e9a73-e9e0-4dbe-8acf-9860f1384a47';
    const questionId = '532b85f1-b6a8-4784-802b-00c7601ab8d3';
    const firstOptionId = '708cacd0-3e06-4bf7-80f0-09e11c7eeac5';
    const secondOptionId = '463a57b6-36e6-4b07-b01c-c74be0037592';

    try {
      await writeFile(
        join(questionBankDir, 'classifications.txt'),
        `${classificationId}|Word processing|00000000-0000-0000-0000-000000000000|0|1|false\n`,
      );
      await writeFile(
        join(questionBankDir, 'change_question_answers.txt'),
        `${firstOptionId}|${questionId}|1|Print preview\n${secondOptionId}|${questionId}|2|Page setup`,
      );
      await writeFile(
        join(questionBankDir, 'qtype_1_SingleChoice.txt'),
        `# qType=1 (SingleChoice)
=== Q1 (useCount=566, diff=0.6) ===
qID: ${questionId}
cID: ${classificationId} (word)
qGroup: 0
Content: Word   document
	print preview
Answer: ${firstOptionId}
Analyze: Use preview before printing.
`,
      );

      const data = await loadQuestionBankData(questionBankDir);

      expect(data.classifications).toEqual([
        {
          id: classificationId,
          name: 'Word processing',
          parentId: null,
          qGroup: 0,
          sort: 1,
          isDeleted: false,
        },
      ]);
      expect(data.questions).toEqual([
        {
          id: questionId,
          classificationId,
          qType: 1,
          normalizedType: 'single_choice',
          qGroup: 0,
          content: 'Word   document\n\tprint preview',
          answerRaw: firstOptionId,
          analyzeRaw: 'Use preview before printing.',
          useCount: 566,
          difficulty: 0.6,
          searchableText: 'Word document print preview word',
        },
      ]);
      expect(data.options).toEqual([
        {
          id: firstOptionId,
          questionId,
          sort: 1,
          content: 'Print preview',
        },
        {
          id: secondOptionId,
          questionId,
          sort: 2,
          content: 'Page setup',
        },
      ]);
      expect(data.summary).toEqual({
        classifications: 1,
        options: 2,
        questions: 1,
        questionTypes: { single_choice: 1 },
      });
    } finally {
      await rm(questionBankDir, { recursive: true, force: true });
    }
  });
});
