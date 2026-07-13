# Backend Completeness And Next Plan

状态日期：**2026-07-13**
最近完整验证：**2026-07-13 `npm run verify:docker` PASS**
本轮初始基线提交：`cae6657 feat: add student session home and history`

本文专门从后端视角回答两个问题：

1. 现在已经完成了多少。
2. 与“完整 BKYExam 练习/考试平台”目标相比，还有哪些部分未达成，以及下一步准备怎么做。

## 1. 总体判断

后端已经完成的是：**学生客观题内部试用版的主闭环**。

后端尚未完成的是：**完整平台化后端**，尤其是管理端、正式身份/RBAC、运营导入平台、非客观题流程、生产运维和模块化边界。

| 口径 | 后端完成度估算 | 判断 |
| --- | ---: | --- |
| 学生客观题后端闭环 | **约 88–92%** | 已可内部试用；核心链路稳定。 |
| 后端工程可验证性 | **约 80%** | 单元、路由、PostgreSQL integration、Playwright 与完整导入 smoke 已建立；仍缺更多异常 fixture 与远端 CI 首次验收。 |
| 后端模块化程度 | **约 35–45%** | 业务上下文已清楚，但物理目录和大文件仍混杂。 |
| 完整平台后端 | **约 54–62%** | 学生客观题稳了；管理端已落地 Auth/RBAC/Audit、题库整理、状态和 dry-run 导入任务，但 Question Review、正式身份、全题型和生产能力仍未完成。 |
| 公开生产后端就绪 | **约 56%** | 缺正式安全策略、监控、备份恢复、rate limit、CSRF、部署验收和管理员 bootstrap。 |

这些百分比是工程判断，不是测试覆盖率。

## 2. 已完成且被验证的后端能力

### 2.1 Database And Import

已完成：

- PostgreSQL schema 与六份 ordered SQL migration。
- 原始题库解析：
  - classifications
  - questions
  - options
  - normalized question types
- 全量题库事务导入。
- 幂等 upsert。
- orphan options 明确跳过并计数。
- 自动生成 `bank_mappings`。
- 可见题库筛选。
- 管理端 `import_jobs` 任务表。
- Import Jobs dry-run API 可复用现有题库解析和 mapping 生成逻辑产出 summary。
- 完整 corpus slow smoke。

已验证数据：

| 项 | 数量 |
| --- | ---: |
| classifications | 2941 |
| questions | 89922 |
| raw options | 180323 |
| imported options | 154899 |
| skipped orphan options | 25424 |
| bank mappings | 2662 |

最近完整 corpus smoke：**2026-07-10 PASS**。

### 2.2 Auth / Student Session

已完成：

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- PostgreSQL `students`
- PostgreSQL `student_sessions`
- httpOnly Cookie session
- session 过期与撤销
- 登录后学生 ownership boundary

当前定位：**MVP 身份系统**。

### 2.3 Catalog / Bank List

已完成：

- 学生可见题库 API：`GET /api/banks`
- PostgreSQL repository 只返回 `visible=true`
- 题库名称、学科、分类、关键词、题量、描述
- 学生端搜索/筛选所需字段
- 自动 mapping 基础字段

当前定位：**学生端 catalog 可用，管理端 catalog curation 未完成**。

### 2.4 Practice

已完成：

- 创建练习 session：`POST /api/practice/sessions`
- 递归题库分类选题
- 随机/顺序模式
- 锁定题目集合与顺序
- 保存当前位置：`PATCH /progress`
- 保存草稿：`PUT /drafts/:questionId`
- 清空草稿：`DELETE /drafts/:questionId`
- 存疑标记：`PATCH /review/:questionId`
- 多 active session 列表：`GET /api/practice/sessions?status=active`
- completed 历史列表：`GET /api/practice/sessions?status=completed`
- session 详情/结果复用：`GET /api/practice/sessions/:sessionId`
- 整卷提交：`POST /submit`
- legacy 逐题提交：`POST /answers`
- completed session 写保护
- ownership 隔离
- `origin=bank|wrongbook`
- active 按 `updatedAt DESC` 稳定排序
- completed 按 `completedAt DESC` 稳定排序

