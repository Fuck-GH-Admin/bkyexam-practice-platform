# Backend Completeness And Next Plan

状态日期：**2026-07-15**
最近完整验证：**2026-07-15 `npm run verify:docker` PASS**
本轮初始基线提交：`cae6657 feat: add student session home and history`

本文专门从后端视角回答两个问题：

1. 现在已经完成了多少。
2. 与“完整 BKYExam 练习/考试平台”目标相比，还有哪些部分未达成，以及下一步准备怎么做。

## 1. 总体判断

后端已经完成的是：**学生客观题内部试用版的主闭环**。

后端尚未完成的是：**完整平台化后端**，尤其是管理端、正式身份/RBAC、运营导入平台、非客观题流程、生产运维和模块化边界。

| 口径 | 后端完成度估算 | 判断 |
| --- | ---: | --- |
| 学生客观题后端闭环 | **约 90–94%** | 已可内部试用；核心链路稳定，学习趋势、目标和反馈信号后端也已具备。 |
| 后端工程可验证性 | **约 82%** | 单元、路由、PostgreSQL integration、Playwright 与完整导入 smoke 已建立；readiness/guardrail 已纳入测试；仍缺更多异常 fixture 与远端 CI 首次验收。 |
| 后端模块化程度 | **约 35–45%** | 业务上下文已清楚，但物理目录和大文件仍混杂。 |
| 完整平台后端 | **约 70–77%** | 学生客观题稳了；管理端已落地 Auth/RBAC/Audit、题库整理、状态、dry-run 导入任务、import error report、true import gate、题目质检 flag/exclusion、管理员 bootstrap、Audit Log read 与 Admin User manage；学生学习概览、趋势、目标、反馈与长期复习标记 API 已落地，但正式身份、全题型、管理前端和生产能力仍未完成。 |
| 公开生产后端就绪 | **约 66%** | 已补第一个 `super_admin` bootstrap、Admin User manage API、gated true import、readiness、request id、基础安全 headers、可配置 rate limit/CSRF origin check、backup/restore drill、structured request log 与 metrics smoke endpoint；仍缺外部监控告警、远端 CI/branch protection 实际确认、部署验收和正式安全策略闭环。 |

这些百分比是工程判断，不是测试覆盖率。

## 2. 已完成且被验证的后端能力

### 2.1 Database And Import

已完成：

- PostgreSQL schema 与九份 ordered SQL migration。
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
- `mode=import` 已可在 `ADMIN_IMPORT_ENABLE_WRITE=true` 下复用真实导入事务写入 PostgreSQL。
- true import 已覆盖幂等 upsert、`generateMappings=false` 跳过 mapping、失败回滚和 errorSummary。
- `resetBeforeImport=true` 在 import mode 中仍显式禁止，返回 `422`。
- 管理端 `question_quality_flags` 质检表。
- 学生端 `student_learning_goals` 与 `question_bookmarks` 长期学习表。
- `excludedFromPractice=true` 的 open quality flag 会从新的 Practice bank session 自动选题中排除对应题目。
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
- 学习概览 API 可统计错题总数、掌握数、待处理数和最近错题时间

当前定位：**错题本核心可用，但学习策略还不完整**。

### 2.6.1 Learning Analytics

已完成：

- `GET /api/learning/dashboard`
- `GET /api/learning/trends?days=7..90`
- `GET/PUT /api/learning/goals`
- `student_learning_goals` 持久化目标设置
- shared v1 Learning contract
- summary：active/completed/review session 数、attempt 数、graded/correct attempt、正确率、最近练习时间
- recent banks：最近练习题库、会话数、完成数、正确率、错题数
- question type stats：按题型统计 attempts、correct attempts、accuracy、wrong question count
- wrongbook summary：total/mastered/pending/lastWrongAt
- daily trends：UTC 日期桶、sessions started/completed、attempts、accuracy、wrongbook touch
- streak：activeDays、currentStreakDays、longestStreakDays
- learning goals：daily attempts、weekly active days、wrongbook review 三类目标
- feedback signals：目标完成、继续练习、错题复习、低正确率关注
- memory/PostgreSQL repository
- PostgreSQL integration 覆盖真实聚合

