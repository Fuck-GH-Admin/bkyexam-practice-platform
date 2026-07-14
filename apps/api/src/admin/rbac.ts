import {
  AdminRoleV1Schema,
  type AdminPermissionV1,
  type AdminRoleV1,
} from '@bkyexam-practice/shared';

export type AdminRole = AdminRoleV1;
export type AdminPermission = AdminPermissionV1;

export interface AdminPrincipal {
  id: string;
  loginName: string;
  displayName: string;
  roles: AdminRole[];
  permissions: AdminPermission[];
}

export const adminPermissions = [
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
  'student_account:read',
  'student_account:write',
  'student_account:reset_password',
  'student_account:revoke_session',
] as const satisfies readonly AdminPermission[];

export const rolePermissions = {
  content_editor: [
    'admin:self:read',
    'bank_mapping:read',
    'bank_mapping:write',
    'bank_mapping:publish',
    'question_review:read',
    'question_review:write',
  ],
  operator: [
    'admin:self:read',
    'bank_mapping:read',
    'import_job:read',
    'import_job:create',
    'system_status:read',
    'student_account:read',
    'student_account:write',
    'student_account:reset_password',
    'student_account:revoke_session',
  ],
  super_admin: adminPermissions,
} as const satisfies Record<AdminRole, readonly AdminPermission[]>;

export function parseAdminRoles(rawRoles: readonly string[]): AdminRole[] {
  const roles = rawRoles.map((role) => AdminRoleV1Schema.parse(role));
  return [...new Set(roles)].sort();
}

export function permissionsForRoles(roles: readonly AdminRole[]): AdminPermission[] {
  const permissionSet = new Set<AdminPermission>();
  for (const role of roles) {
    for (const permission of rolePermissions[role]) {
      permissionSet.add(permission);
    }
  }

  return adminPermissions.filter((permission) => permissionSet.has(permission));
}

export function toAdminPrincipal(input: {
  id: string;
  loginName: string;
  displayName: string;
  roles: readonly AdminRole[];
}): AdminPrincipal {
  const roles = [...new Set(input.roles)].sort();
  return {
    id: input.id,
    loginName: input.loginName,
    displayName: input.displayName,
    roles,
    permissions: permissionsForRoles(roles),
  };
}

export function hasAdminPermission(
  admin: Pick<AdminPrincipal, 'permissions'>,
  permission: AdminPermission,
): boolean {
  return admin.permissions.includes(permission);
}
