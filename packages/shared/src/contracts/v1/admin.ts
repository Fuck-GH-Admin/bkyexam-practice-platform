import { z } from 'zod';

export const AdminRoleV1Schema = z.enum(['content_editor', 'operator', 'super_admin']);
export type AdminRoleV1 = z.infer<typeof AdminRoleV1Schema>;

export const AdminPermissionV1Schema = z.enum([
  'admin:self:read',
  'bank_mapping:read',
  'bank_mapping:write',
  'bank_mapping:publish',
  'question_review:read',
  'question_review:write',
  'import_job:read',
  'import_job:create',
  'system_status:read',
  'audit_log:read',
  'admin_user:manage',
]);
export type AdminPermissionV1 = z.infer<typeof AdminPermissionV1Schema>;

export const AdminUserV1Schema = z.object({
  id: z.string().min(1),
  loginName: z.string().min(1),
  displayName: z.string().min(1),
  roles: z.array(AdminRoleV1Schema),
  permissions: z.array(AdminPermissionV1Schema),
}).strict();
export type AdminUserV1 = z.infer<typeof AdminUserV1Schema>;

export const AdminLoginRequestV1Schema = z.object({
  loginName: z.string().min(1),
  password: z.string().min(1),
}).strict();
export type AdminLoginRequestV1 = z.infer<typeof AdminLoginRequestV1Schema>;

export const AdminLoginResponseV1Schema = z.object({
  admin: AdminUserV1Schema,
  expiresAt: z.string().datetime(),
}).strict();
export type AdminLoginResponseV1 = z.infer<typeof AdminLoginResponseV1Schema>;

export const AdminMeResponseV1Schema = AdminLoginResponseV1Schema;
export type AdminMeResponseV1 = z.infer<typeof AdminMeResponseV1Schema>;

export const AdminLogoutResponseV1Schema = z.object({
  success: z.literal(true),
}).strict();
export type AdminLogoutResponseV1 = z.infer<typeof AdminLogoutResponseV1Schema>;