当前定位：**学生学习统计后端 MVP+ 已具备；前端展示、长期档案和推荐策略未完成。**

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
- Readiness response schema
- submitted answer primitive
- UUID / opaque option ID primitive
- `completedCount` 语义常量：
  - `answered_or_graded_questions`
- Fastify response parse
- Web response parse
- 不合法 repository payload fail closed 为 `500`

当前定位：**学生端主要 runtime contract 已稳定，Learning Dashboard/Trends/Goals/Review Marks 已覆盖；Admin Auth/RBAC/Audit foundation、Admin User manage、Bank Mapping read/write API、System Status API、Import Job dry-run/Error Report/true import gate、Question Review API 与 Audit Log read API 已实现。**

### 2.8 Verification

已完成质量门：

- `npm run verify:docker`
- 433 Vitest
- 377 API tests
- 31 Web tests
- 25 Shared tests
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
- Admin identity/RBAC/audit foundation 和初始 `super_admin` bootstrap 已有，但缺少管理员账号管理和生产级安全策略。

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
- Import Jobs dry-run/Error Report APIs
- True Import Mode Gate（`ADMIN_IMPORT_ENABLE_WRITE=true` 才允许写入；reset 仍禁用）
- Question Review flag/exclusion APIs
- Audit Log read API
- Admin User manage API
- `super_admin` bootstrap CLI

未完成：

- import reset、异步 worker/队列、cancel/retry
- 管理端前端

这是完整平台后端剩余最大的业务缺口之一；另一个大缺口是学生长期学习数据。

### 3.3 Catalog 已有管理 API，但运营工作流未完成

已能给学生展示题库，也能通过 Admin API 编辑题库整理字段、发布/隐藏和做乐观并发控制，但仍缺：

- 发布流程
- 审批流程
- 数据健康检查
- 内容质量抽查
- mapping 变更历史

### 3.4 Import 已有 gated true import，但还不是完整平台任务系统

已完成 CLI 导入、smoke、`import_jobs` 表、dry-run 触发、`ADMIN_IMPORT_ENABLE_WRITE=true` 下真实写入导入、running lock、进度/summary/error 摘要、失败回滚、幂等验证和 source allowlist，但缺：

- 错误下载/按文件行号查看
- 增量导入策略
- resetBeforeImport 的安全实现
- retry/cancel 策略
- 异步 worker/队列策略
- 管理端可视化

### 3.5 Question Review 已有 flag/exclusion，尚无完整质检工作台

已完成：

- `question_quality_flags`
- `GET /api/admin/question-review`
- `PATCH /api/admin/question-review/:questionId`
- open/resolved/ignored 状态
- severity/reason/note
- `excludedFromPractice=true` 排除新练习选题
- System Status quality summary
- audit log

未完成：

- 管理端可视化工作台
- 批量处理/导出
- 题目原文编辑器
- 复杂审批流
- 质检历史筛选 UI

### 3.6 非客观题/复杂题型流程未完成

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

### 3.7 学习记录与统计不足

已有：

- attempts
- wrong_questions
- practice_sessions

新增：

- 每日练习统计 API
- 正确率趋势 API
- 错题 touch 趋势 API
- activity streak
- 学习目标 API
- 错题复习反馈信号

仍缺：

- 周/月聚合视图或前端派生展示
- 更细题库维度趋势
- 掌握规则
- 再练反馈
- 完整长期学习档案与推荐策略

### 3.8 Practice 后端结构太大

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

### 3.9 Wrongbook 与 Practice 边界不够好

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

### 3.10 Contract 未完全覆盖后端

已覆盖：

- Practice
- Practice session page/card
- Wrongbook
- Auth
- Catalog
- Admin Auth / Bank Mapping / System Status / Import Job
- Admin Question Review
- 通用 error
- Health
- Readiness/DB health

未覆盖：

- 部分 request schema 在 route 中仍手写
- metrics/alert payload

### 3.11 生产运维能力不足

缺：

