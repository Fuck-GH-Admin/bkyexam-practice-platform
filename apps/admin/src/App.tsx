import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import {
  AdminLoginResponseV1Schema,
  AdminLogoutResponseV1Schema,
  AdminMeResponseV1Schema,
  AdminStudentDetailResponseV1Schema,
  AdminStudentListResponseV1Schema,
  AdminSystemStatusResponseV1Schema,
  ApiErrorResponseV1Schema,
  BulkCreateAdminStudentsRequestV1Schema,
  BulkCreateAdminStudentsResponseV1Schema,
  CreateAdminStudentRequestV1Schema,
  ResetAdminStudentPasswordRequestV1Schema,
  ResetAdminStudentPasswordResponseV1Schema,
  RevokeAdminStudentSessionsResponseV1Schema,
  UpdateAdminStudentRequestV1Schema,
  type AdminPermissionV1,
  type AdminStudentStatusV1,
  type AdminStudentV1,
  type AdminSystemStatusResponseV1,
  type AdminUserV1,
  type BulkCreateAdminStudentItemV1,
  type BulkCreateAdminStudentsResponseV1,
} from '@bkyexam-practice/shared';

type Parser<T> = { parse: (payload: unknown) => T };

type AdminNavKey = 'system' | 'students' | 'bank-mappings' | 'import-jobs' | 'question-review' | 'audit-logs' | 'admin-users';
type ImplementedAdminNavKey = 'system' | 'students';
type PlaceholderAdminNavKey = Exclude<AdminNavKey, ImplementedAdminNavKey>;

type AdminRoute =
  | { kind: 'login' }
  | { kind: 'system' }
  | { kind: 'students'; studentId?: string; panel?: 'create' | 'bulk-create' }
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

const defaultStudentFilters: StudentFilters = {
  keyword: '',
  className: '',
  groupName: '',
  status: 'active',
  passwordResetRequired: '',
  lockedOnly: false,
};

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
    implemented: false,
    description: '题库整理 UI 后续阶段开放；当前后端 API 已存在。',
  },
  {
    key: 'import-jobs',
    label: 'Import Jobs',
    path: '/admin/import-jobs',
    permissions: ['import_job:read'],
    implemented: false,
    description: '导入任务 UI 后续阶段开放；B9.19 不开放 reset/cancel/retry。',
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
