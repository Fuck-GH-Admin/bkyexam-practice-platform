# Production Operations Runbook

状态日期：**2026-07-14**

本文记录 B9.2 的生产运维演练边界。它不是最终 SRE 手册；目标是在进入正式前端前，先把备份、恢复、迁移、部署验收和 CI 保护的最小可执行流程固定下来。

## 1. Local Backup / Restore Drill

仓库提供隔离 Docker PostgreSQL 演练：

```powershell
npm run ops:backup-restore:docker
```

该脚本会：

1. 启动 `postgres-test`。
2. 对空 `bkyexam_test` 执行全部 migration。
3. 写入最小运维 fixture，覆盖：
   - classifications
   - bank_mappings
   - students
   - questions
   - question_options
   - practice_attempts
   - wrong_questions
   - student_learning_goals
   - question_bookmarks
4. 使用容器内 `pg_dump` 导出 plain SQL backup。
5. 创建 `bkyexam_restore_test`。
6. 将 backup restore 到 `bkyexam_restore_test`。
7. 比较源库和恢复库关键表行数。
8. 清理恢复库和临时容器。

演练产物写入：

```text
artifacts/ops/backup-restore-drill/<timestamp>/bkyexam_test.sql
```

`artifacts/` 不提交 Git。该演练只验证 schema + 最小数据的可备份/可恢复能力，不替代生产数据量级恢复演练。

## 2. Production Backup Procedure

生产备份建议使用 custom format，并将输出写到受限目录：

```bash
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="/var/backups/bkyexam"
mkdir -p "$backup_dir"
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file "$backup_dir/bkyexam-$timestamp.dump"
sha256sum "$backup_dir/bkyexam-$timestamp.dump" > "$backup_dir/bkyexam-$timestamp.dump.sha256"
```

最低要求：

- 备份文件权限只允许运维用户读取。
- 备份完成后记录：
  - 时间。
  - Git commit。
  - migration current file。
  - 文件大小。
  - SHA-256。
  - 保存位置。
- 至少保留一份异机或对象存储副本。
- 不把 backup 复制到仓库目录或聊天记录。

## 3. Restore Drill Procedure

恢复必须先在隔离数据库演练，不直接覆盖生产库：

```bash
createdb bkyexam_restore_test
pg_restore \
  --dbname "postgres://user:password@host:5432/bkyexam_restore_test" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "/var/backups/bkyexam/bkyexam-YYYYmmddTHHMMSSZ.dump"
```

恢复后执行：

```bash
DATABASE_URL="postgres://user:password@host:5432/bkyexam_restore_test" \
  npm run db:smoke -w @bkyexam-practice/api
```

若要做 API 级验收，应以恢复库启动一套临时 API：

```bash
USE_DATABASE=true \
DATABASE_URL="postgres://user:password@host:5432/bkyexam_restore_test" \
COOKIE_SECRET="restore-drill-only" \
npm run start -w @bkyexam-practice/api
```

然后检查：

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/health/readiness
```

恢复演练通过标准：

- backup checksum 可校验。
- restore 命令成功。
- `db:smoke` 关键表可读。
- `/api/health/readiness` 返回 `ok=true`。
- 关键业务表计数与备份前记录一致或在可解释范围内。

## 4. Migration Rollback / Forward-fix Policy

当前 migration 策略是 **forward-only**。

不在同一 release 中临时手写反向 SQL，除非已经在隔离库演练并通过审查。失败处理优先级：

1. **迁移未提交/事务已回滚**：修复 migration 或代码后重新部署。
2. **迁移已成功但应用失败**：优先 forward-fix 新 migration 或回滚应用代码到兼容版本。
3. **迁移破坏数据且无法 forward-fix**：停止写入，使用最近 backup restore 到新库，切换连接。

每次生产 migration 前：

- 执行 `npm run verify:docker`。
- 执行或确认最近一次 backup。
- 记录当前 Git commit。
- 记录当前最新 migration 文件。
- 在 staging/restore-drill DB 上先跑 `npm run db:migrate -w @bkyexam-practice/api`。

每次生产 migration 后：

- 检查 `/api/health/readiness`。
- 执行 `npm run db:smoke -w @bkyexam-practice/api`。
- 抽查登录、题库列表、创建练习或只读核心 API。
- 记录实际执行时间和结果。

## 5. Deployment Checklist Validation

一次生产发布至少记录以下项目：

```text
Release:
  date:
  operator:
  git_commit:
  previous_git_commit:
  current_migration:
  backup_file:
  backup_sha256:

Preflight:
  npm run verify:docker: PASS/FAIL
  npm run ops:backup-restore:docker: PASS/FAIL
  remote_ci: PASS/FAIL
  branch_protection_checked: YES/NO
  identity_security_strategy_checked: YES/NO

Deploy:
  npm ci: PASS/FAIL
  npm run build: PASS/FAIL
  npm run db:migrate -w @bkyexam-practice/api: PASS/FAIL
  service_restart: PASS/FAIL

Postflight:
  /api/health: PASS/FAIL
  /api/health/readiness: PASS/FAIL
  /api/health/metrics: PASS/FAIL
  db:smoke: PASS/FAIL
  admin_login: PASS/FAIL
  student_login: PASS/FAIL
  student_password_change: PASS/FAIL
  create_practice_session: PASS/FAIL
  rollback_plan_confirmed: YES/NO
```

失败时不要继续做 UI 或新功能变更；先记录失败阶段、日志位置、使用的 backup、下一步处理方式。

## 6. Observability Smoke

B9.3 起，API 进程内提供最小可观测性 smoke：

- request 完成时写结构化 `http_request` log，可检索字段包括 `requestId`、`method`、`route`、`statusCode`、`statusBucket`、`durationMs`、`remoteAddress` 和 `userAgent`。
- `GET /api/health/metrics` 返回 shared v1 metrics payload，包含 total requests、status buckets、per-route counters、平均耗时和进程内存摘要。
- `/api/health/metrics` 只用于部署后 smoke/debug；生产监控仍需后续接入日志聚合、外部 metrics store 和 alerting。

发布后最小检查：

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/health/readiness
curl -fsS http://127.0.0.1:3000/api/health/metrics
```

验收标准：

- `x-request-id` 在 response header 中存在。
- readiness `ok=true`。
- metrics `http.totalRequests` 会随请求增长。
- metrics status bucket 能看到 success；故意请求不存在路径后能看到 clientError 增长。
- 应用日志中存在 `event=http_request` 字段。

## 7. Remote CI And Branch Protection Gate

远端仓库启用后，需要记录首次 CI 验收：

- `unit/typecheck/build/Playwright` job 通过。
- PostgreSQL service integration job 通过。
- required checks 包含上述两个 job。
- 默认分支禁止直接 push。
- PR 需要至少一次 review 或由项目 owner 明确豁免。

该项当前仍需实际远端仓库状态确认；本地只提供流程定义。B9.3 的可填写模板见 [`ci-gate-evidence.md`](ci-gate-evidence.md)。
