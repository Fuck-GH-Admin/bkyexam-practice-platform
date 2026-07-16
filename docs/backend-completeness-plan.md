# Backend Completeness And Next Plan

状态日期：**2026-07-16**
最近完整验证：**2026-07-16 `npm run verify:docker` PASS**
本轮初始基线提交：`cae6657 feat: add student session home and history`

本文专门从后端视角回答两个问题：

1. 现在已经完成了多少。
2. 与“完整 BKYExam 练习/考试平台”目标相比，还有哪些部分未达成，以及下一步准备怎么做。

## 1. 总体判断

后端已经完成的是：**学生客观题内部试用版的主闭环**。B9.34 已在真实服务器完成 current-HEAD staging production gate / deployment smoke / worker / backup-restore / deployment evidence 验收；B9.35 已在代码侧补齐首次改密服务端门禁、migration ledger/checksum、真实 System Status、reset blocking gate、custom backup evidence 和导入资源 monitor。

真实验收还发现并关闭了一个重要风险：`resetBeforeImport=true` 会通过 corpus 外键级联删除 practice/attempt/wrongbook 数据。当前已新增独立 `ADMIN_IMPORT_ENABLE_RESET=false` 维护门禁，routine true import 只允许 non-reset。连续全量 upsert 后的主机挂起经 SAR/journal 确认为磁盘 I/O 饱和，而不是 OOM 或公网网络。

后端尚未完成的是：**完整平台化后端**，尤其是非客观题流程、生产运维、推荐策略、更大范围 Admin 模块化边界和实时 progress/外部可观测性。

| 口径 | 后端完成度估算 | 判断 |
| --- | ---: | --- |
| 学生客观题后端闭环 | **约 90–94%** | 已可内部试用；核心链路稳定，学习趋势、目标和反馈信号后端也已具备。 |
| 后端工程可验证性 | **约 96%** | 单元、路由、PostgreSQL integration、Playwright、完整题库双次导入、production gate、真实 current-HEAD staging、worker、migration ledger/checksum、可校验 restore 和 deployment evidence 已覆盖；剩余主要是持续容量测试与外部告警。 |
| 后端模块化程度 | **约 66–70%** | 业务上下文已清楚；Practice、Import Jobs、Learning repository、Admin Question Review、Admin Students 与 Bank Mappings 已完成第一轮拆分；Import Jobs repository 已拆成 memory/pg/mapper，Learning 已拆成 facade/types/memory/pg/utils，Question Review 已拆成 facade/types/memory/pg/mappers，Admin Students 已拆成 facade/types/service/memory/pg/mappers/utils，Bank Mappings 已拆成 facade/types/memory/pg/mappers/rules；route validation/error mapping 等仍存在边界混杂。 |
| 完整平台后端 | **约 88–89%** | 学生客观题稳了；管理端已落地 Auth/RBAC/Audit、题库整理、状态、dry-run/import 导入任务、import error report、true import gate、reset/cancel/retry、durable worker/heartbeat/stuck recovery、题目质检 flag/exclusion、管理员 bootstrap、Audit Log read、Admin User manage、Admin Student Manage 与 Question Review detail/override；学生学习概览、趋势、目标、反馈、长期复习标记 API、正式学生身份数据模型、密码登录 enforcement、旧账号迁移 CLI、管理员登录锁定、生产 gate runbook 和真实 staging 验收与 B9.16 前端开工前审查包已落地，但全题型、管理前端、推荐策略、外部监控和正式生产运营能力仍未完成。 |
| 当前 HEAD 公开生产后端就绪 | **约 88–91%** | commit `c8b310e`、migration `0013`、Question Review override、Import worker、独立 Admin、systemd/Nginx、真实数据恢复和 deployment evidence 已通过；仍缺外部告警、持续容量测试、发布审批与真实用户验收。 |

这些百分比是工程判断，不是测试覆盖率。

B9.14 staging 实机验收摘要：

```text
target = https://exam.acgbot.cc.cd
commit = 1686c6e27a23029c6cc53c8a22ddb843c3d332d7
production gate = ok=true
legacyPasswordlessStudents = 0
HTTP smoke = PASS
deployment evidence = ready=true, 14 pass / 0 warn / 0 fail
```

B9.15 staging 运维基线摘要

```text
synthetic healthcheck timer = active/enabled
backup/restore drill = PASS
load baseline = PASS, 27 checks / 0 failures
PR #2 decision record = review required, CI green
credential delivery runbook = completed
admin IA review draft = completed
```

当前 B9.34 staging 基线：

```text
server HEAD = c8b310e950c6c31faa7f8e45c8f6bd9d435eceb5
latest migration = 0013_import_job_worker.sql
/ = student web
/admin/ = independent admin app
production gate = ok
deployment evidence = ready, 14 pass / 0 warn / 0 fail
final isolated restore = pass
```

