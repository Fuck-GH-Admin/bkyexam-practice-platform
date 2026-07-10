import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  repositoryRoot,
  runNpm,
  startPostgresTest,
  stopPostgresTest,
  testDatabaseUrl,
} from './lib/postgres-test-runner.mjs';

const sourceArgument = process.argv[2];
if (!sourceArgument) {
  console.error('Usage: npm run smoke:import:full:docker -- <questionbank-dir>');
  process.exitCode = 1;
} else {
  const questionBankDir = resolve(repositoryRoot, sourceArgument);
  process.exitCode = await run(questionBankDir);
}

async function run(questionBankDir) {
  try {
    await validateQuestionBankDirectory(questionBankDir);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  let exitCode = 0;
  try {
    await startPostgresTest();
    await runNpm([
      'run',
      'smoke:import:full',
      '-w',
      '@bkyexam-practice/api',
      '--',
      questionBankDir,
    ], {
      ...process.env,
      TEST_DATABASE_URL: testDatabaseUrl,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    exitCode = 1;
  } finally {
    try {
      await stopPostgresTest();
    } catch (cleanupError) {
      console.error(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
      exitCode = 1;
    }
  }

  return exitCode;
}

async function validateQuestionBankDirectory(questionBankDir) {
  for (const requiredFile of ['classifications.txt', 'change_question_answers.txt']) {
    if (!existsSync(resolve(questionBankDir, requiredFile))) {
      throw new Error(`Question-bank source is missing ${requiredFile}: ${questionBankDir}`);
    }
  }

  const files = await readdir(questionBankDir);
  if (!files.some((fileName) => /^qtype_\d+(?:_.*)?\.txt$/i.test(fileName))) {
    throw new Error(`Question-bank source has no qtype files: ${questionBankDir}`);
  }
}
