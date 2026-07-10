import {
  runNpm,
  startPostgresTest,
  stopPostgresTest,
  testDatabaseUrl,
} from './lib/postgres-test-runner.mjs';

let exitCode = 0;

try {
  await startPostgresTest();
  await runNpm(['run', 'test:integration:db'], {
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

process.exitCode = exitCode;