当前定位：**学生客观题核心后端已经稳定**。

### 2.5 Grading

已完成：

- 单选题判分
- 多选题判分
- 判断题判分
- `false` 作为有效答案
- 未答题不生成 attempt
- 不能自动判分时支持 `isCorrect=null` / self-review 语义

当前定位：**客观题可用，主观题/复杂题型还早**。

### 2.6 Wrongbook

已完成：

- 错题自动 upsert
- `(student_id, question_id, bank_id)` 唯一聚合
- `wrong_count`
- `last_answer`
- `mastered`
- `includeMastered`
- 错题列表
- 错题详情
- 正确答案规范化
- 标记掌握
- 再练 session 创建
- 再练 session 记录 `origin=wrongbook`

当前定位：**错题本核心可用，但学习策略还不完整**。

### 2.7 Shared Runtime Contract

已完成：

- `packages/shared/src/contracts/v1`
- Practice response schema
- Practice session card/page schema
- Wrongbook response schema
- Auth response schema
- Catalog bank list schema
- Common error schema
- Health response schema
- submitted answer primitive
- UUID / opaque option ID primitive
- `completedCount` 语义常量：
  - `answered_or_graded_questions`
- Fastify response parse
- Web response parse
- 不合法 repository payload fail closed 为 `500`

当前定位：**学生端主要 runtime contract 已稳定；Admin Auth/RBAC/Audit foundation、Bank Mapping read/write API、System Status API 与 Import Job dry-run API 已实现；Question Review 尚未完成。**

### 2.8 Verification

已完成质量门：

- `npm run verify:docker`
- 357 Vitest
- 308 API tests
- 31 Web tests
- 18 Shared tests
- 3 Playwright browser smoke
- 1 PostgreSQL integration profile
- API build/typecheck
- Web build/typecheck
- Full corpus slow smoke profile

当前定位：**后端质量门已经可重复运行**。

## 3. 与目标未达成的部分

这里的“未达成”按完整 BKYExam 平台目标计算，不只按学生客观题 MVP。

### 3.1 正式身份与权限未完成

当前问题：

- 当前登录接近“用户名即身份”。
- 没有正式密码策略。
- 没有学校账号/邀请码/SSO 决策。
- 没有找回账号。
- 没有账号合并。
- Admin identity/RBAC/audit foundation 已有，但缺少初始 `super_admin` bootstrap、管理员账号管理和生产级安全策略。

影响：

- 不能公开生产。
- 不能安全开放管理端给真实运营团队。
- 学生身份与管理员身份虽已隔离，但账号生命周期仍不完整。

### 3.2 管理端后端未完整实现

当前已有：

- `bank_mappings`
- `visible`
- `status`
- mapping metadata
- import CLI
- question tables
- Admin Auth/RBAC/session/audit foundation
- Bank Mapping list/detail/update/bulk-status APIs
- System Status API
- Import Jobs dry-run APIs

未完成：

- Question Review API / `question_quality_flags`
- Audit Log read API
- Admin User 管理 / bootstrap CLI
- 真正执行写入的 import mode
- 题目质检标记
- 学生端排除异常题策略
- 管理端前端

这是完整平台后端剩余最大的业务缺口。

### 3.3 Catalog 已有管理 API，但运营工作流未完成

已能给学生展示题库，也能通过 Admin API 编辑题库整理字段、发布/隐藏和做乐观并发控制，但仍缺：

- 发布流程
- 审批流程
- 数据健康检查
- 内容质量抽查
- mapping 变更历史

### 3.4 Import 已有 dry-run 任务，但还不是完整平台任务系统

已完成 CLI 导入、smoke、`import_jobs` 表、dry-run 触发、running lock、进度/summary/error 摘要和 source allowlist，但缺：

- 错误下载/查看
- 增量导入策略
- 真正执行写入的 `mode=import`
- retry/cancel 策略
- 异步 worker/队列策略
- 管理端可视化

### 3.5 非客观题/复杂题型流程未完成

已导入但没有完整练习闭环的类型包括：

