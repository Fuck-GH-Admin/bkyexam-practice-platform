import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import {
  AdminAuditLogListResponseV1Schema,
  AdminBankMappingDetailResponseV1Schema,
  AdminBankMappingListResponseV1Schema,
  AdminImportJobDetailResponseV1Schema,
  AdminImportJobEventV1Schema,
  AdminImportJobErrorReportResponseV1Schema,
  AdminImportJobListResponseV1Schema,
  AdminLoginResponseV1Schema,
  AdminLogoutResponseV1Schema,
  AdminMeResponseV1Schema,
  AdminQuestionOverrideResponseV1Schema,
  AdminQuestionReviewDetailResponseV1Schema,
  AdminQuestionReviewListResponseV1Schema,
  AdminStudentDetailResponseV1Schema,
  AdminStudentListResponseV1Schema,
  AdminSystemStatusResponseV1Schema,
  AdminUserDetailResponseV1Schema,
  AdminUserListResponseV1Schema,
  ApiErrorResponseV1Schema,
  BulkUpdateAdminBankMappingStatusRequestV1Schema,
  BulkUpdateAdminBankMappingStatusResponseV1Schema,
  BulkCreateAdminStudentsRequestV1Schema,
  BulkCreateAdminStudentsResponseV1Schema,
  CreateAdminImportJobRequestV1Schema,
  CreateAdminImportJobResponseV1Schema,
  CreateAdminUserRequestV1Schema,
  CreateAdminStudentRequestV1Schema,
  ResetAdminStudentPasswordRequestV1Schema,
  ResetAdminStudentPasswordResponseV1Schema,
  ReviewAdminQuestionOverrideRequestV1Schema,
  RollbackAdminQuestionOverrideRequestV1Schema,
  RevokeAdminStudentSessionsResponseV1Schema,
  SubmitAdminQuestionOverrideRequestV1Schema,
  UpdateAdminBankMappingRequestV1Schema,
  UpdateAdminQuestionOverrideRequestV1Schema,
  UpdateAdminQuestionReviewRequestV1Schema,
  UpdateAdminUserRequestV1Schema,
  UpdateAdminStudentRequestV1Schema,
  type AdminAuditLogEntryV1,
  type AdminAuditLogResultV1,
  type AdminBankMappingDetailV1,
  type AdminBankMappingListItemV1,
  type AdminBankMappingStatusV1,
  type AdminImportJobErrorSummaryV1,
  type AdminImportJobEventTypeV1,
  type AdminImportJobStatusV1,
  type AdminImportJobV1,
  type AdminPermissionV1,
  type AdminQuestionFlagSeverityV1,
  type AdminQuestionFlagStatusV1,
  type AdminQuestionFlagTypeV1,
  type AdminQuestionReviewDetailV1,
  type AdminQuestionReviewFlagV1,
  type AdminQuestionReviewItemV1,
  type AdminQuestionOverrideRevisionV1,
  type AdminManagedUserStatusV1,
  type AdminManagedUserV1,
  type AdminRoleV1,
  type AdminStudentStatusV1,
  type AdminStudentV1,
  type AdminSystemStatusResponseV1,
  type AdminUserV1,
  type BulkUpdateAdminBankMappingStatusResponseV1,
  type BulkCreateAdminStudentItemV1,
  type BulkCreateAdminStudentsResponseV1,
} from '@bkyexam-practice/shared';

type Parser<T> = { parse: (payload: unknown) => T };

type AdminNavKey = 'system' | 'students' | 'bank-mappings' | 'import-jobs' | 'question-review' | 'audit-logs' | 'admin-users';
type ImplementedAdminNavKey = 'system' | 'students' | 'bank-mappings' | 'import-jobs' | 'question-review' | 'audit-logs' | 'admin-users';
type PlaceholderAdminNavKey = Exclude<AdminNavKey, ImplementedAdminNavKey>;

type AdminRoute =
  | { kind: 'login' }
  | { kind: 'system' }
  | { kind: 'students'; studentId?: string; panel?: 'create' | 'bulk-create' }
  | { kind: 'bank-mappings'; bankId?: string }
  | { kind: 'import-jobs'; jobId?: string; panel?: 'create' }
  | { kind: 'question-review'; questionId?: string }
  | { kind: 'audit-logs'; auditLogId?: string }
  | { kind: 'admin-users'; adminId?: string; panel?: 'create' }
  | { kind: 'placeholder'; key: PlaceholderAdminNavKey }
  | { kind: 'unknown'; path: string };

type StudentFilters = {
  keyword: string;
  className: string;
  groupName: string;
  status: '' | AdminStudentStatusV1;
  passwordResetRequired: '' | 'true' | 'false';
  lockedOnly: boolean;
};

type BulkStudentDraft = Pick<
  BulkCreateAdminStudentItemV1,
  'loginName' | 'displayName' | 'initialPassword' | 'className' | 'groupName'
>;

type BulkOptionsDraft = {
  defaultInitialPassword: string;
  passwordResetRequired: boolean;
  revokeExistingSessions: boolean;
  skipExisting: boolean;
};

type BankMappingFilters = {
  keyword: string;
  status: '' | AdminBankMappingStatusV1;
  visible: '' | 'true' | 'false';
  subjectCategory: string;
  subjectName: string;
  qGroup: string;
  hasObjectiveQuestions: '' | 'true' | 'false';
};

type ImportJobFilters = {
  status: '' | AdminImportJobStatusV1;
};

type QuestionReviewFilters = {
  keyword: string;
  bankId: string;
  questionType: string;
  flagType: '' | AdminQuestionFlagTypeV1;
  severity: '' | AdminQuestionFlagSeverityV1;
  status: AdminQuestionFlagStatusV1;
};

type AuditLogFilters = {
  actorAdminId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  result: '' | AdminAuditLogResultV1;
  createdFrom: string;
  createdTo: string;
};

type AdminUserFilters = {
  keyword: string;
  status: '' | AdminManagedUserStatusV1;
  role: '' | AdminRoleV1;
};

const defaultStudentFilters: StudentFilters = {
  keyword: '',
  className: '',
  groupName: '',
  status: 'active',
  passwordResetRequired: '',
  lockedOnly: false,
};

const defaultBankMappingFilters: BankMappingFilters = {
  keyword: '',
  status: 'review',
  visible: '',
  subjectCategory: '',
  subjectName: '',
  qGroup: '',
  hasObjectiveQuestions: '',
};

const defaultImportJobFilters: ImportJobFilters = {
  status: '',
};

const defaultQuestionReviewFilters: QuestionReviewFilters = {
  keyword: '',
  bankId: '',
  questionType: '',
  flagType: '',
  severity: '',
  status: 'open',
};

const defaultAuditLogFilters: AuditLogFilters = {
  actorAdminId: '',
  action: '',
  resourceType: '',
  resourceId: '',
  result: '',
  createdFrom: '',
  createdTo: '',
};

const defaultAdminUserFilters: AdminUserFilters = {
  keyword: '',
  status: '',
  role: '',
};

const adminRoleOptions = ['super_admin', 'operator', 'content_editor'] as const satisfies readonly AdminRoleV1[];

const defaultImportSourceDir = '';

const defaultBulkText = `loginName,displayName,className,groupName
202502040201,202502040201,2班,
202502040202,202502040202,2班,`;

const adminNavigation: Array<{
  key: AdminNavKey;
  label: string;
  path: string;
  permissions: AdminPermissionV1[];
  implemented: boolean;
  description: string;
}> = [
  {
    key: 'system',
    label: 'System Status',
    path: '/admin/system',
    permissions: ['system_status:read'],
    implemented: true,
    description: 'API、数据库、题库、导入与质检健康摘要。',
  },
  {
    key: 'students',
    label: 'Student Accounts',
    path: '/admin/students',
    permissions: ['student_account:read'],
    implemented: true,
    description: '学生账号查询、创建、批量创建、重置密码与撤销会话。',
  },
  {
    key: 'bank-mappings',
    label: 'Bank Mappings',
    path: '/admin/bank-mappings',
    permissions: ['bank_mapping:read'],
    implemented: true,
    description: '题库整理：列表、筛选、详情编辑、发布/隐藏和批量状态更新。',
  },
  {
    key: 'import-jobs',
    label: 'Import Jobs',
    path: '/admin/import-jobs',
    permissions: ['import_job:read'],
    implemented: true,
    description: '导入任务 dry-run/true import、reset、cancel/retry、历史、详情、错误摘要和实时进度。',
  },
  {
    key: 'question-review',
    label: 'Question Review',
    path: '/admin/question-review',
    permissions: ['question_review:read'],
    implemented: true,
    description: '题目质检：open flags 队列、预览、标记、resolve/ignore 与练习排除。',
  },
  {
    key: 'audit-logs',
    label: 'Audit Logs',
    path: '/admin/audit-logs',
    permissions: ['audit_log:read'],
    implemented: true,
    description: '审计日志只读查询：actor、action、resource、result 与 before/after/metadata preview。',
  },
  {
    key: 'admin-users',
    label: 'Admin Users',
    path: '/admin/users',
    permissions: ['admin_user:manage'],
    implemented: true,
    description: '管理员账号管理：列表、创建、角色/状态维护与密码重置。',
  },
];

class AdminApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }
}

export function parseAdminRoute(pathname: string): AdminRoute {
  const path = normalizeAdminPath(pathname);
  if (path === '/admin/login') return { kind: 'login' };
  if (path === '/admin' || path === '/admin/system') return { kind: 'system' };
  if (path === '/admin/students') return { kind: 'students' };
  if (path === '/admin/students/create') return { kind: 'students', panel: 'create' };
  if (path === '/admin/students/bulk-create') return { kind: 'students', panel: 'bulk-create' };
  if (path.startsWith('/admin/students/')) {
    const studentId = decodeURIComponent(path.slice('/admin/students/'.length));
    return { kind: 'students', studentId };
  }
  if (path === '/admin/bank-mappings') return { kind: 'bank-mappings' };
  if (path.startsWith('/admin/bank-mappings/')) {
    const bankId = decodeURIComponent(path.slice('/admin/bank-mappings/'.length));
    return { kind: 'bank-mappings', bankId };
  }
  if (path === '/admin/import-jobs') return { kind: 'import-jobs' };
  if (path === '/admin/import-jobs/create') return { kind: 'import-jobs', panel: 'create' };
  if (path.startsWith('/admin/import-jobs/')) {
    const jobId = decodeURIComponent(path.slice('/admin/import-jobs/'.length));
    return { kind: 'import-jobs', jobId };
  }
  if (path === '/admin/question-review') return { kind: 'question-review' };
  if (path.startsWith('/admin/question-review/')) {
    const questionId = decodeURIComponent(path.slice('/admin/question-review/'.length));
    return { kind: 'question-review', questionId };
  }
  if (path === '/admin/audit-logs') return { kind: 'audit-logs' };
  if (path.startsWith('/admin/audit-logs/')) {
    const auditLogId = decodeURIComponent(path.slice('/admin/audit-logs/'.length));
    return { kind: 'audit-logs', auditLogId };
  }
  if (path === '/admin/users') return { kind: 'admin-users' };
  if (path === '/admin/users/create') return { kind: 'admin-users', panel: 'create' };
  if (path.startsWith('/admin/users/')) {
    const adminId = decodeURIComponent(path.slice('/admin/users/'.length));
    return { kind: 'admin-users', adminId };
  }
  const placeholder = adminNavigation.find((item) => item.path === path && !item.implemented);
  if (placeholder) return { kind: 'placeholder', key: placeholder.key as PlaceholderAdminNavKey };
  return { kind: 'unknown', path };
}

export function buildAdminPath(route: AdminRoute): string {
  if (route.kind === 'login') return '/admin/login';
  if (route.kind === 'system') return '/admin/system';
  if (route.kind === 'students') {
    if (route.panel === 'create') return '/admin/students/create';
    if (route.panel === 'bulk-create') return '/admin/students/bulk-create';
    if (route.studentId) return `/admin/students/${encodeURIComponent(route.studentId)}`;
    return '/admin/students';
  }
  if (route.kind === 'bank-mappings') {
    if (route.bankId) return `/admin/bank-mappings/${encodeURIComponent(route.bankId)}`;
    return '/admin/bank-mappings';
  }
  if (route.kind === 'import-jobs') {
    if (route.panel === 'create') return '/admin/import-jobs/create';
    if (route.jobId) return `/admin/import-jobs/${encodeURIComponent(route.jobId)}`;
    return '/admin/import-jobs';
  }
  if (route.kind === 'question-review') {
    if (route.questionId) return `/admin/question-review/${encodeURIComponent(route.questionId)}`;
    return '/admin/question-review';
  }
  if (route.kind === 'audit-logs') {
    if (route.auditLogId) return `/admin/audit-logs/${encodeURIComponent(route.auditLogId)}`;
    return '/admin/audit-logs';
  }
  if (route.kind === 'admin-users') {
    if (route.panel === 'create') return '/admin/users/create';
    if (route.adminId) return `/admin/users/${encodeURIComponent(route.adminId)}`;
    return '/admin/users';
  }
  if (route.kind === 'placeholder') {
    return adminNavigation.find((item) => item.key === route.key)?.path ?? '/admin/system';
  }
  return route.path;
}

export function hasAllAdminPermissions(
  permissions: readonly AdminPermissionV1[],
  required: readonly AdminPermissionV1[],
): boolean {
  return required.every((permission) => permissions.includes(permission));
}

export function buildVisibleAdminNavigation(permissions: readonly AdminPermissionV1[]) {
  return adminNavigation.filter((item) => hasAllAdminPermissions(permissions, item.permissions));
}

export function buildStudentListQuery(filters: StudentFilters, limit: number, offset: number): string {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  addOptionalParam(params, 'keyword', filters.keyword);
  addOptionalParam(params, 'className', filters.className);
  addOptionalParam(params, 'groupName', filters.groupName);
  addOptionalParam(params, 'status', filters.status);
  addOptionalParam(params, 'passwordResetRequired', filters.passwordResetRequired);
  if (filters.lockedOnly) params.set('lockedOnly', 'true');
  return params.toString();
}

export function buildBankMappingListQuery(filters: BankMappingFilters, limit: number, offset: number): string {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  addOptionalParam(params, 'keyword', filters.keyword);
  addOptionalParam(params, 'status', filters.status);
  addOptionalParam(params, 'visible', filters.visible);
  addOptionalParam(params, 'subjectCategory', filters.subjectCategory);
  addOptionalParam(params, 'subjectName', filters.subjectName);
  addOptionalParam(params, 'qGroup', filters.qGroup);
  addOptionalParam(params, 'hasObjectiveQuestions', filters.hasObjectiveQuestions);
  return params.toString();
}

export function buildImportJobListQuery(filters: ImportJobFilters, limit: number, offset: number): string {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  addOptionalParam(params, 'status', filters.status);
  return params.toString();
}

export function buildQuestionReviewListQuery(filters: QuestionReviewFilters, limit: number, offset: number): string {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  params.set('status', filters.status);
  addOptionalParam(params, 'keyword', filters.keyword);
  addOptionalParam(params, 'bankId', filters.bankId);
  addOptionalParam(params, 'questionType', filters.questionType);
  addOptionalParam(params, 'flagType', filters.flagType);
  addOptionalParam(params, 'severity', filters.severity);
  return params.toString();
}

export function buildAuditLogListQuery(filters: AuditLogFilters, limit: number, offset: number): string {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  addOptionalParam(params, 'actorAdminId', filters.actorAdminId);
  addOptionalParam(params, 'action', filters.action);
  addOptionalParam(params, 'resourceType', filters.resourceType);
  addOptionalParam(params, 'resourceId', filters.resourceId);
  addOptionalParam(params, 'result', filters.result);
  addOptionalDateParam(params, 'createdFrom', filters.createdFrom);
  addOptionalDateParam(params, 'createdTo', filters.createdTo);
  return params.toString();
}

export function buildAdminUserListQuery(filters: AdminUserFilters, limit: number, offset: number): string {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  addOptionalParam(params, 'keyword', filters.keyword);
  addOptionalParam(params, 'status', filters.status);
  addOptionalParam(params, 'role', filters.role);
  return params.toString();
}

export function parseBulkStudentInput(input: string): BulkStudentDraft[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed.map(toBulkStudentDraft);
    if (isRecord(parsed) && Array.isArray(parsed.students)) return parsed.students.map(toBulkStudentDraft);
    throw new Error('JSON 必须是学生数组，或包含 students 数组。');
  }

  return parseStudentCsv(trimmed);
}

export function formatNullable(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : '-';
}

export function formatAdminDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function buildStudentStatusBadges(student: AdminStudentV1): string[] {
  const badges = [student.status === 'active' ? 'active' : 'disabled'];
  badges.push(student.passwordResetRequired ? '待改密' : '已启用');
  if (student.lockedUntil) badges.push(`锁定至 ${formatAdminDate(student.lockedUntil)}`);
  return badges;
}

