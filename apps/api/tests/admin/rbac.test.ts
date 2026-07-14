import { describe, expect, it } from 'vitest';
import {
  hasAdminPermission,
  parseAdminRoles,
  permissionsForRoles,
  toAdminPrincipal,
} from '../../src/admin/rbac';

describe('admin RBAC', () => {
  it('maps content editor and operator roles to explicit permissions', () => {
    expect(permissionsForRoles(['content_editor'])).toEqual([
      'admin:self:read',
      'bank_mapping:read',
      'bank_mapping:write',
      'bank_mapping:publish',
      'question_review:read',
      'question_review:write',
    ]);

    expect(permissionsForRoles(['operator'])).toEqual([
      'admin:self:read',
      'bank_mapping:read',
      'import_job:read',
      'import_job:create',
      'system_status:read',
      'student_account:read',
      'student_account:write',
      'student_account:reset_password',
      'student_account:revoke_session',
    ]);
  });

  it('grants every permission to super admin', () => {
    const permissions = permissionsForRoles(['super_admin']);

    expect(permissions).toContain('admin_user:manage');
    expect(permissions).toContain('audit_log:read');
    expect(permissions).toContain('bank_mapping:publish');
    expect(permissions).toContain('student_account:reset_password');
  });

  it('deduplicates roles and rejects unknown role names', () => {
    expect(parseAdminRoles(['operator', 'operator'])).toEqual(['operator']);
    expect(() => parseAdminRoles(['unknown-role'])).toThrow();
  });

  it('checks permissions on admin principals', () => {
    const admin = toAdminPrincipal({
      id: 'admin-1',
      loginName: 'operator@example.com',
      displayName: 'Operator',
      roles: ['operator'],
    });

    expect(hasAdminPermission(admin, 'admin:self:read')).toBe(true);
    expect(hasAdminPermission(admin, 'bank_mapping:write')).toBe(false);
  });
});