- 填空
- 简答
- 编程
- Office 操作
- 阅读
- 完形
- 材料题/复合题
- AI 类型
- unknown 类型

当前能力只是：

- 类型入库
- 部分 self-review 语义
- 客观题优先

未完成：

- 题型专属 payload
- 题型专属作答 UI contract
- 判分器
- 人工自评流程
- 复杂题组结构
- 附件/图片/富文本处理
- 错题规则
- 统计规则

### 3.6 学习记录与统计不足

已有：

- attempts
- wrong_questions
- practice_sessions

缺：

- 每日/每周练习统计
- 正确率趋势
- 题库维度统计
- 错题趋势
- 掌握规则
- 再练反馈
- 长期学习档案
- 题目收藏/长期存疑模型

### 3.7 Practice 后端结构太大

当前主要问题：

- `apps/api/src/practice/repository.ts` 同时包含：
  - interface/types
  - memory implementation
  - PostgreSQL SQL
  - answer serialization/parsing
  - grading orchestration
  - transaction logic
  - list/history queries

- `apps/api/src/routes/practice.ts` 同时包含：
  - route registration
  - auth checks
  - UUID validation
  - request parsing
  - error mapping
  - response schema parse

影响：

- 加功能容易互相踩。
- Admin/Stats/Non-objective 扩展会越来越难。
- 测试定位成本上升。

### 3.8 Wrongbook 与 Practice 边界不够好

原先：

- Wrongbook repository 直接 insert `practice_sessions` 和 `practice_session_questions`。

问题：

- repository 跨 bounded context 写表。
- 后续如果 Practice 创建规则变复杂，Wrongbook 会绕过规则。
- Admin/Stats/Attempt 逻辑可能分叉。

当前已完成：

- Wrongbook repository 只负责 `listReviewCandidates`。
- Wrongbook service 请求 Practice session service 创建再练 session。
- Practice 统一负责 session 创建、锁题、origin 和约束。

### 3.9 Contract 未完全覆盖后端

已覆盖：

- Practice
- Practice session page/card
- Wrongbook
- Auth
- Catalog
- Admin Auth / Bank Mapping / System Status / Import Job
- 通用 error
- Health

未覆盖：

- Question Review
- Audit Log read API
- Readiness/DB health
- 部分 request schema 在 route 中仍手写

### 3.10 生产运维能力不足

缺：

- DB readiness health
- structured logging
- request id / trace id
- metrics
- alerting
- rate limit
- CSRF
- secure headers
- backup restore drill
- migration rollback plan
- secrets management
- production deploy checklist validation
- 远端 CI 首次验收与 branch protection

### 3.11 异常数据 fixture 不足

缺专项 fixture/test：

- 超长题干
- 空选项
- 异常 option
- 富文本
- 图片题
- 异常 Unicode
- 残缺题目
- 重复题
- 题组/材料题结构

## 4. 后端下一步规划

本路线中 B1 到 B5.5 已按顺序执行完毕。当前下一步仍然不要直接开管理端大工程，也不要先做最终视觉；应继续完成管理端后端最小闭环。

当前建议继续做 **B5.6 Question Review Flags**。

原因：

1. 学生客观题主链路已经稳定，适合继续在稳定测试保护下补管理端能力。
2. Bank Mapping read/write、System Status 与 Import Jobs 已有 Auth/RBAC/Audit 基础，Question Review 是管理端最小可运营闭环的最后一块后端业务能力。
3. Question Review 稳定后，才更适合进入管理端信息架构审核、静态 wireframe 和最后的前端实现。

## 5. 推荐执行路线

### Phase B1 — Backend Module Skeleton And Practice Split

状态：**已完成，2026-07-13。**

目标：不改行为，只把 Practice 后端从大文件拆成清晰模块。

建议新增结构：

```text
apps/api/src/modules/
  practice/
    contracts.ts
    answerCodec.ts
    grading.ts
    repository.ts
    memoryRepository.ts
    pgRepository.ts
    submissionService.ts
    routes.ts
    routeValidation.ts
    errors.ts
  wrongbook/
  catalog/
  auth/

apps/api/src/platform/
  db/
  http/
  config/
```

