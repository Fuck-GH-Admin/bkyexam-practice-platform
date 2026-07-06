import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  bankMappings,
  classifications,
  practiceAttempts,
  practiceSessionDrafts,
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
    expect(getTableName(practiceSessionDrafts)).toBe('practice_session_drafts');
    expect(getTableName(wrongQuestions)).toBe('wrong_questions');
  });

  it('exports practice session tables', () => {
    expect(studentSessions).toBeDefined();
    expect(practiceSessions).toBeDefined();
    expect(practiceSessionQuestions).toBeDefined();
  });

  it('tracks current practice position with a positive sort check', () => {
    const tableConfig = getTableConfig(practiceSessions);
    const columnNames = tableConfig.columns.map((column) => column.name);
    const checkNames = tableConfig.checks.map((tableCheck) => tableCheck.name);

    expect(columnNames).toContain('current_sort');
    expect(checkNames).toContain('practice_sessions_current_sort_positive_check');
  });

  it('exports practice draft table for resumable answers and review flags', () => {
    expect(practiceSessionDrafts).toBeDefined();
  });

  it('defines practice draft columns, indexes, and session-question uniqueness', () => {
    const tableConfig = getTableConfig(practiceSessionDrafts);
    const columnNames = tableConfig.columns.map((column) => column.name);
    const indexNames = tableConfig.indexes.map((tableIndex) => tableIndex.config.name);
    const uniqueSessionQuestionIndex = tableConfig.indexes.find(
      (tableIndex) => tableIndex.config.name === 'practice_session_drafts_session_question_unique_idx',
    );
    const uniqueSessionQuestionColumns = uniqueSessionQuestionIndex?.config.columns.map(
      (column) => (column as { name?: string }).name,
    );

    expect(columnNames).toEqual([
      'id',
      'session_id',
      'question_id',
      'student_id',
      'draft_answer',
      'marked_for_review',
      'updated_at',
    ]);
    expect(indexNames).toEqual(expect.arrayContaining([
      'practice_session_drafts_session_id_idx',
      'practice_session_drafts_student_id_idx',
      'practice_session_drafts_question_id_idx',
      'practice_session_drafts_session_question_unique_idx',
    ]));
    expect(uniqueSessionQuestionIndex?.config.unique).toBe(true);
    expect(uniqueSessionQuestionColumns).toEqual(['session_id', 'question_id']);
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
