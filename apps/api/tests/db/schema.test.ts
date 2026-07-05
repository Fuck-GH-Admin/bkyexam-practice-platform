import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  bankMappings,
  classifications,
  practiceAttempts,
  practiceSessionQuestions,
  practiceSessions,
  questionOptions,
  questions,
  studentSessions,
  students,
  wrongQuestions,
} from '../../src/db/schema';

describe('database schema', () => {
  it('exports core tables with stable names', () => {
    expect(getTableName(classifications)).toBe('classifications');
    expect(getTableName(questions)).toBe('questions');
    expect(getTableName(questionOptions)).toBe('question_options');
    expect(getTableName(bankMappings)).toBe('bank_mappings');
    expect(getTableName(students)).toBe('students');
    expect(getTableName(studentSessions)).toBe('student_sessions');
    expect(getTableName(practiceAttempts)).toBe('practice_attempts');
    expect(getTableName(practiceSessions)).toBe('practice_sessions');
    expect(getTableName(practiceSessionQuestions)).toBe('practice_session_questions');
    expect(getTableName(wrongQuestions)).toBe('wrong_questions');
  });

  it('exports practice session tables', () => {
    expect(studentSessions).toBeDefined();
    expect(practiceSessions).toBeDefined();
    expect(practiceSessionQuestions).toBeDefined();
  });

  it('does not B-tree index unbounded question search text', () => {
    const indexNames = getTableConfig(questions).indexes.map(
      (tableIndex) => tableIndex.config.name,
    );

    expect(indexNames).not.toContain('questions_searchable_text_idx');
  });

  it('keeps one wrong-question notebook row per student question bank', () => {
    const uniqueIndexNames = getTableConfig(wrongQuestions).indexes
      .filter((tableIndex) => tableIndex.config.unique)
      .map((tableIndex) => tableIndex.config.name);

    expect(uniqueIndexNames).toContain('wrong_questions_student_question_bank_unique_idx');
  });
});
