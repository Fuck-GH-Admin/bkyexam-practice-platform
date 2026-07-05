import { describe, expect, it } from 'vitest';
import { normalizeQType } from '../../src/import/qtype';

describe('normalizeQType', () => {
  it.each([
    [0, 'fill_blank'],
    [1, 'single_choice'],
    [2, 'multiple_choice'],
    [3, 'yes_no'],
    [4, 'office_operation'],
    [5, 'programming'],
    [10, 'essay'],
    [40, 'reading'],
    [45, 'reading'],
    [47, 'cloze'],
    [48, 'operation'],
    [49, 'operation'],
    [50, 'short_answer'],
    [70, 'ai'],
    [72, 'ai'],
  ] as const)('maps source qType %i to %s', (sourceQType, expected) => {
    expect(normalizeQType(sourceQType)).toBe(expected);
  });

  it('maps unrecognized source qTypes to unknown', () => {
    expect(normalizeQType(999)).toBe('unknown');
  });
});
