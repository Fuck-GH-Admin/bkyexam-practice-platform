import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@127.0.0.1:5432/bkyexam_practice'),
  USE_DATABASE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  COOKIE_SECRET: z.string().default('dev-cookie-secret-change-me'),
  COOKIE_SECURE: z.string().optional().transform((value) => value === 'true'),
  SESSION_TTL_DAYS: z.string().optional().transform((value) => parsePositiveInteger(value, 30)),
  STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED: z.string().optional().transform((value) => value === 'true'),
  STUDENT_LOGIN_MAX_FAILURES: z.string().optional().transform((value) => parsePositiveInteger(value, 10)),
  STUDENT_LOGIN_FAILURE_WINDOW_MINUTES: z.string().optional().transform((value) => parsePositiveInteger(value, 30)),
  STUDENT_LOGIN_LOCK_MINUTES: z.string().optional().transform((value) => parsePositiveInteger(value, 15)),
  ADMIN_SESSION_TTL_HOURS: z.string().optional().transform((value) => parsePositiveInteger(value, 8)),
  ADMIN_IMPORT_ALLOWED_ROOTS: z.string().optional().transform(parsePathList),
  ADMIN_IMPORT_ENABLE_WRITE: z.string().optional().transform((value) => value === 'true'),
  RATE_LIMIT_ENABLED: z.string().optional().transform((value) => value === 'true'),
  RATE_LIMIT_WINDOW_MS: z.string().optional().transform((value) => parsePositiveInteger(value, 60_000)),
  RATE_LIMIT_MAX: z.string().optional().transform((value) => parsePositiveInteger(value, 600)),
  CSRF_ORIGIN_CHECK_ENABLED: z.string().optional().transform((value) => value === 'true'),
  CSRF_ALLOWED_ORIGINS: z.string().optional().transform((value) => (
    value ? parsePathList(value) : ['http://127.0.0.1:5173', 'http://localhost:5173']
  )),
});

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePathList(value: string | undefined): string[] {
  if (!value) return [];

  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  return configSchema.parse(env);
}

export const config = loadConfig();
