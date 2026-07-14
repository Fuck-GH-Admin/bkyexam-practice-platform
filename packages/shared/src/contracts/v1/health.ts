import { z } from 'zod';

const IsoTimestampV1Schema = z.string().datetime({ offset: true });

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
