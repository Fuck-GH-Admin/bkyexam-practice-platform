import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('initial database migration', () => {
  it('creates core tables and wrong-question uniqueness index', async () => {
    const sql = await readFile(join(process.cwd(), 'src/db/migrations/0001_initial.sql'), 'utf8');

    for (const tableName of [
      'classifications',
      'questions',
      'question_options',
      'bank_mappings',
      'students',
      'practice_attempts',
      'wrong_questions',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }

    expect(sql).toContain('wrong_questions_student_question_bank_unique_idx');
  });

  it('creates practice draft storage and current practice position', async () => {
    const sql = await readFile(join(process.cwd(), 'src/db/migrations/0003_practice_drafts.sql'), 'utf8');

    expect(sql).toContain('ALTER TABLE practice_sessions');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS current_sort integer NOT NULL DEFAULT 1');
    expect(sql).toContain('practice_sessions_current_sort_positive_check');
    expect(sql).toContain('IF NOT EXISTS');
    expect(sql).toContain('ADD CONSTRAINT practice_sessions_current_sort_positive_check');
    expect(sql).toContain('CHECK (current_sort > 0)');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS practice_session_drafts');
    expect(sql).toContain('draft_answer text NOT NULL DEFAULT');
    expect(sql).toContain('marked_for_review boolean NOT NULL DEFAULT false');
    expect(sql).toContain('practice_session_drafts_session_question_unique_idx');
    expect(sql).toContain('ON practice_session_drafts(session_id, question_id)');
    expect(sql).toContain('practice_session_drafts_session_id_idx');
    expect(sql).toContain('practice_session_drafts_student_id_idx');
    expect(sql).toContain('practice_session_drafts_question_id_idx');
  });

  it('creates the admin foundation migration with RBAC, audit, and bank mapping metadata', async () => {
    const sql = await readFile(join(process.cwd(), 'src/db/migrations/0005_admin_foundation.sql'), 'utf8');

    for (const tableName of [
      'admin_users',
      'admin_sessions',
      'admin_user_roles',
      'audit_logs',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }

    expect(sql).toContain("CHECK (role IN ('content_editor', 'operator', 'super_admin'))");
    expect(sql).toContain('audit_logs_actor_created_at_idx');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS updated_by_admin_id uuid REFERENCES admin_users(id)');
  });

  it('creates import job tracking with a one-running-job lock', async () => {
    const sql = await readFile(join(process.cwd(), 'src/db/migrations/0006_import_jobs.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS import_jobs');
    expect(sql).toContain("CHECK (kind IN ('full_corpus_import'))");
    expect(sql).toContain("CHECK (mode IN ('dry_run', 'import'))");
    expect(sql).toContain("CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'))");
    expect(sql).toContain('import_jobs_status_created_at_idx');
    expect(sql).toContain('import_jobs_one_running_kind_idx');
    expect(sql).toContain("WHERE status = 'running'");
  });

  it('creates question quality flags for admin review', async () => {
    const sql = await readFile(join(process.cwd(), 'src/db/migrations/0007_question_quality_flags.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS question_quality_flags');
    expect(sql).toContain("flag_type IN");
    expect(sql).toContain("severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'blocking'))");
    expect(sql).toContain("status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored'))");
    expect(sql).toContain('excluded_from_practice boolean NOT NULL DEFAULT false');
    expect(sql).toContain('question_quality_flags_question_id_idx');
    expect(sql).toContain('question_quality_flags_bank_status_idx');
    expect(sql).toContain('question_quality_flags_excluded_open_idx');
  });

  it('creates per-student learning goals with bounded targets', async () => {
    const sql = await readFile(join(process.cwd(), 'src/db/migrations/0008_student_learning_goals.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS student_learning_goals');
    expect(sql).toContain('student_id uuid PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE');
    expect(sql).toContain('daily_attempts_target BETWEEN 1 AND 500');
    expect(sql).toContain('weekly_active_days_target BETWEEN 1 AND 7');
    expect(sql).toContain('wrong_questions_review_target BETWEEN 1 AND 100');
    expect(sql).toContain('student_learning_goals_updated_at_idx');
  });

  it('creates per-question review marks for favorites and long-term review', async () => {
    const sql = await readFile(join(process.cwd(), 'src/db/migrations/0009_question_bookmarks.sql'), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS question_bookmarks');
    expect(sql).toContain('student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE');
    expect(sql).toContain('question_id uuid NOT NULL REFERENCES questions(id)');
    expect(sql).toContain('bank_id uuid NOT NULL REFERENCES classifications(id)');
    expect(sql).toContain('favorite boolean NOT NULL DEFAULT false');
    expect(sql).toContain('long_term_review boolean NOT NULL DEFAULT false');
    expect(sql).toContain("source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'practice_review', 'wrongbook'))");
    expect(sql).toContain('CHECK (favorite = true OR long_term_review = true)');
    expect(sql).toContain('UNIQUE (student_id, question_id, bank_id)');
    expect(sql).toContain('question_bookmarks_student_updated_at_idx');
    expect(sql).toContain('question_bookmarks_student_bank_idx');
    expect(sql).toContain('question_bookmarks_question_id_idx');
  });

  it('extends students for formal identity security state', async () => {
    const sql = await readFile(join(process.cwd(), 'src/db/migrations/0010_student_identity_security.sql'), 'utf8');

    expect(sql).toContain('ALTER TABLE students');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS class_name text');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS group_name text');
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS password_reset_required boolean NOT NULL DEFAULT false');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS locked_until timestamptz');
    expect(sql).toContain("SET class_name = '2班'");
    expect(sql).toContain("login_name ~ '^\\d{12}$'");
    expect(sql).toContain("login_name >= '202502040201'");
    expect(sql).toContain("login_name <= '202502040230'");
    expect(sql).toContain("CHECK (status IN ('active', 'disabled'))");
    expect(sql).toContain('CHECK (failed_login_count >= 0)');
    expect(sql).toContain('students_class_name_idx');
    expect(sql).toContain('students_locked_until_idx');
  });

  it('extends admin users for login lock and password security state', async () => {
    const sql = await readFile(join(process.cwd(), 'src/db/migrations/0011_admin_identity_security.sql'), 'utf8');

    expect(sql).toContain('ALTER TABLE admin_users');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS password_changed_at timestamptz');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS failed_login_window_started_at timestamptz');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS locked_until timestamptz');
    expect(sql).toContain('admin_users_failed_login_count_check');
    expect(sql).toContain('CHECK (failed_login_count >= 0)');
    expect(sql).toContain('admin_users_locked_until_idx');
  });
});