详细记录见 [`b9.34-current-head-staging-rebaseline.md`](b9.34-current-head-staging-rebaseline.md)。

## 2. 已完成且被验证的后端能力

### 2.1 Database And Import

已完成：

- PostgreSQL schema 与十三份 ordered SQL migration。
- runner-managed `schema_migrations` ledger、SHA-256 drift 和 missing-file detection。
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
- `resetBeforeImport=true` 只在 `super_admin` 且 `ADMIN_IMPORT_ENABLE_RESET=true` 的维护窗口允许执行；默认返回 422。真实 staging 已确认它会级联删除学生学习数据，因此 routine import 必须使用 `resetBeforeImport=false`。
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

B9.35 起，`password_reset_required=true` 不再只依赖学生 Web 跳转。服务端会拒绝该 session 访问 Practice/Wrongbook/Learning API，直到学生成功调用改密接口。

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
- 523 Vitest
- 453 API tests
- 33 Web tests
- 11 Admin tests
- 26 Shared tests
- 5 Playwright browser smoke
- 1 PostgreSQL integration profile
- API build/typecheck
- Web build/typecheck
- Admin build/typecheck
- Full corpus slow smoke profile

当前定位：**后端质量门已经可重复运行**。

## 3. 与目标未达成的部分

这里的“未达成”按完整 BKYExam 平台目标计算，不只按学生客观题 MVP。

### 3.1 正式身份与权限仍未完全完成

当前状态：

- 正式身份策略已在 B9.4 冻结：管理员批量创建学生、用户名/学号 + 密码、管理员重置密码、`className/groupName` 轻量字段、旧账号保留。
- 学生身份安全数据模型已在 B9.5 落地，Admin Student Manage API 已在 B9.6 落地。
- B9.7 已把学生登录推进到正式密码模式：默认要求 `password`，不再公开自助创建学生；仅显式 legacy env 可以临时允许无密码旧账号。
- 已启用学生登录失败计数、临时锁定、成功清空失败状态和 `last_login_at` 更新；学生改密 API 已落地。
- 不做学校账号/邀请码/SSO 作为当前阶段；邀请码/SSO 留作远期。
- 仍没有学生自助找回账号、账号合并和正式前端改密入口；旧账号批量临时密码迁移 CLI 已落地，且 B9.14 已在 staging 目标环境实际迁移 13 个旧账号并保留历史数据。
- Admin identity/RBAC/audit foundation、初始 `super_admin` bootstrap、Admin User manage 和管理员登录失败锁定已落地；生产参数和更完整账号安全策略仍需上线验收。

影响：

- 后端身份主链路已具备公开生产雏形，但仍不能直接发布为完整生产系统。
- 不能安全开放管理端给真实运营团队，直到 PR review/merge、监控告警、凭据交付流程、系统性压测和管理 UI 验收完成。
- 旧学生数据会保留，但历史旧账号需要管理员重置/迁移临时密码后再进入正式模式。

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
- Import Jobs dry-run/Error Report/reset/cancel/retry/worker heartbeat APIs
- True Import Mode Gate（`ADMIN_IMPORT_ENABLE_WRITE=true` 才允许写入；reset 还要求 `super_admin` 与 `ADMIN_IMPORT_ENABLE_RESET=true`）
- Question Review flag/exclusion APIs
- Audit Log read API
- Admin User manage API
- `super_admin` bootstrap CLI

未完成：

- 实时 progress 事件流和错误文件级下载
- 管理端前端最终视觉/完整工作流

Import Jobs 控制和耐久性主链路已补齐；剩余缺口转为实时进度、错误可观测性、完整审核流程和更大范围模块化。

### 3.3 Catalog 已有管理 API，但运营工作流未完成

已能给学生展示题库，也能通过 Admin API 编辑题库整理字段、发布/隐藏和做乐观并发控制，但仍缺：

- 发布流程
- 审批流程
- 数据健康检查
- 内容质量抽查
- mapping 变更历史

### 3.4 Import 已有 gated true import，但还不是完整平台任务系统

已完成 CLI 导入、smoke、`import_jobs` 表、dry-run 触发、`ADMIN_IMPORT_ENABLE_WRITE=true` 下真实写入导入、active lock、queued worker、heartbeat、stuck recovery、进度/summary/error 摘要、失败回滚、幂等验证和 source allowlist，但缺：

- 错误下载/按文件行号查看
- 增量导入策略
- typed reset 二次确认
- SSE/WebSocket 实时 progress 事件流
- 阶段级 progress current/total 细化
- 管理端最终可视化

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
10. import error report / true import mode gate / reset/cancel/retry/worker heartbeat — **已完成；true import 仅在 `ADMIN_IMPORT_ENABLE_WRITE=true` 下启用，reset 还要求 `super_admin` 与 `ADMIN_IMPORT_ENABLE_RESET=true`**

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

