import { z } from 'zod';

export const AuthStudentV1Schema = z.object({
  id: z.string().min(1).optional(),
  loginName: z.string().min(1),
  displayName: z.string().min(1),
  className: z.string().min(1).nullable().optional(),
  groupName: z.string().min(1).nullable().optional(),
}).strict();
export type AuthStudentV1 = z.infer<typeof AuthStudentV1Schema>;

export const AuthLoginRequestV1Schema = z.object({
  loginName: z.string().min(1),
  password: z.string().optional(),
}).strict();
export type AuthLoginRequestV1 = z.infer<typeof AuthLoginRequestV1Schema>;

export const AuthLoginResponseV1Schema = z.object({
  student: AuthStudentV1Schema,
  passwordResetRequired: z.boolean().optional(),
}).strict();
export type AuthLoginResponseV1 = z.infer<typeof AuthLoginResponseV1Schema>;

export const AuthMeResponseV1Schema = AuthLoginResponseV1Schema;
export type AuthMeResponseV1 = z.infer<typeof AuthMeResponseV1Schema>;

export const AuthLogoutResponseV1Schema = z.object({
  success: z.literal(true),
}).strict();
export type AuthLogoutResponseV1 = z.infer<typeof AuthLogoutResponseV1Schema>;
