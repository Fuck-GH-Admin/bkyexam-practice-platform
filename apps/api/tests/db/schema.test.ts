import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  adminSessions,
  adminUserRoles,
  adminUsers,
  auditLogs,
  bankMappings,
  classifications,
  importJobs,
  practiceAttempts,
  practiceSessionDrafts,
  practiceSessionQuestions,
  practiceSessions,
  questionQualityFlags,
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
    expect(getTableName(adminUsers)).toBe('admin_users');
    expect(getTableName(adminSessions)).toBe('admin_sessions');
    expect(getTableName(adminUserRoles)).toBe('admin_user_roles');
    expect(getTableName(auditLogs)).toBe('audit_logs');
    expect(getTableName(importJobs)).toBe('import_jobs');
    expect(getTableName(questionQualityFlags)).toBe('question_quality_flags');
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

  it('defines formal student identity security columns and indexes', () => {
    const tableConfig = getTableConfig(students);
    const columnNames = tableConfig.columns.map((column) => column.name);
    const indexNames = tableConfig.indexes.map((tableIndex) => tableIndex.config.name);
    const checkNames = tableConfig.checks.map((tableCheck) => tableCheck.name);

    expect(columnNames).toEqual([
      'id',
      'login_name',
      'display_name',
      'password_hash',
      'class_name',
      'group_name',
      'status',
      'password_reset_required',
      'password_changed_at',
      'failed_login_count',
      'failed_login_window_started_at',
      'locked_until',
      'last_login_at',
      'updated_at',
      'created_by_admin_id',
      'created_at',
    ]);
    expect(indexNames).toEqual(expect.arrayContaining([
      'students_status_idx',
      'students_class_name_idx',
      'students_group_name_idx',
      'students_locked_until_idx',
    ]));
    expect(checkNames).toEqual(expect.arrayContaining([
      'students_status_check',
      'students_failed_login_count_check',
    ]));
  });

  it('defines admin identity, session, RBAC, and audit foundation tables', () => {
    expect(adminUsers).toBeDefined();
    expect(adminSessions).toBeDefined();
    expect(adminUserRoles).toBeDefined();
    expect(auditLogs).toBeDefined();

    const adminUserColumnNames = getTableConfig(adminUsers).columns.map((column) => column.name);
    const adminUserIndexNames = getTableConfig(adminUsers).indexes.map(
      (tableIndex) => tableIndex.config.name,
    );
    const adminUserCheckNames = getTableConfig(adminUsers).checks.map((tableCheck) => tableCheck.name);
    const adminSessionIndexNames = getTableConfig(adminSessions).indexes.map(
      (tableIndex) => tableIndex.config.name,
    );
    const auditIndexNames = getTableConfig(auditLogs).indexes.map(
      (tableIndex) => tableIndex.config.name,
    );

    expect(adminUserColumnNames).toEqual([
      'id',
      'login_name',
      'display_name',
      'password_hash',
      'status',
      'created_at',
      'updated_at',
      'last_login_at',
      'password_changed_at',
      'failed_login_count',
      'failed_login_window_started_at',
      'locked_until',
    ]);
    expect(adminUserIndexNames).toEqual(expect.arrayContaining([
      'admin_users_locked_until_idx',
    ]));
    expect(adminUserCheckNames).toEqual(expect.arrayContaining([
      'admin_users_failed_login_count_check',
    ]));
    expect(adminSessionIndexNames).toEqual(expect.arrayContaining([
      'admin_sessions_admin_user_id_idx',
      'admin_sessions_expires_at_idx',
    ]));
    expect(auditIndexNames).toEqual(expect.arrayContaining([
      'audit_logs_actor_created_at_idx',
      'audit_logs_resource_idx',
      'audit_logs_action_created_at_idx',
    ]));
  });

  it('adds admin ownership and optimistic concurrency fields to bank mappings', () => {
    const columnNames = getTableConfig(bankMappings).columns.map((column) => column.name);

    expect(columnNames).toEqual(expect.arrayContaining([
      'version',
      'updated_at',
      'updated_by_admin_id',
    ]));
  });

  it('defines import job tracking with a one-running-job index', () => {
    const tableConfig = getTableConfig(importJobs);
    const columnNames = tableConfig.columns.map((column) => column.name);
    const indexNames = tableConfig.indexes.map((tableIndex) => tableIndex.config.name);

    expect(columnNames).toEqual([
      'id',
      'kind',
      'mode',
      'status',
      'source_dir',
      'options',
      'progress',
      'summary',
      'error_summary',
      'created_by_admin_id',
      'created_at',
      'started_at',
      'finished_at',
    ]);
    expect(indexNames).toEqual(expect.arrayContaining([
      'import_jobs_status_created_at_idx',
      'import_jobs_created_by_idx',
      'import_jobs_one_running_kind_idx',
    ]));
  });

  it('defines question quality flags for admin review and practice exclusion', () => {
    const tableConfig = getTableConfig(questionQualityFlags);
    const columnNames = tableConfig.columns.map((column) => column.name);
    const indexNames = tableConfig.indexes.map((tableIndex) => tableIndex.config.name);
    const checkNames = tableConfig.checks.map((tableCheck) => tableCheck.name);

    expect(columnNames).toEqual([
      'id',
      'question_id',
      'bank_id',
      'flag_type',
      'severity',
      'status',
      'note',
      'excluded_from_practice',
      'created_by_admin_id',
      'resolved_by_admin_id',
      'created_at',
      'updated_at',
      'resolved_at',
    ]);
    expect(indexNames).toEqual(expect.arrayContaining([
      'question_quality_flags_question_id_idx',
      'question_quality_flags_bank_status_idx',
      'question_quality_flags_type_status_idx',
      'question_quality_flags_excluded_open_idx',
    ]));
    expect(checkNames).toEqual(expect.arrayContaining([
      'question_quality_flags_type_check',
      'question_quality_flags_severity_check',
      'question_quality_flags_status_check',
    ]));
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