B5.6/B5.7/B5.8/B5.9 和 B7.1/B7.2/B7.3/B7.4 已在下一节落地；当时的下一步是 **B9 Production Backend Readiness**。截至 2026-07-16，B9.34 staging re-baseline 已完成，本段只保留为阶段历史。

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
- B9.11 当时 `resetBeforeImport=true` 仍显式禁止；B9.27 改为 `super_admin` 且 `ADMIN_IMPORT_ENABLE_WRITE=true` 时允许，并在同一事务内 reset 后导入；B9.34 又增加独立 `ADMIN_IMPORT_ENABLE_RESET=true` 维护门禁。
- 导入失败会把 job 标为 `failed`，写入 `errorSummary`，并由 import transaction 回滚已写入的 corpus 行。
- PostgreSQL integration 覆盖：
  - enabled `mode=import` 成功写入。
  - 重复 import 后行数不重复增长，证明 upsert 幂等。
  - 失败 import 回滚部分 corpus 写入并保留 error report。
  - true import reset success 与 destructive corpus reset。
- route/service/unit 覆盖默认关闭、开启 runner、runner failure、reset 权限、cancel 与 retry。

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

### Phase B9.4 — Identity Security Strategy

状态：**策略文档已完成，2026-07-15。**

实际决策：

- 学生账号来源：管理员批量创建/导入；不开放公网自助注册。
- 登录凭据：用户名/学号 + 密码，继续使用 `loginName` 作为唯一标识。
- 密码找回：管理员重置密码；暂不做邮箱/短信找回。
- 学生组织字段：先加 `className` / `groupName` 文本字段，不建正式 school/class/enrollment 模型。
- 已知班级规则：`202502040201`–`202502040230` 属于 `2班`，其余暂未定。
- 登录失败策略：启用失败计数和临时锁定，但按内部试用要求放宽。
- 旧账号：保留历史学生与学习数据，通过后续迁移/临时密码进入正式模式。

新增文档：

- [`identity-security-strategy.md`](identity-security-strategy.md)

仍保留不做：

- 本阶段不改登录行为。
- 不做正式前端。
- 不做公网注册、邮箱找回、短信找回、SSO、MFA。
- 不做复杂组织树。

### Phase B9.5 — Student Identity Data Model

状态：**已完成，2026-07-15。**

实际落地：

- 新增 migration `0010_student_identity_security.sql`。
- `students` 扩展：
  - `class_name`
  - `group_name`
  - `status = active|disabled`
  - `password_reset_required`
  - `password_changed_at`
  - `failed_login_count`
  - `failed_login_window_started_at`
  - `locked_until`
  - `last_login_at`
  - `updated_at`
  - `created_by_admin_id`
- migration 回填 `202502040201`–`202502040230` 为 `2班`。
- shared Auth contract 支持 `className`、`groupName` 和 `passwordResetRequired`。
- PostgreSQL Auth repository 映射新字段。
- Student session repository 返回 class/group/reset state，并排除 disabled student session。
- 学生 auth service 保留 legacy passwordless 账号，识别 disabled/locked 状态，并在新建内部 MVP 学生时套用已知 `2班` 规则。
- route/unit/shared/PostgreSQL integration 已覆盖。

仍保留不做：

- B9.6 已开放管理员学生账号管理 API。
- B9.7 已强制正式学生密码登录并新增学生改密 API。
- 不新增学生修改密码前端。
- 不删除旧学生账号或历史练习数据。

### Phase B9.6 — Admin Student Manage API

状态：**已完成，2026-07-15。**

实际落地：

- shared v1 新增 Admin Student Manage contract：
  - `AdminStudentV1`
  - `ListAdminStudentsRequestV1`
  - `CreateAdminStudentRequestV1`
  - `BulkCreateAdminStudentsRequestV1`
  - `UpdateAdminStudentRequestV1`
  - `ResetAdminStudentPasswordRequestV1`
  - `RevokeAdminStudentSessionsResponseV1`
- RBAC 新增：
  - `student_account:read`
  - `student_account:write`
  - `student_account:reset_password`
  - `student_account:revoke_session`
- `operator` 可进行学生账号日常运营；`content_editor` 默认无学生账号权限；`super_admin` 拥有全部权限。
- 新增后端 API：
  - `GET /api/admin/students`
  - `GET /api/admin/students/:studentId`
  - `POST /api/admin/students`
  - `POST /api/admin/students/bulk-create`
  - `PATCH /api/admin/students/:studentId`
  - `POST /api/admin/students/:studentId/reset-password`
  - `POST /api/admin/students/:studentId/revoke-sessions`
