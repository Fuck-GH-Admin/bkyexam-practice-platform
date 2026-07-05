import { describe, expect, it } from 'vitest';
import { generateBankMapping } from '../../src/mapping/bankMapping';

const baseInput = {
  id: 'bank-1',
  name: '示例题库',
  parentId: null,
  qGroup: 999,
  level: 0,
  questionCount: 10,
  descendantQuestionCount: 10,
};

describe('generateBankMapping', () => {
  it('maps qGroup 97 to 英语', () => {
    const mapping = generateBankMapping({ ...baseInput, qGroup: 97 });

    expect(mapping.subjectCategory).toBe('英语');
  });

  it('maps qGroup 66 to 信息技术 and Python', () => {
    const mapping = generateBankMapping({ ...baseInput, qGroup: 66 });

    expect(mapping.subjectCategory).toBe('信息技术');
    expect(mapping.subjectName).toBe('Python');
  });

  it('maps qGroup 201 to 社科 and 思想道德与法治', () => {
    const mapping = generateBankMapping({ ...baseInput, qGroup: 201 });

    expect(mapping.subjectCategory).toBe('社科');
    expect(mapping.subjectName).toBe('思想道德与法治');
  });

  it('hides Unit structural nodes', () => {
    const mapping = generateBankMapping({ ...baseInput, name: 'Unit 1' });

    expect(mapping.visible).toBe(false);
    expect(mapping.status).toBe('hidden');
  });

  it('hides question type structural nodes', () => {
    const mapping = generateBankMapping({ ...baseInput, name: '单选题' });

    expect(mapping.visible).toBe(false);
    expect(mapping.status).toBe('hidden');
  });

  it('shows named banks with questions and includes detected keywords', () => {
    const mapping = generateBankMapping({ ...baseInput, name: '2026版Python题库', qGroup: 66 });

    expect(mapping.visible).toBe(true);
    expect(mapping.keywords).toContain('Python');
    expect(mapping.keywords).toContain('2026');
  });
});
