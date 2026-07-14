# CI Gate And Deployment Evidence

状态日期：**2026-07-15**

本文是 B9.3 的 CI / branch protection / deployment checklist 证据模板。它用于把“是否已经可以公开生产发布”的判断从口头确认变成可审计记录。

当前结论：

- 本地质量门以 `npm run verify:docker` 为准。
- 本地 PostgreSQL 备份恢复演练以 `npm run ops:backup-restore:docker` 为准。
- 远端 GitHub Actions 首次验收和 branch protection 仍需在分支推送/PR 创建后由项目 owner 记录。
- 在远端 CI 与 branch protection 未确认前，不应把当前后端状态视为公开生产可发布。

## 1. Current Local Gate Evidence

| Gate | Command | Expected result | Last local result |
| --- | --- | --- | --- |
| Shared build | `npm run build:shared` | PASS | B9.7 local PASS |
| Shared contracts | `npm run test -w @bkyexam-practice/shared` | 2 files / 26 tests PASS | B9.7 local PASS |
| API route/unit | `npm run test -w @bkyexam-practice/api` | 55 files / 407 tests PASS | B9.7 local PASS |
| Typecheck | `npm run typecheck` | shared/api/web/e2e TS PASS | B9.7 local PASS |
| Full repository gate | `npm run verify:docker` | 59 Vitest files / 464 tests + typecheck + build + 3 Playwright + 1 PostgreSQL integration PASS | B9.7 local PASS |
| Backup restore drill | `npm run ops:backup-restore:docker` | 10 migrations + pg_dump + restore + count compare PASS | B9.7 local PASS |

B9.7 最新本地证据：

- `npm run verify:docker`：通过，包含 shared 26、API 407、Web 31，共 464 个 Vitest 测试；Playwright 3 项；PostgreSQL integration 1 项。
- `npm run ops:backup-restore:docker`：通过，`0010_student_identity_security.sql` 已纳入 migration drill，source/restored count 一致。
- Web build artifact：`dist/assets/index-9CEFB64M.js` 约 `320.47 kB`（gzip `92.79 kB`），CSS `dist/assets/index-CC2OWsF5.css` 约 `20.26 kB`（gzip `4.98 kB`）。

## 2. Remote CI Evidence Template

> 远端仓库当前已存在 `.github/workflows/quality.yml`，包含 `quality` 与 `postgres-integration` jobs。以下信息需在 push/PR 后补齐。

```yaml
remote_ci_evidence:
  repository: https://github.com/Fuck-GH-Admin/bkyexam-practice-platform
  branch:
  commit:
  pull_request:
  workflow_file: .github/workflows/quality.yml
  workflow_run_url:
  checked_at:
  checked_by:

  jobs:
    quality:
      status: PASS/FAIL/PENDING
      evidence_url:
      notes:
    postgres-integration:
      status: PASS/FAIL/PENDING
      evidence_url:
      notes:

  required_checks:
    quality: ENABLED/NOT_ENABLED
    postgres-integration: ENABLED/NOT_ENABLED

  branch_protection:
    default_branch:
    direct_push_blocked: YES/NO
    required_pull_request: YES/NO
    required_review_count:
    required_status_checks:
      - quality
      - postgres-integration
    admin_enforcement: YES/NO/UNKNOWN

  decision:
    production_gate: PASS/FAIL
    blocker_summary:
```

## 3. Deployment Checklist Evidence Template

```yaml
deployment_evidence:
  release:
    date:
    operator:
    git_commit:
    previous_git_commit:
    current_migration:
    backup_file:
    backup_sha256:

  preflight:
    npm_run_verify_docker: PASS/FAIL
    ops_backup_restore_docker: PASS/FAIL
    remote_ci: PASS/FAIL
    branch_protection_checked: YES/NO
    identity_security_strategy_checked: YES/NO
    rollback_plan_confirmed: YES/NO

  postflight:
    api_health: PASS/FAIL
    api_readiness: PASS/FAIL
    api_metrics: PASS/FAIL
    db_smoke: PASS/FAIL
    admin_login: PASS/FAIL
    student_login: PASS/FAIL
    create_practice_session: PASS/FAIL

  observability:
    request_id_in_response: YES/NO
    http_request_log_fields_checked: YES/NO
    metrics_total_requests_increasing: YES/NO
    metrics_success_and_error_buckets_checked: YES/NO
    alert_route_or_external_monitor_checked: YES/NO
```

## 4. Observability Smoke Criteria

最小 smoke 标准：

1. 任意 API response 带 `x-request-id`。
2. 未捕获错误返回 `{ error, requestId }`，并写结构化 error log。
3. request 完成时 structured log 至少包含：
   - `event=http_request`
   - `requestId`
   - `method`
   - `route`
   - `statusCode`
   - `statusBucket`
   - `durationMs`
4. `GET /api/health/metrics` 返回 shared v1 `MetricsResponseV1Schema`：
   - `http.totalRequests`
   - HTTP status buckets
   - per-route request count
   - per-route average duration
   - process memory summary
5. 在正式监控系统未接入前，`/api/health/metrics` 只能作为 smoke/debug endpoint，不替代 Prometheus、日志聚合和告警。