- 单个/批量创建均写 `password_hash`，不返回明文密码或 hash。
- 批量创建单次限制 200，支持默认临时密码、部分 created/skipped/failed 结果和同请求重复账号失败隔离。
- `202502040201`–`202502040230` 省略 `className` 时自动推断为 `2班`。
- 重置密码设置 `passwordResetRequired=true`，清空失败计数/临时锁定，并可撤销该学生未过期 session。
- 撤销 session 使用 `student_sessions.revoked_at`，不删除学生或学习数据。
- audit log 覆盖 `create`、`bulk_create`、`update`、`reset_password`、`revoke_sessions`。
- PostgreSQL integration 覆盖真实 route/repository/session revocation/audit。

仍保留不做：

- 学生密码登录 enforcement 已由 B9.7 处理。
- 不新增学生自助修改密码前端。
- 不做 CSV 文件上传；当前只支持 JSON 批量创建。
- 不新增复杂 school/class/enrollment 组织模型。

### Phase B9.7 — Password Login Enforcement

状态：**已完成，2026-07-15。**

实际落地：

- shared v1 `AuthLoginRequestV1Schema` 正式要求 `password`。
- shared v1 新增学生改密 contract：
  - `ChangeStudentPasswordRequestV1Schema`
  - `ChangeStudentPasswordResponseV1Schema`
- `POST /api/auth/login` 默认要求密码；缺少密码返回 `400 Student password is required`。
- 默认关闭公网自助创建学生；未知 `loginName` 即使带密码也返回凭据失败。
- 旧无密码账号仅在显式 `STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED=true` 时允许继续登录/兼容自动创建；公开生产默认必须关闭。
- 密码错误递增 `failed_login_count`，在默认 **10 次 / 30 分钟窗口 / 15 分钟临时锁定** 策略下写入 `locked_until`。
- 成功登录清空失败计数、窗口和锁定状态，并更新 `last_login_at`。
- 临时密码账号登录继续返回 `passwordResetRequired=true`。
- 新增 `POST /api/auth/password/change`：校验当前密码，写入新 hash，清空 `passwordResetRequired`、失败计数和锁定状态。
- PostgreSQL Auth repository 支持按 id 读取、失败/成功状态更新和学生密码更新。
- route/unit/shared/PostgreSQL integration 已覆盖无密码默认失败、legacy 显式兼容、临时密码登录、改密后 reset state 清空、旧密码失效和 session 保持。

仍保留不做：

- 不新增正式学生改密前端；前端仍应等后端语义和管理端信息架构稳定后再设计。
- 不做公开注册、邮箱/短信找回、SSO、MFA、账号合并。
- 不自动删除旧账号或历史 practice/wrongbook/learning 数据。
- 旧账号批量临时密码写入 CLI 已由 B9.9 补齐。
- 管理员登录失败锁定已由 B9.10 补齐。

### Phase B9.8 — Production Gate Hardening / Migration Runbook

状态：**已完成，2026-07-15。**

实际落地：

- 新增 `npm run ops:production-gate` 根脚本和 API workspace 脚本。
- 新增 `apps/api/src/ops/productionGate.ts`：
  - 检查 `DATABASE_URL`、`USE_DATABASE`、`COOKIE_SECRET`、`COOKIE_SECURE`。
  - 检查 `STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED` 必须关闭。
  - 检查 `RATE_LIMIT_ENABLED`、`CSRF_ORIGIN_CHECK_ENABLED` 和生产 HTTPS origins。
  - 对残留 `ADMIN_BOOTSTRAP_*` 和 `ADMIN_IMPORT_ENABLE_WRITE=true` 给出 warning。
  - 连接 PostgreSQL 汇总学生身份迁移状态。
  - 对 `legacyPasswordlessStudents > 0` 输出 blocking failure。
- 新增 `docs/production-gate-runbook.md`：
  - production gate 命令、exit code、参数。
  - env gate 表。
  - 旧账号迁移流程。
  - 发布前最小证据包。
- `docs/production-operations.md`、`docs/deployment.md`、`docs/ci-gate-evidence.md`、`README.md` 已链接该 gate/runbook。
- 新增 route/unit 风格的 ops tests，覆盖 env gate、PostgreSQL summary mapping、CLI exit code 和 pool cleanup。

仍保留不做：

- 旧账号写入仍留给 B9.9；B9.8 工具只读审计和阻断。
- 管理员登录失败锁定仍留给 B9.10。
- 不做远端 CI/branch protection 实际确认。
- 不做正式前端。

### Phase B9.9 — Legacy Student Password Migration Tool

状态：**已完成，2026-07-15。**

实际落地：

- 新增 `npm run ops:legacy-student-password-migration` 根脚本和 API workspace 脚本。
- 新增 `apps/api/src/ops/legacyStudentPasswordMigration.ts`：
  - 默认 dry-run，不写库。
  - `--apply` 才执行写入。
  - 仅选择 `password_hash IS NULL` 的学生。
  - 写入 password hash、`password_reset_required=true`、`password_changed_at=NULL`。
  - 清空 `failed_login_count`、`failed_login_window_started_at`、`locked_until`。
  - 默认撤销未过期 student session；支持 `--no-revoke-sessions`。
  - 支持统一临时密码环境变量或 `--credentials-out=artifacts/.../credentials.csv` 生成每人独立临时密码。
  - JSON 输出和 audit log 均不包含明文临时密码。
