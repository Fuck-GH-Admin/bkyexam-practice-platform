import { describe, expect, it } from 'vitest';
import { normalizeAnswer } from '../../src/import/normalizeAnswer';

describe('normalizeAnswer', () => {
  it('normalizes yes/no answers', () => {
    expect(normalizeAnswer(3, '11111111-1111-1111-1111-111111111111')).toEqual({ kind: 'yes_no', value: true });
    expect(normalizeAnswer(3, '22222222-2222-2222-2222-222222222222')).toEqual({ kind: 'yes_no', value: false });
  });

  it('normalizes multiple choice option IDs', () => {
    expect(normalizeAnswer(2, 'a,b,c')).toEqual({ kind: 'option_ids', value: ['a', 'b', 'c'] });
  });

  it('normalizes single-choice answers to one option ID', () => {
    expect(normalizeAnswer(1, 'a')).toEqual({ kind: 'option_ids', value: ['a'] });
  });

  it('returns raw answers for unknown question types', () => {
    expect(normalizeAnswer(99, 'a,b,c')).toEqual({ kind: 'raw', value: 'a,b,c' });
  });
});
