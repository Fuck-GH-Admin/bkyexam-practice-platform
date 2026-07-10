import { describe, expect, it } from 'vitest';
import {
  CreatePracticeSessionRequestV1Schema,
  PRACTICE_COMPLETED_COUNT_SEMANTICS_V1,
  PracticePayloadV1Schema,
  SavePracticeDraftRequestV1Schema,
  PracticeSessionV1Schema,
  PracticeSubmitAnswerResponseV1Schema,
  SubmitPracticeAnswerRequestV1Schema,
  WrongQuestionDetailResponseV1Schema,
} from '../src/index.js';

const bankId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const questionId = '30000000-0000-4000-8000-000000000001';
const wrongQuestionId = '40000000-0000-4000-8000-000000000001';

describe('v1 practice contracts', () => {
  it('accepts a partial completed session and fixes completedCount semantics', () => {
    expect(PRACTICE_COMPLETED_COUNT_SEMANTICS_V1).toBe('answered_or_graded_questions');
    expect(PracticeSessionV1Schema.parse({
      id: sessionId,
      bankId,
      mode: 'sequential',
      questionCount: 4,
      completedCount: 3,
      correctCount: 2,
      currentSort: 3,
      status: 'completed',
    })).toMatchObject({ questionCount: 4, completedCount: 3, status: 'completed' });
  });

  it('rejects impossible practice counters', () => {
    expect(() => PracticeSessionV1Schema.parse({
      id: sessionId,
      bankId,
      mode: 'sequential',
      questionCount: 2,
      completedCount: 3,
      correctCount: 1,
      currentSort: 1,
      status: 'completed',
    })).toThrow('completedCount cannot exceed questionCount');

    expect(() => PracticeSessionV1Schema.parse({
      id: sessionId,
      bankId,
      mode: 'sequential',
      questionCount: 3,
      completedCount: 2,
      correctCount: 3,
      currentSort: 1,
      status: 'active',
    })).toThrow('correctCount cannot exceed completedCount');
  });

  it('preserves a false draft answer in a practice payload', () => {
    const payload = PracticePayloadV1Schema.parse({
      session: {
        id: sessionId,
        bankId,
        mode: 'sequential',
        questionCount: 1,
        completedCount: 0,
        correctCount: 0,
        currentSort: 1,
        status: 'active',
      },
      questions: [{
        id: questionId,
        sort: 1,
        type: 'yes_no',
        content: 'false 是否是有效答案？',
        options: [],
        answered: false,
        draftAnswer: false,
        markedForReview: true,
      }],
    });

    expect(payload.questions[0]?.draftAnswer).toBe(false);
  });

  it('validates version-one create-session request boundaries', () => {
    expect(CreatePracticeSessionRequestV1Schema.parse({
      bankId,
      mode: 'random',
      limit: 70,
      questionTypes: ['single_choice', 'multiple_choice', 'yes_no'],
    })).toMatchObject({ bankId, limit: 70 });
    expect(CreatePracticeSessionRequestV1Schema.parse({
      bankId,
      questionTypes: ['future_custom_type'],
    }).questionTypes).toEqual(['future_custom_type']);
    expect(() => CreatePracticeSessionRequestV1Schema.parse({ bankId, limit: 201 })).toThrow();
    expect(() => SavePracticeDraftRequestV1Schema.parse({ answer: [''] })).toThrow();
  });

  it('keeps the legacy answer endpoint compatible with uppercase UUIDs', () => {
    const uppercaseQuestionId = questionId.toUpperCase();
    expect(SubmitPracticeAnswerRequestV1Schema.parse({
      questionId: uppercaseQuestionId,
      answer: ['option-a'],
    }).questionId).toBe(uppercaseQuestionId);

    expect(PracticeSubmitAnswerResponseV1Schema.parse({
      result: {
        questionId: uppercaseQuestionId,
        isCorrect: true,
        correctAnswer: ['option-a'],
        needsSelfReview: false,
      },
      session: {
        completedCount: 1,
        correctCount: 1,
        status: 'active',
      },
    }).result.questionId).toBe(uppercaseQuestionId);
  });
});

describe('v1 wrongbook contracts', () => {
  it('parses normalized correct answers and readable options', () => {
    const response = WrongQuestionDetailResponseV1Schema.parse({
      wrongQuestion: {
        id: wrongQuestionId,
        questionId,
        bankId,
        bankName: '数据库测试题库',
        subjectCategory: '信息技术',
        subjectName: 'PostgreSQL',
        questionType: 'multiple_choice',
        contentPreview: '哪些属于 ACID？',
        wrongCount: 1,
        lastAnswer: '["option-a"]',
        mastered: false,
        lastWrongAt: '2026-07-10T12:00:00.000Z',
        content: '以下哪些属于 ACID 属性？',
        options: [
          { id: 'option-a', sort: 1, content: '原子性' },
          { id: 'option-b', sort: 2, content: '一致性' },
        ],
        correctAnswer: ['option-a', 'option-b'],
        analysis: '原子性与一致性都属于 ACID。',
      },
    });

    expect(response.wrongQuestion.correctAnswer).toEqual(['option-a', 'option-b']);
  });
});
