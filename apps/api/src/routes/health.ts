import type { FastifyInstance } from 'fastify';
import {
  HealthResponseV1Schema,
  MetricsResponseV1Schema,
  ReadinessResponseV1Schema,
} from '@bkyexam-practice/shared';
import {
  createDisabledDatabaseReadinessProbe,
  type ReadinessProbe,
} from '../health/readiness.js';
import { createMetricsRegistry, type MetricsRegistry } from '../platform/observability.js';

interface HealthRoutesOptions {
  readinessProbe?: ReadinessProbe;
  metricsRegistry?: MetricsRegistry;
}

const service = 'bkyexam-practice-api';

export async function registerHealthRoutes(app: FastifyInstance, options: HealthRoutesOptions = {}) {
  const readinessProbe = options.readinessProbe ?? createDisabledDatabaseReadinessProbe();
  const metricsRegistry = options.metricsRegistry ?? createMetricsRegistry(service);

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

  app.get('/api/health/metrics', async () => MetricsResponseV1Schema.parse(metricsRegistry.snapshot()));
}
