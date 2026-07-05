import { describe, expect, it } from 'vitest';
import { parseOptionFile, parseOptionLine } from '../../src/import/parseOptions';

describe('parseOptionLine', () => {
  it('parses an option line and preserves option text', () => {
    expect(parseOptionLine('708cacd0-3e06-4bf7-80f0-09e11c7eeac5|532b85f1-b6a8-4784-802b-00c7601ab8d3|3| 打印预览')).toEqual({
      id: '708cacd0-3e06-4bf7-80f0-09e11c7eeac5',
      questionId: '532b85f1-b6a8-4784-802b-00c7601ab8d3',
      sort: 3,
      content: ' 打印预览',
    });
  });

  it('preserves extra pipe characters in option content', () => {
    expect(parseOptionLine('708cacd0-3e06-4bf7-80f0-09e11c7eeac5|532b85f1-b6a8-4784-802b-00c7601ab8d3|3|A | B | C')).toMatchObject({
      content: 'A | B | C',
    });
  });

  it('strips a leading UTF-8 BOM from option IDs', () => {
    expect(parseOptionLine('\uFEFF708cacd0-3e06-4bf7-80f0-09e11c7eeac5|532b85f1-b6a8-4784-802b-00c7601ab8d3|3| 打印预览')).toMatchObject({
      id: '708cacd0-3e06-4bf7-80f0-09e11c7eeac5',
      questionId: '532b85f1-b6a8-4784-802b-00c7601ab8d3',
    });
  });

  it('throws on invalid sort values', () => {
    expect(() => parseOptionLine('708cacd0-3e06-4bf7-80f0-09e11c7eeac5|532b85f1-b6a8-4784-802b-00c7601ab8d3|x|content')).toThrow(
      /Invalid option sort/,
    );
  });
});

describe('parseOptionFile', () => {
  it('ignores leading metadata comments before option records', () => {
    const input = `# ChangeQuestionAnswer - options for single/multi choice questions
# Format: cqaID | qID | cqaSort | contentText

708cacd0-3e06-4bf7-80f0-09e11c7eeac5|532b85f1-b6a8-4784-802b-00c7601ab8d3|1|Line one`;

    expect(parseOptionFile(input)).toEqual([
      {
        id: '708cacd0-3e06-4bf7-80f0-09e11c7eeac5',
        questionId: '532b85f1-b6a8-4784-802b-00c7601ab8d3',
        sort: 1,
        content: 'Line one',
      },
    ]);
  });

  it('groups continuation lines with the previous option record', () => {
    const input = `708cacd0-3e06-4bf7-80f0-09e11c7eeac5|532b85f1-b6a8-4784-802b-00c7601ab8d3|1|Line one
Line two

Line four
808cacd0-3e06-4bf7-80f0-09e11c7eeac5|532b85f1-b6a8-4784-802b-00c7601ab8d3|2|Next option`;

    expect(parseOptionFile(input)).toEqual([
      {
        id: '708cacd0-3e06-4bf7-80f0-09e11c7eeac5',
        questionId: '532b85f1-b6a8-4784-802b-00c7601ab8d3',
        sort: 1,
        content: 'Line one\nLine two\n\nLine four',
      },
      {
        id: '808cacd0-3e06-4bf7-80f0-09e11c7eeac5',
        questionId: '532b85f1-b6a8-4784-802b-00c7601ab8d3',
        sort: 2,
        content: 'Next option',
      },
    ]);
  });

  it('keeps pipe-delimited continuation text with the previous option record', () => {
    const input = `708cacd0-3e06-4bf7-80f0-09e11c7eeac5|532b85f1-b6a8-4784-802b-00c7601ab8d3|1|Line one
CommonDialog1.Filter="All Files|*.*|(*.txt)|*.txt|(*.doc)|*.doc"`;

    expect(parseOptionFile(input)[0]?.content).toBe(
      'Line one\nCommonDialog1.Filter="All Files|*.*|(*.txt)|*.txt|(*.doc)|*.doc"',
    );
  });
});
