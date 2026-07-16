import { z } from 'zod';

export const ApiErrorCodeV1Schema = z.enum([
  'PASSWORD_CHANGE_REQUIRED',
]);
export type ApiErrorCodeV1 = z.infer<typeof ApiErrorCodeV1Schema>;

export const ApiErrorResponseV1Schema = z.object({
  error: z.string().min(1),
  code: ApiErrorCodeV1Schema.optional(),
  requestId: z.string().min(1).optional(),
}).strict();
export type ApiErrorResponseV1 = z.infer<typeof ApiErrorResponseV1Schema>;