第一步只动 Practice，其他模块可以先保留转发/adapter。

拆分顺序：

1. 提取 answer codec：
   - `serializeSubmittedAnswer`
   - `serializeDraftAnswer`
   - `parseStoredAnswer`
   - `hasSubmittedAnswerValue`
2. 提取 repository types/interfaces。
3. 分离 memory repository。
4. 分离 PostgreSQL repository。
5. 提取 submission service 或至少提取 transaction orchestration。
6. 分离 route validation。
7. 分离 completed-session error mapping。
8. 保留原 public imports 或建立 compatibility barrel，降低一次性改动风险。

验收：

- 不改变 HTTP contract。
- 不新增业务能力。
- `npm run verify:docker` 已通过。
- commit 一次。

实际落地：

```text
apps/api/src/modules/practice/
  contracts.ts
  grading.ts
  answerCodec.ts
  resultMapper.ts
  memoryRepository.ts
  pgRepository.ts
  repository.ts

apps/api/src/practice/
  grading.ts
  repository.ts
```

保留 `apps/api/src/practice/*` 作为 compatibility barrel，因此现有 route、test 和调用方无需一次性改 import path。

### Phase B2 — Wrongbook Calls Practice Service

状态：**已完成，2026-07-13。**

目标：修复 bounded context 跨表写入。

原问题：

```text
WrongbookRepository
  -> INSERT practice_sessions
  -> INSERT practice_session_questions
```

目标：

```text
WrongbookService
  -> select wrong question ids
  -> PracticeService.createSessionFromQuestionIds({
       origin: 'wrongbook',
       mode: 'sequential'
     })
```

需要注意：

- 保持现有 `/api/wrong-questions/review-sessions` response 不变。
- 保持 `origin=wrongbook`。
- 保持 ownership boundary。
- 保持 integration test 覆盖。

验收：

- Wrongbook repository 不再直接写 Practice 表。
- Practice session 创建规则位于 `PracticeSessionService`。
- `npm run verify:docker` 已通过。
- commit 一次。

实际落地：

```text
apps/api/src/wrongQuestions/service.ts
apps/api/src/modules/practice/sessionService.ts
```

当前调用链：

```text
POST /api/wrong-questions/review-sessions
  -> WrongQuestionService.createReviewSession()
  -> WrongQuestionRepository.listReviewCandidates()
  -> PracticeSessionService.createSessionFromQuestionIds()
  -> practice_sessions / practice_session_questions
```

### Phase B3 — Shared Contract Expansion

状态：**已完成，2026-07-13。**

目标：把 Auth、Catalog、Error 的 contract 补齐。

新增 shared schema：

```text
contracts/v1/auth.ts
contracts/v1/catalog.ts
contracts/v1/error.ts
contracts/v1/health.ts
```

覆盖：

- login response
- me response
- logout response
- bank list response
- common error shape
- health response

迁移方式：

1. 先加 schema 和 tests。
2. API response parse。
3. Web response parse。
4. 再逐步替换手写 request parser。

验收：

- Auth/Catalog 错误 payload 不会被当成成功数据。
- API/Web 两侧统一类型。
- `npm run verify:docker` 已通过。
- commit 一次。

实际落地：

- Auth login/me/logout success response 由 API 与 Web 双侧 parse。
- Catalog bank list response 由 API 与 Web 双侧 parse。
- Web API helper 对非 2xx response 使用 `ApiErrorResponseV1Schema`。
- `/api/health` response 使用 `HealthResponseV1Schema`。
- route 回归覆盖 Auth/Catalog 不合法 repository payload fail-closed。
- readiness/DB health 不在本阶段完成，后续放到 Production Backend Readiness。

### Phase B4 — Admin Backend Contract Design

状态：**已完成，2026-07-13。**

目标：先设计，不急着 UI。

新增文档：

```text
docs/admin-backend-contract.md
```

先定四个后台工作流：

1. 题库整理
2. 导入任务
3. 题目质检
4. 系统状态

先设计 API：

