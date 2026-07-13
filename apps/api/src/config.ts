import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@127.0.0.1:5432/bkyexam_practice'),
  USE_DATABASE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  COOKIE_SECRET: z.string().default('dev-cookie-secret-change-me'),
  COOKIE_SECURE: z.string().optional().transform((value) => value === 'true'),
  SESSION_TTL_DAYS: z.string().optional().transform((value) => parsePositiveInteger(value, 30)),
  ADMIN_SESSION_TTL_HOURS: z.string().optional().transform((value) => parsePositiveInteger(value, 8)),
  ADMIN_IMPORT_ALLOWED_ROOTS: z.string().optional().transform(parsePathList),
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
