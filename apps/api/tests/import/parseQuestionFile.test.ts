import { describe, expect, it } from 'vitest';
import { parseQuestionFile } from '../../src/import/parseQuestionFile';

describe('parseQuestionFile', () => {
  it('parses single-choice question blocks', () => {
    const input = `# qType=1 (SingleChoice)
=== Q1 (useCount=566, diff=0.6) ===
qID: 532b85f1-b6a8-4784-802b-00c7601ab8d3
cID: 919e9a73-e9e0-4dbe-8acf-9860f1384a47 (word)
qGroup: 0
Content: Word在编辑一个文档完毕后，要想知道它打印后的结果，可使用（  ）功能
Answer: 708cacd0-3e06-4bf7-80f0-09e11c7eeac5
`;

    expect(parseQuestionFile(input, 1)).toEqual([
      {
        id: '532b85f1-b6a8-4784-802b-00c7601ab8d3',
        classificationId: '919e9a73-e9e0-4dbe-8acf-9860f1384a47',
        className: 'word',
        qType: 1,
        qGroup: 0,
        content: 'Word在编辑一个文档完毕后，要想知道它打印后的结果，可使用（  ）功能',
        answerRaw: '708cacd0-3e06-4bf7-80f0-09e11c7eeac5',
        analyzeRaw: '',
        useCount: 566,
        difficulty: 0.6,
      },
    ]);
  });

  it('parses bare cID values with an empty class name', () => {
    const input = `# qType=1 (SingleChoice)
=== Q1 (useCount=1, diff=0.1) ===
qID: 532b85f1-b6a8-4784-802b-00c7601ab8d3
cID: 919e9a73-e9e0-4dbe-8acf-9860f1384a47
qGroup: 0
Content: Question text
Answer: 708cacd0-3e06-4bf7-80f0-09e11c7eeac5
`;

    expect(parseQuestionFile(input, 1)[0]).toMatchObject({
      classificationId: '919e9a73-e9e0-4dbe-8acf-9860f1384a47',
      className: '',
    });
  });

  it('parses optional multiline Analyze fields', () => {
    const input = `# qType=1 (SingleChoice)
=== Q1 (useCount=1, diff=0.1) ===
qID: 532b85f1-b6a8-4784-802b-00c7601ab8d3
cID: 919e9a73-e9e0-4dbe-8acf-9860f1384a47 (word)
qGroup: 0
Content: Question text
Answer: 708cacd0-3e06-4bf7-80f0-09e11c7eeac5
Analyze: First line
Second line with details
`;

    expect(parseQuestionFile(input, 1)[0]?.analyzeRaw).toBe('First line\nSecond line with details');
  });

  it('normalizes CRLF, LF, and CR line endings', () => {
    const input = [
      '# qType=1 (SingleChoice)',
      '=== Q1 (useCount=1, diff=0.1) ===',
      'qID: 532b85f1-b6a8-4784-802b-00c7601ab8d3',
      'cID: 919e9a73-e9e0-4dbe-8acf-9860f1384a47 (word)',
      'qGroup: 0',
      'Content: Question text',
      'Answer: 708cacd0-3e06-4bf7-80f0-09e11c7eeac5',
    ].join('\r');

    expect(parseQuestionFile(input, 1)[0]).toMatchObject({
      id: '532b85f1-b6a8-4784-802b-00c7601ab8d3',
      className: 'word',
      content: 'Question text',
      answerRaw: '708cacd0-3e06-4bf7-80f0-09e11c7eeac5',
    });
  });

  it('preserves blank continuation lines inside multiline fields', () => {
    const input = `# qType=1 (SingleChoice)
=== Q1 (useCount=1, diff=0.1) ===
qID: 532b85f1-b6a8-4784-802b-00c7601ab8d3
cID: 919e9a73-e9e0-4dbe-8acf-9860f1384a47 (word)
qGroup: 0
Content: First line

Third line
Answer: First answer line

Third answer line
Analyze: First analyze line

Third analyze line
`;

    expect(parseQuestionFile(input, 1)[0]).toMatchObject({
      content: 'First line\n\nThird line',
      answerRaw: 'First answer line\n\nThird answer line',
      analyzeRaw: 'First analyze line\n\nThird analyze line',
    });
  });

  it('parses present but empty Content fields from real question files', () => {
    const input = `# qType=1 (SingleChoice)
=== Q1 (useCount=1, diff=0.1) ===
qID: 532b85f1-b6a8-4784-802b-00c7601ab8d3
cID: 919e9a73-e9e0-4dbe-8acf-9860f1384a47 (word)
qGroup: 0
Content:
Answer: 708cacd0-3e06-4bf7-80f0-09e11c7eeac5
`;

    expect(parseQuestionFile(input, 1)[0]?.content).toBe('');
  });

  it('throws on invalid numeric question fields', () => {
    const validBase = `# qType=1 (SingleChoice)
=== Q1 (useCount=1, diff=0.1) ===
qID: 532b85f1-b6a8-4784-802b-00c7601ab8d3
cID: 919e9a73-e9e0-4dbe-8acf-9860f1384a47 (word)
qGroup: 0
Content: Question text
Answer: 708cacd0-3e06-4bf7-80f0-09e11c7eeac5
`;

    expect(() => parseQuestionFile(validBase.replace('qGroup: 0', 'qGroup: nope'), 1)).toThrow(/Invalid qGroup/);
    expect(() => parseQuestionFile(validBase.replace('useCount=1', 'useCount=abc'), 1)).toThrow(/Invalid useCount/);
    expect(() => parseQuestionFile(validBase.replace('diff=0.1', 'diff=abc'), 1)).toThrow(/Invalid difficulty/);
  });

  it('throws when required question fields are missing', () => {
    const input = `# qType=1 (SingleChoice)
=== Q1 (useCount=1, diff=0.1) ===
qID: 532b85f1-b6a8-4784-802b-00c7601ab8d3
cID: 919e9a73-e9e0-4dbe-8acf-9860f1384a47 (word)
qGroup: 0
Content: Question text
`;

    expect(() => parseQuestionFile(input, 1)).toThrow(/Missing required question field: Answer/);
  });
});
