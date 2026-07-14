import type { FastifyInstance } from 'fastify';
import {
  HealthResponseV1Schema,
  ReadinessResponseV1Schema,
} from '@bkyexam-practice/shared';
import {
  createDisabledDatabaseReadinessProbe,
  type ReadinessProbe,
} from '../health/readiness.js';

interface HealthRoutesOptions {
  readinessProbe?: ReadinessProbe;
}

const service = 'bkyexam-practice-api';

export async function registerHealthRoutes(app: FastifyInstance, options: HealthRoutesOptions = {}) {
  const readinessProbe = options.readinessProbe ?? createDisabledDatabaseReadinessProbe();

  app.get('/api/health', async () => HealthResponseV1Schema.parse({
    ok: true,
    service,
  }));

  app.get('/api/health/readiness', async (_request, reply) => {
    const database = await readinessProbe.check();
    const response = ReadinessResponseV1Schema.parse({
      ok: database.ok,
      service,
      checkedAt: new Date().toISOString(),
      dependencies: {
        api: { ok: true, status: 'ok', latencyMs: 0 },
        database,
      },
    });

    if (!response.ok) {
      reply.status(503);
    }

    return response;
  });
}