export function buildBankMappingStatusBadges(mapping: AdminBankMappingListItemV1): string[] {
  const badges = [mapping.status, mapping.visible ? 'visible' : 'hidden-from-students'];
  if (mapping.objectiveQuestionCount === 0) badges.push('no-objective-questions');
  if (mapping.parentId) badges.push('child-bank');
  return badges;
}

export function buildImportJobStatusBadges(job: AdminImportJobV1): string[] {
  const badges: string[] = [job.status, job.mode];
  if (job.options.resetBeforeImport) badges.push('reset-requested');
  if (job.errorSummary.length > 0) badges.push('has-errors');
  return badges;
}

export function buildQuestionReviewBadges(question: AdminQuestionReviewItemV1): string[] {
  const badges = [question.questionType, question.excludedFromPractice ? 'excluded-from-practice' : 'practice-enabled'];
  const openFlags = question.flags.filter((flag) => flag.status === 'open');
  if (openFlags.some((flag) => flag.severity === 'blocking')) badges.push('blocking');
  if (openFlags.length > 0) badges.push(`${openFlags.length} open flag${openFlags.length > 1 ? 's' : ''}`);
  return badges;
}

export function buildAuditLogBadges(entry: AdminAuditLogEntryV1): string[] {
  const badges = [entry.result, entry.resourceType];
  badges.push(entry.actor ? 'admin-actor' : 'system-actor');
  const actionGroup = entry.action.includes('.') ? entry.action.split('.')[0] : '';
  if (actionGroup && !badges.includes(actionGroup)) badges.push(actionGroup);
  return badges;
}

export function buildAdminUserBadges(adminUser: AdminManagedUserV1): string[] {
  return [adminUser.status, ...adminUser.roles];
}

