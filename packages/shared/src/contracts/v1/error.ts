import { z } from 'zod';

export const ApiErrorResponseV1Schema = z.object({
  error: z.string().min(1),
}).strict();
export type ApiErrorResponseV1 = z.infer<typeof ApiErrorResponseV1Schema>;