```text
POST   /api/admin/auth/login
GET    /api/admin/me
POST   /api/admin/auth/logout
GET    /api/admin/bank-mappings
GET    /api/admin/bank-mappings/:bankId
PATCH  /api/admin/bank-mappings/:bankId
POST   /api/admin/bank-mappings/bulk-status
GET    /api/admin/import-jobs
POST   /api/admin/import-jobs
GET    /api/admin/import-jobs/:id
GET    /api/admin/question-review
PATCH  /api/admin/question-review/:questionId
GET    /api/admin/system/status
GET    /api/admin/audit-logs  # optional read endpoint; audit writes are mandatory
```

同时设计 migrations：

```text
admin_users
admin_sessions
admin_roles / admin_user_roles 或 role text
audit_logs
import_jobs
question_quality_flags
bank_mappings.version / updated_at / updated_by_admin_id
```

验收：

- 文档明确 request/response。
- 明确权限模型。
- 明确 audit log。
- 明确不会直接编辑原始题目，而是通过 override/flag 层。
- 通过评审后再实现。

实际落地：

- 设计文档：[`admin-backend-contract.md`](./admin-backend-contract.md)。
- 明确角色：`content_editor`、`operator`、`super_admin`。
- 明确权限：bank mapping、import job、question review、system status、audit/admin user。
- 明确 Admin Cookie：`bky_admin_session`，不复用学生 `bky_session`。
- 明确 B5 实现顺序：admin identity/RBAC/audit foundation -> bank mapping read -> bank mapping write -> system status -> import jobs -> question review flags。

### Phase B5 — Admin Backend MVP Implementation

目标：最小可运营闭环。

状态：**进行中。B5.1/B5.2/B5.3/B5.4/B5.5 已完成，2026-07-13。**

优先实现：

1. admin identity + RBAC — **已完成**
2. audit log foundation — **已完成**
3. bank mappings list/detail — **已完成**
4. bank mappings update + batch visible/status — **已完成**
5. system status — **已完成**
6. import jobs — **已完成（dry-run first）**

后实现：

7. question review flags
8. import error report

验收：

- 管理员能整理题库并发布给学生端。
- 所有写操作有 admin ownership、permission 和 audit。
- 学生 API 不暴露 admin 字段。
- 本阶段不创建正式 Admin 前端；只允许补充功能流程、字段表和静态 wireframe 作为 contract 校验材料。
- `npm run verify:docker` 通过。

#### B5.1 实际落地

- migration `0005_admin_foundation.sql`：
  - `admin_users`
  - `admin_sessions`
  - `admin_user_roles`
  - `audit_logs`
  - `bank_mappings.version / updated_at / updated_by_admin_id`
- 新增 Admin Auth repository/service/session：
  - PostgreSQL repository
  - memory repository
  - 独立 `bky_admin_session`
  - 默认 8 小时 TTL，可用 `ADMIN_SESSION_TTL_HOURS` 配置
- 新增 RBAC helper：
  - `content_editor`
  - `operator`
  - `super_admin`
  - 显式 permission list
- 新增 audit service：
  - memory repository
  - PostgreSQL `audit_logs` repository
  - Admin login/logout 写 audit
- 新增 routes：
  - `POST /api/admin/auth/login`
  - `GET /api/admin/me`
  - `POST /api/admin/auth/logout`
- 新增 shared v1 Admin Auth schema：
  - admin role / permission
  - login request/response
  - me response
  - logout response
- 已验证：
  - 管理员登录、恢复 session、退出。
  - 学生 Cookie 和管理员 Cookie 隔离。
  - 非管理员访问 `/api/admin/me` 返回 `401`。
  - 缺少 `admin:self:read` 返回 `403`。
  - PostgreSQL integration 覆盖 admin auth/session/audit。
  - 不创建默认本地管理员账号。

#### B5.2 实际落地

- 新增 shared v1 Admin Bank Mapping schema：
  - list request/query
  - list item/response
  - detail response
  - bank status enum
- 新增 Admin Bank Mapping repository：
  - memory repository
  - PostgreSQL repository
  - 递归统计 descendant objective question count
  - detail 返回 `questionTypeCounts` 与 `studentPreview`
