import { describe, expect, it } from 'vitest';
import { MetricsResponseV1Schema } from '@bkyexam-practice/shared';
import { buildApp } from '../../src/app';
import type { ReadinessProbe } from '../../src/health/readiness';

describe('health and backend guardrails', () => {
  it('returns liveness with request id and secure API headers', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'client-req-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: 'bkyexam-practice-api' });
    expect(response.headers['x-request-id']).toBe('client-req-1');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('returns readiness with disabled database dependency by default', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/health/readiness' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: 'bkyexam-practice-api',
      checkedAt: expect.any(String),
      dependencies: {
        api: { ok: true, status: 'ok', latencyMs: 0 },
        database: {
          ok: true,
          status: 'disabled',
          message: 'Database disabled for this runtime',
        },
      },
    });
  });

  it('returns in-process HTTP metrics with route and status buckets', async () => {
    const app = buildApp();

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    const banks = await app.inject({ method: 'GET', url: '/api/banks' });
    const missing = await app.inject({ method: 'GET', url: '/api/missing' });
    const metrics = await app.inject({ method: 'GET', url: '/api/health/metrics' });

    expect(health.statusCode).toBe(200);
    expect(banks.statusCode).toBe(200);
    expect(missing.statusCode).toBe(404);
    expect(metrics.statusCode).toBe(200);

    const payload = MetricsResponseV1Schema.parse(metrics.json());
    expect(payload.service).toBe('bkyexam-practice-api');
    expect(payload.generatedAt).toEqual(expect.any(String));
    expect(payload.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(payload.process).toMatchObject({
      pid: expect.any(Number),
      nodeVersion: expect.stringMatching(/^v/),
      memoryRssBytes: expect.any(Number),
      memoryHeapUsedBytes: expect.any(Number),
    });
    expect(payload.http.totalRequests).toBe(3);
    expect(payload.http.responses.success).toBe(2);
    expect(payload.http.responses.clientError).toBe(1);
    expect(payload.http.averageDurationMs).toBeGreaterThanOrEqual(0);
    expect(payload.http.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        method: 'GET',
        route: '/api/health',
        requests: 1,
        responses: expect.objectContaining({ success: 1 }),
      }),
      expect.objectContaining({
        method: 'GET',
        route: '/api/banks',
        requests: 1,
        responses: expect.objectContaining({ success: 1 }),
      }),
      expect.objectContaining({
        method: 'GET',
        route: '/api/missing',
        requests: 1,
        responses: expect.objectContaining({ clientError: 1 }),
      }),
    ]));
  });

  it('returns 503 readiness when the database probe is down', async () => {
    const readinessProbe: ReadinessProbe = {
      async check() {
        return {
          ok: false,
          status: 'down',
          latencyMs: 2,
          message: 'Database readiness query failed',
        };
      },
    };
    const app = buildApp({ readinessProbe });

    const response = await app.inject({ method: 'GET', url: '/api/health/readiness' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      ok: false,
      dependencies: {
        database: {
          ok: false,
          status: 'down',
          latencyMs: 2,
          message: 'Database readiness query failed',
        },
      },
    });
  });

  it('returns structured unexpected errors with request ids', async () => {
    const app = buildApp({
      bankRepository: {
        async listBanks() {
          throw new Error('repository exploded');
        },
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/banks',
      headers: { 'x-request-id': 'client-req-500' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'Internal Server Error',
      requestId: 'client-req-500',
    });
  });

  it('can rate limit repeated requests when enabled', async () => {
    const app = buildApp({
      rateLimit: { enabled: true, windowMs: 60_000, max: 1 },
    });

    const first = await app.inject({ method: 'GET', url: '/api/health' });
    const second = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'rate-limited-req' },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.headers['x-ratelimit-limit']).toBe('1');
    expect(second.json()).toEqual({
      error: 'Rate limit exceeded',
      requestId: 'rate-limited-req',
    });
  });

  it('can block unsafe cookie requests with a disallowed CSRF origin when enabled', async () => {
    const app = buildApp({
      csrfOriginCheck: {
        enabled: true,
        allowedOrigins: ['http://127.0.0.1:5173'],
      },
    });

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        cookie: 'bky_session=token',
        origin: 'https://evil.example.com',
        'x-request-id': 'csrf-req',
      },
    });

    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toEqual({
      error: 'CSRF origin check failed',
      requestId: 'csrf-req',
    });
  });
});
