#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const defaultThresholdsMs = {
  health: 6000,
  readiness: 4000,
  metrics: 4000,
  banks: 10_000,
  student_login: 5000,
  student_me: 2500,
  practice_create: 5000,
  admin_login: 5000,
  admin_me: 2500,
};

const userAgent = 'bkyexam-staging-load-baseline/1.0';

function parseArgs(argv) {
  const options = {
    baseUrl: 'https://exam.acgbot.cc.cd',
    iterations: 3,
    practiceLimit: 5,
    credentialsCsv: null,
    studentLogin: '202502040201',
    adminLogin: 'admin',
    output: null,
    requireThresholds: false,
    auth: true,
    thresholds: { ...defaultThresholdsMs },
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--require-thresholds') {
      options.requireThresholds = true;
    } else if (arg === '--no-auth') {
      options.auth = false;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = requireValue(arg, '--base-url=').replace(/\/+$/, '');
    } else if (arg.startsWith('--iterations=')) {
      options.iterations = parseInteger(requireValue(arg, '--iterations='), 'iterations', 1, 50);
    } else if (arg.startsWith('--practice-limit=')) {
      options.practiceLimit = parseInteger(requireValue(arg, '--practice-limit='), 'practice-limit', 1, 50);
    } else if (arg.startsWith('--credentials-csv=')) {
      options.credentialsCsv = requireValue(arg, '--credentials-csv=');
    } else if (arg.startsWith('--student-login=')) {
      options.studentLogin = requireValue(arg, '--student-login=');
    } else if (arg.startsWith('--admin-login=')) {
      options.adminLogin = requireValue(arg, '--admin-login=');
    } else if (arg.startsWith('--output=')) {
      options.output = requireValue(arg, '--output=');
    } else if (arg.startsWith('--threshold=')) {
      const [name, rawMs] = requireValue(arg, '--threshold=').split(':');
      if (!name || !rawMs) throw new Error('--threshold must use name:milliseconds.');
      options.thresholds[name] = parseInteger(rawMs, `threshold ${name}`, 1, 60_000);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return `Usage:
  npm run ops:staging-load-baseline -- \\
    --base-url=https://exam.acgbot.cc.cd \\
    --credentials-csv=/root/bkyexam-credentials/bkyexam-b9.14-credentials-YYYY.csv \\
    --iterations=3 \\
    --require-thresholds \\
    --output=/srv/bkyexam-backups/b9.15/load-baseline.json

Options:
  --no-auth                         Only run public health/readiness/metrics/banks checks.
  --student-login=<login>           Student login name to select from credentials CSV.
  --admin-login=<login>             Admin login name to select from credentials CSV.
  --threshold=<name:ms>             Override a threshold, e.g. --threshold=banks:8000.

The report is sanitized: passwords are never printed or written.`;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  try {
    const report = await runBaseline(options);
    const output = `${JSON.stringify(report, null, 2)}\n`;
    if (options.output) {
      const resolved = resolve(options.output);
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, output, 'utf8');
    }
    console.log(JSON.stringify(summarizeForStdout(report), null, 2));
    process.exitCode = report.ok ? 0 : 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function runBaseline(options) {
  const credentials = options.auth ? await loadCredentials(options) : null;
  const checks = [];
  const failures = [];
  let selectedBank = null;

  for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
    checks.push(await requestJson(options, {
      iteration,
      name: 'health',
      method: 'GET',
      path: '/api/health',
      expectStatus: 200,
      summarize: summarizeHealth,
    }));
    checks.push(await requestJson(options, {
      iteration,
      name: 'readiness',
      method: 'GET',
      path: '/api/health/readiness',
      expectStatus: 200,
      summarize: summarizeReadiness,
    }));
    checks.push(await requestJson(options, {
      iteration,
      name: 'metrics',
      method: 'GET',
      path: '/api/health/metrics',
      expectStatus: 200,
      summarize: summarizeMetrics,
    }));
    const banksCheck = await requestJson(options, {
      iteration,
      name: 'banks',
      method: 'GET',
      path: '/api/banks',
      expectStatus: 200,
      summarize: summarizeBanks,
    });
    checks.push(banksCheck);
    selectedBank ??= banksCheck.bodySummary?.firstBank ?? null;

    if (options.auth) {
      const studentJar = new CookieJar();
      checks.push(await requestJson(options, {
        iteration,
        name: 'student_login',
        method: 'POST',
        path: '/api/auth/login',
        body: {
          loginName: credentials.student.loginName,
          password: credentials.student.password,
        },
        jar: studentJar,
        expectStatus: 200,
        summarize: summarizeStudentAuth,
      }));
      checks.push(await requestJson(options, {
        iteration,
        name: 'student_me',
        method: 'GET',
        path: '/api/auth/me',
        jar: studentJar,
        expectStatus: 200,
        summarize: summarizeStudentAuth,
      }));
      checks.push(await requestJson(options, {
        iteration,
        name: 'practice_create',
        method: 'POST',
        path: '/api/practice/sessions',
        body: {
          bankId: selectedBank?.bankId,
          mode: 'random',
          limit: options.practiceLimit,
        },
        jar: studentJar,
        expectStatus: 200,
        summarize: summarizePracticeCreate,
      }));

      const adminJar = new CookieJar();
      checks.push(await requestJson(options, {
        iteration,
        name: 'admin_login',
        method: 'POST',
        path: '/api/admin/auth/login',
        body: {
          loginName: credentials.admin.loginName,
          password: credentials.admin.password,
        },
        jar: adminJar,
        expectStatus: 200,
        summarize: summarizeAdminAuth,
      }));
      checks.push(await requestJson(options, {
        iteration,
        name: 'admin_me',
        method: 'GET',
        path: '/api/admin/me',
        jar: adminJar,
        expectStatus: 200,
        summarize: summarizeAdminAuth,
      }));
    }
  }

  for (const check of checks) {
    if (check.status !== check.expectedStatus) {
      failures.push(`${check.name}#${check.iteration} status ${check.status} != ${check.expectedStatus}`);
    }
    if (options.requireThresholds) {
      const threshold = options.thresholds[check.name];
      if (threshold && check.elapsedMs > threshold) {
        failures.push(`${check.name}#${check.iteration} ${check.elapsedMs}ms > ${threshold}ms`);
      }
    }
  }

  return {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    iterations: options.iterations,
    authChecksEnabled: options.auth,
    passwordPrinted: false,
    thresholdsRequired: options.requireThresholds,
    thresholdsMs: options.thresholds,
    selectedAccounts: options.auth ? {
      studentLogin: credentials.student.loginName,
      adminLogin: credentials.admin.loginName,
    } : null,
    summary: buildSummary(checks),
    failures,
    checks,
  };
}

async function loadCredentials(options) {
  if (!options.credentialsCsv) {
    throw new Error('--credentials-csv is required unless --no-auth is used.');
  }
  const rows = parseCsv(await readFile(options.credentialsCsv, 'utf8'));
  const student = rows.find((row) =>
    row.accountType === 'student' && row.loginName === options.studentLogin && row.password);
  const admin = rows.find((row) =>
    row.accountType === 'admin' && row.loginName === options.adminLogin && row.password);

  if (!student) throw new Error(`Student credential not found for ${options.studentLogin}.`);
  if (!admin) throw new Error(`Admin credential not found for ${options.adminLogin}.`);
  return { student, admin };
}

async function requestJson(options, input) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': userAgent,
  };
  let body;
  if (input.body) {
    body = JSON.stringify(input.body);
    headers['Content-Type'] = 'application/json';
    headers.Origin = options.baseUrl;
  }
  const cookieHeader = input.jar?.header();
  if (cookieHeader) headers.Cookie = cookieHeader;

  const started = performance.now();
  let status = 0;
  let responseBody = null;
  let sizeBytes = 0;
  let error = null;
  let rateLimit = {};

  try {
    const response = await fetch(`${options.baseUrl}${input.path}`, {
      method: input.method,
      headers,
      body,
    });
    status = response.status;
    input.jar?.store(response.headers);
    rateLimit = {
      limit: response.headers.get('x-ratelimit-limit'),
      remaining: response.headers.get('x-ratelimit-remaining'),
    };
    const text = await response.text();
    sizeBytes = Buffer.byteLength(text);
    responseBody = text ? JSON.parse(text) : null;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const elapsedMs = Number((performance.now() - started).toFixed(2));
  return {
    iteration: input.iteration,
    name: input.name,
    method: input.method,
    path: input.path,
    status,
    expectedStatus: input.expectStatus,
    ok: !error && status === input.expectStatus,
    elapsedMs,
    sizeBytes,
    rateLimit,
    ...(error ? { error } : {}),
    bodySummary: responseBody ? input.summarize(responseBody) : null,
  };
}

