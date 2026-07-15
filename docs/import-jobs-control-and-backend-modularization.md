# B9.27 Import Jobs control and backend modularization

状态日期：**2026-07-16**

目标：把 Import Jobs 从“dry-run/history + gated true import”推进到可运营的控制闭环，并顺手拆分原本混在 `admin/importJobs.ts` 里的后端模块边界。

## 1. 本阶段完成内容

### 1.1 True import reset

`mode=import` 仍受后端 `ADMIN_IMPORT_ENABLE_WRITE=true` gate 保护；未开启时继续返回 `422 Import mode is not enabled yet`。

已新增：

- `resetBeforeImport=true` 在 `mode=import` 中不再被统一禁止。
- 只有 `super_admin` 可提交 reset import；非 super_admin 仍返回 `403 resetBeforeImport requires super_admin`。
- reset 在真实导入事务中执行，导入失败或 cancel 会整体 rollback。
- reset SQL 为 `TRUNCATE classifications CASCADE`，随后重新写入 classifications/questions/options/bank_mappings。

影响范围：

- 会清空 corpus 以及所有依赖 corpus FK 的业务数据，例如 practice sessions、attempts、drafts、wrongbook、bookmarks、question quality flags、question/option overrides 和 bank mappings。
- 不清空 students、admin users、admin sessions、audit logs、import_jobs、student sessions 和 learning goals。

因此 reset import 仍是破坏性运营操作，只适合 staging、初始化或明确允许清库重导的窗口。

### 1.2 Cancel

新增 API：

```http
POST /api/admin/import-jobs/:jobId/cancel
```

规则：

- 需要 `import_job:create` 权限。
- 仅 `queued` / `running` 可取消；已 `cancelled` 的请求幂等返回 cancelled job。
- `succeeded` / `failed` 返回 `409 Import job cannot be cancelled`。
- 写入 audit action：`import_job.cancel`。
- runner 通过 job context 在 source load / batch checkpoint 检查 job 是否已经变成 `cancelled`；发现 cancel 后抛出 cancellation error，并回滚当前导入事务。

限制：

- 当前是 request 内同步 runner + checkpoint cooperative cancel，不是独立 durable worker。
- 如果正在执行单个 DB query，需要等该 query 返回后才会进入下一个 cancel checkpoint。

### 1.3 Retry

新增 API：

```http
POST /api/admin/import-jobs/:jobId/retry
```

规则：

- 需要 `import_job:create` 权限。
- 仅 `failed` / `cancelled` job 可重试。
- retry 会复制原 job 的 `kind/mode/sourceDir/options`，创建一个新的 import job id，然后执行同一 runner。
- 如果原 job 是 reset import，retry 仍保留 `resetBeforeImport=true`，因此当前操作者必须是 `super_admin`。
- 写入 audit action：`import_job.retry`，metadata 包含 `sourceJobId` / `sourceStatus` / `options`。

### 1.4 Admin UI 最小控制入口

`apps/admin` 的 Import Jobs 页面已同步最小操作：

- create form 支持 `mode=dry_run|import`。
- `mode=import` 下可勾选 `resetBeforeImport`。
- detail panel 显示 cancel / retry 按钮，按 job status 启用或禁用。
- 仍不做最终视觉系统。

## 2. 后端模块化变更

原 `apps/api/src/admin/importJobs.ts` 现在只保留兼容 facade：

```ts
export * from './import-jobs/index.js';
```

实际实现拆到：

- `apps/api/src/admin/import-jobs/types.ts`：service/repository/runner 类型、结果 union、job context。
- `apps/api/src/admin/import-jobs/repository.ts`：memory + PostgreSQL repository、row mapping、cancel-safe complete/fail/cancel。
- `apps/api/src/admin/import-jobs/service.ts`：source allowlist、permission-facing state machine、create/cancel/retry orchestration。
- `apps/api/src/admin/import-jobs/runner.ts`：dry-run runner 与 PostgreSQL true import runner。
- `apps/api/src/import/cancellation.ts`：导入 cancellation error 与 checkpoint helper。
- `apps/api/src/import/importQuestionBank.ts`：新增 `resetBeforeImport` 与 `shouldAbort`，在单个 DB transaction 内完成 reset/import/rollback。

这样 `routes/adminImportJobs.ts` 只负责 HTTP、session/RBAC、request parse、error mapping 和 audit；import job 业务状态机不再塞在 route 或单个大文件里。

## 3. 验证

已覆盖：

- Admin import job service：reset super_admin gate、cancel、retry、runner observed cancellation。
- Admin import job routes：reset import success、cancel endpoint、retry endpoint、audit。
- PostgreSQL integration：true import reset 在真实 DB 中清空旧 corpus/practice state 后写入新 fixture，且保持事务导入。
- Admin Playwright smoke：Import Jobs create/detail/error report 继续可跑通。

最新计数在 `docs/status.md` / `docs/testing.md` 中维护。

## 4. 仍未做

- 独立 durable queue/worker。
- heartbeat、stuck job recovery、worker ownership/fencing。
- 阶段级实时 progress 事件流。
- reset 二次确认 UI / typed confirmation。
- import error report 的文件级/行级下载。
