import { describe, expect, test } from 'vitest';

import { formatCorrectAnswer, getVisibleChips, hasSubmittedAnswer } from './App';

describe('hasSubmittedAnswer', () => {
  test('treats a false yes/no answer as submitted', () => {
    expect(hasSubmittedAnswer(false)).toBe(true);
  });

  test('treats an undefined answer as not submitted', () => {
    expect(hasSubmittedAnswer(undefined)).toBe(false);
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
});
