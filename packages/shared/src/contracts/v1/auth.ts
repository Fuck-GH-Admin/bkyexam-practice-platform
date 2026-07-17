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
  password: z.string().min(1),
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

export const ChangeStudentPasswordRequestV1Schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
}).strict().refine((value) => value.currentPassword !== value.newPassword, {
  message: 'newPassword must be different from currentPassword',
  path: ['newPassword'],
});
export type ChangeStudentPasswordRequestV1 = z.infer<typeof ChangeStudentPasswordRequestV1Schema>;

export const ChangeStudentPasswordResponseV1Schema = z.object({
  success: z.literal(true),
  passwordResetRequired: z.literal(false),
}).strict();
export type ChangeStudentPasswordResponseV1 = z.infer<typeof ChangeStudentPasswordResponseV1Schema>;