class CookieJar {
  cookies = new Map();

  store(headers) {
    const values = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
    for (const value of values) {
      const matches = value.matchAll(/(?:^|,\s*)(bky_session|bky_admin_session)=([^;,\s]+)/g);
      for (const match of matches) {
        this.cookies.set(match[1], match[2]);
      }
    }
  }

  header() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
  }
}

function buildSummary(checks) {
  const byName = {};
  for (const check of checks) {
    byName[check.name] ??= [];
    byName[check.name].push(check.elapsedMs);
  }

  const latency = {};
  for (const [name, values] of Object.entries(byName)) {
    const sorted = [...values].sort((a, b) => a - b);
    latency[name] = {
      samples: sorted.length,
      minMs: sorted[0],
      maxMs: sorted[sorted.length - 1],
      avgMs: Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2)),
      p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    };
  }

  return {
    totalChecks: checks.length,
    failedChecks: checks.filter((check) => !check.ok).length,
    latency,
  };
}

function summarizeForStdout(report) {
  return {
    ok: report.ok,
    generatedAt: report.generatedAt,
    baseUrl: report.baseUrl,
    iterations: report.iterations,
    thresholdsRequired: report.thresholdsRequired,
    passwordPrinted: report.passwordPrinted,
    summary: report.summary,
    failures: report.failures,
  };
}