- 新增 `docs/legacy-student-password-migration.md`，并更新 production gate/operations/deployment runbook。
- 测试覆盖 dry-run、apply、credential file、PostgreSQL SQL shape、CLI transaction 和 plaintext 不泄露。

仍保留不做：

- 不决定每个班级最终临时密码分发流程；该流程必须由真实运营线下确认。
- 不做正式管理端前端。
- 不做邮箱/短信找回。

### Phase B9.10 — Admin Login Security Hardening

状态：**已完成，2026-07-15。**

实际落地：

- 新增 `0011_admin_identity_security.sql`。
- 扩展 `admin_users`：`password_changed_at`、`failed_login_count`、`failed_login_window_started_at`、`locked_until`。
- 管理员登录失败写入失败计数；默认 **10 次 / 30 分钟窗口 / 15 分钟锁定**。
- 锁定管理员登录返回 `423 Admin user temporarily locked`，并写入 failure audit。
- 成功登录清空失败计数、窗口和锁定状态。
- 管理员被重置密码时更新 `password_changed_at` 并清空失败/锁定状态。
- 测试覆盖 service、route、migration、schema 和 PostgreSQL repository SQL shape。

仍保留不做：

- 不做 MFA/SSO。
- 不做更细粒度的登录路由专用限流；当前仍依赖可配置平台级 rate limit。
- 不做正式 Admin UI。

### Phase B9.11 — Production Deployment Evidence / Remote CI Closure

状态：**已完成证据工具与远端审计，2026-07-15。**

实际落地：

- 新增 `npm run ops:deployment-evidence` 根脚本和 API workspace 脚本。
- 新增 `apps/api/src/ops/deploymentEvidence.ts`：
  - `--template` 生成 deployment evidence JSON 模板。
  - `--evidence=<file>` 校验证据文件。
  - `--require-ready` 在证据未满足 production-ready 时返回 exit code `2`。
  - 检查 local gates、production gate JSON、legacy migration closure、remote CI、branch protection、rollback plan 和 deployment smoke。
- 新增 `docs/production-deployment-evidence.md`。
- 更新 `docs/ci-gate-evidence.md`，记录 B9.11 远端审计快照：
  - remote branch `codex/practice-platform-stabilization` 不存在。
  - remote workflows / workflow runs 为空。
  - default branch `main` 未启用 branch protection。
- 测试覆盖 template、ready evidence、missing remote/branch/legacy blockers 和 CLI exit code。

仍保留不做：

- 不擅自推送远端分支。
- 不擅自创建 PR。
- 不擅自修改 branch protection。
- 不声明公开生产可发布；当前远端证据仍是 blocker。

### Phase B9.12 — Remote Publication / CI Validation

状态：**已完成首次远端 CI 验收，2026-07-15。**

实际落地：

- 已推送 `codex/practice-platform-stabilization` 到 `origin`。
- 远端分支 commit：`96f0dc090adb44dba21ba65354af823cafd48d44`。
- GitHub Actions workflow：
  - name：`Quality`
  - id：`313324672`
  - path：`.github/workflows/quality.yml`
  - state：`active`
- Workflow run：
  - run id：`29373386558`
  - conclusion：`success`
  - URL：`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29373386558`
- Job evidence：
  - `quality`：success，`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29373386558/job/87221554824`
  - `postgres-integration`：success，`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29373386558/job/87221554819`
- `docs/ci-gate-evidence.md` 与 `docs/production-deployment-evidence.md` 已记录本次远端验证事实。

仍保留不做：

- 不创建 PR。
- 不修改 `main` branch protection。
- 不部署到真实目标环境。
- 不声明公开生产可发布；当前 blocker 已从“远端 CI 缺失”变为“branch protection/required checks、目标环境 production gate、deployment smoke、外部监控和性能证据缺失”。

### Phase B9.13 — PR / Branch Protection / Required Checks

状态：**已完成 PR 与 branch protection 闭环，2026-07-15。**

实际落地：

- 已创建 PR `#2`：`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/pull/2`。
- PR base/head：`main` <- `codex/practice-platform-stabilization`。
- B9.13 初次 PR 证据 commit：`07a7892b0a6ea5e50fdeb5f4ec60090bdd54dc84`。
- PR 状态：
  - state：`OPEN`
  - mergeability：`MERGEABLE`
  - review decision：`REVIEW_REQUIRED`
- 初次 PR workflow run：
  - run id：`29376220149`
  - conclusion：`success`
  - URL：`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29376220149`
- Job evidence：
  - `quality`：success，`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29376220149/job/87230129856`
  - `postgres-integration`：success，`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29376220149/job/87230129819`
