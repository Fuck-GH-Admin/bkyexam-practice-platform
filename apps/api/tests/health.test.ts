import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

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
});
