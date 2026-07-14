# CI Gate And Deployment Evidence

状态日期：**2026-07-15**

本文是 B9.3 创建、B9.11 扩展的 CI / branch protection / deployment checklist 证据模板。它用于把“是否已经可以公开生产发布”的判断从口头确认变成可审计记录。

当前结论：

- 本地质量门以 `npm run verify:docker` 为准。
- 本地 PostgreSQL 备份恢复演练以 `npm run ops:backup-restore:docker` 为准。
- B9.11 新增 `npm run ops:deployment-evidence`，可以生成 deployment evidence 模板并对完整证据执行 production-ready 校验。
- B9.12 已推送 `codex/practice-platform-stabilization`，并完成 GitHub Actions `Quality` 首次远端验收。
- B9.13 已创建 PR #2，并启用 `main` branch protection / required checks：`quality` 与 `postgres-integration`。
- 当前 PR CI 已跑绿，但仍需 review；目标环境 production gate / deployment smoke / 性能压测证据仍缺失。
- 因此当前只适合继续 staging/远端验证；不应把当前后端状态视为公开生产可发布。

## 1. Current Local Gate Evidence

| Gate | Command | Expected result | Last local result |
| --- | --- | --- | --- |
| Shared build | `npm run build:shared` | PASS | B9.8 local PASS |
| Shared contracts | `npm run test -w @bkyexam-practice/shared` | 2 files / 26 tests PASS | B9.8 local PASS |
| API route/unit | `npm run test -w @bkyexam-practice/api` | 58 files / 431 tests PASS | B9.11 local PASS |
| Typecheck | `npm run typecheck` | shared/api/web/e2e TS PASS | B9.8 local PASS |
| Full repository gate | `npm run verify:docker` | 62 Vitest files / 488 tests + typecheck + build + 3 Playwright + 1 PostgreSQL integration PASS | B9.11 local PASS |
| Backup restore drill | `npm run ops:backup-restore:docker` | 11 migrations + pg_dump + restore + count compare PASS | B9.11 local PASS |
| Production gate dry-run | `npm run ops:production-gate -- --skip-db` | JSON report and exit 0 with production-safe fixture env | B9.10 local PASS |
| Legacy student password migration tests | `npm run test -w @bkyexam-practice/api -- legacyStudentPasswordMigration` | dry-run/apply/credential output/CLI transaction PASS | B9.9 local PASS |
| Deployment evidence CLI | `npm run ops:deployment-evidence -- --template` | JSON evidence template PASS | B9.11 local PASS |

B9.9/B9.10/B9.11 最新本地证据：

- `npm run verify:docker`：通过，包含 shared 26、API 431、Web 31，共 488 个 Vitest 测试；Playwright 3 项；PostgreSQL integration 1 项。
- `npm run ops:backup-restore:docker`：通过，`0011_admin_identity_security.sql` 已纳入 migration drill，source/restored count 一致。
- `npm run ops:production-gate -- --skip-db`：在 production-safe fixture env 下通过；真实发布仍必须连接目标 `DATABASE_URL` 跑完整 gate。
- `npm run test -w @bkyexam-practice/api -- legacyStudentPasswordMigration`：通过，迁移工具不在 JSON/audit 输出明文临时密码。
- `npm run ops:deployment-evidence -- --template`：通过，可生成待填写 production deployment evidence JSON。
- Web build artifact：`dist/assets/index-9CEFB64M.js` 约 `320.47 kB`（gzip `92.79 kB`），CSS `dist/assets/index-CC2OWsF5.css` 约 `20.26 kB`（gzip `4.98 kB`）。

## 1.1 B9.12 Remote Publication Snapshot

2026-07-15 在用户确认后推送当前工作分支，并通过 `gh` 与远端 Git 查询得到：

| Item | Result |
| --- | --- |
| Repository | `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform` |
| Default branch | `main` |
| Remote branch | `codex/practice-platform-stabilization` exists |
| Remote branch commit | `96f0dc090adb44dba21ba65354af823cafd48d44` |
| Remote workflow | `Quality` active, workflow id `313324672`, path `.github/workflows/quality.yml` |
| Workflow run | `29373386558`, success, `2026-07-14T22:33:35Z` -> `2026-07-14T22:35:03Z` |
| Workflow run URL | `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29373386558` |
| Job `quality` | success, `2026-07-14T22:33:37Z` -> `2026-07-14T22:35:02Z`, `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29373386558/job/87221554824` |
| Job `postgres-integration` | success, `2026-07-14T22:33:39Z` -> `2026-07-14T22:34:15Z`, `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29373386558/job/87221554819` |
| Pull request | none for `codex/practice-platform-stabilization` |
| `main` branch protection | not protected; GitHub API returned `Branch not protected` |

结论：远端 CI 首次验收已对 commit `96f0dc0` 跑绿，`remote CI absent` 不再是当前分支的 blocker。当前仍 **不能** 视为公开生产可发布，因为 branch protection / required checks、PR review、目标环境 production gate、deployment smoke、外部监控与性能压测证据仍未闭环。

## 1.2 B9.13 PR / Branch Protection Snapshot

2026-07-15 在用户确认后创建 PR 并配置 `main` branch protection：

| Item | Result |
| --- | --- |
| Pull request | `#2`，`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/pull/2` |
| PR base/head | `main` <- `codex/practice-platform-stabilization` |
| PR head commit | `07a7892b0a6ea5e50fdeb5f4ec60090bdd54dc84` |
| PR state | open |
| PR mergeability | `MERGEABLE` |
| PR review decision | `REVIEW_REQUIRED` |
| PR workflow run | `29376220149`, success, `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29376220149` |
| Job `quality` | success, `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29376220149/job/87230129856` |
| Job `postgres-integration` | success, `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29376220149/job/87230129819` |
| `main` branch protection | enabled |
| Required status checks | `quality`, `postgres-integration` |
| Strict required checks | enabled |
| Required approving reviews | `1` |
| Dismiss stale reviews | enabled |
| Admin enforcement | enabled |
| Required conversation resolution | enabled |
| Force pushes / deletions | disabled |

结论：远端 CI、PR 和 branch protection 已完成第一轮闭环。当前仍 **不能** 视为公开生产可发布，因为 review、目标环境 production gate、legacy migration closure、rollback plan、deployment smoke、外部监控和性能压测证据仍未闭环。

## 2. Remote CI Evidence Template

> 远端仓库当前已存在 `.github/workflows/quality.yml`，包含 `quality` 与 `postgres-integration` jobs。B9.12/B9.13 首次远端运行见上方快照；后续每个 release candidate 都应重新填写以下模板，以最新 commit 的 run 为准。

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