- 已启用 `main` branch protection：
  - required status checks：`quality`, `postgres-integration`
  - strict checks：enabled
  - required approving reviews：`1`
  - dismiss stale reviews：enabled
  - admin enforcement：enabled
  - required conversation resolution：enabled
  - force pushes / deletions：disabled
- `docs/ci-gate-evidence.md` 与 `docs/production-deployment-evidence.md` 已记录本次 PR / branch protection 验证事实。
- 后续提交以 PR `#2` 最新 status checks 为准，不要求每次文档提交都改写初次证据快照。

仍保留不做：

- 不合并 PR。
- 不替代 owner/reviewer 完成 review。
- 不部署到真实目标环境。
- 不声明公开生产可发布；B9.14 已完成目标环境 gate/smoke/evidence，当前 blocker 变为 PR review/merge、外部监控告警、系统性性能压测和正式生产发布验收。

### Phase B9.14 — Staging Production Gate / Deployment Smoke / Performance Evidence

状态：**已完成真实服务器 staging 验收，2026-07-15。**

实际落地：

- 目标环境：`https://exam.acgbot.cc.cd` / `root@47.88.33.54`。
- 部署目录：`/srv/bkyexam-practice-platform`。
- 备份/证据目录：`/srv/bkyexam-backups/b9.14-20260715080815`。
- 部署 commit：`1686c6e27a23029c6cc53c8a22ddb843c3d332d7`。
- 首次部署中断后已恢复：`npm ci` 未完成导致 service 缺少 `fastify`，重启后续跑安装/构建/迁移/导入。
- `npm ci`、`npm run build`、`db:migrate`、`import:db`、`db:smoke` 全部通过。
- 真实题库导入：2941 classifications / 89922 questions / 154899 options / 2662 mappings。
- 已更新 production env：secure cookie、rate limit、CSRF origin check、legacy passwordless disabled、true import write disabled。
- 旧 13 个无密码学生账号已保留并迁移到临时密码，`legacyPasswordlessStudents=0`。
- 已创建/刷新 `admin` super_admin 和 `202502040201`–`202502040230` 的 `2班` 学生账号。
- 目标数据库 production gate：`ok=true`。
- HTTPS smoke：health/readiness/metrics/banks/student login/auth me/practice create/admin login/admin me 全部 PASS。
- Deployment evidence CLI：`ready=true`，`14 pass / 0 warn / 0 fail`。
- 凭据只存在服务器受限目录 `/root/bkyexam-credentials/LATEST`，未写入 Git，未在日志/对话中输出明文密码。

仍保留不做：

- 不合并 PR，不替代 owner/reviewer 完成 review。
- 不声明外部监控告警已接入。
- 不声明已完成系统性压测。
- 不提前开始正式前端视觉实现。

## 6. 推荐下一步具体执行

B9.15 已完成目标环境运维基线；B9.16 已完成前端开工前审查包；B9.17 已完成学生账号启用最小 UI；B9.18 已完成 Admin 静态 wireframe 审查包；B9.19 已完成 Admin Operational MVP。

B9.19 实际落地：

- 独立 `apps/admin` workspace。
- Admin Login / logout / session guard / target route restore / 403 fallback。
- RBAC-filtered sidebar；Bank Mappings、Import Jobs、Question Review、Audit Logs 和 Admin Users 已逐步升级为功能页。
- System Status dashboard，使用 shared v1 response schema parse。
- Student Accounts list/detail/create/bulk-create/update/reset-password/revoke-sessions。
- Bulk create 支持 JSON 或简单 CSV paste，并渲染 created/skipped/failed partial result。
- Admin unit tests 与 Playwright admin smoke。
- 文档：[`admin-operational-mvp.md`](admin-operational-mvp.md)。

B9.20 已完成 Admin P1 工作流与后端缺口审查，文档见 [`admin-p1-workflow-gap-review.md`](admin-p1-workflow-gap-review.md)。

B9.20 结论：

- **Bank Mappings P1 UI 可以优先做**：list/detail/edit/bulk-status、optimistic concurrency、无客观题禁止发布、partial bulk result 和 audit 都已有后端语义。
- **Import Jobs 已从 dry-run/history/error-report 推进到 reset/cancel/retry 最小控制闭环**：B9.27 已补 cancel/retry endpoint 与 reset 事务策略；B9.28 已补 durable worker、heartbeat 和 stuck recovery；实时 progress 事件流仍后置。
- **Question Review 已经从 preview-level 升级到 detail/override 最小闭环**：B9.26 已补齐 full question detail、override 保存、版本冲突和导入覆盖语义；后续再补 diff/审批/回滚与批量操作。
- **System Status 不承载账号运营统计**：如需要 Admin Dashboard 总览，后续新增独立 ops summary API。

B9.21 已完成 Admin Bank Mappings P1 UI，文档见 [`admin-bank-mappings-p1-ui.md`](admin-bank-mappings-p1-ui.md)。

