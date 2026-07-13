import { describe, expect, test } from 'vitest';
import type { PracticeQuestion } from './features/practice/model';

import {
  buildPracticeCheckSummary,
  buildQuestionStatus,
  buildQuestionTypeLabel,
  buildSectionScores,
  buildResultsFromQuestions,
  buildWrongbookStats,
  filterBanks,
  formatCorrectAnswer,
  formatSavedAnswer,
  formatStoredAnswer,
  getAnsweredCount,
  getFilterOptions,
  getFirstSectionType,
  getInitialQuestionIndex,
  getQuestionState,
  getUnansweredCount,
  getVisibleChips,
  groupQuestionsByType,
  hasSubmittedAnswer,
  hydrateAnswersFromQuestions,
  hydrateReviewFlagsFromQuestions,
} from './App';

describe('hasSubmittedAnswer', () => {
  test('treats a false yes/no answer as submitted', () => {
    expect(hasSubmittedAnswer(false)).toBe(true);
  });

  test('treats an undefined answer as not submitted', () => {
    expect(hasSubmittedAnswer(undefined)).toBe(false);
  });
  test('treats an empty multiple-choice answer as not submitted', () => {
    expect(hasSubmittedAnswer([])).toBe(false);
  });

  test('treats blank text as unanswered and non-blank text as submitted', () => {
    expect(hasSubmittedAnswer('   ')).toBe(false);
    expect(hasSubmittedAnswer('text answer')).toBe(true);
  });
});

describe('getVisibleChips', () => {
  test('removes duplicate chip labels before rendering', () => {
    expect(getVisibleChips('C语言', ['C语言', '信息技术', '信息技术'])).toEqual(['C语言', '信息技术']);
  });
});

describe('formatCorrectAnswer', () => {
  test('renders option ids as option labels when the current question has matching options', () => {
    expect(
      formatCorrectAnswer(['option-a', 'option-c'], [
        { id: 'option-a', sort: 1, content: 'A. First option' },
        { id: 'option-b', sort: 2, content: 'B. Second option' },
        { id: 'option-c', sort: 3, content: 'C. Third option' },
      ]),
    ).toBe('A. First option、C. Third option');
  });

  test('renders yes/no reference answers in Chinese', () => {
    expect(formatCorrectAnswer(true)).toBe('正确');
    expect(formatCorrectAnswer(false)).toBe('错误');
  });
});

const sampleBanks = [
  {
    bankId: 'python',
    bankName: 'Python 期末题库',
    subjectCategory: '信息技术',
    subjectName: 'Python',
    visible: true,
    status: 'active',
    keywords: ['Python', '编程'],
    questionCount: 70,
    description: 'Python 自动映射',
  },
  {
    bankId: 'english',
    bankName: '大学英语阅读',
    subjectCategory: '英语',
    subjectName: '大学英语',
    visible: true,
    status: 'active',
    keywords: ['大学英语', '阅读'],
    questionCount: 120,
    description: '英语 自动映射',
  },
  {
    bankId: 'cpp',
    bankName: 'C++ 机试',
    subjectCategory: '信息技术',
    subjectName: 'C++',
    visible: true,
    status: 'active',
    keywords: ['C++'],
    questionCount: 30,
    description: 'C++ 自动映射',
  },
];

describe('bank filtering helpers', () => {
  test('builds stable filter options from every loaded bank category and subject', () => {
    expect(getFilterOptions(sampleBanks)).toEqual(['C++', 'Python', '大学英语', '信息技术', '英语']);
  });

  test('filters banks locally by category or subject without losing the full option set', () => {
    expect(filterBanks(sampleBanks, { category: 'Python', keyword: '' }).map((bank) => bank.bankId)).toEqual(['python']);
    expect(filterBanks(sampleBanks, { category: '信息技术', keyword: '' }).map((bank) => bank.bankId)).toEqual(['python', 'cpp']);
  });

  test('searches bank names, subjects, categories, keywords, and descriptions case-insensitively', () => {
    expect(filterBanks(sampleBanks, { category: '', keyword: 'python' }).map((bank) => bank.bankId)).toEqual(['python']);
    expect(filterBanks(sampleBanks, { category: '', keyword: '阅读' }).map((bank) => bank.bankId)).toEqual(['english']);
  });
});

