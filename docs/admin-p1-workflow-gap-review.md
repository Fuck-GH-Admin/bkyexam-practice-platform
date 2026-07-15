# B9.20 Admin P1 Workflow UI Review / Backend Gap Check

状态日期：**2026-07-15**

本文是 B9.20 的阶段产物：在 B9.19 已运行的 `apps/admin` 骨架上，先审查 Bank Mappings、Import Jobs、Question Review 三条 P1 管理工作流是否可以直接进入 UI 实现，以及是否还存在必须先补的后端 command、字段或状态。

本阶段不做最终视觉，不新增业务代码，不改变 API contract；目标是避免再次出现“先做页面，做到一半才发现后端语义不够”的问题。

## 1. 结论

### 可以立即进入 P1 UI 的部分

1. **Bank Mappings P1 UI 可以优先做。**
   - 现有 `GET /api/admin/bank-mappings`、`GET /api/admin/bank-mappings/:bankId`、`PATCH /api/admin/bank-mappings/:bankId`、`POST /api/admin/bank-mappings/bulk-status` 已覆盖 list/detail/edit/bulk status。
   - list item 和 detail 已包含题库整理第一版需要的 `rawName`、`bankName`、`subjectCategory`、`subjectName`、`visible`、`status`、`objectiveQuestionCount`、`version`、`studentPreview`、`updatedBy/updatedAt`。
   - optimistic concurrency、无客观题禁止发布、批量局部失败和审计已经有后端语义。

2. **Question Review 可以做“预览级质检 UI”。**
   - 现有 list + patch 能支持筛选 open flags、添加 flag、resolve/ignore flag、切换 `excludedFromPractice`。
   - 适合先做异常队列、快速排除和标记，不适合立即做完整题目编辑器。

3. **Import Jobs 可以做 dry-run/read-only 操作 UI。**
   - 现有 list/detail/create dry-run/error report 能支撑“导入前检查、看 summary、看错误摘要”。
   - true import 写入由服务端 gate 控制，UI 可以显示 blocked/error 状态，但不应在这一阶段承诺 reset、cancel、retry 或后台队列。

### 需要先补后端或先明确语义的部分

1. **Import true write/reset/cancel/retry 不应先做完整 UI。**
   - 当前 create job 在 request 内同步执行 runner，`running` 只是持久化状态，不是独立后台 worker 队列。
   - `resetBeforeImport=true` 在 import mode 中仍被后端显式禁止。
   - 没有 cancel/retry endpoint，也没有异步 job worker、heartbeat、阶段级进度事件。
   - 因此 Import P1 UI 应先限定为 dry-run 和历史查看；真正写入导入控制建议拆成 B9.22 或单独后端阶段。

2. **Question Review 完整审核器还缺 full question payload。**
   - 现有 detail 与 list 都是 `AdminQuestionReviewItemV1`，只返回 `contentPreview`、`answerPreview`、`optionCount`、flags 和 exclusion 状态。
   - 第一版运营可以用 preview 快速处理异常；若要认真核对题干、选项、答案、解析和来源，需要新增 full question detail contract。
   - 不建议直接编辑原始题目，除非先设计 override 层，避免下次导入覆盖手工修改。

3. **Admin dashboard summary 不应塞进 System Status。**
   - `GET /api/admin/system/status` 当前定位是 API/DB/corpus/import/quality 健康状态。
   - 学生账号运营统计、待改密数量、锁定数量、最近重置密码、最近登录失败等应后续走独立 ops summary 或 account summary，不应污染 System Status。

## 2. Bank Mappings 审查

### 2.1 现有后端能力