B9.21 实际落地：

- `/admin/bank-mappings` list/filter/page。
- `/admin/bank-mappings/:bankId` detail/edit。
- 文案字段保存、keywords、description、notes。
- status/visible 发布控制，按 `bank_mapping:publish` 权限启用。
- `expectedVersion` 保存与 `409` 冲突提示。
- `objectiveQuestionCount=0` 发布风险提示。
- bulk status updated/failed partial result。
- Admin unit tests、stateful mock Admin API 和 Playwright smoke。
- 继续不做最终视觉系统。

B9.22 已完成 Admin Import Jobs dry-run/history UI，文档见 [`admin-import-jobs-dry-run-ui.md`](admin-import-jobs-dry-run-ui.md)。

B9.22 实际落地：

- `/admin/import-jobs` list/filter/page。
- `/admin/import-jobs/create` dry-run 创建表单。
- `/admin/import-jobs/:jobId` detail。
- `/api/admin/import-jobs/:jobId/errors` error report panel。
- import mode disabled / source forbidden / running conflict / reset blocked 错误提示。
- Admin unit tests、stateful mock Admin API 和 Playwright smoke。
- B9.22 当时继续不做 true import write/reset/cancel/retry、异步 queue/worker 和最终视觉系统；B9.27 已补 true import reset/cancel/retry；B9.28 已补 durable queue/worker/heartbeat；最终视觉仍后置。

B9.23 已完成 Admin Question Review preview UI，文档见 [`admin-question-review-preview-ui.md`](admin-question-review-preview-ui.md)。

B9.23 实际落地：

- `/admin/question-review` list/filter/page。
- `/admin/question-review/:questionId` preview panel。
- add flag。
- resolve / ignore flag。
- toggle `excludedFromPractice`。
- Admin unit tests、stateful mock Admin API 和 Playwright smoke。
- 继续不做 full question detail endpoint、完整题目编辑器、override 层、批量操作和最终视觉系统。

B9.24 已完成 Admin Audit Logs read-only UI，文档见 [`admin-audit-logs-readonly-ui.md`](admin-audit-logs-readonly-ui.md)。

B9.24 实际落地：

- `/admin/audit-logs` list/filter/page。
- `/admin/audit-logs/:auditLogId` preview panel。
- 展示 actor、action、resourceType/resourceId、result、createdAt、metadata keys。
- 简单 before/after/metadata JSON preview。
- Admin unit tests、stateful mock Admin API 和 Playwright smoke。
- 继续不做复杂 diff viewer、导出、审计统计 dashboard 和最终视觉系统。

B9.25 已完成 Admin Users management UI，文档见 [`admin-users-management-ui.md`](admin-users-management-ui.md)。

B9.25 实际落地：

- Admin Users list/filter/page。
- Detail/edit displayName、status、roles。
- Create admin user。
- Update/reset admin password。
- Admin unit tests、stateful mock Admin API 和 Playwright smoke。

B9.25 不做：

- 不做 MFA/SSO。
- 不做邀请邮件/通知。
- 不做复杂安全策略 UI。
- 不做最终视觉系统。

B9.26 已完成 Admin Question Review override layer，文档见 [`question-review-override-layer.md`](question-review-override-layer.md)。

B9.26 实际落地：

- `/admin/question-review/:questionId` detail/override editor。
- `GET /api/admin/question-review/:questionId` detail API。
- `PATCH /api/admin/question-review/:questionId/override` 保存题干、答案、解析与 option override。
- question / option override 独立持久化，不直接改原始导入表。
- version conflict 检查与 audit log。
- Admin unit tests、stateful mock Admin API 和 Playwright smoke。
- 继续不做 override diff/审批/回滚、批量操作和最终视觉系统。

B9.27 已完成 Import Jobs control and backend modularization，文档见 [`import-jobs-control-and-backend-modularization.md`](import-jobs-control-and-backend-modularization.md)。

B9.27 实际落地：

- `POST /api/admin/import-jobs/:jobId/cancel`。
- `POST /api/admin/import-jobs/:jobId/retry`。
- `mode=import` + `resetBeforeImport=true` 在 `super_admin` 与独立 reset maintenance gate 同时满足时启用，并在单事务内 reset/reimport。
- cancel checkpoint 与 cancel-safe complete/fail，避免已取消 job 被覆盖。
- `apps/admin` Import Jobs create form 支持 dry_run/import/reset，detail 支持 cancel/retry。
- `apps/api/src/admin/importJobs.ts` 拆成 `admin/import-jobs/{types,repository,service,runner}.ts`，保留兼容 facade。
- B9.27 当时继续不做 durable queue/worker、heartbeat/stuck recovery、实时 progress 事件流和最终视觉系统；B9.28 已补 durable worker/heartbeat/stuck recovery。

