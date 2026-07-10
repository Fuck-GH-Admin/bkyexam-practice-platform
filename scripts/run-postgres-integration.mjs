import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const testPort = process.env.POSTGRES_TEST_PORT ?? '55432';
const testDatabaseUrl = `postgres://bkyexam:bkyexam@127.0.0.1:${testPort}/bkyexam_test`;
const windowsNpmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npmCli = process.env.npm_execpath
  ?? (process.platform === 'win32' && existsSync(windowsNpmCli) ? windowsNpmCli : undefined);
const npmInvocation = npmCli
  ? { command: process.execPath, args: [npmCli, 'run', 'test:integration:db'] }
  : { command: 'npm', args: ['run', 'test:integration:db'] };

let exitCode = 0;

try {
  await run('docker', [
    'compose',
    '--profile',
    'test',
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    '60',
    'postgres-test',
  ]);
  await run(npmInvocation.command, npmInvocation.args, {
    ...process.env,
    TEST_DATABASE_URL: testDatabaseUrl,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  try {
    await run('docker', ['compose', '--profile', 'test', 'rm', '-s', '-f', 'postgres-test']);
  } catch (cleanupError) {
    console.error(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    exitCode = 1;
  }
}

process.exitCode = exitCode;

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env,
      shell: false,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(
        signal
          ? `${command} ${args.join(' ')} terminated by ${signal}`
          : `${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`,
      ));
    });
  });
}
