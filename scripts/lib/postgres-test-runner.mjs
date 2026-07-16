import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
export const testPort = process.env.POSTGRES_TEST_PORT ?? '55432';
export const testDatabaseUrl = `postgres://bkyexam:bkyexam@127.0.0.1:${testPort}/bkyexam_test`;

const windowsNpmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npmCli = process.env.npm_execpath
  ?? (process.platform === 'win32' && existsSync(windowsNpmCli) ? windowsNpmCli : undefined);

export async function runNpm(args, env = process.env) {
  if (npmCli) {
    return runCommand(process.execPath, [npmCli, ...args], env);
  }

  return runCommand('npm', args, env);
}

export function startPostgresTest() {
  return runCommand('docker', [
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
}

export function stopPostgresTest() {
  return runCommand('docker', ['compose', '--profile', 'test', 'rm', '-s', '-f', 'postgres-test']);
}

export function runCommand(command, args, env = process.env) {
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

export function captureCommand(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let stdout = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve(stdout);
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

export function captureCommandBuffer(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const chunks = [];

    child.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
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

export function runCommandWithInput(command, args, input, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env,
      shell: false,
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    child.stdin.end(input);
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
