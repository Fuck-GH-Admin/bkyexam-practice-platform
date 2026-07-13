import { describe, expect, it } from 'vitest';
import type { QueryClient } from '../../src/db/client';
import { createPgWrongQuestionRepository } from '../../src/wrongQuestions/repository';

class FakeQueryClient implements QueryClient {
  calls: { sql: string; params?: readonly unknown[] }[] = [];

  constructor(private readonly results: unknown[] = []) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.calls.push({ sql, params });
    return this.results.shift() ?? { rows: [] };
  }
}

const wrongQuestionRow = {
  id: 'wrong-1',
  question_id: 'question-1',
  bank_id: 'bank-1',
  wrong_count: '2',
  last_answer: 'A',
  mastered: false,
  last_wrong_at: new Date('2026-01-02T03:04:05.000Z'),
};

const enhancedWrongQuestionRow = {
  ...wrongQuestionRow,
  bank_name: 'C 语言程序设计',
  subject_category: '计算机基础',
  subject_name: 'C 语言',
  normalized_type: 'single_choice',
  content_preview: '下列关于数组初始化的说法，正确的是哪一项？',
};

describe('createPgWrongQuestionRepository', () => {
  it('lists current student unmastered wrong questions and maps rows', async () => {
    const client = new FakeQueryClient([{ rows: [enhancedWrongQuestionRow] }]);
    const repository = createPgWrongQuestionRepository(client);

    const result = await repository.list({ studentId: 'student-1', includeMastered: false });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].sql).toContain('FROM wrong_questions');
    expect(client.calls[0].sql).toContain('student_id = $1');
    expect(client.calls[0].sql).toContain('mastered = false');
    expect(client.calls[0].params).toEqual(['student-1']);
    expect(result).toEqual([
      {
        id: 'wrong-1',
        questionId: 'question-1',
        bankId: 'bank-1',
        bankName: 'C 语言程序设计',
        subjectCategory: '计算机基础',
        subjectName: 'C 语言',
        questionType: 'single_choice',
        contentPreview: '下列关于数组初始化的说法，正确的是哪一项？',
        wrongCount: 2,
        lastAnswer: 'A',
        mastered: false,
        lastWrongAt: '2026-01-02T03:04:05.000Z',
      },
    ]);
  });

  it('adds a bankId filter with a parameter when listing', async () => {
    const client = new FakeQueryClient([{ rows: [] }]);
    const repository = createPgWrongQuestionRepository(client);

    await repository.list({ studentId: 'student-1', bankId: 'bank-2', includeMastered: false });

    expect(client.calls[0].sql).toContain('student_id = $1');
    expect(client.calls[0].sql).toContain('bank_id = $2');
    expect(client.calls[0].sql).toContain('mastered = false');
    expect(client.calls[0].params).toEqual(['student-1', 'bank-2']);
  });

  it('does not add the mastered filter when includeMastered is true', async () => {
    const client = new FakeQueryClient([{ rows: [] }]);
    const repository = createPgWrongQuestionRepository(client);

    await repository.list({ studentId: 'student-1', includeMastered: true });

    expect(client.calls[0].sql).toContain('student_id = $1');
    expect(client.calls[0].sql).not.toContain('mastered = false');
    expect(client.calls[0].params).toEqual(['student-1']);
  });

  it('loads one wrong-question review detail for the current student', async () => {
    const client = new FakeQueryClient([
      {
        rows: [
          {
            id: 'wrong-1',
            question_id: 'question-1',
            bank_id: 'bank-1',
            bank_name: 'C 语言程序设计',
            subject_category: '计算机基础',
            subject_name: 'C 语言',
            normalized_type: 'single_choice',
            content: '完整题干',
            answer_raw: 'option-a',
            analyze_raw: '解析文本',
            wrong_count: '2',
            last_answer: '["B"]',
            mastered: false,
            last_wrong_at: new Date('2026-01-02T03:04:05.000Z'),
          },
        ],
      },
      { rows: [{ id: 'option-a', question_id: 'question-1', sort: 1, content: 'A. 正确选项' }] },
    ]);
    const repository = createPgWrongQuestionRepository(client);

    const result = await repository.getDetail({ studentId: 'student-1', id: 'wrong-1' });

    expect(client.calls[0].sql).toContain('FROM wrong_questions');
    expect(client.calls[0].sql).toContain('wrong_questions.student_id = $1');
    expect(client.calls[0].sql).toContain('wrong_questions.id = $2');
    expect(client.calls[0].params).toEqual(['student-1', 'wrong-1']);
    expect(client.calls[1].sql).toContain('FROM question_options');
    expect(client.calls[1].params).toEqual(['question-1']);
    expect(result).toEqual({
      id: 'wrong-1',
      questionId: 'question-1',
      bankId: 'bank-1',
      bankName: 'C 语言程序设计',
      subjectCategory: '计算机基础',
      subjectName: 'C 语言',
      questionType: 'single_choice',
      contentPreview: '完整题干',
      content: '完整题干',
      options: [{ id: 'option-a', sort: 1, content: 'A. 正确选项' }],
      lastAnswer: '["B"]',
      correctAnswer: ['option-a'],
      analysis: '解析文本',
      wrongCount: 2,
      mastered: false,
      lastWrongAt: '2026-01-02T03:04:05.000Z',
    });
  });

  it('returns null when a wrong-question detail is not owned by the student', async () => {
    const client = new FakeQueryClient([{ rows: [] }]);
    const repository = createPgWrongQuestionRepository(client);

    await expect(repository.getDetail({ studentId: 'student-1', id: 'wrong-2' })).resolves.toBeNull();
  });

  it('lists wrong-question review candidates without writing practice tables', async () => {
    const client = new FakeQueryClient([
      { rows: [{ question_id: 'question-1', bank_id: 'bank-1' }, { question_id: 'question-2', bank_id: 'bank-1' }] },
    ]);
    const repository = createPgWrongQuestionRepository(client);

    const result = await repository.listReviewCandidates({ studentId: 'student-1', includeMastered: false, limit: 20 });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].sql).toContain('FROM wrong_questions');
    expect(client.calls[0].sql).toContain('mastered = false');
    expect(client.calls[0].sql).toContain('LIMIT $2');
    expect(client.calls[0].sql).not.toContain('INSERT INTO practice_sessions');
    expect(result).toEqual([
      { questionId: 'question-1', bankId: 'bank-1' },
      { questionId: 'question-2', bankId: 'bank-1' },
    ]);
  });

  it('marks a current student wrong question mastered and returns true when a row is updated', async () => {
    const client = new FakeQueryClient([{ rows: [], rowCount: 1 }]);
    const repository = createPgWrongQuestionRepository(client);

    const result = await repository.markMastered({ studentId: 'student-1', id: 'wrong-1' });

    expect(result).toBe(true);
    expect(client.calls[0].sql).toContain('UPDATE wrong_questions');
    expect(client.calls[0].sql).toContain('SET mastered = true');
    expect(client.calls[0].sql).toContain('mastered_at = now()');
    expect(client.calls[0].sql).toContain('WHERE id = $1');
    expect(client.calls[0].sql).toContain('AND student_id = $2');
    expect(client.calls[0].params).toEqual(['wrong-1', 'student-1']);
  });

  it('returns false when markMastered updates no rows', async () => {
    const client = new FakeQueryClient([{ rows: [], rowCount: 0 }]);
    const repository = createPgWrongQuestionRepository(client);

    await expect(repository.markMastered({ studentId: 'student-1', id: 'wrong-2' })).resolves.toBe(false);
  });
});
