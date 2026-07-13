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
| 完整平台后端 | **约 50–58%** | 学生客观题稳了，但管理端、正式身份、全题型和生产能力仍未完成。 |
| 公开生产后端就绪 | **约 55%** | 缺正式安全策略、监控、备份恢复、rate limit、CSRF、部署验收。 |

这些百分比是工程判断，不是测试覆盖率。

## 2. 已完成且被验证的后端能力

### 2.1 Database And Import

已完成：

- PostgreSQL schema 与四份 ordered SQL migration。
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
- submitted answer primitive
- UUID / opaque option ID primitive
- `completedCount` 语义常量：
  - `answered_or_graded_questions`
- Fastify response parse
- Web response parse
- 不合法 repository payload fail closed 为 `500`

当前定位：**Practice/Wrongbook contract 稳定，Auth/Catalog/Admin 尚未迁入 shared**。

### 2.8 Verification

已完成质量门：

- `npm run verify:docker`
- 281 Vitest
- 240 API tests
- 31 Web tests
- 10 Shared tests
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
- 没有 admin identity。
- 没有 RBAC。
- 没有权限审计。

影响：

- 不能公开生产。
- 不能安全建设管理端。
- 不能区分学生、内容运营、管理员。

### 3.2 管理端后端基本未实现

当前已有的只是数据基础：

- `bank_mappings`
- `visible`
- `status`
- mapping metadata
- import CLI
- question tables

未完成：

- `/api/admin/*`
- 管理员登录
- RBAC
- 题库 mapping 列表/详情/编辑
- 批量发布/隐藏
- optimistic concurrency/version
- audit log
- import job table
- 导入任务进度
- 导入错误摘要
- 题目质检标记
- 学生端排除异常题策略

这是完整平台后端最大的缺口。

### 3.3 Catalog 仍偏学生读取，不是运营管理

已能给学生展示题库，但缺：

- 人工整理题库名称
- 学科/标签/说明编辑
- 发布流程
- 审批流程
- 可见性批量管理
- 数据健康检查
- 内容质量抽查
- mapping 变更历史

### 3.4 Import 仍是 CLI，不是平台任务系统

已完成 CLI 导入与 smoke，但缺：

- `import_jobs`
- 后台触发
- job 状态
- job progress
- job result summary
- 错误下载/查看
- 增量导入策略
- 导入锁
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

当前：

- Wrongbook repository 直接 insert `practice_sessions` 和 `practice_session_questions`。

问题：

- repository 跨 bounded context 写表。
- 后续如果 Practice 创建规则变复杂，Wrongbook 会绕过规则。
- Admin/Stats/Attempt 逻辑可能分叉。

目标：

- Wrongbook service 请求 Practice service 创建再练 session。
- Practice 统一负责 session 创建、锁题、origin、约束和事件。

### 3.9 Contract 未完全覆盖后端

已覆盖：

- Practice
- Practice session page/card
- Wrongbook

未覆盖：

- Auth
- Catalog
- Admin
- 通用 error
- Health/readiness
- Import job
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

建议下一步不要直接开管理端大工程，也不要先做最终视觉。
建议先做 **Backend P2A：无行为变化的模块化整理**，再做管理端后端 contract。

原因：

1. 学生客观题主链路已经稳定，适合在稳定测试保护下拆边界。
2. 管理端会引入大量新 API，如果现在直接往现有目录里堆，会继续放大混乱。
3. 后端边界清楚后，Admin、Import Jobs、Stats、Non-objective 会更好接。

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

目标：修复 bounded context 跨表写入。

当前问题：

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
- Practice session 创建规则只有一处。
- `npm run verify:docker` 通过。
- commit 一次。

### Phase B3 — Shared Contract Expansion

目标：把 Auth、Catalog、Error 的 contract 补齐。

新增 shared schema：

```text
contracts/v1/auth.ts
contracts/v1/catalog.ts
contracts/v1/error.ts
```

覆盖：

- login response
- me response
- logout response
- bank list response
- common error shape
- health response 或 readiness response

迁移方式：

1. 先加 schema 和 tests。
2. API response parse。
3. Web response parse。
4. 再逐步替换手写 request parser。

验收：

- Auth/Catalog 错误 payload 不会被当成成功数据。
- API/Web 两侧统一类型。
- `npm run verify:docker` 通过。
- commit 一次。

### Phase B4 — Admin Backend Contract Design

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
```

同时设计 migrations：

```text
admin_users
admin_sessions
admin_roles / admin_user_roles 或 role text
audit_logs
import_jobs
question_quality_flags
bank_mapping_versions 或 version column
```

验收：

- 文档明确 request/response。
- 明确权限模型。
- 明确 audit log。
- 明确不会直接编辑原始题目，而是通过 override/flag 层。
- 通过评审后再实现。

### Phase B5 — Admin Backend MVP Implementation

目标：最小可运营闭环。

优先实现：

1. admin identity + RBAC
2. audit log
3. bank mappings list/detail/update
4. batch visible/status
5. system status

后实现：

6. import jobs
7. question review flags
8. import error report

验收：

- 管理员能整理题库并发布给学生端。
- 所有写操作有 admin ownership、permission 和 audit。
- 学生 API 不暴露 admin 字段。
- `npm run verify:docker` 通过。

### Phase B6 — Import Jobs And Data Health

目标：把 CLI 导入升级为平台任务。

后端能力：

- create import job
- job status
- progress counters
- result summary
- error summary
- import lock
- retry/cancel 策略
- data health check

注意：

- 初期可以仍由 Node process 同步执行，不必先引入队列。
- 不急着上复杂消息队列。
- job table 和状态 API 先稳定。

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

如果本规划认可，下一步建议执行：

> **Phase B1：Practice 后端无行为变化拆分。**

具体第一阶段 commit 目标：

```text
feat/refactor: split practice backend repository boundaries
```

范围只包含：

- answer codec 提取
- PracticeRepository interface/types 提取
- memory repository 提取
- pg repository 提取
- 保持 route 和 HTTP 行为不变
- 更新 architecture/todo
- 全量 verify:docker

不做：

- 不改 UI
- 不改 API response
- 不做 Admin
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

> **学生客观题主链路已经完成并稳定；完整平台后端还缺管理、正式身份、模块化、非客观题、运营导入和生产运维。**

最合理的下一步是先把后端边界拆清楚，再开始 Admin 后端 MVP。
