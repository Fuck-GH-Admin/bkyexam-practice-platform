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
});