const sampleQuestions: PracticeQuestion[] = [
  {
    id: 'single-1',
    sort: 1,
    type: 'single_choice',
    content: 'Single choice',
    options: [],
    answered: false,
    markedForReview: false,
  },
  {
    id: 'multiple-1',
    sort: 2,
    type: 'multiple_choice',
    content: 'Multiple choice',
    options: [],
    answered: false,
    markedForReview: false,
  },
  {
    id: 'yes-no-1',
    sort: 3,
    type: 'yes_no',
    content: 'Yes/no',
    options: [],
    answered: false,
    markedForReview: false,
  },
];

describe('sectioned practice helpers', () => {
  test('groups objective questions by practice section order', () => {
    expect(groupQuestionsByType(sampleQuestions).map((section) => section.label)).toEqual(['单选题', '多选题', '判断题']);
  });

  test('counts answered and unanswered questions from saved answers', () => {
    const answersByQuestion = {
      'single-1': ['option-a'],
      'yes-no-1': false,
    };

    expect(getAnsweredCount(sampleQuestions, answersByQuestion)).toBe(2);
    expect(getUnansweredCount(sampleQuestions, answersByQuestion)).toBe(1);
  });

  test('combines answer and review flags into question navigation state', () => {
    expect(getQuestionState(sampleQuestions[0], { 'single-1': ['option-a'] }, { 'single-1': true })).toBe('answered-review');
    expect(getQuestionState(sampleQuestions[1], { 'multiple-1': ['option-b'] }, {})).toBe('answered');
    expect(getQuestionState(sampleQuestions[2], {}, { 'yes-no-1': true })).toBe('review');
    expect(getQuestionState(sampleQuestions[2], {}, {})).toBe('empty');
  });

  test('builds section scores from graded question results', () => {
    expect(
      buildSectionScores(sampleQuestions, {
        'single-1': { questionId: 'single-1', isCorrect: true, correctAnswer: ['option-a'], needsSelfReview: false },
        'multiple-1': { questionId: 'multiple-1', isCorrect: false, correctAnswer: ['option-b'], needsSelfReview: false },
      }),
    ).toEqual([
      { type: 'single_choice', label: '单选题', correctCount: 1, totalCount: 1 },
      { type: 'multiple_choice', label: '多选题', correctCount: 0, totalCount: 1 },
      { type: 'yes_no', label: '判断题', correctCount: 0, totalCount: 1 },
    ]);
  });

  test('hydrates draft answers and review flags from loaded questions', () => {
    const questions = [
      { ...sampleQuestions[0], draftAnswer: ['option-a'], markedForReview: true },
      { ...sampleQuestions[1], draftAnswer: undefined, markedForReview: false },
      { ...sampleQuestions[2], draftAnswer: false, markedForReview: true },
    ];

    expect(hydrateAnswersFromQuestions(questions)).toEqual({ 'single-1': ['option-a'], 'yes-no-1': false });
    expect(hydrateReviewFlagsFromQuestions(questions)).toEqual({ 'single-1': true, 'yes-no-1': true });
  });

  test('hydrates completed question results with returned reference answers', () => {
    expect(buildResultsFromQuestions([
      {
        ...sampleQuestions[0],
        isCorrect: true,
        correctAnswer: ['option-a'],
        needsSelfReview: false,
      },
    ])).toEqual({
      'single-1': {
        questionId: 'single-1',
        isCorrect: true,
        correctAnswer: ['option-a'],
        needsSelfReview: false,
      },
    });
  });

  test('selects the first available section type from practice questions', () => {
    expect(getFirstSectionType([sampleQuestions[1], sampleQuestions[2]])).toBe('multiple_choice');
    expect(getFirstSectionType([])).toBe('');
  });

  test('restores the current question index from session currentSort', () => {
    expect(getInitialQuestionIndex(sampleQuestions, 2)).toBe(1);
    expect(getInitialQuestionIndex(sampleQuestions, 999)).toBe(0);
    expect(getInitialQuestionIndex(sampleQuestions)).toBe(0);
  });
});