- structured logging beyond Fastify defaults
- trace id propagation beyond request id
- metrics
- alerting
- rate limit 策略细化与分布式存储
- CSRF 策略正式启用决策与前端配合
- backup restore drill
- migration rollback plan
- secrets management
- production deploy checklist validation
- 远端 CI 首次验收与 branch protection

### 3.12 异常数据 fixture 不足

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

本路线中 B1 到 B5.9 已按顺序执行完毕，B7.1 学习概览、B7.2 学习趋势、B7.3 学习目标/反馈和 B7.4 收藏/长期复习标记也已落地。当前仍然不要直接开管理端大工程，也不要先做最终视觉；应继续补齐正式身份、推荐策略、导入 reset/队列化、生产安全和剩余运营闭环。

当前建议下一步做 **B9 Production Backend Readiness 前置项**。

原因：

1. 学生客观题主链路已经稳定，适合继续在稳定测试保护下补管理端能力。
2. Bank Mapping read/write、System Status、Import Jobs dry-run/error report/true import gate、Question Review Flags、Admin User manage、bootstrap 和 audit query 已有 Auth/RBAC/Audit 基础；学生学习概览/趋势/目标/反馈/长期复习标记已有后端 API，但真实运营还缺导入 reset/队列化、正式管理 UI、生产安全与推荐策略。
3. 管理端信息架构已先以静态文档冻结，继续补后端 command/query 比现在直接做 UI 更稳。

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
- `/api/health/readiness` response 使用 `ReadinessResponseV1Schema`。
- `/api/health/metrics` response 使用 `MetricsResponseV1Schema`。
- route 回归覆盖 Auth/Catalog 不合法 repository payload fail-closed。
- B9.1 已补 readiness/DB health、request id 和基础 guardrail。

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

状态：**已完成 B5.1–B5.9，2026-07-14。**

优先实现：

1. admin identity + RBAC — **已完成**
2. audit log foundation — **已完成**
3. bank mappings list/detail — **已完成**
4. bank mappings update + batch visible/status — **已完成**
5. system status — **已完成**
6. import jobs — **已完成（dry-run first）**
7. question review flags — **已完成**
8. admin bootstrap / audit log read / admin IA gate — **已完成**
9. admin user manage — **已完成**
10. import error report / true import mode gate — **已完成；true import 仅在 `ADMIN_IMPORT_ENABLE_WRITE=true` 下启用，reset 仍关闭**

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

B5.6/B5.7/B5.8/B5.9 和 B7.1/B7.2/B7.3/B7.4 已在下一节落地；当前下一步：**B9 Production Backend Readiness**。

### Phase B5.6 — Question Review Flags

状态：**已完成，2026-07-14。**

目标：补齐管理端题目质量标记后端，让内容运营可以记录异常题并选择性排除练习。

实际落地：

- migration `0007_question_quality_flags.sql`，新增 `question_quality_flags`。
- shared v1 Question Review schema，覆盖 list/update/detail response、flag type/severity/status 和 actor attribution。
- `GET /api/admin/question-review`，支持 bank/type/flag/status/severity/keyword/pagination 查询。
- `PATCH /api/admin/question-review/:questionId`，支持 add/resolve/ignore flag 与 `excludedFromPractice` 切换。
- `question_review:read/write` 权限守卫，覆盖 `401/403/400/404`。
- `question_review.flag_add`、`question_review.flag_resolve`、`question_review.exclude_update` audit log。
- System Status quality summary 接入真实表。
- 新建 Practice bank session 会排除 open 且 `excludedFromPractice=true` 的题目；错题再练等显式题目列表不受影响。
- route/unit/schema/PostgreSQL integration 已覆盖。

注意：

- 第一版仍不直接编辑原始题干/答案，只记录 quality flag。
- 不做管理前端。
- 是否立即影响学生选题由 `excludedFromPractice=true` 明确控制。

### Phase B5.7 — Admin Bootstrap + Audit Log Read / Admin IA Gate

目标：在正式管理端 UI 前，让后台具备安全初始化、审计查询和信息架构静态验收能力。

实际落地：