B9.28 已完成 Import Jobs durable worker / heartbeat / stuck recovery，文档见 [`import-jobs-durable-worker.md`](import-jobs-durable-worker.md)。

B9.28 实际落地：

- `import_jobs` 新增 `worker_id` / `heartbeat_at`。
- 新增 `import_jobs_worker_scan_idx` 与 `import_jobs_one_active_kind_idx`。
- repository 支持 queued create、worker claim、heartbeat 和 stale recovery。
- 新增 `createAdminImportJobWorker`，生产 `index.ts` 在 worker enabled 时启用 queued execution。
- stale running job 会标记 failed 并写入 `Import job heartbeat timed out`，可通过 retry 重新排队。
- `apps/admin` detail 显示 `workerId` / `heartbeatAt`。
- 继续不做外部队列服务、SSE/WebSocket 实时 progress 事件流和最终视觉系统。

B9.29 已完成 Backend modularization follow-up，文档见 [`backend-modularization-b9.29.md`](backend-modularization-b9.29.md)。

B9.29 实际落地：

- `apps/api/src/admin/import-jobs/repository.ts` 收敛为 facade。
- 新增 `memoryRepository.ts` / `pgRepository.ts` / `jobMapper.ts`。
- 保留 `apps/api/src/admin/importJobs.ts` 兼容路径。
- 继续不改行为、不改 public API；Learning/Admin 更大范围拆分后置。

B9.30 已完成 Learning backend modularization，文档见 [`backend-modularization-b9.30-learning.md`](backend-modularization-b9.30-learning.md)。

B9.30 实际落地：

- `apps/api/src/learning/repository.ts` 收敛为 facade。
- 新增 `types.ts` / `memoryRepository.ts` / `pgRepository.ts` / `utils.ts`。
- 保持 Learning Dashboard / Trends / Goals / Review Marks public API、SQL 语义和 route contract 不变。
- B9.30 当时继续不做 Admin Question Review/Admin Students/Bank Mappings 大文件拆分、实时 progress 事件流和最终视觉系统；B9.31 已补 Admin Question Review 拆分。

B9.31 已完成 Admin Question Review backend modularization，文档见 [`backend-modularization-b9.31-question-review.md`](backend-modularization-b9.31-question-review.md)。

B9.31 实际落地：

- `apps/api/src/admin/questionReview.ts` 收敛为 facade。
- 新增 `admin/question-review/{index,types,memoryRepository,pgRepository,mappers}.ts`。
- 保持 Question Review list/detail/flag/exclusion/override public API、SQL 语义和 route contract 不变。
- 继续不做 diff/审批/回滚/批量操作、Import Jobs realtime progress 和最终视觉系统。

B9.32 已完成 Admin Students backend modularization，文档见 [`backend-modularization-b9.32-admin-students.md`](backend-modularization-b9.32-admin-students.md)。

B9.32 实际落地：

- `apps/api/src/admin/adminStudents.ts` 收敛为 facade。
- 新增 `admin/admin-students/{index,types,service,memoryRepository,pgRepository,mappers,utils}.ts`。
- 保持 Student Accounts list/detail/create/bulk-create/update/reset-password/revoke-session public API、SQL 语义和 route contract 不变。
- 继续不做 Bank Mappings 拆分、Import Jobs realtime progress 和最终视觉系统。

B9.33 已完成 Admin Bank Mappings backend modularization，文档见 [`backend-modularization-b9.33-bank-mappings.md`](backend-modularization-b9.33-bank-mappings.md)。

B9.33 实际落地：

- `apps/api/src/admin/bankMappings.ts` 收敛为 facade。
- 新增 `admin/bank-mappings/{index,types,memoryRepository,pgRepository,mappers,rules}.ts`。
- 保持 Bank Mappings list/detail/update/bulk-status public API、SQL 语义和 route contract 不变。
- 继续不做 route validation/error helper 抽取、Import Jobs realtime progress 和最终视觉系统。

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

> **学生客观题主链路已经完成并稳定；Learning Dashboard/Trends/Goals/Review Marks 后端 MVP+ 已落地；Admin Auth/RBAC/Audit、题库整理、System Status、Import Jobs dry-run/true import/reset maintenance gate/cancel/retry/worker heartbeat、Question Review Detail/Override、Audit Log、Admin User/Student Manage 与独立 Admin app 已落地；current HEAD、migration `0013`、最终 restore 和 deployment evidence 已在真实 staging 通过。完整平台后端还缺非客观题、推荐策略/完整长期档案、Question Review 完整审批流、实时 progress、外部监控告警、持续容量优化和正式生产发布验收。**

下一步先固化 importer 维护窗口、避免无变化 upsert、增加超时/节流和导入后健康检查，再由用户人工审核学生端/Admin 后选择 Question Review 完整运营流或 Learning 前端 IA。route validation/error helper 继续分批收敛；realtime progress 不应先于容量优化。