- 新增 routes：
  - `GET /api/admin/bank-mappings`
  - `GET /api/admin/bank-mappings/:bankId`
- 已验证：
  - `bank_mapping:read` 权限守卫。
  - 无管理员 session 返回 `401`。
  - 缺少权限返回 `403`。
  - 无效 query / bank id 返回 `400`。
  - 不存在 mapping 返回 `404`。
  - PostgreSQL integration 覆盖 list/detail。
  - repository payload 使用 shared schema fail closed。

#### B5.3 实际落地

- 新增 shared v1 Admin Bank Mapping write schema：
  - `PATCH /api/admin/bank-mappings/:bankId` request。
  - `POST /api/admin/bank-mappings/bulk-status` request/response。
  - `expectedVersion`、空 `changes`、单次最多 100 个 bank 的 contract 边界。
- 扩展 Admin Bank Mapping repository：
  - memory/PostgreSQL update 双路径。
  - PostgreSQL `BEGIN`/`COMMIT` transaction。
  - `FOR UPDATE` + `expectedVersion` optimistic concurrency。
  - 写入 `version = version + 1`、`updated_at`、`updated_by_admin_id`。
  - 批量状态更新按 item 独立处理，支持部分成功。
- 新增 routes：
  - `PATCH /api/admin/bank-mappings/:bankId`
  - `POST /api/admin/bank-mappings/bulk-status`
- 已验证：
  - metadata 写操作需要 `bank_mapping:write`。
  - `visible/status` 写操作需要 `bank_mapping:publish`。
  - stale version 返回 `409`。
  - 无客观题题库不能发布为 `visible=true` + `active`，返回 `422`。
  - 成功写操作写 `bank_mapping.update` audit log。
  - PostgreSQL integration 覆盖 PATCH、bulk-status、version conflict、audit 和学生 `/api/banks` 隐藏过滤。

#### B5.4 实际落地

- 新增 shared v1 Admin System Status schema。
- 新增 Admin System Status repository：
  - memory repository。
  - PostgreSQL repository。
  - `SELECT 1` DB readiness。
  - migration 文件摘要。
  - corpus counts：classifications/questions/questionOptions/bankMappings。
  - 学生可见题库数量：`visible=true`、`status=active` 且含客观题。
  - `import_jobs` 表存在时返回 running/latest job 摘要；表不存在时返回 `tableExists=false`。
  - `question_quality_flags` 表存在时返回 open/blocking/excluded 摘要；表不存在时返回 `tableExists=false`。
- 新增 route：
  - `GET /api/admin/system/status`
- 已验证：
  - `system_status:read` 权限守卫。
  - 无管理员 session 返回 `401`。
  - 缺少权限返回 `403`。
  - repository payload 使用 shared schema fail closed。
  - PostgreSQL integration 覆盖真实 counts、migration summary、future table fallback。

#### B5.5 实际落地

- 新增 migration `0006_import_jobs.sql`：
  - `import_jobs` 表。
  - `status + created_at`、`created_by_admin_id` 索引。
  - 同一 `kind` 只允许一个 `running` job 的 partial unique lock。
  - `kind/mode/status` check 约束。
- 新增 shared v1 Admin Import Job schema：
  - kind/mode/status/options/progress/summary/errorSummary。
  - list/detail/create response。
  - list query filter：`status`、`createdBy`、`limit`、`offset`。
- 新增 Admin Import Job repository/service：
  - memory/PostgreSQL 双路径。
  - source directory allowlist：`ADMIN_IMPORT_ALLOWED_ROOTS`。
  - `resetBeforeImport=true` 需要 `super_admin`。
  - `mode=dry_run` 同步运行，复用 `loadQuestionBankData` + `generateBankMappings` 产出 summary。
  - `mode=import` 暂不启用，明确返回 `422`。
  - dry-run 成功写 `succeeded`，异常写 `failed` 和 `errorSummary`。
- 新增 routes：
  - `GET /api/admin/import-jobs`
  - `POST /api/admin/import-jobs`
  - `GET /api/admin/import-jobs/:id`