- 初始 `super_admin` bootstrap：`npm run admin:bootstrap`，通过环境变量一次性创建，不开放 public registration。
- 成功 bootstrap 写 `admin_user.bootstrap` audit log，不输出明文密码。
- shared v1 Admin Audit Log schema。
- `GET /api/admin/audit-logs`：按 action/resource/actor/result/time/limit/offset 查询。
- `audit_log:read` 权限守卫。
- audit log repository memory/PostgreSQL 双路径。
- PostgreSQL integration 覆盖 bootstrap、audit query 和权限边界。

已补文档/产品能力：

- 管理端 sitemap：题库整理、导入任务、题目质检、系统状态、审计日志、管理员初始化/账号管理边界。
- 各页面字段表、状态表、权限矩阵和空/错误/加载态。
- 静态 wireframe 只用于 contract 校验，不启动正式前端实现。

不做：

- 不创建正式 Admin UI。
- 不开放管理员注册。
- 不直接编辑原始题目。
- 不开启真正写入 import mode。
- 不做复杂审批流。

### Phase B5.8 — Admin User Manage + Import Error Report / True Import Gate

状态：**已完成 Admin User Manage + Import Error Report，2026-07-14。True import mode 继续关闭。**

实际落地：

- shared v1 Admin Managed User schema：list/detail/create/update request/response。
- `GET /api/admin/users`：status/role/keyword/limit/offset。
- `GET /api/admin/users/:adminId`。
- `POST /api/admin/users`：hash password，不返回 password/passwordHash。
- `PATCH /api/admin/users/:adminId`：displayName/status/roles/password 更新。
- `admin_user:manage` 权限守卫，非 `super_admin` 返回 `403`。
- 阻止禁用或移除最后一个 active `super_admin`。
- `admin_user.create` / `admin_user.update` audit log。
- memory/PostgreSQL Admin User repository/service。
- shared v1 Import Job Error Report schema。
- `GET /api/admin/import-jobs/:jobId/errors`：返回 `{ jobId, status, errorSummary }`。
- PostgreSQL integration 覆盖真实 create/update/list/detail、last-super-admin guard、audit 和 import error report。

保留不做：

- 不创建正式 Admin UI。
- 不开放 public admin registration。
- 不做复杂审批流。
- 不开启真正写入 import mode；`mode=import` 继续返回 `422`，等待专门 rollback/idempotency fixture 后再启用。

后续已由 B5.9 处理：

- **B5.9 True Import Mode Gate**：在显式环境变量开启时允许真实写入导入，并补 rollback/idempotency fixture 与 PostgreSQL integration。

### Phase B5.9 — True Import Mode Gate

状态：**已完成，2026-07-14。**

实际落地：

- 新增 `ADMIN_IMPORT_ENABLE_WRITE` 配置，默认 `false`。
- `mode=import` 只有在服务端启用 `ADMIN_IMPORT_ENABLE_WRITE=true` 且配置 PostgreSQL import runner 时才运行；默认仍返回 `422`。
- `mode=import` 复用 `loadQuestionBankData` + `importQuestionBank` 真实事务写入 classifications、questions、question_options 和 bank_mappings。
- `generateMappings=false` 时跳过 bank_mappings 生成。
- `resetBeforeImport=true` 在 import mode 中仍显式禁止，即使 `super_admin` 也返回 `422 resetBeforeImport is not enabled for import mode yet`。
- 导入失败会把 job 标为 `failed`，写入 `errorSummary`，并由 import transaction 回滚已写入的 corpus 行。
- PostgreSQL integration 覆盖：
  - enabled `mode=import` 成功写入。
  - 重复 import 后行数不重复增长，证明 upsert 幂等。
  - 失败 import 回滚部分 corpus 写入并保留 error report。
  - true import reset gate。
- route/service/unit 覆盖默认关闭、开启 runner、runner failure 和 reset gate。

仍保留不做：

- 不实现 resetBeforeImport 的真实清库/重导。
- 不引入异步 worker/队列。
- 不做 cancel/retry。
- 不创建正式 Admin UI。

下一步候选：

- **B9 Production Backend Readiness** 的安全/运维前置项：rate limit、CSRF、readiness、备份恢复演练。

### Phase B7 — Student Learning Record And Statistics