export function App() {
  const [route, setRoute] = useState<AdminRoute>(() => parseAdminRoute(window.location.pathname));
  const [admin, setAdmin] = useState<AdminUserV1 | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState('');

  const navigate = useCallback((target: string | AdminRoute, options: { replace?: boolean } = {}) => {
    const path = typeof target === 'string' ? target : buildAdminPath(target);
    const nextRoute = parseAdminRoute(path);
    if (options.replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    setRoute(nextRoute);
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(parseAdminRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let active = true;
    requestJson('/api/admin/me', AdminMeResponseV1Schema)
      .then((response) => {
        if (!active) return;
        setAdmin(response.admin);
        setExpiresAt(response.expiresAt);
        setSessionError('');
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (isUnauthorized(error)) {
          setAdmin(null);
          setExpiresAt(null);
          const currentTarget = window.location.pathname + window.location.search;
          if (!currentTarget.startsWith('/admin/login')) {
            const next = encodeURIComponent(currentTarget);
            window.history.replaceState(null, '', `/admin/login?next=${next}`);
            setRoute({ kind: 'login' });
          }
          return;
        }
        setSessionError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (checkingSession || !admin || route.kind !== 'login') return;
    navigate(readNextPathFromLocation() ?? '/admin/system', { replace: true });
  }, [admin, checkingSession, navigate, route.kind]);

  const expireSession = useCallback(() => {
    setAdmin(null);
    setExpiresAt(null);
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    navigate(`/admin/login?next=${next}`, { replace: true });
  }, [navigate]);

  const onLogout = useCallback(async () => {
    try {
      await requestJson('/api/admin/auth/logout', AdminLogoutResponseV1Schema, { method: 'POST' });
    } finally {
      setAdmin(null);
      setExpiresAt(null);
      navigate('/admin/login', { replace: true });
    }
  }, [navigate]);

  const onLogin = useCallback((response: { admin: AdminUserV1; expiresAt: string }) => {
    setAdmin(response.admin);
    setExpiresAt(response.expiresAt);
    navigate(readNextPathFromLocation() ?? '/admin/system', { replace: true });
  }, [navigate]);

  if (checkingSession) {
    return (
      <main className="admin-login-shell">
        <section className="admin-login-card compact">
          <p className="eyebrow">BKYExam Admin</p>
          <h1>正在恢复管理会话</h1>
          <p className="muted">读取 `bky_admin_session`，学生会话不会被复用。</p>
        </section>
      </main>
    );
  }

  if (route.kind === 'login' || !admin) {
    return <AdminLoginPage onLogin={onLogin} initialError={sessionError} />;
  }

  const requiredPermissions = getRouteRequiredPermissions(route);
  const routeForbidden = requiredPermissions.length > 0
    && !hasAllAdminPermissions(admin.permissions, requiredPermissions);

  return (
    <AdminShell
      admin={admin}
      expiresAt={expiresAt}
      route={route}
      navigate={navigate}
      onLogout={onLogout}
    >
      {routeForbidden ? (
        <ForbiddenPanel admin={admin} attemptedPath={buildAdminPath(route)} navigate={navigate} onSwitchAccount={onLogout} />
      ) : route.kind === 'system' ? (
        <SystemStatusPage onSessionExpired={expireSession} />
      ) : route.kind === 'students' ? (
        <StudentAccountsPage
          admin={admin}
          route={route}
          navigate={navigate}
          onSessionExpired={expireSession}
        />
      ) : route.kind === 'bank-mappings' ? (
        <BankMappingsPage
          admin={admin}
          route={route}
          navigate={navigate}
          onSessionExpired={expireSession}
        />
      ) : route.kind === 'import-jobs' ? (
        <ImportJobsPage
          admin={admin}
          route={route}
          navigate={navigate}
          onSessionExpired={expireSession}
        />
      ) : route.kind === 'question-review' ? (
        <QuestionReviewPage
          admin={admin}
          route={route}
          navigate={navigate}
          onSessionExpired={expireSession}
        />
      ) : route.kind === 'audit-logs' ? (
        <AuditLogsPage
          route={route}
          navigate={navigate}
          onSessionExpired={expireSession}
        />
      ) : route.kind === 'admin-users' ? (
        <AdminUsersPage
          admin={admin}
          route={route}
          navigate={navigate}
          onSessionExpired={expireSession}
        />
      ) : route.kind === 'placeholder' ? (
        <PlaceholderPage routeKey={route.key} />
      ) : (
        <NotFoundPanel path={route.path} navigate={navigate} />
      )}
    </AdminShell>
  );
}

function AdminLoginPage({
  onLogin,
  initialError,
}: {
  onLogin: (response: { admin: AdminUserV1; expiresAt: string }) => void;
  initialError: string;
}) {
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(initialError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await requestJson('/api/admin/auth/login', AdminLoginResponseV1Schema, {
        method: 'POST',
        body: JSON.stringify({ loginName, password }),
      });
      onLogin(response);
    } catch (caught: unknown) {
      setError(mapLoginError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-login-shell">
      <section className="admin-login-card">
        <p className="eyebrow">BKYExam Admin</p>
        <h1>题库与账号运营入口</h1>
        <p className="muted">这是管理后台登录，不复用学生登录态。</p>
        <form className="admin-login-form" onSubmit={submit}>
          <label>
            Login name
            <input
              autoComplete="username"
              value={loginName}
              onChange={(event) => setLoginName(event.target.value)}
              placeholder="admin"
              required
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={submitting}>{submitting ? '登录中…' : '登录管理后台'}</button>
        </form>
      </section>
    </main>
  );
}

function AdminShell({
  admin,
  expiresAt,
  route,
  navigate,
  onLogout,
  children,
}: {
  admin: AdminUserV1;
  expiresAt: string | null;
  route: AdminRoute;
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const navItems = buildVisibleAdminNavigation(admin.permissions);
  const activeKey = getActiveNavKey(route);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div>
          <p className="eyebrow">BKYExam</p>
          <h1>Admin</h1>
        </div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.key}
              className={item.key === activeKey ? 'active' : ''}
              onClick={() => navigate(item.path)}
              type="button"
            >
              <span>{item.label}</span>
              {!item.implemented ? <small>placeholder</small> : null}
            </button>
          ))}
        </nav>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Current admin</p>
            <strong>{admin.displayName}</strong>
            <span>{admin.loginName}</span>
          </div>
          <div className="topbar-actions">
            <span className="session-expiry">Session expires: {formatAdminDate(expiresAt)}</span>
            <button className="ghost" type="button" onClick={onLogout}>退出管理后台</button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function SystemStatusPage({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [status, setStatus] = useState<AdminSystemStatusResponseV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await requestJson('/api/admin/system/status', AdminSystemStatusResponseV1Schema);
      setStatus(response);
      setRefreshedAt(new Date().toISOString());
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="Operations"
        title="System Status"
        description="只展示 System Status API 已提供的真实字段；B9.19 不伪造外部监控或账号统计。"
        action={<button type="button" onClick={() => void load()} disabled={loading}>刷新</button>}
      />
      <p className="muted">Last refreshed: {formatAdminDate(refreshedAt)}</p>
      {loading && !status ? <InfoPanel title="正在读取系统状态" /> : null}
      {error ? <ErrorPanel message={error} onRetry={() => void load()} /> : null}
      {status ? <SystemStatusContent status={status} /> : null}
    </section>
  );
}

function SystemStatusContent({ status }: { status: AdminSystemStatusResponseV1 }) {
  return (
    <>
      <div className="status-grid">
        <StatusCard tone="ok" title="API" value="ok" detail={`${status.api.service} / ${status.api.version}`} />
        <StatusCard
          tone={status.database.ok ? 'ok' : 'danger'}
          title="Database"
          value={status.database.ok ? 'ok' : 'down'}
          detail={`${status.database.migrationCount} migrations · ${status.database.currentMigration ?? 'no current migration'}`}
        />
        <StatusCard
          tone="neutral"
          title="Corpus"
          value={`${status.corpus.questions.toLocaleString()} questions`}
          detail={`${status.corpus.classifications.toLocaleString()} classifications · ${status.corpus.visibleBanks.toLocaleString()} visible banks`}
        />
        <StatusCard
          tone={status.quality.blockingFlags > 0 ? 'danger' : 'neutral'}
          title="Quality"
          value={`${status.quality.openFlags} open / ${status.quality.blockingFlags} blocking`}
          detail={`${status.quality.excludedQuestions} excluded · table ${status.quality.tableExists ? 'ready' : 'missing'}`}
        />
      </div>
      <section className="admin-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Import status</p>
            <h2>Import Jobs Summary</h2>
          </div>
        </div>
        <dl className="key-values">
          <div><dt>tableExists</dt><dd>{String(status.imports.tableExists)}</dd></div>
          <div><dt>runningJobId</dt><dd>{status.imports.runningJobId ?? '-'}</dd></div>
          <div><dt>lastJob status</dt><dd>{status.imports.lastJob?.status ?? '-'}</dd></div>
          <div><dt>lastJob finishedAt</dt><dd>{formatAdminDate(status.imports.lastJob?.finishedAt)}</dd></div>
        </dl>
      </section>
      <section className="admin-card muted-card">
        <h2>Operational notes</h2>
        <ul>
          <li>true import write gate 由后端环境变量控制；reset/cancel/retry 已进入 Import Jobs 工作流。</li>
          <li>外部监控告警目标未在本页伪造；需要后续接入后再显示。</li>
          <li>学生待改密、锁定统计目前请在 Student Accounts 过滤查看。</li>
        </ul>
      </section>
    </>
  );
}

function BankMappingsPage({
  admin,
  route,
  navigate,
  onSessionExpired,
}: {
  admin: AdminUserV1;
  route: Extract<AdminRoute, { kind: 'bank-mappings' }>;
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
  onSessionExpired: () => void;
}) {
  const [draftFilters, setDraftFilters] = useState<BankMappingFilters>(defaultBankMappingFilters);
  const [filters, setFilters] = useState<BankMappingFilters>(defaultBankMappingFilters);
  const [offset, setOffset] = useState(0);
  const [mappings, setMappings] = useState<AdminBankMappingListItemV1[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<'' | AdminBankMappingStatusV1>('');
  const [bulkVisible, setBulkVisible] = useState<'' | 'true' | 'false'>('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUpdateAdminBankMappingStatusResponseV1 | null>(null);
  const limit = 20;

  const canWrite = admin.permissions.includes('bank_mapping:write');
  const canPublish = admin.permissions.includes('bank_mapping:publish');

  const loadMappings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = buildBankMappingListQuery(filters, limit, offset);
      const response = await requestJson(`/api/admin/bank-mappings?${query}`, AdminBankMappingListResponseV1Schema);
      setMappings(response.bankMappings);
      setHasMore(response.page.hasMore);
      setSelectedBankIds((current) => current.filter((bankId) => response.bankMappings.some((mapping) => mapping.bankId === bankId)));
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [filters, offset, onSessionExpired]);

  useEffect(() => {
    void loadMappings();
  }, [loadMappings]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setFilters(draftFilters);
    setBulkResult(null);
  }

  function toggleSelected(bankId: string, checked: boolean) {
    setSelectedBankIds((current) => {
      if (checked) return current.includes(bankId) ? current : [...current, bankId];
      return current.filter((candidate) => candidate !== bankId);
    });
  }

  async function submitBulkStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedMappings = mappings.filter((mapping) => selectedBankIds.includes(mapping.bankId));
    if (!canPublish || selectedMappings.length === 0) return;

    const changes: { visible?: boolean; status?: AdminBankMappingStatusV1 } = {};
    if (bulkStatus) changes.status = bulkStatus;
    if (bulkVisible) changes.visible = bulkVisible === 'true';

    setBulkSubmitting(true);
    setError('');
    setBulkResult(null);
    try {
      const request = BulkUpdateAdminBankMappingStatusRequestV1Schema.parse({
        items: selectedMappings.map((mapping) => ({
          bankId: mapping.bankId,
          expectedVersion: mapping.version,
        })),
        changes,
      });
      const response = await requestJson('/api/admin/bank-mappings/bulk-status', BulkUpdateAdminBankMappingStatusResponseV1Schema, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      setBulkResult(response);
      setSelectedBankIds([]);
      await loadMappings();
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setBulkSubmitting(false);
    }
  }

  function refreshAfterMutation(mapping: AdminBankMappingDetailV1) {
    void loadMappings();
    navigate(`/admin/bank-mappings/${mapping.bankId}`);
  }

  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="Catalog operations"
        title="Bank Mappings"
        description="B9.21 只做功能性题库整理 UI：列表、筛选、详情编辑、发布/隐藏和批量状态；最终视觉后续再打磨。"
        action={<button type="button" onClick={() => void loadMappings()} disabled={loading}>刷新列表</button>}
      />

      <section className="admin-card">
        <form className="student-filters" onSubmit={submitFilters}>
          <label>关键字
            <input value={draftFilters.keyword} onChange={(event) => setDraftFilters({ ...draftFilters, keyword: event.target.value })} placeholder="rawName / bankName / keyword" />
          </label>
          <label>状态
            <select value={draftFilters.status} onChange={(event) => setDraftFilters({ ...draftFilters, status: event.target.value as BankMappingFilters['status'] })}>
              <option value="">全部</option>
              <option value="review">review</option>
              <option value="active">active</option>
              <option value="hidden">hidden</option>
              <option value="deprecated">deprecated</option>
            </select>
          </label>
          <label>可见
            <select value={draftFilters.visible} onChange={(event) => setDraftFilters({ ...draftFilters, visible: event.target.value as BankMappingFilters['visible'] })}>
              <option value="">全部</option>
              <option value="true">visible</option>
              <option value="false">hidden</option>
            </select>
          </label>
          <label>学科
            <input value={draftFilters.subjectCategory} onChange={(event) => setDraftFilters({ ...draftFilters, subjectCategory: event.target.value })} />
          </label>
          <label>分类
            <input value={draftFilters.subjectName} onChange={(event) => setDraftFilters({ ...draftFilters, subjectName: event.target.value })} />
          </label>
          <label>客观题
            <select value={draftFilters.hasObjectiveQuestions} onChange={(event) => setDraftFilters({ ...draftFilters, hasObjectiveQuestions: event.target.value as BankMappingFilters['hasObjectiveQuestions'] })}>
              <option value="">全部</option>
              <option value="true">有客观题</option>
              <option value="false">无客观题</option>
            </select>
          </label>
          <label>qGroup
            <input value={draftFilters.qGroup} onChange={(event) => setDraftFilters({ ...draftFilters, qGroup: event.target.value })} inputMode="numeric" />
          </label>
          <button type="submit">应用过滤</button>
        </form>
      </section>

      <div className="student-layout">
        <section className="admin-card student-list-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Mappings</p>
              <h2>题库整理列表</h2>
            </div>
            <span className="muted">offset {offset}</span>
          </div>
          {error ? <ErrorPanel message={error} onRetry={() => void loadMappings()} /> : null}
          {loading ? <p className="muted">正在加载题库 mapping…</p> : null}
          {!loading && !error && mappings.length === 0 ? <InfoPanel title="没有匹配题库" detail="过滤条件保留，可直接调整后重新查询。" /> : null}
          {mappings.length > 0 ? (
            <BankMappingTable
              mappings={mappings}
              selectedBankIds={selectedBankIds}
              onSelect={toggleSelected}
              navigate={navigate}
            />
          ) : null}
          <div className="pager">
            <button className="ghost" type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>上一页</button>
            <span>offset {offset}</span>
            <button className="ghost" type="button" disabled={!hasMore || loading} onClick={() => setOffset(offset + limit)}>下一页</button>
          </div>

          <form className="option-grid" onSubmit={submitBulkStatus}>
            <h3>Bulk status</h3>
            <p className="muted">使用当前列表中的 version 做 optimistic concurrency；失败行会保留在结果中。</p>
            {!canPublish ? <ForbiddenInline /> : null}
            <label>Bulk status
              <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as '' | AdminBankMappingStatusV1)} disabled={!canPublish}>
                <option value="">不修改</option>
                <option value="review">review</option>
                <option value="active">active</option>
                <option value="hidden">hidden</option>
                <option value="deprecated">deprecated</option>
              </select>
            </label>
            <label>Bulk visible
              <select value={bulkVisible} onChange={(event) => setBulkVisible(event.target.value as '' | 'true' | 'false')} disabled={!canPublish}>
                <option value="">不修改</option>
                <option value="true">visible</option>
                <option value="false">hidden</option>
              </select>
            </label>
            <button type="submit" disabled={!canPublish || selectedBankIds.length === 0 || bulkSubmitting}>{bulkSubmitting ? '更新中…' : `批量更新状态 (${selectedBankIds.length})`}</button>
          </form>
          {bulkResult ? <BankMappingBulkResult result={bulkResult} /> : null}
        </section>

        <aside className="admin-card student-side-panel">
          {route.bankId ? (
            <BankMappingDetailPanel
              bankId={route.bankId}
              canWrite={canWrite}
              canPublish={canPublish}
              onChanged={refreshAfterMutation}
              onSessionExpired={onSessionExpired}
            />
          ) : (
            <InfoPanel title="选择一个题库 mapping" detail="从左侧列表点击“查看”，先确认自动映射，再做展示名、标签和发布状态调整。" />
          )}
        </aside>
      </div>
    </section>
  );
}

function BankMappingTable({
  mappings,
  selectedBankIds,
  onSelect,
  navigate,
}: {
  mappings: AdminBankMappingListItemV1[];
  selectedBankIds: string[];
  onSelect: (bankId: string, checked: boolean) => void;
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Select</th>
            <th>Bank</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Questions</th>
            <th>Updated</th>
            <th>Version</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((mapping) => (
            <tr key={mapping.bankId}>
              <td>
                <label className="checkbox-label">
                  <input
                    aria-label={`选择 ${mapping.bankName}`}
                    checked={selectedBankIds.includes(mapping.bankId)}
                    onChange={(event) => onSelect(mapping.bankId, event.target.checked)}
                    type="checkbox"
                  />
                </label>
              </td>
              <td>
                <strong>{mapping.bankName}</strong>
                <br />
                <span className="muted">{mapping.rawName}</span>
              </td>
              <td>{mapping.subjectCategory} / {mapping.subjectName}</td>
              <td>
                <div className="badge-row">
                  {buildBankMappingStatusBadges(mapping).map((badge) => (
                    <Badge key={badge} tone={bankMappingBadgeTone(badge)}>{badge}</Badge>
                  ))}
                </div>
              </td>
              <td>{mapping.objectiveQuestionCount} objective / {mapping.questionCount} direct / {mapping.descendantQuestionCount} total</td>
              <td>{mapping.updatedBy?.displayName ?? '-'}<br /><span className="muted">{formatAdminDate(mapping.updatedAt)}</span></td>
              <td>{mapping.version}</td>
              <td><button className="ghost" type="button" onClick={() => navigate(`/admin/bank-mappings/${mapping.bankId}`)}>查看 {mapping.bankName}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BankMappingDetailPanel({
  bankId,
  canWrite,
  canPublish,
  onChanged,
  onSessionExpired,
}: {
  bankId: string;
  canWrite: boolean;
  canPublish: boolean;
  onChanged: (mapping: AdminBankMappingDetailV1) => void;
  onSessionExpired: () => void;
}) {
  const [mapping, setMapping] = useState<AdminBankMappingDetailV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [bankName, setBankName] = useState('');
  const [subjectCategory, setSubjectCategory] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [examPurpose, setExamPurpose] = useState('');
  const [audience, setAudience] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<AdminBankMappingStatusV1>('review');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await requestJson(`/api/admin/bank-mappings/${encodeURIComponent(bankId)}`, AdminBankMappingDetailResponseV1Schema);
      applyBankMappingToForm(response.bankMapping);
      setMapping(response.bankMapping);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [bankId, onSessionExpired]);

  function applyBankMappingToForm(next: AdminBankMappingDetailV1) {
    setBankName(next.bankName);
    setSubjectCategory(next.subjectCategory);
    setSubjectName(next.subjectName);
    setDifficulty(next.difficulty);
    setExamPurpose(next.examPurpose);
    setAudience(next.audience);
    setKeywordsText(next.keywords.join(', '));
    setDescription(next.description);
    setNotes(next.notes);
    setStatus(next.status);
    setVisible(next.visible);
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !mapping) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const changes: {
        bankName: string;
        subjectCategory: string;
        subjectName: string;
        difficulty: string;
        examPurpose: string;
        audience: string;
        keywords: string[];
        description: string;
        notes: string;
        visible?: boolean;
        status?: AdminBankMappingStatusV1;
      } = {
        bankName: bankName.trim(),
        subjectCategory: subjectCategory.trim(),
        subjectName: subjectName.trim(),
        difficulty: difficulty.trim(),
        examPurpose: examPurpose.trim(),
        audience: audience.trim(),
        keywords: parseKeywords(keywordsText),
        description,
        notes,
      };
      if (canPublish) {
        changes.visible = visible;
        changes.status = status;
      }
      const request = UpdateAdminBankMappingRequestV1Schema.parse({
        expectedVersion: mapping.version,
        changes,
      });
      const response = await requestJson(`/api/admin/bank-mappings/${encodeURIComponent(mapping.bankId)}`, AdminBankMappingDetailResponseV1Schema, {
        method: 'PATCH',
        body: JSON.stringify(request),
      });
      setMapping(response.bankMapping);
      applyBankMappingToForm(response.bankMapping);
      setMessage('题库 mapping 已保存。');
      onChanged(response.bankMapping);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(mapBankMappingError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <InfoPanel title="正在加载题库详情…" />;
  if (error && !mapping) return <ErrorPanel message={error} onRetry={() => void load()} />;
  if (!mapping) return <InfoPanel title="题库 mapping 不存在" detail="返回列表后重新选择。" />;

  return (
    <section className="student-detail">
      <p className="eyebrow">Bank Mapping Detail</p>
      <h2>{mapping.bankName}</h2>
      <div className="badge-row">
        {buildBankMappingStatusBadges(mapping).map((badge) => <Badge key={badge} tone={bankMappingBadgeTone(badge)}>{badge}</Badge>)}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {!canWrite ? <ForbiddenInline /> : null}

      <section className="detail-section">
        <h3>Student preview</h3>
        <dl className="key-values single">
          <div><dt>visibleInStudentCatalog</dt><dd>{mapping.studentPreview.visibleInStudentCatalog ? 'yes' : 'no'}</dd></div>
          <div><dt>reason</dt><dd>{mapping.studentPreview.reason}</dd></div>
          <div><dt>parent</dt><dd>{mapping.parentName ?? '-'}</dd></div>
          <div><dt>questionTypeCounts</dt><dd>{Object.entries(mapping.questionTypeCounts).map(([type, count]) => `${type}: ${count}`).join('；') || '-'}</dd></div>
        </dl>
      </section>

      <form className="stack-form" onSubmit={save}>
        <h3>Curation fields</h3>
        <label>rawName<input value={mapping.rawName} disabled /></label>
        <label>bankName<input value={bankName} onChange={(event) => setBankName(event.target.value)} disabled={!canWrite} /></label>
        <label>subjectCategory<input value={subjectCategory} onChange={(event) => setSubjectCategory(event.target.value)} disabled={!canWrite} /></label>
        <label>subjectName<input value={subjectName} onChange={(event) => setSubjectName(event.target.value)} disabled={!canWrite} /></label>
        <label>difficulty<input value={difficulty} onChange={(event) => setDifficulty(event.target.value)} disabled={!canWrite} /></label>
        <label>examPurpose<input value={examPurpose} onChange={(event) => setExamPurpose(event.target.value)} disabled={!canWrite} /></label>
        <label>audience<input value={audience} onChange={(event) => setAudience(event.target.value)} disabled={!canWrite} /></label>
        <label>keywords<input value={keywordsText} onChange={(event) => setKeywordsText(event.target.value)} disabled={!canWrite} placeholder="逗号分隔" /></label>
        <label>description<textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canWrite} rows={3} /></label>
        <label>notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!canWrite} rows={3} /></label>
        <fieldset className="option-grid">
          <legend>Publish controls</legend>
          {!canPublish ? <p className="muted">当前账号没有 `bank_mapping:publish`，只能保存文案字段。</p> : null}
          <label>status
            <select value={status} onChange={(event) => setStatus(event.target.value as AdminBankMappingStatusV1)} disabled={!canPublish}>
              <option value="review">review</option>
              <option value="active">active</option>
              <option value="hidden">hidden</option>
              <option value="deprecated">deprecated</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} disabled={!canPublish} />
            visible in student catalog
          </label>
        </fieldset>
        {mapping.objectiveQuestionCount === 0 ? <p className="form-error">该 mapping 没有客观题；后端会拒绝发布为 active/visible。</p> : null}
        <button type="submit" disabled={!canWrite || saving}>{saving ? '保存中…' : '保存题库 mapping'}</button>
      </form>

      <section className="detail-section">
        <h3>Counts / audit</h3>
        <dl className="key-values single">
          <div><dt>bankId</dt><dd>{mapping.bankId}</dd></div>
          <div><dt>qGroup</dt><dd>{mapping.qGroup}</dd></div>
          <div><dt>direct / descendant / objective</dt><dd>{mapping.questionCount} / {mapping.descendantQuestionCount} / {mapping.objectiveQuestionCount}</dd></div>
          <div><dt>version</dt><dd>{mapping.version}</dd></div>
          <div><dt>updatedBy</dt><dd>{mapping.updatedBy?.displayName ?? '-'}</dd></div>
          <div><dt>updatedAt</dt><dd>{formatAdminDate(mapping.updatedAt)}</dd></div>
        </dl>
      </section>
    </section>
  );
}

function BankMappingBulkResult({ result }: { result: BulkUpdateAdminBankMappingStatusResponseV1 }) {
  return (
    <section className="bulk-result" role="status">
      <h3>Bulk status result</h3>
      <div className="status-grid three">
        <StatusCard tone="ok" title="updated" value={`${result.updated.length}`} detail={result.updated.map((item) => `${item.bankId}: v${item.version}`).join('；') || '-'} />
        <StatusCard tone={result.failed.length > 0 ? 'danger' : 'neutral'} title="failed" value={`${result.failed.length}`} detail={result.failed.map((item) => `${item.bankId}: ${item.error}`).join('；') || '-'} />
        <StatusCard tone="neutral" title="contract" value="v1" detail="updated/failed partial result is rendered without hiding failed rows." />
      </div>
    </section>
  );
}

function ImportJobsPage({
  admin,
  route,
  navigate,
  onSessionExpired,
}: {
  admin: AdminUserV1;
  route: Extract<AdminRoute, { kind: 'import-jobs' }>;
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
  onSessionExpired: () => void;
}) {
  const [draftFilters, setDraftFilters] = useState<ImportJobFilters>(defaultImportJobFilters);
  const [filters, setFilters] = useState<ImportJobFilters>(defaultImportJobFilters);
  const [offset, setOffset] = useState(0);
  const [jobs, setJobs] = useState<AdminImportJobV1[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 20;

  const canCreate = admin.permissions.includes('import_job:create');

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = buildImportJobListQuery(filters, limit, offset);
      const response = await requestJson(`/api/admin/import-jobs?${query}`, AdminImportJobListResponseV1Schema);
      setJobs(response.jobs);
      setHasMore(response.page.hasMore);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [filters, offset, onSessionExpired]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setFilters(draftFilters);
  }

  function refreshAfterCreate(job: AdminImportJobV1) {
    void loadJobs();
    navigate(`/admin/import-jobs/${job.id}`);
  }

  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="Import operations"
        title="Import Jobs"
        description="导入任务支持 dry-run、受 gate 保护的 true import、resetBeforeImport、cancel/retry、历史、详情、错误摘要和可断线续传的 SSE 实时进度。"
        action={(
          <div className="button-row">
            <button type="button" onClick={() => navigate('/admin/import-jobs/create')} disabled={!canCreate}>创建导入任务</button>
            <button className="ghost" type="button" onClick={() => void loadJobs()} disabled={loading}>刷新列表</button>
          </div>
        )}
      />

      <section className="admin-card">
        <form className="student-filters" onSubmit={submitFilters}>
          <label>状态
            <select value={draftFilters.status} onChange={(event) => setDraftFilters({ status: event.target.value as ImportJobFilters['status'] })}>
              <option value="">全部</option>
              <option value="queued">queued</option>
              <option value="running">running</option>
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
          <button type="submit">应用过滤</button>
        </form>
      </section>

      <div className="student-layout">
        <section className="admin-card student-list-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Jobs</p>
              <h2>导入任务历史</h2>
            </div>
            <span className="muted">offset {offset}</span>
          </div>
          {error ? <ErrorPanel message={error} onRetry={() => void loadJobs()} /> : null}
          {loading ? <p className="muted">正在加载导入任务…</p> : null}
          {!loading && !error && jobs.length === 0 ? <InfoPanel title="没有匹配导入任务" detail="创建 dry-run 或 import 任务后会出现在这里。" /> : null}
          {jobs.length > 0 ? <ImportJobTable jobs={jobs} navigate={navigate} /> : null}
          <div className="pager">
            <button className="ghost" type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>上一页</button>
            <span>offset {offset}</span>
            <button className="ghost" type="button" disabled={!hasMore || loading} onClick={() => setOffset(offset + limit)}>下一页</button>
          </div>
        </section>

        <aside className="admin-card student-side-panel">
          {route.panel === 'create' ? (
            <CreateImportJobPanel canCreate={canCreate} onCreated={refreshAfterCreate} onSessionExpired={onSessionExpired} />
          ) : route.jobId ? (
            <ImportJobDetailPanel
              jobId={route.jobId}
              onSessionExpired={onSessionExpired}
              onOpenJob={(nextJobId) => navigate(`/admin/import-jobs/${nextJobId}`)}
            />
          ) : (
            <InfoPanel title="选择一个导入任务" detail="从左侧列表查看 summary、progress、error report，并对 running/failed/cancelled 任务执行 cancel/retry。" />
          )}
        </aside>
      </div>
    </section>
  );
}

function ImportJobTable({
  jobs,
  navigate,
}: {
  jobs: AdminImportJobV1[];
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Source</th>
            <th>Summary</th>
            <th>Progress</th>
            <th>Created</th>
            <th>Finished</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>
                <strong>{job.kind}</strong>
                <br />
                <span className="muted">{job.id}</span>
              </td>
              <td>
                <div className="badge-row">
                  {buildImportJobStatusBadges(job).map((badge) => (
                    <Badge key={badge} tone={importJobBadgeTone(badge)}>{badge}</Badge>
                  ))}
                </div>
              </td>
              <td>{job.sourceDir}</td>
              <td>{formatImportJobSummary(job)}</td>
              <td>{formatImportJobProgress(job)}</td>
              <td>{job.createdBy?.displayName ?? '-'}<br /><span className="muted">{formatAdminDate(job.createdAt)}</span></td>
              <td>{formatAdminDate(job.finishedAt)}</td>
              <td><button className="ghost" type="button" onClick={() => navigate(`/admin/import-jobs/${job.id}`)}>查看任务</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateImportJobPanel({
  canCreate,
  onCreated,
  onSessionExpired,
}: {
  canCreate: boolean;
  onCreated: (job: AdminImportJobV1) => void;
  onSessionExpired: () => void;
}) {
  const [sourceDir, setSourceDir] = useState(defaultImportSourceDir);
  const [mode, setMode] = useState<AdminImportJobV1['mode']>('dry_run');
  const [batchSize, setBatchSize] = useState('1000');
  const [generateMappings, setGenerateMappings] = useState(true);
  const [resetBeforeImport, setResetBeforeImport] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdJob, setCreatedJob] = useState<AdminImportJobV1 | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setSubmitting(true);
    setError('');
    setCreatedJob(null);
    try {
      const request = CreateAdminImportJobRequestV1Schema.parse({
        kind: 'full_corpus_import',
        sourceDir,
        mode,
        options: {
          batchSize: Number(batchSize),
          resetBeforeImport,
          generateMappings,
        },
      });
      const response = await requestJson('/api/admin/import-jobs', CreateAdminImportJobResponseV1Schema, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      setCreatedJob(response.job);
      onCreated(response.job);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(mapImportJobError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="student-detail">
      <p className="eyebrow">Create Import Job</p>
      <h2>创建导入任务</h2>
      <p className="muted">`mode=import` 由 `ADMIN_IMPORT_ENABLE_WRITE=true` 控制；`resetBeforeImport=true` 会删除现有 corpus 及其级联学习数据，需要 super_admin，并额外要求维护窗口显式启用 `ADMIN_IMPORT_ENABLE_RESET=true`。</p>
      {!canCreate ? <ForbiddenInline /> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {createdJob ? <p className="form-success" role="status">{createdJob.mode} 已创建：{createdJob.status} / {createdJob.id}</p> : null}
      <form className="stack-form" onSubmit={submit}>
        <label>sourceDir
          <input
            value={sourceDir}
            onChange={(event) => setSourceDir(event.target.value)}
            placeholder="输入服务器 ADMIN_IMPORT_ALLOWED_ROOTS 下的题库目录"
            required
            disabled={!canCreate || submitting}
          />
        </label>
        <label>mode
          <select
            value={mode}
            onChange={(event) => {
              const nextMode = event.target.value as AdminImportJobV1['mode'];
              setMode(nextMode);
              if (nextMode === 'dry_run') setResetBeforeImport(false);
            }}
            disabled={!canCreate || submitting}
          >
            <option value="dry_run">dry_run</option>
            <option value="import">import</option>
          </select>
        </label>
        <label>batchSize
          <input value={batchSize} onChange={(event) => setBatchSize(event.target.value)} inputMode="numeric" disabled={!canCreate || submitting} />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={generateMappings} onChange={(event) => setGenerateMappings(event.target.checked)} disabled={!canCreate || submitting} />
          generateMappings
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={resetBeforeImport}
            onChange={(event) => setResetBeforeImport(event.target.checked)}
            disabled={!canCreate || submitting || mode === 'dry_run'}
          />
          resetBeforeImport（import 专用）
        </label>
        <button type="submit" disabled={!canCreate || submitting}>{submitting ? '创建中…' : `提交 ${mode}`}</button>
      </form>
    </section>
  );
}

function ImportJobDetailPanel({
  jobId,
  onSessionExpired,
  onOpenJob,
}: {
  jobId: string;
  onSessionExpired: () => void;
  onOpenJob: (jobId: string) => void;
}) {
  const [job, setJob] = useState<AdminImportJobV1 | null>(null);
  const [errorReport, setErrorReport] = useState<AdminImportJobErrorSummaryV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [liveState, setLiveState] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
  const [liveEvents, setLiveEvents] = useState<Array<{ id: string; type: AdminImportJobEventTypeV1; phase: string; at: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setErrorReport(null);
    try {
      const response = await requestJson(`/api/admin/import-jobs/${encodeURIComponent(jobId)}`, AdminImportJobDetailResponseV1Schema);
      setJob(response.job);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [jobId, onSessionExpired]);

  async function cancelJob() {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    setActing(true);
    setError('');
    setActionMessage('');
    try {
      const response = await requestJson(
        `/api/admin/import-jobs/${encodeURIComponent(job.id)}/cancel`,
        AdminImportJobDetailResponseV1Schema,
        { method: 'POST' },
      );
      setJob(response.job);
      setActionMessage(`任务已取消：${response.job.id}`);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(mapImportJobError(caught));
    } finally {
      setActing(false);
    }
  }

  async function retryJob() {
    if (!job || !['failed', 'cancelled'].includes(job.status)) return;
    setActing(true);
    setError('');
    setActionMessage('');
    try {
      const response = await requestJson(
        `/api/admin/import-jobs/${encodeURIComponent(job.id)}/retry`,
        AdminImportJobDetailResponseV1Schema,
        { method: 'POST' },
      );
      setActionMessage(`已创建 retry job：${response.job.id}`);
      onOpenJob(response.job.id);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(mapImportJobError(caught));
    } finally {
      setActing(false);
    }
  }

  const loadErrors = useCallback(async () => {
    setLoadingErrors(true);
    setError('');
    try {
      const response = await requestJson(`/api/admin/import-jobs/${encodeURIComponent(jobId)}/errors`, AdminImportJobErrorReportResponseV1Schema);
      setErrorReport(response.errorSummary);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoadingErrors(false);
    }
  }, [jobId, onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setLiveEvents([]);
  }, [jobId]);

  const liveStreamEnabled = shouldStreamImportJobEvents(job);

  useEffect(() => {
    if (!liveStreamEnabled || typeof EventSource === 'undefined') {
      setLiveState('idle');
      return;
    }

    const source = new EventSource(`/api/admin/import-jobs/${encodeURIComponent(jobId)}/events`);
    const eventTypes: AdminImportJobEventTypeV1[] = [
      'queued',
      'running',
      'progress',
      'succeeded',
      'failed',
      'cancelled',
      'recovered',
    ];
    setLiveState('connecting');
    source.onopen = () => setLiveState('connected');
    source.onerror = () => setLiveState('disconnected');
    const onEvent = (event: MessageEvent<string>) => {
      try {
        const parsed = AdminImportJobEventV1Schema.parse(JSON.parse(event.data));
        setJob(parsed.job);
        setLiveEvents((current) => [
          {
            id: parsed.id,
            type: parsed.type,
            phase: parsed.job.progress.phase,
            at: parsed.createdAt,
          },
          ...current.filter((entry) => entry.id !== parsed.id),
        ].slice(0, 12));
        if (isTerminalImportJob(parsed.job)) {
          setLiveState('idle');
          source.close();
        }
      } catch {
        setLiveState('disconnected');
      }
    };
    for (const eventType of eventTypes) {
      source.addEventListener(eventType, onEvent as EventListener);
    }

    return () => {
      for (const eventType of eventTypes) {
        source.removeEventListener(eventType, onEvent as EventListener);
      }
      source.close();
    };
  }, [jobId, liveStreamEnabled]);

  if (loading) return <InfoPanel title="正在加载导入任务详情…" />;
  if (error && !job) return <ErrorPanel message={error} onRetry={() => void load()} />;
  if (!job) return <InfoPanel title="导入任务不存在" detail="返回列表后重新选择。" />;

  return (
    <section className="student-detail">
      <p className="eyebrow">Import Job Detail</p>
      <h2>{job.kind}</h2>
      <div className="badge-row">
        {buildImportJobStatusBadges(job).map((badge) => <Badge key={badge} tone={importJobBadgeTone(badge)}>{badge}</Badge>)}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {actionMessage ? <p className="form-success" role="status">{actionMessage}</p> : null}
      <div className="button-row">
        <button className="ghost" type="button" onClick={() => void load()}>刷新详情</button>
        <button className="ghost" type="button" onClick={() => void loadErrors()} disabled={loadingErrors}>{loadingErrors ? '读取中…' : '查看 error report'}</button>
        <button className="ghost danger" type="button" onClick={() => void cancelJob()} disabled={acting || !['queued', 'running'].includes(job.status)}>取消任务</button>
        <button className="ghost" type="button" onClick={() => void retryJob()} disabled={acting || !['failed', 'cancelled'].includes(job.status)}>重试任务</button>
      </div>

      <section className="detail-section">
        <h3>Progress / summary</h3>
        <div className="progress-block">
          <div className="card-heading">
            <strong>{job.progress.phase}</strong>
            <span className="muted">{job.progress.current}/{job.progress.total} · realtime {liveState}</span>
          </div>
          <progress max={Math.max(1, job.progress.total)} value={Math.min(job.progress.current, Math.max(1, job.progress.total))} />
        </div>
        <dl className="key-values single">
          <div><dt>jobId</dt><dd>{job.id}</dd></div>
          <div><dt>sourceDir</dt><dd>{job.sourceDir}</dd></div>
          <div><dt>progress</dt><dd>{formatImportJobProgress(job)}</dd></div>
          <div><dt>summary</dt><dd>{formatImportJobSummary(job)}</dd></div>
          <div><dt>questionTypes</dt><dd>{job.summary.questionTypes ? Object.entries(job.summary.questionTypes).map(([type, count]) => `${type}: ${count}`).join('；') : '-'}</dd></div>
        </dl>
        {liveEvents.length > 0 ? (
          <ul className="event-list">
            {liveEvents.map((event) => (
              <li key={event.id}>
                <strong>{event.type}</strong>
                <span>{event.phase}</span>
                <time>{formatAdminDate(event.at)}</time>
              </li>
            ))}
          </ul>
        ) : <p className="muted">任务运行时会通过 SSE 显示阶段级实时事件；断线后浏览器使用 Last-Event-ID 补拉。</p>}
      </section>

      <section className="detail-section">
        <h3>Options / lifecycle</h3>
        <dl className="key-values single">
          <div><dt>batchSize</dt><dd>{job.options.batchSize}</dd></div>
          <div><dt>generateMappings</dt><dd>{String(job.options.generateMappings)}</dd></div>
          <div><dt>resetBeforeImport</dt><dd>{String(job.options.resetBeforeImport)}</dd></div>
          <div><dt>createdBy</dt><dd>{job.createdBy?.displayName ?? '-'}</dd></div>
          <div><dt>createdAt</dt><dd>{formatAdminDate(job.createdAt)}</dd></div>
          <div><dt>startedAt</dt><dd>{formatAdminDate(job.startedAt)}</dd></div>
          <div><dt>finishedAt</dt><dd>{formatAdminDate(job.finishedAt)}</dd></div>
          <div><dt>workerId</dt><dd>{job.workerId ?? '-'}</dd></div>
          <div><dt>heartbeatAt</dt><dd>{formatAdminDate(job.heartbeatAt ?? null)}</dd></div>
        </dl>
      </section>

      <section className="detail-section">
        <h3>Error report</h3>
        {errorReport ? <ImportJobErrorReport errors={errorReport} /> : (
          <p className="muted">点击“查看 error report”读取后端 errorSummary；成功任务通常为空。</p>
        )}
      </section>
    </section>
  );
}

function ImportJobErrorReport({ errors }: { errors: AdminImportJobErrorSummaryV1 }) {
  if (errors.length === 0) {
    return <InfoPanel title="没有错误摘要" detail="当前任务 errorSummary 为空。" />;
  }
  return (
    <ul className="error-list">
      {errors.map((entry, index) => (
        <li key={`${entry.message}-${index}`}>
          <strong>{entry.message}</strong>
          {Object.keys(entry).length > 1 ? <pre>{JSON.stringify(entry, null, 2)}</pre> : null}
        </li>
      ))}
    </ul>
  );
}

function isTerminalImportJob(job: AdminImportJobV1): boolean {
  return job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled';
}

export function shouldStreamImportJobEvents(job: AdminImportJobV1 | null): boolean {
  return Boolean(job && !isTerminalImportJob(job));
}

function QuestionReviewPage({
  admin,
  route,
  navigate,
  onSessionExpired,
}: {
  admin: AdminUserV1;
  route: Extract<AdminRoute, { kind: 'question-review' }>;
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
  onSessionExpired: () => void;
}) {
  const [draftFilters, setDraftFilters] = useState<QuestionReviewFilters>(defaultQuestionReviewFilters);
  const [filters, setFilters] = useState<QuestionReviewFilters>(defaultQuestionReviewFilters);
  const [offset, setOffset] = useState(0);
  const [questions, setQuestions] = useState<AdminQuestionReviewItemV1[]>([]);
  const [detailOverride, setDetailOverride] = useState<AdminQuestionReviewDetailV1 | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 20;

  const canWrite = admin.permissions.includes('question_review:write');
  const canApprove = admin.permissions.includes('question_review:approve');
  const selectedQuestion = route.questionId
    ? (detailOverride?.questionId === route.questionId ? detailOverride : questions.find((question) => question.questionId === route.questionId) ?? null)
    : null;

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = buildQuestionReviewListQuery(filters, limit, offset);
      const response = await requestJson(`/api/admin/question-review?${query}`, AdminQuestionReviewListResponseV1Schema);
      setQuestions(response.questions);
      setHasMore(response.page.hasMore);
      setDetailOverride((current) => {
        if (!current) return null;
        return response.questions.some((question) => question.questionId === current.questionId) ? null : current;
      });
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [filters, offset, onSessionExpired]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setFilters(draftFilters);
    setDetailOverride(null);
  }

  function refreshAfterMutation(question: AdminQuestionReviewDetailV1) {
    setDetailOverride(question);
    setQuestions((current) => current.map((item) => (
      item.questionId === question.questionId
        ? {
          questionId: question.questionId,
          bankId: question.bankId,
          bankName: question.bankName,
          questionType: question.questionType,
          contentPreview: question.contentPreview,
          optionCount: question.optionCount,
          answerPreview: question.answerPreview,
          flags: question.flags,
          excludedFromPractice: question.excludedFromPractice,
        }
        : item
    )));
    void loadQuestions();
    navigate(`/admin/question-review/${question.questionId}`);
  }

  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="Quality operations"
        title="Question Review"
        description="题目复核使用独立覆盖层：编辑者保存草稿并查看字段级 diff，提交后由审批权限角色批准或驳回；已批准版本可审计回滚，不直接改导入原表。"
        action={<button className="ghost" type="button" onClick={() => void loadQuestions()} disabled={loading}>刷新列表</button>}
      />

      <section className="admin-card">
        <form className="student-filters" onSubmit={submitFilters}>
          <label>关键字
            <input value={draftFilters.keyword} onChange={(event) => setDraftFilters({ ...draftFilters, keyword: event.target.value })} placeholder="题干 / 答案 / searchable text" />
          </label>
          <label>状态
            <select value={draftFilters.status} onChange={(event) => setDraftFilters({ ...draftFilters, status: event.target.value as AdminQuestionFlagStatusV1 })}>
              <option value="open">open</option>
              <option value="resolved">resolved</option>
              <option value="ignored">ignored</option>
            </select>
          </label>
          <label>严重度
            <select value={draftFilters.severity} onChange={(event) => setDraftFilters({ ...draftFilters, severity: event.target.value as QuestionReviewFilters['severity'] })}>
              <option value="">全部</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="blocking">blocking</option>
            </select>
          </label>
          <label>Flag type
            <select value={draftFilters.flagType} onChange={(event) => setDraftFilters({ ...draftFilters, flagType: event.target.value as QuestionReviewFilters['flagType'] })}>
              <option value="">全部</option>
              <option value="bad_answer">bad_answer</option>
              <option value="missing_option">missing_option</option>
              <option value="bad_option">bad_option</option>
              <option value="garbled_content">garbled_content</option>
              <option value="duplicate_question">duplicate_question</option>
              <option value="wrong_type">wrong_type</option>
              <option value="needs_manual_review">needs_manual_review</option>
            </select>
          </label>
          <label>questionType
            <input value={draftFilters.questionType} onChange={(event) => setDraftFilters({ ...draftFilters, questionType: event.target.value })} placeholder="single_choice" />
          </label>
          <label>bankId
            <input value={draftFilters.bankId} onChange={(event) => setDraftFilters({ ...draftFilters, bankId: event.target.value })} placeholder="uuid" />
          </label>
          <button type="submit">应用过滤</button>
        </form>
      </section>

      <div className="student-layout">
        <section className="admin-card student-list-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Review queue</p>
              <h2>题目质检队列</h2>
            </div>
            <span className="muted">offset {offset}</span>
          </div>
          {error ? <ErrorPanel message={error} onRetry={() => void loadQuestions()} /> : null}
          {loading ? <p className="muted">正在加载题目质检队列…</p> : null}
          {!loading && !error && questions.length === 0 ? <InfoPanel title="没有匹配质检题目" detail="后端当前按 flag status 返回队列；默认只看 open。" /> : null}
          {questions.length > 0 ? <QuestionReviewTable questions={questions} navigate={navigate} /> : null}
          <div className="pager">
            <button className="ghost" type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>上一页</button>
            <span>offset {offset}</span>
            <button className="ghost" type="button" disabled={!hasMore || loading} onClick={() => setOffset(offset + limit)}>下一页</button>
          </div>
        </section>

        <aside className="admin-card student-side-panel">
          {route.questionId ? (
            <QuestionReviewDetailPanel
              questionId={route.questionId}
              initialQuestion={selectedQuestion}
              canWrite={canWrite}
              canApprove={canApprove}
              onChanged={refreshAfterMutation}
              onSessionExpired={onSessionExpired}
            />
          ) : (
            <InfoPanel title="选择一个质检题目" detail="从左侧列表查看题干/答案预览、open flags，并进行 add/resolve/ignore 或练习排除操作。" />
          )}
        </aside>
      </div>
    </section>
  );
}

function QuestionReviewTable({
  questions,
  navigate,
}: {
  questions: AdminQuestionReviewItemV1[];
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Bank</th>
            <th>Flags</th>
            <th>Preview</th>
            <th>Answer</th>
            <th>Options</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((question) => (
            <tr key={question.questionId}>
              <td>
                <strong>{question.questionType}</strong>
                <br />
                <span className="muted">{question.questionId}</span>
              </td>
              <td>{question.bankName}<br /><span className="muted">{question.bankId}</span></td>
              <td>
                <div className="badge-row">
                  {buildQuestionReviewBadges(question).map((badge) => (
                    <Badge key={badge} tone={questionReviewBadgeTone(badge)}>{badge}</Badge>
                  ))}
                </div>
              </td>
              <td>{question.contentPreview || '-'}</td>
              <td>{question.answerPreview || '-'}</td>
              <td>{question.optionCount}</td>
              <td><button className="ghost" type="button" onClick={() => navigate(`/admin/question-review/${question.questionId}`)}>查看题目质检</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isQuestionReviewDetail(
  question: AdminQuestionReviewItemV1 | AdminQuestionReviewDetailV1 | null,
): question is AdminQuestionReviewDetailV1 {
  return Boolean(question && 'overrideVersion' in question && Array.isArray(question.options));
}

function QuestionReviewDetailPanel({
  questionId,
  initialQuestion,
  canWrite,
  canApprove,
  onChanged,
  onSessionExpired,
}: {
  questionId: string;
  initialQuestion: AdminQuestionReviewItemV1 | AdminQuestionReviewDetailV1 | null;
  canWrite: boolean;
  canApprove: boolean;
  onChanged: (question: AdminQuestionReviewDetailV1) => void;
  onSessionExpired: () => void;
}) {
  const [question, setQuestion] = useState<AdminQuestionReviewDetailV1 | null>(
    () => (isQuestionReviewDetail(initialQuestion) ? initialQuestion : null),
  );
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [flagType, setFlagType] = useState<AdminQuestionFlagTypeV1>('needs_manual_review');
  const [severity, setSeverity] = useState<AdminQuestionFlagSeverityV1>('medium');
  const [note, setNote] = useState('');
  const [excludeOnAdd, setExcludeOnAdd] = useState(false);
  const [overrideContent, setOverrideContent] = useState('');
  const [overrideAnswerRaw, setOverrideAnswerRaw] = useState('');
  const [overrideAnalyzeRaw, setOverrideAnalyzeRaw] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const syncOverrideDraft = useCallback((next: AdminQuestionReviewDetailV1) => {
    const active = next.workflow?.activeRevision;
    const source = next.source ?? {
      content: next.content,
      answerRaw: next.answerRaw,
      analyzeRaw: next.analyzeRaw,
    };
    const optionOverrides = new Map(
      active?.optionContentOverrides.map((option) => [option.optionId, option.content]) ?? [],
    );
    setOverrideContent(active ? active.contentOverride ?? source.content : next.content);
    setOverrideAnswerRaw(active ? active.answerRawOverride ?? source.answerRaw : next.answerRaw);
    setOverrideAnalyzeRaw(active ? active.analyzeRawOverride ?? source.analyzeRaw ?? '' : next.analyzeRaw ?? '');
    setOverrideNote(active?.note ?? next.override?.note ?? '');
    setOptionDrafts(Object.fromEntries(next.options.map((option) => [
      option.id,
      active ? optionOverrides.get(option.id) ?? option.content : option.effectiveContent,
    ])));
  }, []);

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    setError('');
    try {
      const response = await requestJson(
        `/api/admin/question-review/${encodeURIComponent(questionId)}`,
        AdminQuestionReviewDetailResponseV1Schema,
      );
      setQuestion(response.question);
      syncOverrideDraft(response.question);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(mapQuestionReviewError(caught));
    } finally {
      setLoadingDetail(false);
    }
  }, [questionId, onSessionExpired, syncOverrideDraft]);

  useEffect(() => {
    if (isQuestionReviewDetail(initialQuestion) && initialQuestion.questionId === questionId) {
      setQuestion(initialQuestion);
      syncOverrideDraft(initialQuestion);
    }
  }, [initialQuestion, questionId, syncOverrideDraft]);

  useEffect(() => {
    setMessage('');
    setError('');
    setExcludeOnAdd(false);
    setNote('');
    void loadDetail();
  }, [questionId, loadDetail]);

  if (!question && loadingDetail) {
    return (
      <section className="student-detail">
        <p className="eyebrow">Question Review Detail</p>
        <h2>加载题目详情…</h2>
      </section>
    );
  }

  if (!question) {
    return (
      <section className="student-detail">
        <p className="eyebrow">Question Review Detail</p>
        <h2>题目详情不可用</h2>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="ghost" type="button" onClick={() => void loadDetail()} disabled={loadingDetail}>重试加载详情</button>
      </section>
    );
  }
  const currentQuestion = question;

  async function patchQuestionReview(changes: {
    addFlags?: Array<{ type: AdminQuestionFlagTypeV1; severity: AdminQuestionFlagSeverityV1; note: string }>;
    resolveFlagIds?: string[];
    ignoredFlagIds?: string[];
    excludedFromPractice?: boolean;
  }, successMessage: string) {
    if (!canWrite) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const request = UpdateAdminQuestionReviewRequestV1Schema.parse({
        addFlags: changes.addFlags ?? [],
        resolveFlagIds: changes.resolveFlagIds ?? [],
        ignoredFlagIds: changes.ignoredFlagIds ?? [],
        excludedFromPractice: changes.excludedFromPractice,
      });
      const response = await requestJson(`/api/admin/question-review/${encodeURIComponent(currentQuestion.questionId)}`, AdminQuestionReviewDetailResponseV1Schema, {
        method: 'PATCH',
        body: JSON.stringify(request),
      });
      setMessage(successMessage);
      setNote('');
      setExcludeOnAdd(false);
      setQuestion(response.question);
      syncOverrideDraft(response.question);
      onChanged(response.question);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(mapQuestionReviewError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function addFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes: Parameters<typeof patchQuestionReview>[0] = {
      addFlags: [{ type: flagType, severity, note }],
    };
    if (excludeOnAdd && !currentQuestion.excludedFromPractice) changes.excludedFromPractice = true;
    await patchQuestionReview(changes, '质检 flag 已添加。');
  }

  async function saveOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const optionContentOverrides = currentQuestion.options
        .map((option) => ({
          optionId: option.id,
          content: optionDrafts[option.id] ?? option.effectiveContent,
          previous: option.effectiveContent,
        }))
        .filter((option) => option.content !== option.previous)
        .map(({ optionId, content }) => ({ optionId, content }));
      const contentChanged = overrideContent !== currentQuestion.content;
      const answerChanged = overrideAnswerRaw !== currentQuestion.answerRaw;
      const analyzeChanged = overrideAnalyzeRaw !== (currentQuestion.analyzeRaw ?? '');
      const noteChanged = overrideNote !== (currentQuestion.override?.note ?? '');
      const hasOverrideChange = contentChanged || answerChanged || analyzeChanged || optionContentOverrides.length > 0;
      const request = UpdateAdminQuestionOverrideRequestV1Schema.parse({
        expectedVersion: currentQuestion.overrideVersion,
        expectedDraftVersion: currentQuestion.workflow?.activeRevision?.version ?? 0,
        content: contentChanged ? overrideContent : undefined,
        answerRaw: answerChanged ? overrideAnswerRaw : undefined,
        analyzeRaw: analyzeChanged ? overrideAnalyzeRaw : undefined,
        optionContentOverrides,
        note: hasOverrideChange || noteChanged ? overrideNote : '',
      });
      const response = await requestJson(
        `/api/admin/question-review/${encodeURIComponent(currentQuestion.questionId)}/override`,
        AdminQuestionOverrideResponseV1Schema,
        {
          method: 'PATCH',
          body: JSON.stringify(request),
        },
      );
      setQuestion(response.question);
      syncOverrideDraft(response.question);
      setMessage(`题目修订草稿已保存；draft version = ${response.question.workflow?.activeRevision?.version ?? '-'}。`);
      onChanged(response.question);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(mapQuestionReviewError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOverrideRevision() {
    const revision = currentQuestion.workflow?.activeRevision;
    if (!canWrite || revision?.status !== 'draft') return;
    await runOverrideWorkflowAction(
      `/api/admin/question-review/${encodeURIComponent(currentQuestion.questionId)}/override/submit`,
      SubmitAdminQuestionOverrideRequestV1Schema.parse({
        revisionId: revision.id,
        expectedDraftVersion: revision.version,
      }),
      '修订已提交审批。',
    );
  }

  async function approveOverrideRevision() {
    const revision = currentQuestion.workflow?.activeRevision;
    if (!canApprove || revision?.status !== 'pending_review') return;
    await runOverrideWorkflowAction(
      `/api/admin/question-review/${encodeURIComponent(currentQuestion.questionId)}/override/approve`,
      ReviewAdminQuestionOverrideRequestV1Schema.parse({
        revisionId: revision.id,
        expectedVersion: currentQuestion.overrideVersion,
        reviewNote,
      }),
      '修订已批准并生效。',
    );
  }

  async function rejectOverrideRevision() {
    const revision = currentQuestion.workflow?.activeRevision;
    if (!canApprove || revision?.status !== 'pending_review') return;
    await runOverrideWorkflowAction(
      `/api/admin/question-review/${encodeURIComponent(currentQuestion.questionId)}/override/reject`,
      ReviewAdminQuestionOverrideRequestV1Schema.parse({
        revisionId: revision.id,
        expectedVersion: currentQuestion.overrideVersion,
        reviewNote,
      }),
      '修订已驳回。',
    );
  }

  async function rollbackOverrideRevision(revision: AdminQuestionOverrideRevisionV1) {
    if (!canApprove || revision.status !== 'approved') return;
    await runOverrideWorkflowAction(
      `/api/admin/question-review/${encodeURIComponent(currentQuestion.questionId)}/override/rollback`,
      RollbackAdminQuestionOverrideRequestV1Schema.parse({
        revisionId: revision.id,
        expectedVersion: currentQuestion.overrideVersion,
        note: reviewNote.trim() || `Rollback to revision ${revision.id}`,
      }),
      `已回滚到修订 ${revision.id}。`,
    );
  }

  async function runOverrideWorkflowAction(url: string, body: unknown, successMessage: string) {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const response = await requestJson(url, AdminQuestionOverrideResponseV1Schema, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setQuestion(response.question);
      syncOverrideDraft(response.question);
      setReviewNote('');
      setMessage(successMessage);
      onChanged(response.question);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(mapQuestionReviewError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  const openFlags = currentQuestion.flags.filter((flag) => flag.status === 'open');
  const activeRevision = currentQuestion.workflow?.activeRevision ?? null;
  const revisionHistory = currentQuestion.workflow?.revisions ?? [];
  const editorLocked = activeRevision?.status === 'pending_review';

  return (
    <section className="student-detail">
      <p className="eyebrow">Question Review Detail</p>
      <h2>{currentQuestion.questionType}</h2>
      <div className="badge-row">
        {buildQuestionReviewBadges(currentQuestion).map((badge) => <Badge key={badge} tone={questionReviewBadgeTone(badge)}>{badge}</Badge>)}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {loadingDetail ? <p className="muted">正在刷新题目详情…</p> : null}
      {!canWrite ? <ForbiddenInline /> : null}

      <section className="detail-section">
        <h3>Effective detail</h3>
        <dl className="key-values single">
          <div><dt>questionId</dt><dd>{currentQuestion.questionId}</dd></div>
          <div><dt>bank</dt><dd>{currentQuestion.bankName} / {currentQuestion.bankId}</dd></div>
          <div><dt>content</dt><dd>{currentQuestion.content || '-'}</dd></div>
          <div><dt>answerRaw</dt><dd>{currentQuestion.answerRaw || '-'}</dd></div>
          <div><dt>analyzeRaw</dt><dd>{currentQuestion.analyzeRaw || '-'}</dd></div>
          <div><dt>optionCount</dt><dd>{currentQuestion.optionCount}</dd></div>
          <div><dt>excludedFromPractice</dt><dd>{String(currentQuestion.excludedFromPractice)}</dd></div>
          <div><dt>overrideVersion</dt><dd>{currentQuestion.overrideVersion}</dd></div>
          <div><dt>overrideUpdatedBy</dt><dd>{currentQuestion.override?.updatedBy?.displayName ?? '-'}</dd></div>
        </dl>
      </section>

      <form className="stack-form detail-section" onSubmit={saveOverride}>
        <h3>Revision editor</h3>
        <p className="muted">编辑先保存为 draft，不会立即影响学生端；提交后由具有 `question_review:approve` 权限的管理员批准，批准时才写入 effective override。</p>
        <label>题干 content override
          <textarea value={overrideContent} onChange={(event) => setOverrideContent(event.target.value)} rows={5} disabled={!canWrite || submitting || editorLocked} />
        </label>
        <label>answerRaw override
          <input value={overrideAnswerRaw} onChange={(event) => setOverrideAnswerRaw(event.target.value)} disabled={!canWrite || submitting || editorLocked} />
        </label>
        <label>analyzeRaw override
          <textarea value={overrideAnalyzeRaw} onChange={(event) => setOverrideAnalyzeRaw(event.target.value)} rows={3} disabled={!canWrite || submitting || editorLocked} />
        </label>
        {currentQuestion.options.length > 0 ? (
          <div className="option-editor-list">
            <strong>Option content overrides</strong>
            {currentQuestion.options.map((option) => (
              <label key={option.id}>option {option.sort}
                <input
                  value={optionDrafts[option.id] ?? option.effectiveContent}
                  onChange={(event) => setOptionDrafts({ ...optionDrafts, [option.id]: event.target.value })}
                  disabled={!canWrite || submitting || editorLocked}
                />
                <span className="muted">{option.id}{option.overrideContent ? ' · overridden' : ''}</span>
              </label>
            ))}
          </div>
        ) : <p className="muted">该题没有选项记录。</p>}
        <label>override note
          <textarea value={overrideNote} onChange={(event) => setOverrideNote(event.target.value)} rows={2} disabled={!canWrite || submitting || editorLocked} placeholder="说明为什么覆盖题干/答案/选项。" />
        </label>
        <div className="button-row">
          <button type="submit" disabled={!canWrite || submitting || editorLocked}>{submitting ? '保存中…' : '保存修订草稿'}</button>
          <button className="ghost" type="button" onClick={() => void submitOverrideRevision()} disabled={!canWrite || submitting || activeRevision?.status !== 'draft'}>提交审批</button>
        </div>
      </form>

      <section className="detail-section">
        <h3>Diff / approval</h3>
        {activeRevision ? (
          <>
            <div className="badge-row">
              <Badge tone={activeRevision.status === 'pending_review' ? 'warning' : 'neutral'}>{activeRevision.status}</Badge>
              <span className="muted">revision {activeRevision.id} · v{activeRevision.version} · base effective v{activeRevision.baseVersion}</span>
            </div>
            <QuestionOverrideDiff revision={activeRevision} />
            {activeRevision.status === 'pending_review' ? (
              <>
                <label>审批意见
                  <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={2} disabled={!canApprove || submitting} />
                </label>
                <div className="button-row">
                  <button type="button" onClick={() => void approveOverrideRevision()} disabled={!canApprove || submitting}>批准并生效</button>
                  <button className="ghost danger" type="button" onClick={() => void rejectOverrideRevision()} disabled={!canApprove || submitting}>驳回修订</button>
                </div>
                {!canApprove ? <p className="muted">当前账号可编辑但没有审批权限。</p> : null}
              </>
            ) : null}
          </>
        ) : <p className="muted">当前没有 draft / pending revision。</p>}
      </section>

      <section className="detail-section">
        <h3>Revision history / rollback</h3>
        <label>回滚说明
          <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={2} disabled={!canApprove || submitting} placeholder="回滚时会创建一条新的 approved revision，不删除历史。" />
        </label>
        {revisionHistory.length > 0 ? (
          <ul className="revision-list">
            {revisionHistory.map((revision) => (
              <li key={revision.id}>
                <div className="card-heading">
                  <div>
                    <strong>{revision.status} · effective {revision.appliedVersion ?? '-'}</strong>
                    <p className="muted">{revision.id} · {formatAdminDate(revision.createdAt)} · {revision.createdBy?.displayName ?? '-'}</p>
                  </div>
                  <button className="ghost" type="button" disabled={!canApprove || submitting || revision.status !== 'approved' || Boolean(activeRevision)} onClick={() => void rollbackOverrideRevision(revision)}>回滚到此版本</button>
                </div>
                <p>{revision.note || '-'}</p>
                {revision.reviewNote ? <p className="muted">审批：{revision.reviewNote}</p> : null}
                <QuestionOverrideDiff revision={revision} />
              </li>
            ))}
          </ul>
        ) : <p className="muted">暂无修订历史。</p>}
      </section>

      <section className="detail-section">
        <h3>Practice exclusion</h3>
        <p className="muted">只切换 `excludedFromPractice`；打开后新建普通练习会排除该题。</p>
        <button
          type="button"
          className={currentQuestion.excludedFromPractice ? 'ghost' : 'danger'}
          disabled={!canWrite || submitting}
          onClick={() => void patchQuestionReview({ excludedFromPractice: !currentQuestion.excludedFromPractice }, currentQuestion.excludedFromPractice ? '该题已恢复进入练习选题。' : '该题已排除出练习选题。')}
        >
          {currentQuestion.excludedFromPractice ? '恢复练习选题' : '排除出练习'}
        </button>
      </section>

      <form className="stack-form detail-section" onSubmit={addFlag}>
        <h3>Add flag</h3>
        <label>Flag type
          <select value={flagType} onChange={(event) => setFlagType(event.target.value as AdminQuestionFlagTypeV1)} disabled={!canWrite || submitting}>
            <option value="needs_manual_review">needs_manual_review</option>
            <option value="bad_answer">bad_answer</option>
            <option value="missing_option">missing_option</option>
            <option value="bad_option">bad_option</option>
            <option value="garbled_content">garbled_content</option>
            <option value="duplicate_question">duplicate_question</option>
            <option value="wrong_type">wrong_type</option>
          </select>
        </label>
        <label>Severity
          <select value={severity} onChange={(event) => setSeverity(event.target.value as AdminQuestionFlagSeverityV1)} disabled={!canWrite || submitting}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="blocking">blocking</option>
          </select>
        </label>
        <label>Note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} disabled={!canWrite || submitting} placeholder="记录质检原因，不写入原题。" />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={excludeOnAdd} onChange={(event) => setExcludeOnAdd(event.target.checked)} disabled={!canWrite || submitting || currentQuestion.excludedFromPractice} />
          添加 flag 时同时排除练习
        </label>
        <button type="submit" disabled={!canWrite || submitting}>{submitting ? '提交中…' : '添加质检 flag'}</button>
      </form>

      <section className="detail-section">
        <h3>Flags</h3>
        {currentQuestion.flags.length === 0 ? <InfoPanel title="暂无 flag" detail="可以先添加 needs_manual_review flag。" /> : (
          <ul className="flag-list">
            {currentQuestion.flags.map((flag) => (
              <QuestionReviewFlagItem
                key={flag.id}
                flag={flag}
                canWrite={canWrite}
                submitting={submitting}
                onResolve={() => void patchQuestionReview({ resolveFlagIds: [flag.id] }, '质检 flag 已 resolve。')}
                onIgnore={() => void patchQuestionReview({ ignoredFlagIds: [flag.id] }, '质检 flag 已 ignore。')}
              />
            ))}
          </ul>
        )}
        {openFlags.length === 0 ? <p className="muted">当前没有 open flags；默认列表刷新后可能不再显示该题。</p> : null}
      </section>
    </section>
  );
}

function QuestionReviewFlagItem({
  flag,
  canWrite,
  submitting,
  onResolve,
  onIgnore,
}: {
  flag: AdminQuestionReviewFlagV1;
  canWrite: boolean;
  submitting: boolean;
  onResolve: () => void;
  onIgnore: () => void;
}) {
  return (
    <li>
      <div>
        <div className="badge-row">
          <Badge tone={questionReviewBadgeTone(flag.status)}>{flag.status}</Badge>
          <Badge tone={questionReviewBadgeTone(flag.severity)}>{flag.severity}</Badge>
          <Badge>{flag.type}</Badge>
        </div>
        <p>{flag.note || '-'}</p>
        <p className="muted">
          created {formatAdminDate(flag.createdAt)} by {flag.createdBy?.displayName ?? '-'}
          {flag.resolvedAt ? ` · resolved ${formatAdminDate(flag.resolvedAt)} by ${flag.resolvedBy?.displayName ?? '-'}` : ''}
        </p>
      </div>
      {flag.status === 'open' ? (
        <div className="button-row">
          <button className="ghost" type="button" disabled={!canWrite || submitting} onClick={onResolve}>resolve</button>
          <button className="ghost" type="button" disabled={!canWrite || submitting} onClick={onIgnore}>ignore</button>
        </div>
      ) : null}
    </li>
  );
}

function QuestionOverrideDiff({ revision }: { revision: AdminQuestionOverrideRevisionV1 }) {
  if (revision.diff.length === 0) {
    return <p className="muted">该修订相对基线没有内容差异。</p>;
  }

  return (
    <div className="diff-list">
      {revision.diff.map((entry) => (
        <article key={entry.field}>
          <strong>{entry.label}</strong>
          <div className="diff-values">
            <pre className="diff-before">{entry.before ?? '∅'}</pre>
            <span aria-hidden="true">→</span>
            <pre className="diff-after">{entry.after ?? '∅'}</pre>
          </div>
        </article>
      ))}
    </div>
  );
}

function AuditLogsPage({
  route,
  navigate,
  onSessionExpired,
}: {
  route: Extract<AdminRoute, { kind: 'audit-logs' }>;
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
  onSessionExpired: () => void;
}) {
  const [draftFilters, setDraftFilters] = useState<AuditLogFilters>(defaultAuditLogFilters);
  const [filters, setFilters] = useState<AuditLogFilters>(defaultAuditLogFilters);
  const [offset, setOffset] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogEntryV1[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 20;

  const selectedLog = route.auditLogId
    ? auditLogs.find((entry) => entry.id === route.auditLogId) ?? null
    : null;

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = buildAuditLogListQuery(filters, limit, offset);
      const response = await requestJson(`/api/admin/audit-logs?${query}`, AdminAuditLogListResponseV1Schema);
      setAuditLogs(response.auditLogs);
      setHasMore(response.page.hasMore);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [filters, offset, onSessionExpired]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setFilters(draftFilters);
  }

  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="Audit"
        title="Audit Logs"
        description="B9.24 只做只读审计日志 UI：list/filter/page 与 before/after/metadata JSON preview；复杂 diff viewer、导出和视觉精修后置。"
        action={<button className="ghost" type="button" onClick={() => void loadAuditLogs()} disabled={loading}>刷新列表</button>}
      />

      <section className="admin-card">
        <form className="student-filters" onSubmit={submitFilters}>
          <label>actorAdminId
            <input value={draftFilters.actorAdminId} onChange={(event) => setDraftFilters({ ...draftFilters, actorAdminId: event.target.value })} placeholder="uuid" />
          </label>
          <label>action
            <input value={draftFilters.action} onChange={(event) => setDraftFilters({ ...draftFilters, action: event.target.value })} placeholder="bank_mapping.update" />
          </label>
          <label>resourceType
            <input value={draftFilters.resourceType} onChange={(event) => setDraftFilters({ ...draftFilters, resourceType: event.target.value })} placeholder="student / question" />
          </label>
          <label>resourceId
            <input value={draftFilters.resourceId} onChange={(event) => setDraftFilters({ ...draftFilters, resourceId: event.target.value })} />
          </label>
          <label>result
            <select value={draftFilters.result} onChange={(event) => setDraftFilters({ ...draftFilters, result: event.target.value as AuditLogFilters['result'] })}>
              <option value="">全部</option>
              <option value="success">success</option>
              <option value="failure">failure</option>
            </select>
          </label>
          <label>createdFrom
            <input type="datetime-local" value={draftFilters.createdFrom} onChange={(event) => setDraftFilters({ ...draftFilters, createdFrom: event.target.value })} />
          </label>
          <label>createdTo
            <input type="datetime-local" value={draftFilters.createdTo} onChange={(event) => setDraftFilters({ ...draftFilters, createdTo: event.target.value })} />
          </label>
          <button type="submit">应用过滤</button>
        </form>
      </section>

      <div className="student-layout">
        <section className="admin-card student-list-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Audit events</p>
              <h2>审计日志列表</h2>
            </div>
            <span className="muted">offset {offset}</span>
          </div>
          {error ? <ErrorPanel message={error} onRetry={() => void loadAuditLogs()} /> : null}
          {loading ? <p className="muted">正在加载审计日志…</p> : null}
          {!loading && !error && auditLogs.length === 0 ? <InfoPanel title="没有匹配审计日志" detail="审计日志为只读列表；可以调整 actor/action/resource/result/time 过滤。" /> : null}
          {auditLogs.length > 0 ? <AuditLogTable auditLogs={auditLogs} navigate={navigate} /> : null}
          <div className="pager">
            <button className="ghost" type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>上一页</button>
            <span>offset {offset}</span>
            <button className="ghost" type="button" disabled={!hasMore || loading} onClick={() => setOffset(offset + limit)}>下一页</button>
          </div>
        </section>

        <aside className="admin-card student-side-panel">
          {route.auditLogId && selectedLog ? (
            <AuditLogDetailPanel entry={selectedLog} />
          ) : route.auditLogId ? (
            <InfoPanel title="当前列表中没有该日志" detail="Audit Logs 暂无单独 GET detail endpoint；请调整过滤条件或从左侧列表重新选择。" />
          ) : (
            <InfoPanel title="选择一条审计日志" detail="从左侧列表点击查看，右侧展示 actor、action、resource、before/after 和 metadata JSON preview。" />
          )}
        </aside>
      </div>
    </section>
  );
}

function AuditLogTable({
  auditLogs,
  navigate,
}: {
  auditLogs: AdminAuditLogEntryV1[];
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Actor</th>
            <th>Action</th>
            <th>Resource</th>
            <th>Result</th>
            <th>Metadata</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {auditLogs.map((entry) => (
            <tr key={entry.id}>
              <td>
                <strong>{entry.actor?.displayName ?? 'system'}</strong>
                <br />
                <span className="muted">{entry.actor?.loginName ?? '-'}</span>
              </td>
              <td>{entry.action}</td>
              <td>{entry.resourceType}<br /><span className="muted">{entry.resourceId}</span></td>
              <td>
                <div className="badge-row">
                  {buildAuditLogBadges(entry).map((badge) => (
                    <Badge key={badge} tone={auditLogBadgeTone(badge)}>{badge}</Badge>
                  ))}
                </div>
              </td>
              <td>{Object.keys(entry.metadata).join(', ') || '-'}</td>
              <td>{formatAdminDate(entry.createdAt)}</td>
              <td><button className="ghost" type="button" onClick={() => navigate(`/admin/audit-logs/${entry.id}`)}>查看审计日志</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditLogDetailPanel({ entry }: { entry: AdminAuditLogEntryV1 }) {
  return (
    <section className="student-detail">
      <p className="eyebrow">Audit Log Detail</p>
      <h2>{entry.action}</h2>
      <div className="badge-row">
        {buildAuditLogBadges(entry).map((badge) => <Badge key={badge} tone={auditLogBadgeTone(badge)}>{badge}</Badge>)}
      </div>

      <section className="detail-section">
        <h3>Identity</h3>
        <dl className="key-values single">
          <div><dt>id</dt><dd>{entry.id}</dd></div>
          <div><dt>actor</dt><dd>{entry.actor ? `${entry.actor.displayName} / ${entry.actor.loginName} / ${entry.actor.id}` : 'system / bootstrap / unknown'}</dd></div>
          <div><dt>resource</dt><dd>{entry.resourceType} / {entry.resourceId}</dd></div>
          <div><dt>result</dt><dd>{entry.result}</dd></div>
          <div><dt>createdAt</dt><dd>{formatAdminDate(entry.createdAt)}</dd></div>
        </dl>
      </section>

      <section className="detail-section">
        <h3>Before / after</h3>
        <JsonPreview title="before" value={entry.before} />
        <JsonPreview title="after" value={entry.after} />
      </section>

      <section className="detail-section">
        <h3>Metadata</h3>
        <JsonPreview title="metadata" value={entry.metadata} />
      </section>
    </section>
  );
}

function JsonPreview({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="json-preview">
      <strong>{title}</strong>
      <pre>{formatJsonBlock(value)}</pre>
    </div>
  );
}

function AdminUsersPage({
  admin,
  route,
  navigate,
  onSessionExpired,
}: {
  admin: AdminUserV1;
  route: Extract<AdminRoute, { kind: 'admin-users' }>;
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
  onSessionExpired: () => void;
}) {
  const canWrite = admin.permissions.includes('admin_user:manage');
  const [draftFilters, setDraftFilters] = useState<AdminUserFilters>(defaultAdminUserFilters);
  const [filters, setFilters] = useState<AdminUserFilters>(defaultAdminUserFilters);
  const [offset, setOffset] = useState(0);
  const [adminUsers, setAdminUsers] = useState<AdminManagedUserV1[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 20;

  const loadAdminUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = buildAdminUserListQuery(filters, limit, offset);
      const response = await requestJson(`/api/admin/users?${query}`, AdminUserListResponseV1Schema);
      setAdminUsers(response.adminUsers);
      setHasMore(response.page.hasMore);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [filters, offset, onSessionExpired]);

  useEffect(() => {
    void loadAdminUsers();
  }, [loadAdminUsers]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setFilters(draftFilters);
  }

  function refreshAfterMutation(adminId?: string) {
    void loadAdminUsers();
    if (adminId) navigate(`/admin/users/${adminId}`);
  }

  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="Identity operations"
        title="Admin Users"
        description="B9.25 实现管理员账号管理 UI：列表、创建、角色/状态维护与密码重置；MFA、SSO、细粒度权限编辑和最终视觉继续后置。"
        action={(
          <div className="button-row">
            <button type="button" onClick={() => navigate('/admin/users/create')}>创建管理员</button>
            <button className="ghost" type="button" onClick={() => void loadAdminUsers()} disabled={loading}>刷新列表</button>
          </div>
        )}
      />

      <section className="admin-card">
        <form className="admin-user-filters" onSubmit={submitFilters}>
          <label>关键字
            <input value={draftFilters.keyword} onChange={(event) => setDraftFilters({ ...draftFilters, keyword: event.target.value })} placeholder="loginName / displayName" />
          </label>
          <label>状态
            <select value={draftFilters.status} onChange={(event) => setDraftFilters({ ...draftFilters, status: event.target.value as AdminUserFilters['status'] })}>
              <option value="">全部</option>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          <label>角色
            <select value={draftFilters.role} onChange={(event) => setDraftFilters({ ...draftFilters, role: event.target.value as AdminUserFilters['role'] })}>
              <option value="">全部</option>
              {adminRoleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <button type="submit">应用过滤</button>
        </form>
      </section>

      <div className="student-layout">
        <section className="admin-card student-list-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Admins</p>
              <h2>管理员列表</h2>
            </div>
            <span className="muted">offset {offset}</span>
          </div>
          {error ? <ErrorPanel message={error} onRetry={() => void loadAdminUsers()} /> : null}
          {loading ? <p className="muted">正在加载管理员账号…</p> : null}
          {!loading && !error && adminUsers.length === 0 ? <InfoPanel title="没有匹配管理员" detail="可以调整 keyword/status/role 过滤后重新查询。" /> : null}
          {adminUsers.length > 0 ? <AdminUserTable adminUsers={adminUsers} navigate={navigate} /> : null}
          <div className="pager">
            <button className="ghost" type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>上一页</button>
            <span>offset {offset}</span>
            <button className="ghost" type="button" disabled={!hasMore || loading} onClick={() => setOffset(offset + limit)}>下一页</button>
          </div>
        </section>

        <aside className="admin-card student-side-panel">
          {route.panel === 'create' ? (
            <CreateAdminUserPanel
              canWrite={canWrite}
              onCreated={(createdAdmin) => refreshAfterMutation(createdAdmin.id)}
              onSessionExpired={onSessionExpired}
            />
          ) : route.adminId ? (
            <AdminUserDetailPanel
              adminUserId={route.adminId}
              currentAdmin={admin}
              canWrite={canWrite}
              onChanged={(changedAdmin) => refreshAfterMutation(changedAdmin.id)}
              onSessionExpired={onSessionExpired}
            />
          ) : (
            <InfoPanel title="选择一个管理员账号" detail="从左侧列表点击查看，或使用右上角创建入口。密码提交后不会保存或回显。" />
          )}
        </aside>
      </div>
    </section>
  );
}

function AdminUserTable({
  adminUsers,
  navigate,
}: {
  adminUsers: AdminManagedUserV1[];
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Login name</th>
            <th>Display name</th>
            <th>Roles</th>
            <th>Permissions</th>
            <th>Created</th>
            <th>Last login</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {adminUsers.map((adminUser) => (
            <tr key={adminUser.id}>
              <td>
                <strong>{adminUser.loginName}</strong>
                <br />
                <span className="muted">{adminUser.id}</span>
              </td>
              <td>{adminUser.displayName}</td>
              <td>
                <div className="badge-row">
                  {buildAdminUserBadges(adminUser).map((badge) => (
                    <Badge key={badge} tone={adminUserBadgeTone(badge)}>{badge}</Badge>
                  ))}
                </div>
              </td>
              <td>{adminUser.permissions.length} permissions</td>
              <td>{formatAdminDate(adminUser.createdAt)}</td>
              <td>{formatAdminDate(adminUser.lastLoginAt)}</td>
              <td><button className="ghost" type="button" onClick={() => navigate(`/admin/users/${adminUser.id}`)}>查看管理员 {adminUser.loginName}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateAdminUserPanel({
  canWrite,
  onCreated,
  onSessionExpired,
}: {
  canWrite: boolean;
  onCreated: (adminUser: AdminManagedUserV1) => void;
  onSessionExpired: () => void;
}) {
  const [loginName, setLoginName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<AdminRoleV1[]>(['operator']);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      if (roles.length === 0) throw new Error('至少选择一个管理员角色。');
      const normalizedLoginName = loginName.trim();
      const request = CreateAdminUserRequestV1Schema.parse({
        loginName: normalizedLoginName,
        displayName: displayName.trim() || normalizedLoginName,
        password,
        roles: sortAdminRoles(roles),
      });
      const response = await requestJson('/api/admin/users', AdminUserDetailResponseV1Schema, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      setPassword('');
      setMessage(`管理员已创建：${response.adminUser.loginName}。临时密码不会在提交后保存或回显。`);
      onCreated(response.adminUser);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <p className="eyebrow">Create Admin</p>
      <h2>创建管理员</h2>
      {!canWrite ? <ForbiddenInline /> : null}
      <form className="stack-form" onSubmit={submit}>
        <label>loginName *<input value={loginName} onChange={(event) => setLoginName(event.target.value)} required /></label>
        <label>displayName<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="默认可与 loginName 一致" /></label>
        <label>initial password *<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required /></label>
        <AdminUserRoleSelector roles={roles} onChange={setRoles} disabled={!canWrite || submitting} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}
        <button type="submit" disabled={!canWrite || submitting}>{submitting ? '创建中…' : '创建管理员'}</button>
      </form>
    </section>
  );
}

function AdminUserDetailPanel({
  adminUserId,
  currentAdmin,
  canWrite,
  onChanged,
  onSessionExpired,
}: {
  adminUserId: string;
  currentAdmin: AdminUserV1;
  canWrite: boolean;
  onChanged: (adminUser: AdminManagedUserV1) => void;
  onSessionExpired: () => void;
}) {
  const [adminUser, setAdminUser] = useState<AdminManagedUserV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState<AdminManagedUserStatusV1>('active');
  const [roles, setRoles] = useState<AdminRoleV1[]>(['operator']);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await requestJson(`/api/admin/users/${encodeURIComponent(adminUserId)}`, AdminUserDetailResponseV1Schema);
      setAdminUser(response.adminUser);
      setDisplayName(response.adminUser.displayName);
      setStatus(response.adminUser.status);
      setRoles(sortAdminRoles(response.adminUser.roles));
      setNewPassword('');
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [adminUserId, onSessionExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !adminUser) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (roles.length === 0) throw new Error('至少保留一个管理员角色。');
      const request = UpdateAdminUserRequestV1Schema.parse({
        displayName: displayName.trim() || adminUser.displayName,
        status,
        roles: sortAdminRoles(roles),
      });
      const response = await requestJson(`/api/admin/users/${encodeURIComponent(adminUser.id)}`, AdminUserDetailResponseV1Schema, {
        method: 'PATCH',
        body: JSON.stringify(request),
      });
      setAdminUser(response.adminUser);
      setDisplayName(response.adminUser.displayName);
      setStatus(response.adminUser.status);
      setRoles(sortAdminRoles(response.adminUser.roles));
      setMessage('管理员资料已保存。');
      onChanged(response.adminUser);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !adminUser) return;
    setResetting(true);
    setError('');
    setMessage('');
    try {
      const request = UpdateAdminUserRequestV1Schema.parse({ password: newPassword });
      const response = await requestJson(`/api/admin/users/${encodeURIComponent(adminUser.id)}`, AdminUserDetailResponseV1Schema, {
        method: 'PATCH',
        body: JSON.stringify(request),
      });
      setAdminUser(response.adminUser);
      setNewPassword('');
      setMessage('管理员密码已重置；临时密码不会被保存或回显。');
      onChanged(response.adminUser);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setResetting(false);
    }
  }

  if (loading) return <InfoPanel title="正在加载管理员详情" />;
  if (error && !adminUser) return <ErrorPanel message={error} onRetry={() => void load()} />;
  if (!adminUser) return <InfoPanel title="管理员不存在" detail="返回列表后重新选择。" />;

  const isCurrentSessionAdmin = adminUser.id === currentAdmin.id;

  return (
    <section className="student-detail">
      <p className="eyebrow">Admin User Detail</p>
      <h2>{adminUser.loginName}</h2>
      <div className="badge-row">
        {buildAdminUserBadges(adminUser).map((badge) => <Badge key={badge} tone={adminUserBadgeTone(badge)}>{badge}</Badge>)}
        {isCurrentSessionAdmin ? <Badge tone="warning">current-session</Badge> : null}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}

      <form className="stack-form" onSubmit={saveProfile}>
        <h3>Identity</h3>
        <label>loginName<input value={adminUser.loginName} disabled /></label>
        <label>displayName<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={!canWrite} required /></label>
        <label>status
          <select value={status} onChange={(event) => setStatus(event.target.value as AdminManagedUserStatusV1)} disabled={!canWrite}>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </label>
        <AdminUserRoleSelector roles={roles} onChange={setRoles} disabled={!canWrite || saving} />
        <button type="submit" disabled={!canWrite || saving}>{saving ? '保存中…' : '保存管理员资料'}</button>
      </form>

      <section className="detail-section">
        <h3>Permissions</h3>
        <div className="badge-row">
          {adminUser.permissions.map((permission) => <Badge key={permission}>{permission}</Badge>)}
        </div>
      </section>

      <form className="stack-form danger-zone" onSubmit={resetPassword}>
        <h3>Reset Password</h3>
        <p className="muted">Target: {adminUser.loginName} / {adminUser.displayName}</p>
        <label>New temporary password<input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={8} disabled={!canWrite} required /></label>
        <button type="submit" className="danger" disabled={!canWrite || resetting}>{resetting ? '重置中…' : '确认重置管理员密码'}</button>
      </form>

      <section className="detail-section">
        <h3>Audit summary</h3>
        <dl className="key-values single">
          <div><dt>id</dt><dd>{adminUser.id}</dd></div>
          <div><dt>createdAt</dt><dd>{formatAdminDate(adminUser.createdAt)}</dd></div>
          <div><dt>updatedAt</dt><dd>{formatAdminDate(adminUser.updatedAt)}</dd></div>
          <div><dt>lastLoginAt</dt><dd>{formatAdminDate(adminUser.lastLoginAt)}</dd></div>
        </dl>
      </section>
    </section>
  );
}

function AdminUserRoleSelector({
  roles,
  onChange,
  disabled,
}: {
  roles: AdminRoleV1[];
  onChange: (roles: AdminRoleV1[]) => void;
  disabled: boolean;
}) {
  function toggleRole(role: AdminRoleV1) {
    if (roles.includes(role)) {
      if (roles.length === 1) return;
      onChange(sortAdminRoles(roles.filter((candidate) => candidate !== role)));
      return;
    }
    onChange(sortAdminRoles([...roles, role]));
  }

  return (
    <section className="option-grid">
      <h3>Roles</h3>
      {adminRoleOptions.map((role) => (
        <label className="checkbox-label" key={role}>
          <input
            type="checkbox"
            checked={roles.includes(role)}
            disabled={disabled || (roles.length === 1 && roles.includes(role))}
            onChange={() => toggleRole(role)}
          />
          {role}
        </label>
      ))}
      <p className="muted">至少保留一个角色；权限由后端 RBAC 根据角色计算。</p>
    </section>
  );
}

function StudentAccountsPage({
  admin,
  route,
  navigate,
  onSessionExpired,
}: {
  admin: AdminUserV1;
  route: Extract<AdminRoute, { kind: 'students' }>;
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
  onSessionExpired: () => void;
}) {
  const [draftFilters, setDraftFilters] = useState<StudentFilters>(defaultStudentFilters);
  const [filters, setFilters] = useState<StudentFilters>(defaultStudentFilters);
  const [offset, setOffset] = useState(0);
  const [students, setStudents] = useState<AdminStudentV1[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 20;

  const canWrite = admin.permissions.includes('student_account:write');
  const canResetPassword = admin.permissions.includes('student_account:reset_password');
  const canRevokeSessions = admin.permissions.includes('student_account:revoke_session');

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = buildStudentListQuery(filters, limit, offset);
      const response = await requestJson(`/api/admin/students?${query}`, AdminStudentListResponseV1Schema);
      setStudents(response.students);
      setHasMore(response.page.hasMore);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [filters, offset, onSessionExpired]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setFilters(draftFilters);
  }

  function refreshAfterMutation(studentId?: string) {
    void loadStudents();
    if (studentId) navigate(`/admin/students/${studentId}`);
  }

  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="Account operations"
        title="Student Accounts"
        description="B9.19 只实现账号运营主链路：查询、创建、批量创建、资料修改、重置密码和撤销会话。"
        action={(
          <div className="button-row">
            <button type="button" onClick={() => navigate('/admin/students/create')} disabled={!canWrite}>单个创建</button>
            <button type="button" className="ghost" onClick={() => navigate('/admin/students/bulk-create')} disabled={!canWrite}>批量创建</button>
          </div>
        )}
      />

      <section className="admin-card">
        <form className="student-filters" onSubmit={submitFilters}>
          <label>关键字
            <input value={draftFilters.keyword} onChange={(event) => setDraftFilters({ ...draftFilters, keyword: event.target.value })} placeholder="loginName / displayName" />
          </label>
          <label>班级
            <input value={draftFilters.className} onChange={(event) => setDraftFilters({ ...draftFilters, className: event.target.value })} placeholder="2班" />
          </label>
          <label>分组
            <input value={draftFilters.groupName} onChange={(event) => setDraftFilters({ ...draftFilters, groupName: event.target.value })} />
          </label>
          <label>状态
            <select value={draftFilters.status} onChange={(event) => setDraftFilters({ ...draftFilters, status: event.target.value as StudentFilters['status'] })}>
              <option value="">全部</option>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
          <label>改密
            <select value={draftFilters.passwordResetRequired} onChange={(event) => setDraftFilters({ ...draftFilters, passwordResetRequired: event.target.value as StudentFilters['passwordResetRequired'] })}>
              <option value="">全部</option>
              <option value="true">待改密</option>
              <option value="false">已启用</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={draftFilters.lockedOnly} onChange={(event) => setDraftFilters({ ...draftFilters, lockedOnly: event.target.checked })} />
            锁定 only
          </label>
          <button type="submit">应用过滤</button>
        </form>
      </section>

      <div className="student-layout">
        <section className="admin-card student-list-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Students</p>
              <h2>账号列表</h2>
            </div>
            <button className="ghost" type="button" onClick={() => void loadStudents()} disabled={loading}>刷新列表</button>
          </div>
          {error ? <ErrorPanel message={error} onRetry={() => void loadStudents()} /> : null}
          {loading ? <p className="muted">正在加载学生账号…</p> : null}
          {!loading && !error && students.length === 0 ? <InfoPanel title="没有匹配学生" detail="过滤条件保留，可直接调整后重新查询。" /> : null}
          {students.length > 0 ? <StudentTable students={students} navigate={navigate} /> : null}
          <div className="pager">
            <button className="ghost" type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>上一页</button>
            <span>offset {offset}</span>
            <button className="ghost" type="button" disabled={!hasMore || loading} onClick={() => setOffset(offset + limit)}>下一页</button>
          </div>
        </section>

        <aside className="admin-card student-side-panel">
          {route.panel === 'create' ? (
            <CreateStudentPanel canWrite={canWrite} onCreated={(student) => refreshAfterMutation(student.id)} onSessionExpired={onSessionExpired} />
          ) : route.panel === 'bulk-create' ? (
            <BulkCreatePanel canWrite={canWrite} onCompleted={() => refreshAfterMutation()} onSessionExpired={onSessionExpired} />
          ) : route.studentId ? (
            <StudentDetailPanel
              studentId={route.studentId}
              canWrite={canWrite}
              canResetPassword={canResetPassword}
              canRevokeSessions={canRevokeSessions}
              onChanged={(student) => refreshAfterMutation(student.id)}
              onSessionExpired={onSessionExpired}
            />
          ) : (
            <InfoPanel title="选择一个学生账号" detail="从左侧列表点击“查看”，或使用右上角创建入口。" />
          )}
        </aside>
      </div>
    </section>
  );
}

function StudentTable({
  students,
  navigate,
}: {
  students: AdminStudentV1[];
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Login name</th>
            <th>Display name</th>
            <th>班级</th>
            <th>分组</th>
            <th>状态</th>
            <th>改密</th>
            <th>最近登录</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td><strong>{student.loginName}</strong></td>
              <td>{student.displayName}</td>
              <td>{formatNullable(student.className)}</td>
              <td>{formatNullable(student.groupName)}</td>
              <td><Badge tone={student.status === 'active' ? 'ok' : 'danger'}>{student.status}</Badge></td>
              <td><Badge tone={student.passwordResetRequired ? 'warning' : 'ok'}>{student.passwordResetRequired ? '待改密' : '已启用'}</Badge></td>
              <td>{formatAdminDate(student.lastLoginAt)}</td>
              <td><button className="ghost" type="button" onClick={() => navigate(`/admin/students/${student.id}`)}>查看 {student.loginName}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateStudentPanel({
  canWrite,
  onCreated,
  onSessionExpired,
}: {
  canWrite: boolean;
  onCreated: (student: AdminStudentV1) => void;
  onSessionExpired: () => void;
}) {
  const [loginName, setLoginName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [className, setClassName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [passwordResetRequired, setPasswordResetRequired] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const request = CreateAdminStudentRequestV1Schema.parse({
        loginName: loginName.trim(),
        displayName: optionalString(displayName),
        initialPassword,
        className: nullableString(className),
        groupName: nullableString(groupName),
        passwordResetRequired,
      });
      const response = await requestJson('/api/admin/students', AdminStudentDetailResponseV1Schema, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      setInitialPassword('');
      setMessage(`账号已创建：${response.student.loginName}。临时密码不会在提交后保存或回显。`);
      onCreated(response.student);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <p className="eyebrow">Create Student</p>
      <h2>单个创建</h2>
      {!canWrite ? <ForbiddenInline /> : null}
      <form className="stack-form" onSubmit={submit}>
        <label>loginName *<input value={loginName} onChange={(event) => setLoginName(event.target.value)} required /></label>
        <label>displayName<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="默认可与 loginName 一致" /></label>
        <label>initialPassword *<input value={initialPassword} onChange={(event) => setInitialPassword(event.target.value)} type="password" minLength={8} required /></label>
        <label>className<input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="2班" /></label>
        <label>groupName<input value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={passwordResetRequired} onChange={(event) => setPasswordResetRequired(event.target.checked)} /> 要求首次登录改密</label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}
        <button type="submit" disabled={!canWrite || submitting}>{submitting ? '创建中…' : '创建学生'}</button>
      </form>
    </section>
  );
}

function BulkCreatePanel({
  canWrite,
  onCompleted,
  onSessionExpired,
}: {
  canWrite: boolean;
  onCompleted: () => void;
  onSessionExpired: () => void;
}) {
  const [bulkText, setBulkText] = useState(defaultBulkText);
  const [options, setOptions] = useState<BulkOptionsDraft>({
    defaultInitialPassword: '',
    passwordResetRequired: true,
    revokeExistingSessions: true,
    skipExisting: true,
  });
  const [preview, setPreview] = useState<BulkStudentDraft[]>([]);
  const [result, setResult] = useState<BulkCreateAdminStudentsResponseV1 | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function dryParse() {
    setError('');
    setResult(null);
    try {
      setPreview(parseBulkStudentInput(bulkText));
    } catch (caught: unknown) {
      setPreview([]);
      setError(getErrorMessage(caught));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const students = parseBulkStudentInput(bulkText);
      const request = BulkCreateAdminStudentsRequestV1Schema.parse({
        students,
        options: {
          defaultInitialPassword: optionalString(options.defaultInitialPassword),
          passwordResetRequired: options.passwordResetRequired,
          revokeExistingSessions: options.revokeExistingSessions,
          skipExisting: options.skipExisting,
        },
      });
      const response = await requestJson('/api/admin/students/bulk-create', BulkCreateAdminStudentsResponseV1Schema, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      setResult(response);
      setPreview(students);
      onCompleted();
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <p className="eyebrow">Bulk Create</p>
      <h2>批量创建</h2>
      {!canWrite ? <ForbiddenInline /> : null}
      <form className="stack-form" onSubmit={submit}>
        <fieldset className="option-grid">
          <legend>Options</legend>
          <label className="checkbox-label"><input type="checkbox" checked={options.skipExisting} onChange={(event) => setOptions({ ...options, skipExisting: event.target.checked })} /> skipExisting</label>
          <label className="checkbox-label"><input type="checkbox" checked={options.revokeExistingSessions} onChange={(event) => setOptions({ ...options, revokeExistingSessions: event.target.checked })} /> revokeExistingSessions</label>
          <label className="checkbox-label"><input type="checkbox" checked={options.passwordResetRequired} onChange={(event) => setOptions({ ...options, passwordResetRequired: event.target.checked })} /> passwordResetRequired</label>
          <label>Default initial password<input value={options.defaultInitialPassword} onChange={(event) => setOptions({ ...options, defaultInitialPassword: event.target.value })} type="password" placeholder="至少 8 位；也可每行单独提供" /></label>
        </fieldset>
        <label>Input JSON / CSV paste
          <textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} rows={8} />
        </label>
        <div className="button-row">
          <button className="ghost" type="button" onClick={dryParse}>Dry parse locally</button>
          <button type="submit" disabled={!canWrite || submitting}>{submitting ? '提交中…' : '提交批量创建'}</button>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </form>
      {preview.length > 0 ? <BulkPreview students={preview} /> : null}
      {result ? <BulkResult result={result} /> : null}
    </section>
  );
}

function StudentDetailPanel({
  studentId,
  canWrite,
  canResetPassword,
  canRevokeSessions,
  onChanged,
  onSessionExpired,
}: {
  studentId: string;
  canWrite: boolean;
  canResetPassword: boolean;
  canRevokeSessions: boolean;
  onChanged: (student: AdminStudentV1) => void;
  onSessionExpired: () => void;
}) {
  const [student, setStudent] = useState<AdminStudentV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [className, setClassName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [status, setStatus] = useState<AdminStudentStatusV1>('active');
  const [newPassword, setNewPassword] = useState('');
  const [revokeOnReset, setRevokeOnReset] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await requestJson(`/api/admin/students/${encodeURIComponent(studentId)}`, AdminStudentDetailResponseV1Schema);
      setStudent(response.student);
      setDisplayName(response.student.displayName);
      setClassName(response.student.className ?? '');
      setGroupName(response.student.groupName ?? '');
      setStatus(response.student.status);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired, studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || !student) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const request = UpdateAdminStudentRequestV1Schema.parse({
        displayName: displayName.trim(),
        status,
        className: nullableString(className),
        groupName: nullableString(groupName),
      });
      const response = await requestJson(`/api/admin/students/${encodeURIComponent(student.id)}`, AdminStudentDetailResponseV1Schema, {
        method: 'PATCH',
        body: JSON.stringify(request),
      });
      setStudent(response.student);
      setMessage('学生资料已保存。');
      onChanged(response.student);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canResetPassword || !student) return;
    setResetting(true);
    setError('');
    setMessage('');
    try {
      const request = ResetAdminStudentPasswordRequestV1Schema.parse({
        newPassword,
        revokeExistingSessions: revokeOnReset,
      });
      const response = await requestJson(`/api/admin/students/${encodeURIComponent(student.id)}/reset-password`, ResetAdminStudentPasswordResponseV1Schema, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      setStudent(response.student);
      setNewPassword('');
      setMessage(`密码已重置；revokedSessions = ${response.revokedSessions}。临时密码不会被保存或回显。`);
      onChanged(response.student);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setResetting(false);
    }
  }

  async function revokeSessions() {
    if (!canRevokeSessions || !student) return;
    setRevoking(true);
    setError('');
    setMessage('');
    try {
      const response = await requestJson(`/api/admin/students/${encodeURIComponent(student.id)}/revoke-sessions`, RevokeAdminStudentSessionsResponseV1Schema, {
        method: 'POST',
      });
      setMessage(`已撤销所有会话；revokedSessions = ${response.revokedSessions}。`);
    } catch (caught: unknown) {
      if (isUnauthorized(caught)) onSessionExpired();
      else setError(getErrorMessage(caught));
    } finally {
      setRevoking(false);
    }
  }

  if (loading) return <InfoPanel title="正在加载学生详情" />;
  if (error && !student) return <ErrorPanel message={error} onRetry={() => void load()} />;
  if (!student) return <InfoPanel title="学生不存在" detail="返回列表后重新选择。" />;

  return (
    <section className="student-detail">
      <p className="eyebrow">Student Detail</p>
      <h2>{student.loginName}</h2>
      <div className="badge-row">{buildStudentStatusBadges(student).map((badge) => <Badge key={badge}>{badge}</Badge>)}</div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}

      <form className="stack-form" onSubmit={saveProfile}>
        <h3>Identity</h3>
        <label>loginName<input value={student.loginName} disabled /></label>
        <label>displayName<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={!canWrite} /></label>
        <label>className<input value={className} onChange={(event) => setClassName(event.target.value)} disabled={!canWrite} /></label>
        <label>groupName<input value={groupName} onChange={(event) => setGroupName(event.target.value)} disabled={!canWrite} /></label>
        <label>status
          <select value={status} onChange={(event) => setStatus(event.target.value as AdminStudentStatusV1)} disabled={!canWrite}>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </label>
        <button type="submit" disabled={!canWrite || saving}>{saving ? '保存中…' : '保存资料'}</button>
      </form>

      <section className="detail-section">
        <h3>Security</h3>
        <dl className="key-values single">
          <div><dt>passwordResetRequired</dt><dd>{student.passwordResetRequired ? '待改密' : '已启用'}</dd></div>
          <div><dt>passwordChangedAt</dt><dd>{formatAdminDate(student.passwordChangedAt)}</dd></div>
          <div><dt>failedLoginCount</dt><dd>{student.failedLoginCount}</dd></div>
          <div><dt>lockedUntil</dt><dd>{formatAdminDate(student.lockedUntil)}</dd></div>
          <div><dt>lastLoginAt</dt><dd>{formatAdminDate(student.lastLoginAt)}</dd></div>
        </dl>
      </section>

      <form className="stack-form danger-zone" onSubmit={resetPassword}>
        <h3>Confirm Reset Password</h3>
        <p className="muted">Target: {student.loginName} / {formatNullable(student.className)}</p>
        <label>New temporary password<input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={8} disabled={!canResetPassword} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={revokeOnReset} onChange={(event) => setRevokeOnReset(event.target.checked)} disabled={!canResetPassword} /> Revoke existing sessions</label>
        <button type="submit" className="danger" disabled={!canResetPassword || resetting}>{resetting ? '重置中…' : '确认重置密码'}</button>
      </form>

      <section className="danger-zone">
        <h3>Confirm Revoke Sessions</h3>
        <p className="muted">Target: {student.loginName}</p>
        <button type="button" className="danger" onClick={() => void revokeSessions()} disabled={!canRevokeSessions || revoking}>{revoking ? '撤销中…' : '撤销所有会话'}</button>
      </section>

      <section className="detail-section">
        <h3>Audit summary</h3>
        <dl className="key-values single">
          <div><dt>createdBy</dt><dd>{student.createdBy?.displayName ?? '-'}</dd></div>
          <div><dt>createdAt</dt><dd>{formatAdminDate(student.createdAt)}</dd></div>
          <div><dt>updatedAt</dt><dd>{formatAdminDate(student.updatedAt)}</dd></div>
        </dl>
      </section>
    </section>
  );
}

function BulkPreview({ students }: { students: BulkStudentDraft[] }) {
  return (
    <section className="bulk-result">
      <h3>Dry parse result</h3>
      <p className="muted">共解析 {students.length} 行；提交前仍会由 shared v1 schema 与后端再次校验。</p>
      <ul>
        {students.slice(0, 8).map((student) => <li key={student.loginName}>{student.loginName} / {formatNullable(student.className)} / {formatNullable(student.groupName)}</li>)}
      </ul>
    </section>
  );
}

function BulkResult({ result }: { result: BulkCreateAdminStudentsResponseV1 }) {
  return (
    <section className="bulk-result" role="status">
      <h3>Bulk create result</h3>
      <div className="status-grid three">
        <StatusCard tone="ok" title="created" value={`${result.created.length}`} detail={result.created.map((student) => student.loginName).join('、') || '-'} />
        <StatusCard tone="neutral" title="skipped" value={`${result.skipped.length}`} detail={result.skipped.map((item) => `${item.loginName}: ${item.reason}`).join('；') || '-'} />
        <StatusCard tone={result.failed.length > 0 ? 'danger' : 'neutral'} title="failed" value={`${result.failed.length}`} detail={result.failed.map((item) => `${item.loginName}: ${item.error}`).join('；') || '-'} />
      </div>
    </section>
  );
}

function PlaceholderPage({ routeKey }: { routeKey: PlaceholderAdminNavKey }) {
  const item = adminNavigation.find((candidate) => candidate.key === routeKey)!;
  return (
    <section className="admin-page">
      <PageHeader
        eyebrow="Placeholder"
        title={item.label}
        description={item.description}
      />
      <InfoPanel
        title="此功能后续阶段开放"
        detail="当前导航已尽量只暴露可运行页面；若后续新增占位入口，应先补契约和验证再开放写操作。"
      />
    </section>
  );
}

function ForbiddenPanel({
  admin,
  attemptedPath,
  navigate,
  onSwitchAccount,
}: {
  admin: AdminUserV1;
  attemptedPath: string;
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
  onSwitchAccount: () => void;
}) {
  return (
    <section className="admin-page">
      <InfoPanel
        title="403 Forbidden"
        detail={`当前管理员 ${admin.loginName} 没有访问 ${attemptedPath} 所需权限。`}
      />
      <div className="button-row">
        <button type="button" onClick={() => navigate('/admin/system')}>返回 System</button>
        <button className="ghost" type="button" onClick={() => navigate('/admin/login')}>切换账号</button>
      </div>
    </section>
  );
}

function NotFoundPanel({
  path,
  navigate,
}: {
  path: string;
  navigate: (target: string | AdminRoute, options?: { replace?: boolean }) => void;
}) {
  return (
    <section className="admin-page">
      <InfoPanel title="404 Not Found" detail={`未识别的管理路径：${path}`} />
      <button type="button" onClick={() => navigate('/admin/system')}>返回 System</button>
    </section>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}

function StatusCard({
  tone,
  title,
  value,
  detail,
}: {
  tone: 'ok' | 'neutral' | 'danger';
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className={`status-card ${tone}`}>
      <p>{title}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'ok' | 'neutral' | 'warning' | 'danger' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function InfoPanel({ title, detail }: { title: string; detail?: string }) {
  return (
    <section className="info-panel">
      <h2>{title}</h2>
      {detail ? <p>{detail}</p> : null}
    </section>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="info-panel error-panel" role="alert">
      <h2>操作失败</h2>
      <p>{message}</p>
      <button type="button" className="ghost" onClick={onRetry}>重试</button>
    </section>
  );
}

function ForbiddenInline() {
  return <p className="form-error">当前账号没有执行此操作所需权限。</p>;
}

async function requestJson<T>(url: string, parser: Parser<T>, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  });
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    const parsed = ApiErrorResponseV1Schema.safeParse(payload);
    throw new AdminApiError(response.status, parsed.success ? parsed.data.error : `HTTP ${response.status}`);
  }
  return parser.parse(payload);
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getRouteRequiredPermissions(route: AdminRoute): AdminPermissionV1[] {
  const activeKey = getActiveNavKey(route);
  if (!activeKey) return [];
  return adminNavigation.find((item) => item.key === activeKey)?.permissions ?? [];
}

function getActiveNavKey(route: AdminRoute): AdminNavKey | null {
  if (route.kind === 'system') return 'system';
  if (route.kind === 'students') return 'students';
  if (route.kind === 'bank-mappings') return 'bank-mappings';
  if (route.kind === 'import-jobs') return 'import-jobs';
  if (route.kind === 'question-review') return 'question-review';
  if (route.kind === 'audit-logs') return 'audit-logs';
  if (route.kind === 'admin-users') return 'admin-users';
  if (route.kind === 'placeholder') return route.key;
  return null;
}

function normalizeAdminPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/admin';
}

function addOptionalParam(params: URLSearchParams, key: string, value: string) {
  const normalized = value.trim();
  if (normalized) params.set(key, normalized);
}

function addOptionalDateParam(params: URLSearchParams, key: string, value: string) {
  const normalized = value.trim();
  if (!normalized) return;
  const parsed = new Date(normalized);
  params.set(key, Number.isNaN(parsed.getTime()) ? normalized : parsed.toISOString());
}

function optionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function nullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseKeywords(value: string): string[] {
  return value
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function bankMappingBadgeTone(badge: string): 'ok' | 'neutral' | 'warning' | 'danger' {
  if (badge === 'active' || badge === 'visible') return 'ok';
  if (badge === 'review' || badge === 'no-objective-questions') return 'warning';
  if (badge === 'deprecated' || badge === 'hidden-from-students') return 'danger';
  return 'neutral';
}

function importJobBadgeTone(badge: string): 'ok' | 'neutral' | 'warning' | 'danger' {
  if (badge === 'succeeded') return 'ok';
  if (badge === 'failed' || badge === 'has-errors') return 'danger';
  if (badge === 'queued' || badge === 'running' || badge === 'reset-requested') return 'warning';
  return 'neutral';
}

function questionReviewBadgeTone(badge: string): 'ok' | 'neutral' | 'warning' | 'danger' {
  if (badge === 'resolved' || badge === 'practice-enabled') return 'ok';
  if (badge === 'ignored' || badge === 'low') return 'neutral';
  if (badge === 'medium' || badge === 'high' || badge === 'open') return 'warning';
  if (badge === 'blocking' || badge === 'excluded-from-practice') return 'danger';
  if (badge.endsWith('open flag') || badge.endsWith('open flags')) return 'warning';
  return 'neutral';
}

function auditLogBadgeTone(badge: string): 'ok' | 'neutral' | 'warning' | 'danger' {
  if (badge === 'success') return 'ok';
  if (badge === 'failure') return 'danger';
  if (badge === 'system-actor') return 'warning';
  return 'neutral';
}

function adminUserBadgeTone(badge: string): 'ok' | 'neutral' | 'warning' | 'danger' {
  if (badge === 'active') return 'ok';
  if (badge === 'disabled') return 'danger';
  if (badge === 'super_admin') return 'warning';
  return 'neutral';
}

function sortAdminRoles(roles: readonly AdminRoleV1[]): AdminRoleV1[] {
  return [...new Set(roles)].sort(
    (left, right) => adminRoleOptions.indexOf(left) - adminRoleOptions.indexOf(right),
  );
}

function formatImportJobProgress(job: AdminImportJobV1): string {
  return `${job.progress.phase} ${job.progress.current}/${job.progress.total}`;
}

function formatImportJobSummary(job: AdminImportJobV1): string {
  const summary = job.summary;
  const parts = [
    ['questions', summary.questions],
    ['options', summary.options],
    ['skipped', summary.skippedOptions],
    ['mappings', summary.bankMappings],
  ]
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([label, value]) => `${label}: ${value}`);
  return parts.length > 0 ? parts.join(' · ') : '-';
}

function formatJsonBlock(value: unknown): string {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function readNextPathFromLocation(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) return null;
  if (!next.startsWith('/admin') || next.startsWith('/admin/login')) return null;
  return next;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 401;
}

function mapLoginError(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 401) return '登录失败：账号或密码不正确。';
    if (error.status === 403) return '管理员账号已禁用。';
    if (error.status === 423) return '管理员账号临时锁定，请稍后重试。';
    return error.message;
  }
  return getErrorMessage(error);
}

function mapBankMappingError(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 409) return '保存失败：题库 mapping version 已变化，请刷新详情后重试。';
    if (error.status === 422) return `保存失败：${error.message}`;
    if (error.status === 403) return '保存失败：当前账号缺少题库整理或发布权限。';
  }
  return getErrorMessage(error);
}

function mapImportJobError(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 403) return `导入任务被拒绝：${error.message}`;
    if (error.status === 409) return `导入任务状态冲突：${error.message}`;
    if (error.status === 422) return `导入任务未开放：${error.message}`;
  }
  return getErrorMessage(error);
}

function mapQuestionReviewError(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 403) return '质检操作失败：当前账号缺少题目质检写入权限。';
    if (error.status === 404) return `质检操作失败：${error.message}`;
    if (error.status === 409) return `质检操作失败：${error.message}，请刷新详情后重试。`;
    if (error.status === 400) return `质检请求无效：${error.message}`;
  }
  return getErrorMessage(error);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toBulkStudentDraft(value: unknown): BulkStudentDraft {
  if (!isRecord(value)) throw new Error('学生条目必须是对象。');
  const loginName = readRequiredString(value.loginName, 'loginName');
  return {
    loginName,
    displayName: readOptionalString(value.displayName),
    initialPassword: readOptionalString(value.initialPassword),
    className: readOptionalNullableString(value.className),
    groupName: readOptionalNullableString(value.groupName),
  };
}

function parseStudentCsv(input: string): BulkStudentDraft[] {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const firstCells = splitCsvLine(lines[0]).map((cell) => cell.trim());
  const hasHeader = firstCells.includes('loginName');
  const header = hasHeader ? firstCells : ['loginName', 'displayName', 'className', 'groupName', 'initialPassword'];
  const bodyLines = hasHeader ? lines.slice(1) : lines;
  return bodyLines.map((line) => {
    const cells = splitCsvLine(line);
    const record: Record<string, unknown> = {};
    header.forEach((key, index) => { record[key] = cells[index] ?? ''; });
    return toBulkStudentDraft(record);
  });
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map((cell) => cell.trim());
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} 不能为空。`);
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readOptionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return readOptionalString(value);
}