| UI 需求 | 后端 contract / endpoint | 结论 |
| --- | --- | --- |
| 列表分页 | `GET /api/admin/bank-mappings` + `limit/offset/hasMore` | 足够 |
| 按状态过滤 | `status=review/active/hidden/deprecated` | 足够 |
| 按是否学生可见过滤 | `visible=true/false` | 足够 |
| 按学科/分类过滤 | `subjectCategory`、`subjectName` | 足够 |
| 按关键字搜索 | `keyword` | 足够 |
| 按 qGroup / parent 过滤 | `qGroup`、`parentId` | 足够 |
| 只看有客观题题库 | `hasObjectiveQuestions` | 足够 |
| 列表展示题量 | `questionCount`、`descendantQuestionCount`、`objectiveQuestionCount` | 足够 |
| 详情展示学生端可见原因 | `studentPreview.visibleInStudentCatalog/reason` | 足够 |
| 编辑展示文案 | `bankName`、`subjectCategory`、`subjectName`、`difficulty`、`examPurpose`、`audience`、`keywords`、`description`、`notes` | 足够 |
| 发布/隐藏 | `visible`、`status` + `bank_mapping:publish` | 足够 |
| 并发保护 | `expectedVersion` / `version`，冲突返回 `409` | 足够 |
| 批量发布/隐藏 | `POST /api/admin/bank-mappings/bulk-status` | 足够 |
| 审计 | route 写入 `bank_mapping.update` audit | 足够 |

### 2.2 UI 必须覆盖的状态

- loading / empty / forbidden / server error。
- `status=review` 默认队列。
- hidden/deprecated 与 `visible=false` 的组合提示。
- `objectiveQuestionCount=0` 时禁止或解释无法发布。
- detail 打开后 version 过期，保存返回 `409`。
- bulk status partial success：同时显示 updated 和 failed。
- content_editor 无 publish 权限时只能编辑文案，不能改 `visible/status`。
- parent/child 题库关系展示，避免误把父节点题量当直接题量。

### 2.3 后端缺口

Bank Mappings P1 没有阻塞性后端缺口。可选增强：

- list 级汇总，例如 review/active/hidden/deprecated counts，便于 tab badge。
- 更明确的 publish readiness 字段，例如 `canPublish` / `publishBlockers`；当前可由 `studentPreview.reason` 和 `objectiveQuestionCount` 推断。
- 审批流暂不做；当前是直接编辑/发布模型。

### 2.4 推荐实现顺序

Bank Mappings 应作为 B9.21 的首选实现对象：它字段完整、后端语义稳定、风险低，并且能直接服务真实题库整理。

## 3. Import Jobs 审查

### 3.1 现有后端能力

| UI 需求 | 后端 contract / endpoint | 结论 |
| --- | --- | --- |
| 任务列表 | `GET /api/admin/import-jobs` | 足够 |
| 状态过滤 | `status=queued/running/succeeded/failed/cancelled` | contract 有枚举；当前 runner 主要同步产出 running->succeeded/failed |
| 详情 | `GET /api/admin/import-jobs/:jobId` | 足够 |
| dry-run 创建 | `POST /api/admin/import-jobs` with `mode=dry_run` | 足够 |
| true import 创建 | `mode=import` | 有 gate，但 UI 不应默认开放 |
| 错误摘要 | `GET /api/admin/import-jobs/:jobId/errors` | 足够做摘要，不足以做文件级下载 |
| 进度 | `progress.phase/current/total` | contract 有字段，但当前不是异步实时进度 |
| summary | classifications/questions/rawOptions/options/skippedOptions/bankMappings/questionTypes | 足够 |
| source allowlist | source forbidden -> `403` | 足够 |
| running conflict | running conflict -> `409` | 足够 |
| reset gate | `resetBeforeImport` 非 super_admin 或 import mode reset 禁止 | 足够表达 blocked |
| 审计 | route 写入 `import_job.create` audit | 足够 |

### 3.2 UI 可以先做的范围

第一版 Import Jobs UI 应明确为：

1. 查看历史任务。
2. 创建 dry-run。
3. 查看 dry-run summary。
4. 查看 error summary。
5. 显示 true import 被禁用或 reset 被禁用的后端错误。
6. 显示 running conflict。

### 3.3 不应先承诺的范围

- 后台异步导入队列。
- 取消运行中的导入。
- 重试失败导入。
- reset 后重新导入。
- 文件级错误报告下载。
- 实时阶段进度事件。
- UI 端定时轮询以伪装异步运行。

### 3.4 后端缺口

若要把 Import Jobs 从 dry-run/read-only 推进到正式运营写入，需要新增：

1. 独立 worker 或 queue runner。
2. job 状态机：queued -> running -> succeeded/failed/cancelled。
3. cancel endpoint。
4. retry endpoint。
5. resetBeforeImport 的明确事务策略、权限确认和二次确认。
6. error report 持久化结构，最好能定位 source file / row / question id。
7. System Status 或 Ops Summary 暴露 import write gate 状态，避免 UI 只能靠 422 猜。