状态：**B7.1 学习概览、B7.2 学习趋势、B7.3 学习目标/反馈与 B7.4 收藏/长期复习标记已完成，2026-07-14。**

目标：补学生长期学习闭环。

已完成后端能力：

- `GET /api/learning/dashboard`
- `GET /api/learning/trends`
- `GET /api/learning/goals`
- `PUT /api/learning/goals`
- `GET /api/learning/review-marks`
- `PUT /api/learning/review-marks`
- `DELETE /api/learning/review-marks/:id`
- `student_learning_goals`
- `question_bookmarks`
- practice summary stats
- daily trends
- activity streak
- learning goals
- wrongbook feedback signals
- favorite / long-term review marks
- recent banks
- wrongbook trend summary
- correct rate by bank/type
- mastered/pending wrongbook summary
- shared v1 Learning contract
- memory/PostgreSQL repository
- route/unit/PostgreSQL integration 覆盖

仍未完成：

- 周/月聚合展示或前端派生。
- wrongbook re-practice feedback 的前端展示和更细策略。
- 推荐策略、错因/掌握规则和更完整长期学习档案。
- 前端学生档案/学习概览页面。

后续可再考虑是否新增：

```text
student_learning_daily_stats
review_items
```

### Phase B7.4 — Bookmarks / Long-term Review Flags

状态：**已完成，2026-07-14。**

实际落地：

- migration `0009_question_bookmarks.sql`，新增 `question_bookmarks`。
- shared v1 Learning Review Mark schema，覆盖 list/upsert/delete response、`favorite`、`longTermReview`、`source` 与 note 边界。
- `GET /api/learning/review-marks`：支持 `bankId`、`kind=all|favorite|long_term_review`、`limit/offset`。
- `PUT /api/learning/review-marks`：同一学生/题目/题库 upsert，校验题目属于题库或后代分类。
- `DELETE /api/learning/review-marks/:id`：只删除当前学生自己的标记。
- memory/PostgreSQL repository、route fail-closed、migration test、shared contract test 和 PostgreSQL integration 已覆盖。

不做：

- 不做正式前端页面。
- 不把 review mark 变成推荐算法。
- 不复制完整题干/选项/解析到 bookmark 表；列表只返回摘要。

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

### Phase B9.1 — Backend Readiness Guardrails

状态：**已完成，2026-07-14。**

实际落地：

- shared v1 `ReadinessResponseV1Schema` 与可选 `requestId` error contract。
- `GET /api/health/readiness`：`USE_DATABASE=false` 时 database dependency 为 `disabled`；PostgreSQL runtime 执行 `SELECT 1`；失败返回 `503`。
- 所有响应写入 `x-request-id`，并复用合法客户端传入值。
- 未捕获异常统一返回结构化 `{ error, requestId }`，避免泄漏内部错误。
- 基础安全 headers：`x-content-type-options`、`x-frame-options`、`referrer-policy`、`cross-origin-resource-policy`。
- 可配置最小 rate limit：`RATE_LIMIT_ENABLED`、`RATE_LIMIT_WINDOW_MS`、`RATE_LIMIT_MAX`。
- 可配置 CSRF origin check：`CSRF_ORIGIN_CHECK_ENABLED`、`CSRF_ALLOWED_ORIGINS`，只拦截带学生/管理员 Cookie 的 unsafe method。
- route/unit/shared/PostgreSQL integration 覆盖。

仍保留不做：

- 不接入 Prometheus/metrics。
- 不做告警。
- 不在 B9.1 做备份恢复演练；该项已由 B9.2 处理。
- 不做部署回滚自动化。
- 不把内存 rate limit 当作多实例生产最终方案。

### Phase B9.2 — Production Operations Drill

状态：**已完成，2026-07-14。**

实际落地：

- 新增 `npm run ops:backup-restore:docker`。
- 脚本在隔离 `postgres-test` 上执行全部 migration。
- 写入最小运维 fixture，覆盖题库、学生、题目、选项、attempt、wrongbook、learning goals、question bookmarks。
- 使用容器内 `pg_dump` 生成 backup。
- 创建 `bkyexam_restore_test` 并恢复 backup。
- 比较源库和恢复库关键表行数。
- 演练产物写入 `artifacts/ops/backup-restore-drill/<timestamp>/`，并通过 `.gitignore` 排除。
- 新增 [`production-operations.md`](production-operations.md)，固定生产 backup、restore drill、migration rollback/forward-fix、deployment checklist、remote CI/branch protection gate。

