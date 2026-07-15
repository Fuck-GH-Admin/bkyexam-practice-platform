# B9.22 Admin Import Jobs dry-run/history UI

状态日期：**2026-07-15**

目标：按 B9.21 之后的轻量路线，在 `apps/admin` 里补 Import Jobs 的 dry-run、历史、详情和错误摘要 UI。这个阶段只验证真实 contract 和真实状态；B9.27 已在后续补齐 true import/reset/cancel/retry 与最小控制 UI，本页保留为 B9.22 历史记录。

## 1. 本阶段结论

```text
Import Jobs nav = implemented
Import Jobs list/filter/page = implemented
Create dry-run = implemented
Import Job detail = implemented
Error report = implemented
true import write/reset/cancel/retry = implemented later in B9.27
visual polish = deferred
```

B9.22 把 Import Jobs 从 placeholder 升级为功能性 dry-run/history 页面。它复用既有 Admin shell、RBAC sidebar、shared v1 contract parse 和 Admin API wrapper。

## 2. 已实现范围

### Navigation / route

- `/admin/import-jobs` 进入导入任务历史列表。
- `/admin/import-jobs/create` 打开 dry-run 创建面板。
- `/admin/import-jobs/:jobId` 打开任务详情面板。
- Sidebar 中 Import Jobs 不再显示 placeholder。

### List / filter / page

调用：`GET /api/admin/import-jobs`

已支持：

- status：`queued` / `running` / `succeeded` / `failed` / `cancelled`。
- limit / offset 翻页。

列表展示：

- kind / job id。
- status / mode / reset / errors badges。
- sourceDir。
- summary：questions/options/skipped/mappings。
- progress phase/current/total。
- createdBy / createdAt。
- finishedAt。

### Create dry-run

调用：`POST /api/admin/import-jobs`

表单固定：

- `kind=full_corpus_import`
- `mode=dry_run`
- `resetBeforeImport=false`

可输入：

- sourceDir。
- batchSize。
- generateMappings。

错误处理：

- `403` source root forbidden。
- `409` running conflict。
- `422` import/reset gate blocked。

### Detail / error report

调用：

- `GET /api/admin/import-jobs/:jobId`
- `GET /api/admin/import-jobs/:jobId/errors`

详情展示：

- job id / sourceDir。
- progress。
- summary。
- questionTypes。
- options。
- createdBy / createdAt / startedAt / finishedAt。
- errorSummary。

## 3. Contract parsing

本阶段新增使用的 shared v1 schema：

- `AdminImportJobListResponseV1Schema`
- `AdminImportJobDetailResponseV1Schema`
- `CreateAdminImportJobRequestV1Schema`
- `CreateAdminImportJobResponseV1Schema`
- `AdminImportJobErrorReportResponseV1Schema`

所有成功响应进入 React state 前继续执行 schema parse；非 2xx 继续走 `ApiErrorResponseV1Schema`。

## 4. 验证范围

新增/扩展测试：

- `apps/admin/src/App.test.ts`
  - Import Job route parse/build。
  - Import Job list query builder。
  - Import Job status badge helper。
- `tests/e2e/mockAdminApi.ts`
  - stateful Import Job list/detail/create dry-run/error-report mock。
- `tests/e2e/admin-smoke.spec.ts`
  - Admin Login。
  - System Status。
  - Student Accounts。
  - Bank Mappings。
  - Import Jobs list/create dry-run/detail/error-report。

阶段验证命令：

```text
npm run typecheck -w @bkyexam-practice/admin  PASS
npm run test -w @bkyexam-practice/admin  PASS, 1 file / 8 tests
npm run typecheck:e2e  PASS
npm run test:e2e  PASS, 5 passed
```

最终阶段验证：`npm run verify:docker` PASS。

## 5. 明确不做

- 不做最终视觉设计系统。
- 不重构 Admin app 大文件结构。
- 不开放 `mode=import` 写入导入 UI。
- 不做 `resetBeforeImport=true` UI。
- 不做 cancel/retry。
- 不做异步 queue/worker。
- 不做文件级错误下载。
- 不新增后端 contract。

## 6. 下一步建议

B9.22 之后建议：

> **B9.23 Admin Question Review preview UI**

范围只做 open flags 队列、flag add、resolve/ignore、excludedFromPractice，不做完整题目编辑器、不做 override 层、不做最终视觉。
