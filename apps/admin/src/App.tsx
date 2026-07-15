import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import {
  AdminBankMappingDetailResponseV1Schema,
  AdminBankMappingListResponseV1Schema,
  AdminImportJobDetailResponseV1Schema,
  AdminImportJobErrorReportResponseV1Schema,
  AdminImportJobListResponseV1Schema,
  AdminLoginResponseV1Schema,
  AdminLogoutResponseV1Schema,
  AdminMeResponseV1Schema,
  AdminStudentDetailResponseV1Schema,
  AdminStudentListResponseV1Schema,
  AdminSystemStatusResponseV1Schema,
  ApiErrorResponseV1Schema,
  BulkUpdateAdminBankMappingStatusRequestV1Schema,
  BulkUpdateAdminBankMappingStatusResponseV1Schema,
  BulkCreateAdminStudentsRequestV1Schema,
  BulkCreateAdminStudentsResponseV1Schema,
  CreateAdminImportJobRequestV1Schema,
  CreateAdminImportJobResponseV1Schema,
  CreateAdminStudentRequestV1Schema,
  ResetAdminStudentPasswordRequestV1Schema,
  ResetAdminStudentPasswordResponseV1Schema,
  RevokeAdminStudentSessionsResponseV1Schema,
  UpdateAdminBankMappingRequestV1Schema,
  UpdateAdminStudentRequestV1Schema,
  type AdminBankMappingDetailV1,
  type AdminBankMappingListItemV1,
  type AdminBankMappingStatusV1,
  type AdminImportJobErrorSummaryV1,
  type AdminImportJobStatusV1,
  type AdminImportJobV1,
  type AdminPermissionV1,
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
type ImplementedAdminNavKey = 'system' | 'students' | 'bank-mappings' | 'import-jobs';
type PlaceholderAdminNavKey = Exclude<AdminNavKey, ImplementedAdminNavKey>;

type AdminRoute =
  | { kind: 'login' }
  | { kind: 'system' }
  | { kind: 'students'; studentId?: string; panel?: 'create' | 'bulk-create' }
  | { kind: 'bank-mappings'; bankId?: string }
  | { kind: 'import-jobs'; jobId?: string; panel?: 'create' }
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

const defaultImportSourceDir = 'C:\\Users\\Bot\\Bot\\BKYExam\\questionbank';

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
    description: '导入任务 dry-run、历史、详情和错误摘要；true import/reset/cancel/retry 后置。',
  },
  {
    key: 'question-review',
    label: 'Question Review',
    path: '/admin/question-review',
    permissions: ['question_review:read'],
    implemented: false,
    description: '题目质检工作台后续阶段开放；当前只保留入口占位。',
  },
  {
    key: 'audit-logs',
    label: 'Audit Logs',
    path: '/admin/audit-logs',
    permissions: ['audit_log:read'],
    implemented: false,
    description: '审计日志读取 UI 后续阶段开放。',
  },
  {
    key: 'admin-users',
    label: 'Admin Users',
    path: '/admin/users',
    permissions: ['admin_user:manage'],
    implemented: false,
    description: '管理员账号管理 UI 后续阶段开放。',
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
          <li>true import write gate 仍只在后端环境变量中控制；B9.19 不提供 reset/cancel/retry。</li>
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
        description="B9.22 只做 dry-run、历史、详情和错误摘要；true import write/reset/cancel/retry 继续后置。"
        action={(
          <div className="button-row">
            <button type="button" onClick={() => navigate('/admin/import-jobs/create')} disabled={!canCreate}>创建 dry-run</button>
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
          {!loading && !error && jobs.length === 0 ? <InfoPanel title="没有匹配导入任务" detail="当前只开放 dry-run 与历史查看。" /> : null}
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
            <ImportJobDetailPanel jobId={route.jobId} onSessionExpired={onSessionExpired} />
          ) : (
            <InfoPanel title="选择一个导入任务" detail="从左侧列表查看 dry-run summary、progress 和 error report；写入导入控制暂不开放。" />
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
  const [batchSize, setBatchSize] = useState('1000');
  const [generateMappings, setGenerateMappings] = useState(true);
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
        mode: 'dry_run',
        options: {
          batchSize: Number(batchSize),
          resetBeforeImport: false,
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
      <h2>创建 dry-run</h2>
      <p className="muted">此表单固定 `mode=dry_run` 和 `resetBeforeImport=false`；true import 写入、reset、cancel、retry 后续再设计。</p>
      {!canCreate ? <ForbiddenInline /> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {createdJob ? <p className="form-success" role="status">dry-run 已创建：{createdJob.status} / {createdJob.id}</p> : null}
      <form className="stack-form" onSubmit={submit}>
        <label>sourceDir
          <input value={sourceDir} onChange={(event) => setSourceDir(event.target.value)} disabled={!canCreate || submitting} />
        </label>
        <label>batchSize
          <input value={batchSize} onChange={(event) => setBatchSize(event.target.value)} inputMode="numeric" disabled={!canCreate || submitting} />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={generateMappings} onChange={(event) => setGenerateMappings(event.target.checked)} disabled={!canCreate || submitting} />
          generateMappings
        </label>
        <button type="submit" disabled={!canCreate || submitting}>{submitting ? '创建中…' : '提交 dry-run'}</button>
      </form>
    </section>
  );
}

function ImportJobDetailPanel({
  jobId,
  onSessionExpired,
}: {
  jobId: string;
  onSessionExpired: () => void;
}) {
  const [job, setJob] = useState<AdminImportJobV1 | null>(null);
  const [errorReport, setErrorReport] = useState<AdminImportJobErrorSummaryV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [error, setError] = useState('');

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
      <div className="button-row">
        <button className="ghost" type="button" onClick={() => void load()}>刷新详情</button>
        <button className="ghost" type="button" onClick={() => void loadErrors()} disabled={loadingErrors}>{loadingErrors ? '读取中…' : '查看 error report'}</button>
      </div>

      <section className="detail-section">
        <h3>Progress / summary</h3>
        <dl className="key-values single">
          <div><dt>jobId</dt><dd>{job.id}</dd></div>
          <div><dt>sourceDir</dt><dd>{job.sourceDir}</dd></div>
          <div><dt>progress</dt><dd>{formatImportJobProgress(job)}</dd></div>
          <div><dt>summary</dt><dd>{formatImportJobSummary(job)}</dd></div>
          <div><dt>questionTypes</dt><dd>{job.summary.questionTypes ? Object.entries(job.summary.questionTypes).map(([type, count]) => `${type}: ${count}`).join('；') : '-'}</dd></div>
        </dl>
      </section>

      <section className="detail-section">
        <h3>Options / lifecycle</h3>
        <dl className="key-values single">
          <div><dt>batchSize</dt><dd>{job.options.batchSize}</dd></div>
          <div><dt>generateMappings</dt><dd>{String(job.options.generateMappings)}</dd></div>
          <div><dt>resetBeforeImport</dt><dd>{String(job.options.resetBeforeImport)}（UI 不开放 reset 写入）</dd></div>
          <div><dt>createdBy</dt><dd>{job.createdBy?.displayName ?? '-'}</dd></div>
          <div><dt>createdAt</dt><dd>{formatAdminDate(job.createdAt)}</dd></div>
          <div><dt>startedAt</dt><dd>{formatAdminDate(job.startedAt)}</dd></div>
          <div><dt>finishedAt</dt><dd>{formatAdminDate(job.finishedAt)}</dd></div>
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
        detail="B9.19 只交付 Admin Login、System Status 与 Student Accounts。此入口用于确认导航边界，不开放半成品写操作。"
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
    if (error.status === 409) return '已有导入任务正在运行，请稍后刷新列表。';
    if (error.status === 422) return `导入任务未开放：${error.message}`;
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