function summarizeHealth(body) {
  return { ok: body.ok, service: body.service };
}

function summarizeReadiness(body) {
  return {
    ok: body.ok,
    api: body.dependencies?.api,
    database: body.dependencies?.database,
  };
}

function summarizeMetrics(body) {
  return {
    service: body.service,
    uptimeSeconds: body.uptimeSeconds,
    totalRequests: body.http?.totalRequests,
    averageDurationMs: body.http?.averageDurationMs,
  };
}

function summarizeBanks(body) {
  const banks = Array.isArray(body.banks) ? body.banks : [];
  const firstBank = banks[0] ? {
    bankId: banks[0].bankId,
    bankName: banks[0].bankName,
    questionCount: banks[0].questionCount,
    status: banks[0].status,
    visible: banks[0].visible,
  } : null;
  return { bankCount: banks.length, firstBank };
}

function summarizeStudentAuth(body) {
  const student = body.student ?? {};
  return {
    student: {
      loginName: student.loginName,
      displayName: student.displayName,
      className: student.className,
      groupName: student.groupName,
    },
    passwordResetRequired: body.passwordResetRequired,
  };
}

function summarizePracticeCreate(body) {
  const session = body.session ?? {};
  const questions = Array.isArray(body.questions) ? body.questions : [];
  return {
    session: {
      id: session.id,
      bankId: session.bankId,
      mode: session.mode,
      status: session.status,
      totalQuestions: session.totalQuestions,
      currentSort: session.currentSort,
    },
    questionCount: questions.length,
  };
}

function summarizeAdminAuth(body) {
  const admin = body.admin ?? {};
  return {
    admin: {
      loginName: admin.loginName,
      displayName: admin.displayName,
      roles: admin.roles,
    },
    expiresAtPresent: Boolean(body.expiresAt),
  };
}

function parseCsv(content) {
  const rows = [];
  const cells = [];
  let cell = '';
  let inQuotes = false;
  const text = content.replace(/^\uFEFF/, '');

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes && char === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char === ',') {
      cells.push(cell);
      cell = '';
    } else if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      cells.push(cell);
      if (cells.some((value) => value.length > 0)) rows.push(cells.splice(0));
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || cells.length > 0) {
    cells.push(cell);
    rows.push(cells);
  }

  const [header, ...bodyRows] = rows;
  if (!header) return [];
  return bodyRows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])));
}

function parseInteger(value, name, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function requireValue(arg, prefix) {
  const value = arg.slice(prefix.length).trim();
  if (!value) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return value;
}

void main();