- 已验证：
  - `import_job:read/create` 权限守卫。
  - 无管理员 session 返回 `401`。
  - 无 allowlist / disallowed source 返回 `403`。
  - 已有 running job 返回 `409`。
  - `mode=import` 返回 `422`。
  - 成功创建写 `import_job.create` audit log。
  - PostgreSQL integration 覆盖 migration、创建、列表、详情、audit、System Status latest import job。

下一步：**B5.6 Question Review Flags**。

### Phase B5.6 — Question Review Flags

目标：补齐管理端题目质量标记后端，让内容运营可以记录异常题并选择性排除练习。

后端能力：

- migration `0007_question_quality_flags.sql`
- shared v1 Question Review schema
- `GET /api/admin/question-review`
- `PATCH /api/admin/question-review/:questionId`
- open/resolved/ignored 状态
- severity、reason、note、excludedFromPractice
- created/resolved admin attribution
- System Status quality summary 使用真实表
- 可选 practice exclusion rule，必须有显式测试

注意：

- 第一版仍不直接编辑原始题干/答案，只记录 quality flag。
- 不做管理前端。
- 是否立即影响学生选题必须由 `excludedFromPractice=true` 明确控制。

### Phase B7 — Student Learning Record And Statistics

目标：补学生长期学习闭环。

后端能力：

- practice summary stats
- recent banks
- wrongbook trend
- correct rate by bank/type
- mastered rule
- wrongbook re-practice feedback
- optional favorite / long-term review flag

这阶段再考虑是否新增：

```text
student_learning_daily_stats
question_bookmarks
review_items
```

### Phase B8 — Non-objective Question Support

目标：不要把复杂题型硬塞进 objective grader。

分题型设计：

- fill_blank
- short_answer / essay
- reading / cloze
- programming
- office_operation

每类都要先定义：

1. payload contract
2. answer contract
3. grading/self-review rule
4. result contract
5. wrongbook/statistics rule

### Phase B9 — Production Backend Readiness

目标：公开生产前补齐。

包括：

- readiness health
- structured logs
- request id
- metrics
- alerting
- rate limit
- CSRF
- secure headers
- cookie hardening
- DB backup
- restore drill
- migration rollback
- secrets management
- deployment verification
- remote CI and branch protection

## 6. 推荐下一步具体执行

如果继续本规划，下一步建议执行：

> **B5.6 Question Review Flags。**

具体第一阶段 commit 目标：

```text
feat: add admin question review api
```

范围只包含：

- migration `0007_question_quality_flags.sql`
- shared v1 question review schema
- `GET /api/admin/question-review`
- `PATCH /api/admin/question-review/:questionId`
- `question_review:read/write` 权限守卫
- open/resolved/ignored quality flag
- optional `excludedFromPractice` rule behind explicit tests
- System Status quality summary 接入真实表
- route/unit/PostgreSQL integration 覆盖
- 更新 architecture/todo/status/api docs
- 全量 verify:docker

不做：

- 不改 UI
- 不创建 `apps/admin`
- 不编辑原始题干/选项/答案
- 不做完整审核工作台
- 不开启复杂审批流
- 不改业务语义
- 不引入微服务
- 不引入队列

这样最稳。

## 7. 阶段提交规则

每个阶段都遵守：

1. 先改一个垂直切片。
2. 任何行为改变必须有测试。
3. 涉及 SQL/migration 必须跑 PostgreSQL integration。
4. 阶段结束更新文档。
5. `npm run verify:docker` 通过后提交。
6. worktree 保持 clean 后再进入下一阶段。

## 8. 当前一句话总结

后端现在不是“没完成”，而是：

> **学生客观题主链路已经完成并稳定；Admin 后端 contract 已设计，Auth/RBAC/Audit、题库整理 read/write、System Status 与 Import Jobs dry-run 已落地；完整平台后端还缺 Question Review、管理员 bootstrap、正式身份、模块化、非客观题和生产运维。**

最合理的下一步是继续 Admin 后端 MVP：补 Question Review；前端仍应等管理后端 command/query 基本稳定后再进入设计审核。
