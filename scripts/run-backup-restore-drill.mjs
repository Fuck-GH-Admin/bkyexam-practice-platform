import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  captureCommand,
  repositoryRoot,
  runCommand,
  runCommandWithInput,
  runNpm,
  startPostgresTest,
  stopPostgresTest,
  testDatabaseUrl,
} from './lib/postgres-test-runner.mjs';

const restoreDatabase = process.env.POSTGRES_RESTORE_TEST_DATABASE ?? 'bkyexam_restore_test';

let exitCode = 0;

try {
  await startPostgresTest();
  await runNpm(['run', 'db:migrate', '-w', '@bkyexam-practice/api'], {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
  });
  await runPsql('bkyexam_test', seedSql());

  const sourceCounts = await readCounts('bkyexam_test');
  const backupSql = await pgDump('bkyexam_test');
  const artifactDir = join(repositoryRoot, 'artifacts', 'ops', 'backup-restore-drill', timestampSlug());
  const backupPath = join(artifactDir, 'bkyexam_test.sql');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(backupPath, backupSql, 'utf8');

  await dropDatabase(restoreDatabase);
  await createDatabase(restoreDatabase);
  await restorePlainSql(restoreDatabase, backupSql);
  const restoredCounts = await readCounts(restoreDatabase);

  if (JSON.stringify(restoredCounts) !== JSON.stringify(sourceCounts)) {
    throw new Error(`Restored counts differ. source=${JSON.stringify(sourceCounts)} restored=${JSON.stringify(restoredCounts)}`);
  }

  console.log(`Backup/restore drill passed. backup=${backupPath}`);
  console.log(JSON.stringify({ sourceCounts, restoredCounts }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  try {
    await dropDatabase(restoreDatabase);
  } catch (cleanupError) {
    console.error(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    exitCode = 1;
  }

  try {
    await stopPostgresTest();
  } catch (cleanupError) {
    console.error(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    exitCode = 1;
  }
}

process.exitCode = exitCode;

function dockerComposeExec(args) {
  return ['compose', '--profile', 'test', 'exec', '-T', 'postgres-test', ...args];
}

function runPsql(database, sql) {
  return runCommandWithInput('docker', dockerComposeExec([
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'bkyexam',
    '-d',
    database,
    '-f',
    '-',
  ]), sql);
}

function pgDump(database) {
  return captureCommand('docker', dockerComposeExec([
    'pg_dump',
    '-U',
    'bkyexam',
    '-d',
    database,
    '--format=plain',
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
  ]));
}

function restorePlainSql(database, sql) {
  return runPsql(database, sql);
}

function createDatabase(database) {
  return runCommand('docker', dockerComposeExec(['createdb', '-U', 'bkyexam', database]));
}

function dropDatabase(database) {
  return runCommand('docker', dockerComposeExec(['dropdb', '--if-exists', '-U', 'bkyexam', database]));
}

async function readCounts(database) {
  const output = await captureCommand('docker', dockerComposeExec([
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'bkyexam',
    '-d',
    database,
    '-At',
    '-c',
    countSql(),
  ]));

  return JSON.parse(output.trim());
}

function countSql() {
  return `
    SELECT json_build_object(
      'classifications', (SELECT COUNT(*) FROM classifications),
      'bankMappings', (SELECT COUNT(*) FROM bank_mappings),
      'students', (SELECT COUNT(*) FROM students),
      'questions', (SELECT COUNT(*) FROM questions),
      'questionOptions', (SELECT COUNT(*) FROM question_options),
      'practiceAttempts', (SELECT COUNT(*) FROM practice_attempts),
      'wrongQuestions', (SELECT COUNT(*) FROM wrong_questions),
      'studentLearningGoals', (SELECT COUNT(*) FROM student_learning_goals),
      'questionBookmarks', (SELECT COUNT(*) FROM question_bookmarks)
    )::text;
  `;
}

function seedSql() {
  return `
    INSERT INTO classifications (id, name, parent_id, q_group, sort, is_deleted)
    VALUES ('10000000-0000-4000-8000-000000000001', 'Ops Drill Bank', NULL, 900, 1, false);

    INSERT INTO bank_mappings (
      bank_id,
      subject_category,
      subject_name,
      bank_name,
      raw_name,
      parent_id,
      q_group,
      visible,
      status,
      difficulty,
      exam_purpose,
      question_types,
      audience,
      keywords,
      description,
      notes,
      question_count,
      descendant_question_count
    )
    VALUES (
      '10000000-0000-4000-8000-000000000001',
      '运维演练',
      'PostgreSQL',
      'Ops Drill Bank',
      'Ops Drill Bank',
      NULL,
      900,
      true,
      'active',
      'mixed',
      'ops',
      '["single_choice"]'::jsonb,
      'operators',
      '["backup","restore"]'::jsonb,
      'Backup and restore drill fixture.',
      '',
      1,
      1
    );

    INSERT INTO students (id, login_name, display_name)
    VALUES ('50000000-0000-4000-8000-000000000001', 'ops-drill-student', 'Ops Drill Student');

    INSERT INTO questions (
      id,
      classification_id,
      q_type,
      normalized_type,
      q_group,
      content,
      answer_raw,
      analyze_raw,
      use_count,
      difficulty,
      searchable_text
    )
    VALUES (
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      1,
      'single_choice',
      900,
      'Which command creates a logical backup?',
      '30000000-0000-4000-8000-000000000001',
      'pg_dump creates a logical backup.',
      0,
      1,
      'pg_dump logical backup'
    );

    INSERT INTO question_options (id, question_id, sort, content)
    VALUES ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, 'pg_dump');

    INSERT INTO practice_attempts (id, student_id, question_id, bank_id, answer, is_correct, source)
    VALUES (
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '["30000000-0000-4000-8000-000000000001"]',
      true,
      'ops_drill'
    );

    INSERT INTO wrong_questions (id, student_id, question_id, bank_id, wrong_count, last_answer, mastered, source)
    VALUES (
      '41000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      1,
      '["wrong-option"]',
      true,
      'ops_drill'
    );

    INSERT INTO student_learning_goals (student_id, daily_attempts_target, weekly_active_days_target, wrong_questions_review_target)
    VALUES ('50000000-0000-4000-8000-000000000001', 20, 5, 10);

    INSERT INTO question_bookmarks (id, student_id, question_id, bank_id, favorite, long_term_review, note, source)
    VALUES (
      '42000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      true,
      true,
      'restore drill bookmark',
      'manual'
    );
  `;
}

function timestampSlug() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}