仍保留不做：

- 不实际接入远端 CI branch protection；仅固定验收清单。
- 不做真实生产数据量级恢复压测。
- 不做自动化蓝绿/回滚发布系统。
- 不做监控/告警接入。

### Phase B9.3 — Observability / CI Gate Evidence

状态：**已完成，2026-07-15。**

实际落地：

- 新增 shared v1 `MetricsResponseV1Schema`：
  - service / generatedAt / uptimeSeconds
  - process pid / nodeVersion / RSS / heap used
  - HTTP totalRequests
  - status buckets：informational / success / redirection / clientError / serverError
  - per-route counters 和 averageDurationMs
  - status bucket sum 必须与 request count 一致
- 新增 Fastify observability hook：
  - `onRequest` 记录高精度开始时间
  - `onResponse` 记录 route/method/status/duration
  - structured request log 使用 `event=http_request`、`requestId`、`method`、`route`、`statusCode`、`statusBucket`、`durationMs`、`remoteAddress`、`userAgent`
- 新增 `GET /api/health/metrics`，用于最小部署后 smoke/debug。
- PostgreSQL integration 覆盖真实 app 中 readiness 后 metrics route 可读。
- 新增 [`ci-gate-evidence.md`](ci-gate-evidence.md)，固定远端 CI、branch protection 与部署验收证据模板。
- `production-operations.md` 的 deployment checklist 纳入 `/api/health/metrics` postflight。

仍保留不做：

- 不接入 Prometheus / OpenTelemetry / 外部 metrics store。
- 不接入正式 alerting。
- 不代替日志聚合；当前只是 structured log 字段策略和进程内 metrics smoke。
- 不推送远端分支，也不替项目 owner 设置 branch protection；远端 CI 首次通过与 required checks 仍需后续实际记录。
- 不创建正式 Admin UI 或学生前端新页面。

## 6. 推荐下一步具体执行

如果继续本规划，下一步建议执行：

> **正式身份安全策略**，或继续 B9.4 远端 CI / branch protection 实际确认。

具体第一阶段 commit 目标可定为：

```text
docs: record production identity security strategy
```

范围建议只包含：

- 学生身份从“用户名即身份”升级前的安全决策。
- 管理员密码策略、会话策略和恢复流程。
- Cookie/CSRF/rate-limit 生产参数。
- secrets 管理与部署配置边界。
- 远端 CI 与 branch protection 若可用，则补实际证据记录。

不做：

- 不改正式 UI
- 不创建 `apps/admin`
- 不开放 public 管理员注册
- 不编辑原始题干/选项/答案
- 不改 true import reset gate；reset/队列化另设阶段
- 不做完整审核工作台
- 不开启复杂审批流
- 不改学生端业务语义
- 不引入微服务
- 不引入队列

这样可以把“学生学习后端闭环”转向“生产安全与运营闭环”，再进入正式前端设计审核。

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

> **学生客观题主链路已经完成并稳定；Learning Dashboard/Trends/Goals/Review Marks 后端 MVP+ 已落地；Admin 后端 contract 已设计，Auth/RBAC/Audit、题库整理 read/write、System Status、Import Jobs dry-run/Error Report/true import gate、Question Review Flags、Audit Log read、Admin User manage 与 super_admin bootstrap 已落地；readiness、request id、基础安全 headers、可配置 rate limit/CSRF origin check、backup/restore drill、structured request log 与 metrics smoke endpoint 已落地；完整平台后端还缺正式身份、模块化、非客观题、推荐策略/完整长期档案、管理前端、外部监控告警和远端 CI/branch protection 实际确认。**

最合理的下一步是继续后端闭环：优先做正式身份安全策略，或在远端仓库条件允许时完成 CI/branch protection 实际验收；正式前端仍应等管理后端 command/query 与页面语义稳定后再进入设计实现。