describe('practice submit check helpers', () => {
  test('renders known and unknown question type labels', () => {
    expect(buildQuestionTypeLabel('single_choice')).toEqual({ short: '单选', long: '单选题' });
    expect(buildQuestionTypeLabel('multiple_choice')).toEqual({ short: '多选', long: '多选题' });
    expect(buildQuestionTypeLabel('yes_no')).toEqual({ short: '判断', long: '判断题' });
    expect(buildQuestionTypeLabel('material')).toEqual({ short: 'material', long: 'material' });
  });

  test('formats saved answers and resolves option ids for the check list', () => {
    expect(formatSavedAnswer(['B', 'D'])).toBe('B、D');
    expect(formatSavedAnswer(false)).toBe('错误');
    expect(formatSavedAnswer(undefined)).toBe('未答');
    expect(formatSavedAnswer('  text answer  ')).toBe('text answer');
    expect(formatSavedAnswer('   ')).toBe('未答');
    expect(formatSavedAnswer(['option-a'], [
      { id: 'option-a', sort: 1, content: 'First option' },
    ])).toBe('1. First option');
  });

  test('classifies current, answered, unanswered, flagged, and mixed states', () => {
    expect(buildQuestionStatus({ current: true, answered: true, flagged: true })).toBe('current');
    expect(buildQuestionStatus({ current: false, answered: true, flagged: true })).toBe('mixed');
    expect(buildQuestionStatus({ current: false, answered: false, flagged: true })).toBe('flagged');
    expect(buildQuestionStatus({ current: false, answered: true, flagged: false })).toBe('answered');
    expect(buildQuestionStatus({ current: false, answered: false, flagged: false })).toBe('unanswered');
  });

  test('builds ordered unanswered and server-backed review lists', () => {
    const summary = buildPracticeCheckSummary(
      sampleQuestions,
      { 'single-1': ['option-a'], 'yes-no-1': false },
      { 'single-1': true, 'multiple-1': true },
    );

    expect(summary).toMatchObject({
      total: 3,
      answeredCount: 2,
      unansweredCount: 1,
      flaggedCount: 2,
    });
    expect(summary.unanswered.map((question) => question.id)).toEqual(['multiple-1']);
    expect(summary.flagged.map((question) => question.id)).toEqual(['single-1', 'multiple-1']);
  });
});

describe('formatStoredAnswer', () => {
  test('formats JSON array answers', () => {
    expect(formatStoredAnswer('["B","D"]')).toBe('B、D');
  });

  test('renders persisted yes/no answers in Chinese', () => {
    expect(formatStoredAnswer('true')).toBe('正确');
    expect(formatStoredAnswer('false')).toBe('错误');
  });

  test('resolves persisted option ids when detail options are available', () => {
    expect(formatStoredAnswer(
      '["2efed6be-6bfc-4f06-8a1d-9c337ddb8d7c"]',
      [{ id: '2efed6be-6bfc-4f06-8a1d-9c337ddb8d7c', sort: 2, content: '第二个选项' }],
    )).toBe('第二个选项');
  });

  test('does not expose raw UUIDs in wrongbook list summaries', () => {
    expect(formatStoredAnswer('["2efed6be-6bfc-4f06-8a1d-9c337ddb8d7c"]')).toBe('已选择 1 项');
  });

  test('returns plain legacy answers when they are not JSON', () => {
    expect(formatStoredAnswer('B')).toBe('B');
  });
});

describe('buildWrongbookStats', () => {
  test('counts active and mastered wrong questions', () => {
    expect(buildWrongbookStats([
      { mastered: false, lastWrongAt: '2026-01-02T00:00:00.000Z' },
      { mastered: true, lastWrongAt: '2026-01-03T00:00:00.000Z' },
    ])).toEqual({ total: 2, active: 1, mastered: 1, latestWrongAt: '2026-01-03T00:00:00.000Z' });
  });
});
