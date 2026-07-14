import { z } from 'zod';

export const ApiErrorResponseV1Schema = z.object({
  error: z.string().min(1),
  requestId: z.string().min(1).optional(),
}).strict();
export type ApiErrorResponseV1 = z.infer<typeof ApiErrorResponseV1Schema>;
