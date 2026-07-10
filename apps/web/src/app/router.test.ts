import { describe, expect, it } from 'vitest';
import { buildStudentPath, parseStudentRoute } from './router';

const sessionId = 'aaaaaaaa-2222-4222-8222-222222222222';

describe('student router', () => {
  it('maps stable student paths to product views', () => {
    expect(parseStudentRoute('/')).toEqual({ view: 'home' });
    expect(parseStudentRoute('/banks/')).toEqual({ view: 'banks' });
    expect(parseStudentRoute('/wrong-questions')).toEqual({ view: 'wrong' });
    expect(parseStudentRoute('/history')).toEqual({ view: 'history' });
    expect(parseStudentRoute(`/practice/${sessionId}`)).toEqual({ view: 'practice', sessionId });
  });

  it('falls back to home for unknown or non-canonical practice paths', () => {
    expect(parseStudentRoute('/admin')).toEqual({ view: 'home' });
    expect(parseStudentRoute('/practice/not-a-uuid')).toEqual({ view: 'home' });
    expect(parseStudentRoute(`/practice/${sessionId.toUpperCase()}`)).toEqual({ view: 'home' });
  });

  it('builds a restorable path for every supported route', () => {
    expect(buildStudentPath({ view: 'home' })).toBe('/');
    expect(buildStudentPath({ view: 'banks' })).toBe('/banks');
    expect(buildStudentPath({ view: 'wrong' })).toBe('/wrong-questions');
    expect(buildStudentPath({ view: 'history' })).toBe('/history');
    expect(buildStudentPath({ view: 'practice', sessionId })).toBe(`/practice/${sessionId}`);
  });
});
