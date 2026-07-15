# B9.28 Import Jobs durable worker / heartbeat / stuck recovery

状态日期：**2026-07-16**

目标：把 B9.27 的 request 内同步 runner 推进为生产可用的 queued execution model，让 Import Jobs 可以在 API 进程内由后台 worker 拾取、持续 heartbeat，并对 stale running job 做恢复。

## 1. 本阶段结论

```text
queued import job creation = implemented
API production execution mode = queued when worker enabled
worker claim = implemented
heartbeat = implemented
stuck recovery = implemented
cancel/retry compatibility = preserved
stage-level realtime progress stream = deferred
external durable queue service = deferred
```

## 2. 行为语义

### Create

`POST /api/admin/import-jobs` 在生产 `USE_DATABASE=true` 且 `ADMIN_IMPORT_WORKER_ENABLED=true` 时不再在 request 内同步跑导入，而是：

1. 校验 RBAC、source allowlist、`ADMIN_IMPORT_ENABLE_WRITE` 与 `resetBeforeImport` 权限。
2. 创建 `status=queued` 的 `import_jobs` 行。
3. 立即返回 job detail。
4. 后台 worker 轮询并 claim queued job。

测试和内存模式默认仍可使用 inline execution，以保持快速单元测试和现有 route 行为；`buildApp` 新增 `adminImportExecutionMode`，生产 `index.ts` 会在 worker 启用时传入 `queued`。

### Claim

worker 使用 repository 的 `claimNextImportJob({ workerId })` 原子领取最早的 queued job：

- `queued -> running`
- `progress.phase -> running`
- `started_at = now()`（如果为空）
- `worker_id = 当前 workerId`
- `heartbeat_at = now()`

PostgreSQL 实现使用 `FOR UPDATE SKIP LOCKED`，并继续保持同 kind 只允许一个 active job。

### Heartbeat

worker 在执行前和执行中定期调用：

```ts
repository.heartbeatImportJob({ jobId, workerId })
```

只有 `status=running` 且 `worker_id` 匹配时才更新 `heartbeat_at`。如果 heartbeat 更新失败，runner 的 cancellation checkpoint 会把它视作 abort。

### Stuck recovery

worker 每轮先执行：

```ts
repository.recoverStaleImportJobs({ staleAfterMs })
```

PostgreSQL 使用：

```sql
COALESCE(heartbeat_at, started_at, created_at) < now() - staleAfter
```

命中的 running job 会被标记为：

- `status=failed`
- `progress.phase=failed`
- `error_summary=[{ message: "Import job heartbeat timed out" }]`
- `finished_at=now()`
- `worker_id=NULL`

之后管理员可以用 B9.27 的 retry endpoint 创建新的 queued job。

### Cancel / retry

- queued job 和 running job 都可以 cancel。
- cancel 会把 job 标成 `cancelled`，并清掉 `worker_id`。
- running job 依赖既有 checkpoint cooperative cancel；worker complete/fail 不会覆盖 cancelled job。
- retry failed/cancelled job 会复制原 `kind/mode/sourceDir/options` 创建新 queued job。

## 3. 配置

新增环境变量：

```env
ADMIN_IMPORT_WORKER_ENABLED=true
ADMIN_IMPORT_WORKER_POLL_INTERVAL_MS=2000
ADMIN_IMPORT_WORKER_HEARTBEAT_INTERVAL_MS=5000
ADMIN_IMPORT_WORKER_STALE_AFTER_MS=300000
```

说明：

- `ADMIN_IMPORT_WORKER_ENABLED=false` 时，生产 `buildApp` 会回退 inline execution。
- `ADMIN_IMPORT_WORKER_STALE_AFTER_MS` 默认 5 分钟。
- `ADMIN_IMPORT_ENABLE_WRITE` 仍只控制 `mode=import` 是否允许创建；dry-run 不受该 gate 限制。

## 4. 数据库变更

新增 migration：

```text
apps/api/src/db/migrations/0013_import_job_worker.sql
```

新增字段：

- `import_jobs.worker_id text`
- `import_jobs.heartbeat_at timestamptz`

新增索引：

- `import_jobs_worker_scan_idx(status, heartbeat_at, created_at)`
- `import_jobs_one_active_kind_idx(kind) WHERE status IN ('queued', 'running')`

shared contract 对 `AdminImportJobV1` 增加可选字段：

- `workerId?: string | null`
- `heartbeatAt?: string | null`

## 5. 代码结构

新增：

- `apps/api/src/admin/import-jobs/worker.ts`
  - `createAdminImportJobWorker`
  - `runOnce`
  - `recoverStaleJobs`
  - background `start/stop`

扩展：

- `repository.ts`
  - `createQueuedImportJob`
  - `claimNextImportJob`
  - `heartbeatImportJob`
  - `recoverStaleImportJobs`
- `service.ts`
  - `executionMode: "inline" | "queued"`
- `index.ts`
  - 生产环境创建 worker 并在 app close 时停止。

## 6. 验证

新增/扩展测试覆盖：

- queued execution mode create。
- memory worker claim + heartbeat + complete。
- cancellation checkpoint 与 queued worker 兼容。
- stale running job recovery。
- PostgreSQL repository 的 queued/claim/heartbeat/recover SQL。
- migration/schema 对 worker columns/indexes 的断言。

当前已通过：

```text
npm run build:shared
npm run test -w @bkyexam-practice/api
npm run typecheck -w @bkyexam-practice/api
npm run typecheck -w @bkyexam-practice/admin
npm run typecheck -w @bkyexam-practice/shared
```

最终阶段已通过 `npm run verify:docker`。

## 7. 明确未做

- 不引入外部队列系统（BullMQ/SQS/RabbitMQ 等）。
- 不做 SSE/WebSocket 实时 progress 事件流。
- 不做阶段级 progress current/total 细化。
- 不做 typed reset 二次确认 UI。
- 不做最终视觉打磨。
