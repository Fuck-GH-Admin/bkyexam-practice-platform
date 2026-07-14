import { z } from 'zod';

const IsoTimestampV1Schema = z.string().datetime({ offset: true });
const NonNegativeIntegerV1Schema = z.number().int().nonnegative();
const NonNegativeNumberV1Schema = z.number().nonnegative();

export const HealthResponseV1Schema = z.object({
  ok: z.literal(true),
  service: z.string().min(1),
}).strict();
export type HealthResponseV1 = z.infer<typeof HealthResponseV1Schema>;

export const ReadinessDependencyStatusV1Schema = z.enum(['ok', 'disabled', 'down']);
export type ReadinessDependencyStatusV1 = z.infer<typeof ReadinessDependencyStatusV1Schema>;

export const ReadinessDependencyV1Schema = z.object({
  ok: z.boolean(),
  status: ReadinessDependencyStatusV1Schema,
  latencyMs: z.number().nonnegative().optional(),
  message: z.string().min(1).optional(),
}).strict().superRefine((dependency, context) => {
  if (dependency.ok && dependency.status === 'down') {
    context.addIssue({
      code: 'custom',
      path: ['status'],
      message: 'down dependency cannot be ok',
    });
  }
  if (!dependency.ok && dependency.status !== 'down') {
    context.addIssue({
      code: 'custom',
      path: ['status'],
      message: 'non-ok dependency must be down',
    });
  }
});
export type ReadinessDependencyV1 = z.infer<typeof ReadinessDependencyV1Schema>;

export const ReadinessResponseV1Schema = z.object({
  ok: z.boolean(),
  service: z.string().min(1),
  checkedAt: IsoTimestampV1Schema,
  dependencies: z.object({
    api: ReadinessDependencyV1Schema,
    database: ReadinessDependencyV1Schema,
  }).strict(),
}).strict().superRefine((response, context) => {
  const dependenciesOk = Object.values(response.dependencies).every((dependency) => dependency.ok);
  if (response.ok !== dependenciesOk) {
    context.addIssue({
      code: 'custom',
      path: ['ok'],
      message: 'readiness ok must match dependency health',
    });
  }
});
export type ReadinessResponseV1 = z.infer<typeof ReadinessResponseV1Schema>;

export const MetricsStatusBucketsV1Schema = z.object({
  informational: NonNegativeIntegerV1Schema,
  success: NonNegativeIntegerV1Schema,
  redirection: NonNegativeIntegerV1Schema,
  clientError: NonNegativeIntegerV1Schema,
  serverError: NonNegativeIntegerV1Schema,
}).strict();
export type MetricsStatusBucketsV1 = z.infer<typeof MetricsStatusBucketsV1Schema>;

export const MetricsRouteV1Schema = z.object({
  method: z.string().min(1),
  route: z.string().min(1),
  requests: NonNegativeIntegerV1Schema,
  responses: MetricsStatusBucketsV1Schema,
  averageDurationMs: NonNegativeNumberV1Schema,
}).strict().superRefine((route, context) => {
  const responseCount = sumStatusBuckets(route.responses);
  if (responseCount !== route.requests) {
    context.addIssue({
      code: 'custom',
      path: ['responses'],
      message: 'route response buckets must sum to requests',
    });
  }
});
export type MetricsRouteV1 = z.infer<typeof MetricsRouteV1Schema>;

export const MetricsResponseV1Schema = z.object({
  service: z.string().min(1),
  generatedAt: IsoTimestampV1Schema,
  uptimeSeconds: NonNegativeNumberV1Schema,
  process: z.object({
    pid: NonNegativeIntegerV1Schema,
    nodeVersion: z.string().min(1),
    memoryRssBytes: NonNegativeIntegerV1Schema,
    memoryHeapUsedBytes: NonNegativeIntegerV1Schema,
  }).strict(),
  http: z.object({
    totalRequests: NonNegativeIntegerV1Schema,
    responses: MetricsStatusBucketsV1Schema,
    averageDurationMs: NonNegativeNumberV1Schema,
    routes: z.array(MetricsRouteV1Schema),
  }).strict(),
}).strict().superRefine((metrics, context) => {
  const responseCount = sumStatusBuckets(metrics.http.responses);
  if (responseCount !== metrics.http.totalRequests) {
    context.addIssue({
      code: 'custom',
      path: ['http', 'responses'],
      message: 'HTTP response buckets must sum to totalRequests',
    });
  }
});
export type MetricsResponseV1 = z.infer<typeof MetricsResponseV1Schema>;

function sumStatusBuckets(buckets: MetricsStatusBucketsV1): number {
  return buckets.informational
    + buckets.success
    + buckets.redirection
    + buckets.clientError
    + buckets.serverError;
}
