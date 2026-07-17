import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MetricsResponseV1, MetricsStatusBucketsV1 } from '@bkyexam-practice/shared';

declare module 'fastify' {
  interface FastifyRequest {
    observabilityStartedAt?: bigint;
  }
}

export type MetricsStatusBucket = keyof MetricsStatusBucketsV1;

export interface HttpRequestMetricSample {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}

export interface MetricsRegistry {
  recordHttpRequest(sample: HttpRequestMetricSample): void;
  snapshot(now?: Date): MetricsResponseV1;
}

interface RouteAccumulator {
  method: string;
  route: string;
  requests: number;
  responses: MetricsStatusBucketsV1;
  totalDurationMs: number;
}

const defaultServiceName = 'bkyexam-practice-api';

export function createMetricsRegistry(service = defaultServiceName): MetricsRegistry {
  return new InMemoryMetricsRegistry(service);
}

export function registerObservability(app: FastifyInstance, registry: MetricsRegistry) {
  app.addHook('onRequest', async (request) => {
    request.observabilityStartedAt = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (request, reply) => {
    const durationMs = calculateDurationMs(request.observabilityStartedAt);
    const route = resolveRouteLabel(request);
    const statusCode = reply.statusCode;
    const statusBucket = toStatusBucket(statusCode);
    const metric = {
      method: request.method,
      route,
      statusCode,
      durationMs,
    };

    registry.recordHttpRequest(metric);

    request.log.info({
      event: 'http_request',
      requestId: request.bkyRequestId ?? request.id,
      method: request.method,
      route,
      statusCode,
      statusBucket,
      durationMs,
      remoteAddress: request.ip,
      userAgent: normalizeHeaderValue(request.headers['user-agent']),
    }, 'http request completed');
  });
}

class InMemoryMetricsRegistry implements MetricsRegistry {
  private readonly startedAt = Date.now();
  private totalRequests = 0;
  private readonly responses = createEmptyStatusBuckets();
  private totalDurationMs = 0;
  private readonly routes = new Map<string, RouteAccumulator>();

  constructor(private readonly service: string) {}

  recordHttpRequest(sample: HttpRequestMetricSample): void {
    const bucket = toStatusBucket(sample.statusCode);
    const durationMs = Math.max(sample.durationMs, 0);
    this.totalRequests += 1;
    this.responses[bucket] += 1;
    this.totalDurationMs += durationMs;

    const routeKey = `${sample.method} ${sample.route}`;
    const route = this.routes.get(routeKey) ?? {
      method: sample.method,
      route: sample.route,
      requests: 0,
      responses: createEmptyStatusBuckets(),
      totalDurationMs: 0,
    };
    route.requests += 1;
    route.responses[bucket] += 1;
    route.totalDurationMs += durationMs;
    this.routes.set(routeKey, route);
  }

  snapshot(now = new Date()): MetricsResponseV1 {
    const memory = process.memoryUsage();
    return {
      service: this.service,
      generatedAt: now.toISOString(),
      uptimeSeconds: roundDuration((now.getTime() - this.startedAt) / 1000),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        memoryRssBytes: memory.rss,
        memoryHeapUsedBytes: memory.heapUsed,
      },
      http: {
        totalRequests: this.totalRequests,
        responses: cloneStatusBuckets(this.responses),
        averageDurationMs: averageDuration(this.totalDurationMs, this.totalRequests),
        routes: Array.from(this.routes.values())
          .map((route) => ({
            method: route.method,
            route: route.route,
            requests: route.requests,
            responses: cloneStatusBuckets(route.responses),
            averageDurationMs: averageDuration(route.totalDurationMs, route.requests),
          }))
          .sort((left, right) => `${left.method} ${left.route}`.localeCompare(`${right.method} ${right.route}`)),
      },
    };
  }
}

function createEmptyStatusBuckets(): MetricsStatusBucketsV1 {
  return {
    informational: 0,
    success: 0,
    redirection: 0,
    clientError: 0,
    serverError: 0,
  };
}

function cloneStatusBuckets(buckets: MetricsStatusBucketsV1): MetricsStatusBucketsV1 {
  return { ...buckets };
}

function toStatusBucket(statusCode: number): MetricsStatusBucket {
  if (statusCode >= 500) return 'serverError';
  if (statusCode >= 400) return 'clientError';
  if (statusCode >= 300) return 'redirection';
  if (statusCode >= 200) return 'success';
  return 'informational';
}

function calculateDurationMs(startedAt: bigint | undefined): number {
  if (!startedAt) return 0;
  const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
  return roundDuration(Number(elapsedNanoseconds) / 1_000_000);
}

function averageDuration(totalDurationMs: number, count: number): number {
  if (count === 0) return 0;
  return roundDuration(totalDurationMs / count);
}

function roundDuration(value: number): number {
  return Math.round(Math.max(value, 0) * 1000) / 1000;
}

function resolveRouteLabel(request: FastifyRequest): string {
  return request.routeOptions?.url ?? parsePathname(request.url);
}

function parsePathname(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url.split('?', 1)[0] || '/';
  }
}

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
