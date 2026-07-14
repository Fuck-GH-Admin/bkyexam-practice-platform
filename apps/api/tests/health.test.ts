import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createPgReadinessProbe } from '../src/health/readiness';
import type { QueryClient } from '../src/db/client';

describe('health route', () => {
  it('returns ok status and service name', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: 'bkyexam-practice-api',
    });
  });

  it('maps database readiness query success and failure', async () => {
    const okClient: QueryClient = {
      async query() {
        return { rows: [{ ok: 1 }] };
      },
    };
    const failingClient: QueryClient = {
      async query() {
        throw new Error('database unavailable');
      },
    };

    await expect(createPgReadinessProbe(okClient).check()).resolves.toMatchObject({
      ok: true,
      status: 'ok',
      latencyMs: expect.any(Number),
    });
    await expect(createPgReadinessProbe(failingClient).check()).resolves.toMatchObject({
      ok: false,
      status: 'down',
      latencyMs: expect.any(Number),
      message: 'Database readiness query failed',
    });
  });
});
