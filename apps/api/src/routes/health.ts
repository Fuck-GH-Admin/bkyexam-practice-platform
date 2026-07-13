import type { FastifyInstance } from 'fastify';
import { HealthResponseV1Schema } from '@bkyexam-practice/shared';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => HealthResponseV1Schema.parse({
    ok: true,
    service: 'bkyexam-practice-api',
  }));
}
