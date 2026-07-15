import type { Page, Route } from '@playwright/test';

import type {
  AdminPermissionV1,
  AdminStudentV1,
  BulkCreateAdminStudentItemV1,
} from '@bkyexam-practice/shared';

export type MockAdminState = {
  authenticated: boolean;
  calls: string[];
  students: AdminStudentV1[];
};

const adminId = '99999999-9999-4999-8999-999999999999';
const now = '2026-07-15T10:00:00.000Z';

const allAdminPermissions: AdminPermissionV1[] = [
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
];

export function createMockAdminState(): MockAdminState {
  return {
    authenticated: false,
    calls: [],
    students: [
      buildStudent({
        id: '11111111-1111-4111-8111-111111111111',
        loginName: '202502040201',
        displayName: '202502040201',
        className: '2班',
        passwordResetRequired: true,
      }),
      buildStudent({
        id: '22222222-2222-4222-8222-222222222222',
        loginName: 'legacy001',
        displayName: 'legacy001',
        className: null,
        lastLoginAt: '2026-07-15T08:00:00.000Z',
      }),
    ],
  };
}

export async function installMockAdminApi(page: Page, state: MockAdminState) {
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    state.calls.push(`${method} ${pathname}`);

    if (method === 'POST' && pathname === '/api/admin/auth/login') {
      state.authenticated = true;
      return fulfillJson(route, adminSession());
    }

    if (method === 'POST' && pathname === '/api/admin/auth/logout') {
      state.authenticated = false;
      return fulfillJson(route, { success: true });
    }

    if (!state.authenticated) {
      return fulfillJson(route, { error: 'Unauthenticated' }, 401);
    }

    if (method === 'GET' && pathname === '/api/admin/me') {
      return fulfillJson(route, adminSession());
    }

    if (method === 'GET' && pathname === '/api/admin/system/status') {
      return fulfillJson(route, {
        api: { ok: true, service: 'bkyexam-practice-api', version: '0.1.0' },
        database: { ok: true, migrationCount: 11, currentMigration: '0011_admin_identity_security.sql' },
        corpus: {
          classifications: 2941,
          questions: 89922,
          questionOptions: 154899,
          bankMappings: 2662,
          visibleBanks: 473,
        },
        imports: {
          tableExists: true,
          runningJobId: null,
          lastJob: {
            id: '33333333-3333-4333-8333-333333333333',
            status: 'succeeded',
            finishedAt: '2026-07-15T09:00:00.000Z',
          },
        },
        quality: {
          tableExists: true,
          openFlags: 2,
          blockingFlags: 0,
          excludedQuestions: 1,
        },
      });
    }

    if (method === 'GET' && pathname === '/api/admin/students') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const status = url.searchParams.get('status');
      const keyword = url.searchParams.get('keyword')?.toLowerCase() ?? '';
      const filtered = state.students.filter((student) => {
        if (status && student.status !== status) return false;
        if (keyword && !`${student.loginName} ${student.displayName}`.toLowerCase().includes(keyword)) return false;
        return true;
      });
      const pageItems = filtered.slice(offset, offset + limit + 1);
      return fulfillJson(route, {
        students: pageItems.slice(0, limit),
        page: { limit, offset, hasMore: pageItems.length > limit },
      });
    }

    if (method === 'POST' && pathname === '/api/admin/students') {
      const body = readBody<{
        loginName: string;
        displayName?: string;
        className?: string | null;
        groupName?: string | null;
        passwordResetRequired?: boolean;
      }>(route);
      if (state.students.some((student) => student.loginName === body.loginName)) {
        return fulfillJson(route, { error: 'Student loginName already exists' }, 409);
      }
      const student = buildStudent({
        id: nextStudentId(state.students.length + 1),
        loginName: body.loginName,
        displayName: body.displayName ?? body.loginName,
        className: body.className ?? null,
        groupName: body.groupName ?? null,
        passwordResetRequired: body.passwordResetRequired ?? true,
      });
      state.students.unshift(student);
      return fulfillJson(route, { student });
    }

    if (method === 'POST' && pathname === '/api/admin/students/bulk-create') {
      const body = readBody<{
        students: BulkCreateAdminStudentItemV1[];
        options: { skipExisting: boolean; passwordResetRequired: boolean };
      }>(route);
      const created: AdminStudentV1[] = [];
      const skipped: Array<{ loginName: string; reason: string }> = [];
      const failed: Array<{ loginName: string; error: string }> = [];
      for (const item of body.students) {
        if (state.students.some((student) => student.loginName === item.loginName)) {
          if (body.options.skipExisting) skipped.push({ loginName: item.loginName, reason: 'already_exists' });
          else failed.push({ loginName: item.loginName, error: 'already_exists' });
          continue;
        }
        const student = buildStudent({
          id: nextStudentId(state.students.length + created.length + 1),
          loginName: item.loginName,
          displayName: item.displayName ?? item.loginName,
          className: item.className ?? null,
          groupName: item.groupName ?? null,
          passwordResetRequired: body.options.passwordResetRequired,
        });
        created.push(student);
      }
      state.students.unshift(...created);
      return fulfillJson(route, { created, skipped, failed });
    }

    const studentMatch = pathname.match(/^\/api\/admin\/students\/([^/]+)(?:\/([^/]+))?$/);
    if (studentMatch) {
      const studentId = studentMatch[1];
      const action = studentMatch[2];
      const student = state.students.find((item) => item.id === studentId);
      if (!student) return fulfillJson(route, { error: 'Student account not found' }, 404);

      if (method === 'GET' && !action) {
        return fulfillJson(route, { student });
      }

      if (method === 'PATCH' && !action) {
        const body = readBody<Partial<Pick<AdminStudentV1, 'displayName' | 'status' | 'className' | 'groupName'>>>(route);
        Object.assign(student, {
          ...body,
          updatedAt: '2026-07-15T10:30:00.000Z',
        });
        return fulfillJson(route, { student });
      }

      if (method === 'POST' && action === 'reset-password') {
        student.passwordResetRequired = true;
        student.failedLoginCount = 0;
        student.lockedUntil = null;
        student.updatedAt = '2026-07-15T10:40:00.000Z';
        return fulfillJson(route, { student, revokedSessions: 1 });
      }

      if (method === 'POST' && action === 'revoke-sessions') {
        return fulfillJson(route, { studentId: student.id, revokedSessions: 1 });
      }
    }

    return fulfillJson(route, { error: `Unhandled mock route: ${method} ${pathname}` }, 500);
  });
}

function adminSession() {
  return {
    admin: {
      id: adminId,
      loginName: 'admin',
      displayName: '平台管理员',
      roles: ['super_admin'],
      permissions: allAdminPermissions,
    },
    expiresAt: '2026-07-15T18:00:00.000Z',
  };
}

function buildStudent(input: {
  id: string;
  loginName: string;
  displayName: string;
  className: string | null;
  groupName?: string | null;
  passwordResetRequired?: boolean;
  lastLoginAt?: string | null;
}): AdminStudentV1 {
  return {
    id: input.id,
    loginName: input.loginName,
    displayName: input.displayName,
    className: input.className,
    groupName: input.groupName ?? null,
    status: 'active',
    passwordResetRequired: input.passwordResetRequired ?? false,
    passwordChangedAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: input.lastLoginAt ?? null,
    createdBy: { id: adminId, displayName: '平台管理员' },
    createdAt: now,
    updatedAt: now,
  };
}

function nextStudentId(index: number) {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`;
}

function readBody<T>(route: Route): T {
  return route.request().postDataJSON() as T;
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}
