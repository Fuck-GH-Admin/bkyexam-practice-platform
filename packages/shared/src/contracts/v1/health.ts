import { z } from 'zod';

export const HealthResponseV1Schema = z.object({
  ok: z.literal(true),
  service: z.string().min(1),
}).strict();
export type HealthResponseV1 = z.infer<typeof HealthResponseV1Schema>;