因此 Import Jobs 不推荐作为 B9.21 首个完整 UI；推荐先做 dry-run/history 页，true import 控制后置。

## 4. Question Review 审查

### 4.1 现有后端能力

| UI 需求 | 后端 contract / endpoint | 结论 |
| --- | --- | --- |
| 质检列表 | `GET /api/admin/question-review` | 足够 |
| 按题库过滤 | `bankId` | 足够 |
| 按题型过滤 | `questionType` | 足够 |
| 按 flag 类型过滤 | `flagType` | 足够 |
| 按 flag 状态过滤 | `status=open/resolved/ignored` | 足够 |
| 按严重程度过滤 | `severity=low/medium/high/blocking` | 足够 |
| 搜索 | `keyword` | 足够 |
| 添加 flag | `addFlags` | 足够 |
| resolve / ignore | `resolveFlagIds` / `ignoredFlagIds` | 足够 |
| 从练习中排除 | `excludedFromPractice` | 足够 |
| 审计 | route 写入 flag/exclude audit | 足够 |

### 4.2 UI 可以先做的范围

第一版可以做：

- open flags 工作队列。
- blocking/high severity 优先。
- 题干/答案 preview。
- 快速 add flag。
- resolve/ignore 单个或页面内多个 flag。
- toggle `excludedFromPractice`，并解释排除只影响新创建的 practice session。

### 4.3 后端缺口

完整审核器缺少：

- full question detail：完整题干、完整选项、答案、解析、来源分类路径、导入批次。
- 批量操作 endpoint。
- flag 历史时间线或 comment thread。
- 手工修题 override 层。
- “下次导入是否覆盖手工修改”的所有权策略。

因此 Question Review 可以在 B9.21 或 B9.22 做 preview-level UI，但完整题目编辑与审核平台应后置。

## 5. Audit Logs / Admin Users / Student Accounts 关系

B9.19 已把 Student Accounts 做成可运营最小 UI。B9.20 对 P1 工作流的结论是：

- **Audit Logs**：后端可读，P1 可先做简单列表/过滤；复杂 diff 视觉不是阻塞项。
- **Admin Users**：后端可管理，但涉及角色、禁用、重置密码和 last-super-admin guard，建议在 Bank Mappings 之后再做。
- **Student Accounts**：已经是当前 Admin runtime 的运营核心，后续只需补分页体验、筛选细节和批量导入文件化，而不是改底层语义。

## 6. Dashboard / Summary API 决策

当前不要把账号运营统计塞进 `GET /api/admin/system/status`。

System Status 保持运维健康口径：

- API / DB。
- corpus counts。
- import latest/running。
- quality open/blocking/excluded。

如果后续 Admin Dashboard 需要首页总览，建议新增独立 query，例如：

```text
GET /api/admin/ops/summary
```

候选字段：

- studentAccounts.total / active / disabled / passwordResetRequired / locked。
- importJobs.running / lastFailed / lastSucceeded。
- bankMappings.review / active / hidden / deprecated / publishBlocked。
- questionReview.open / blocking / excluded。
- recentAuditLogs。

该 API 是 Dashboard 体验增强，不是 B9.21 Bank Mappings UI 的阻塞项。

## 7. 下一阶段建议

推荐下一阶段：

> **B9.21 Admin Bank Mappings P1 UI**

理由：

1. 后端字段与 command 最完整。
2. 直接解决“题库整理”这个管理平台核心任务。
3. 不依赖 import queue/reset/cancel/retry。
4. 可以验证 `apps/admin` 的真实列表、详情、编辑、批量状态、权限和错误状态模式。
5. 做完后再复用同一套 Admin UI 数据模式到 Question Review 和 Import Jobs。

B9.21 建议范围：

- Bank Mappings list/filter/page。
- Detail/Edit drawer 或页面。
- optimistic concurrency 保存。
- publish/hidden/deprecated 状态操作。
- bulk status partial result。
- permission-gated controls。
- unit + Playwright mock smoke。

B9.21 不做：

- Import true write/reset/cancel/retry。
- full question editor。
- Audit diff polish。
- 最终视觉系统。

若你更关心安全导入写入，也可以把下一阶段改为 **B9.21 Import Queue/Control Backend**；但按当前完成度和风险，Bank Mappings P1 UI 是更稳的下一步。