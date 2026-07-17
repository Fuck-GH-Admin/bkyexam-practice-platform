import type { ReadinessDependencyV1 } from '@bkyexam-practice/shared';
import type { QueryClient } from '../db/client.js';

export interface ReadinessProbe {
  check(): Promise<ReadinessDependencyV1>;
}

export function createDisabledDatabaseReadinessProbe(): ReadinessProbe {
  return {
    async check() {
      return {
        ok: true,
        status: 'disabled',
        message: 'Database disabled for this runtime',
      };
    },
  };
}

export function createPgReadinessProbe(client: QueryClient): ReadinessProbe {
  return {
    async check() {
      const startedAt = Date.now();
      try {
        await client.query('SELECT 1 AS ok');
        return {
          ok: true,
          status: 'ok',
          latencyMs: Date.now() - startedAt,
        };
      } catch {
        return {
          ok: false,
          status: 'down',
          latencyMs: Date.now() - startedAt,
          message: 'Database readiness query failed',
        };
      }
    },
  };
}
