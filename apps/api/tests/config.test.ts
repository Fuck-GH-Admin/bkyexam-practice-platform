import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('defaults USE_DATABASE to false', () => {
    expect(loadConfig({}).USE_DATABASE).toBe(false);
  });

  it('sets USE_DATABASE to true when env USE_DATABASE is true', () => {
    expect(loadConfig({ USE_DATABASE: 'true' }).USE_DATABASE).toBe(true);
  });

  it('reads DATABASE_URL from env', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://example' }).DATABASE_URL).toBe('postgres://example');
  });

  it('loads cookie session settings with safe development defaults', () => {
    const config = loadConfig({});

    expect(config.COOKIE_SECRET).toBe('dev-cookie-secret-change-me');
    expect(config.COOKIE_SECURE).toBe(false);
    expect(config.SESSION_TTL_DAYS).toBe(30);
    expect(config.ADMIN_SESSION_TTL_HOURS).toBe(8);
    expect(config.ADMIN_IMPORT_ENABLE_WRITE).toBe(false);
    expect(config.RATE_LIMIT_ENABLED).toBe(false);
    expect(config.RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(config.RATE_LIMIT_MAX).toBe(600);
    expect(config.CSRF_ORIGIN_CHECK_ENABLED).toBe(false);
    expect(config.CSRF_ALLOWED_ORIGINS).toEqual(['http://127.0.0.1:5173', 'http://localhost:5173']);
  });

  it('loads cookie session settings from environment', () => {
    const config = loadConfig({
      COOKIE_SECRET: 'production-secret',
      COOKIE_SECURE: 'true',
      SESSION_TTL_DAYS: '14',
      ADMIN_SESSION_TTL_HOURS: '6',
      ADMIN_IMPORT_ENABLE_WRITE: 'true',
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_WINDOW_MS: '5000',
      RATE_LIMIT_MAX: '20',
      CSRF_ORIGIN_CHECK_ENABLED: 'true',
      CSRF_ALLOWED_ORIGINS: 'https://student.example.com;https://admin.example.com',
    });

    expect(config.COOKIE_SECRET).toBe('production-secret');
    expect(config.COOKIE_SECURE).toBe(true);
    expect(config.SESSION_TTL_DAYS).toBe(14);
    expect(config.ADMIN_SESSION_TTL_HOURS).toBe(6);
    expect(config.ADMIN_IMPORT_ENABLE_WRITE).toBe(true);
    expect(config.RATE_LIMIT_ENABLED).toBe(true);
    expect(config.RATE_LIMIT_WINDOW_MS).toBe(5000);
    expect(config.RATE_LIMIT_MAX).toBe(20);
    expect(config.CSRF_ORIGIN_CHECK_ENABLED).toBe(true);
    expect(config.CSRF_ALLOWED_ORIGINS).toEqual(['https://student.example.com', 'https://admin.example.com']);
  });
});
