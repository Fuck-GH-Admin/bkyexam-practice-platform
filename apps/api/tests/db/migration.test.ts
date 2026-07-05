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
});
