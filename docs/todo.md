# Roadmap

路线图按依赖和风险排序，不再继续使用已失真的 Phase 3B/3C/3D 清单。

后端完成度、未达成目标与下一步执行计划详见
[`backend-completeness-plan.md`](./backend-completeness-plan.md)。

## Completed Backend B3 — 2026-07-13

- [x] 新增 shared v1 `auth.ts`，覆盖 login/me/logout response 和学生 DTO。
- [x] 新增 shared v1 `catalog.ts`，覆盖学生端 bank list response。
- [x] 新增 shared v1 `error.ts`，固定 `{ error: string }` 通用错误形状。
- [x] 新增 shared v1 `health.ts`，覆盖 `/api/health` response。
- [x] Auth、Catalog、Health API 成功响应执行 shared schema parse。
- [x] Web 登录、恢复登录、退出和题库列表执行 shared schema parse。
- [x] Web API helper 对非 2xx response 使用 `ApiErrorResponseV1Schema`。
- [x] 增加 Auth/Catalog fail-closed route 回归。
- [x] `npm run verify:docker` 通过。

## Completed Backend B2 — 2026-07-13

- [x] 新增 `WrongQuestionService`，由 service 编排错题再练创建。
- [x] 新增 `PracticeSessionService.createSessionFromQuestionIds`，统一负责显式题目列表创建 Practice session。
- [x] 将 `WrongQuestionRepository.createReviewSession` 改为 `listReviewCandidates`。
- [x] Wrongbook repository 不再直接写 `practice_sessions` 或 `practice_session_questions`。
- [x] 保持 `/api/wrong-questions/review-sessions` response、`origin=wrongbook` 与 ownership boundary 不变。
- [x] 增加 service/repository 回归测试。
- [x] `npm run verify:docker` 通过。

## Completed Backend B1 — 2026-07-13

- [x] 将 Practice DTO aliases、`PracticeRepository` 和 `CompletedSessionError` 提取到 `apps/api/src/modules/practice/contracts.ts`。
- [x] 将 answer serialization/parsing 提取到 `answerCodec.ts`。
- [x] 将客观题判分规则迁移到 `modules/practice/grading.ts`，并保留旧 `practice/grading.ts` compatibility barrel。
- [x] 将 in-memory Practice repository 提取到 `memoryRepository.ts`。
- [x] 将 PostgreSQL Practice repository、SQL mapper 与 transaction helper 提取到 `pgRepository.ts`。
- [x] 保留旧 `practice/repository.ts` compatibility barrel，避免一次性修改 route/test import。
- [x] 保持 HTTP contract、shared v1 schema、SQL transaction 语义与 Web 行为不变。
- [x] `npm run verify:docker` 通过。

## Completed Stabilization — 2026-07-10/11

- [x] 建立独立稳定化 worktree。
- [x] 保留服务器草稿、存疑和整卷提交语义，迁移 PC 练习台与提交检查交互。
- [x] 将 practice model、PracticeDesk、SubmitCheckDialog 从 `App.tsx` 提取。
- [x] 修复错题参考答案 UUID 泄漏。
- [x] 修复错题用户答案 UUID 展示。
- [x] 修复错题再练 session hydration。
- [x] 全量 281 Vitest、typecheck、build、3 条 Playwright 与 PostgreSQL integration 通过。
- [x] 完整真实题库导入 PostgreSQL 并 smoke。
- [x] 真实 API 闭环与真实浏览器闭环通过。
- [x] 更新当前状态、产品边界、架构和 API 文档。

## P0 — Freeze Semantics And Make Verification Repeatable

目标：把本轮“临时验证成功”升级成仓库可重复执行的质量门。

- [x] 在仓库中增加 Playwright E2E 配置，不依赖临时 runner。
- [x] 增加 PostgreSQL integration test job。
- [x] 为完整导入提供可选的慢速 smoke profile。
- [x] 为 API DTO 增加共享 Zod contract，覆盖 Practice、Wrongbook、Auth、Catalog、Error、Health，并在 API/Web 两侧 runtime parse。
- [x] 明确并版本化 `completedCount` 语义为 answered/graded questions；后续更名必须走显式迁移。
- [x] 降低测试中的 Fastify request log 噪音。
- [x] 增加 Boolean false、opaque/UUID option answer 和不合法 response fail-closed 回归。
- [ ] 增加超长题干、异常空选项、富文本、图片题和异常 Unicode fixture。

完成标准：

- 新环境按文档可以一条链路启动 DB、迁移、导入并跑 E2E。
- CI 同时验证 unit、typecheck、build、PostgreSQL integration。

## P1 — Product Definition And Student Information Architecture

目标：先让学生层“对象、导航、状态”清楚，再做最终视觉。

- [x] 确认学生首页结构：继续练习、选择题库、错题本、历史。
- [x] 定义多个 active session 的展示与处理规则。
- [x] 设计并实现练习历史 API 和结果详情入口。
- [x] 增加 URL router 与可链接页面。
- [ ] 固定登录、无数据、加载、保存失败、提交失败、session 已完成等状态。
- [ ] 决定正式身份策略：用户名自动创建、密码、学校账号或邀请码。
- [ ] 对当前练习台做可用性测试，不做大规模视觉换肤。

完成标准：

- 学生端 sitemap、状态机和主要页面验收标准已确认。
- 真实 API 可以支持 sitemap 中的每个页面。

## P2 — Gradual Modularization

目标：解决目录混乱，但不做大爆炸重构。

### Web

- [ ] 创建 `src/app`，迁移 session bootstrap、shell 和 navigation。
- [x] 创建 `src/app/router.ts`，固定学生端可恢复 URL。
- [x] 创建 `features/sessions`，提取学生首页、历史和会话卡片。
- [ ] 创建 `features/auth`。
- [ ] 创建 `features/catalog`。
- [ ] 创建 `features/wrongbook`。
- [ ] 创建 `shared/api`，统一 fetch、错误和 auth handling。
- [ ] 将 `App.tsx` 降到只负责 app composition。

### API

- [ ] 建立 `modules/auth`、`modules/catalog`、`modules/practice`、`modules/wrongbook`。
- [ ] 拆分 `practice/repository.ts`：
  - [x] contract/DTO
  - [x] memory repository
  - [x] PostgreSQL repository
  - [x] answer codec
  - [ ] submission service
- [ ] 拆分 practice route validation 与错误映射。
- [x] 把 Wrongbook 创建再练 session 改为 service 调用 Practice。
- [ ] 将 `db/config/http` 移到 platform 层。

完成标准：

- 每个业务模块可独立定位 route、service、contract、repository。
- 无行为变化，全量质量门持续通过。

## P3 — Admin MVP Design And Implementation

目标：先做可运营的最小管理闭环。

### Product Design

- [ ] 确认管理员角色：content editor、operator、super admin。
- [ ] 设计题库整理、导入任务、题目质检、系统状态四个工作流。
- [ ] 用低保真界面验证工作流和所需后端 command。

### Backend

- [ ] 管理员 identity、session 和 RBAC。
- [ ] `/api/admin/bank-mappings` 列表、详情、更新、批量状态。
- [ ] mapping 版本/并发控制与 audit log。
- [ ] import job table、触发、进度、结果和错误摘要。
- [ ] 题目质检标记与学生端排除策略。

### Frontend

- [ ] 创建独立 `apps/admin`。
- [ ] 实现管理 shell、导航和权限守卫。
- [ ] 实现题库整理表格/详情。
- [ ] 实现导入任务状态。
- [ ] 实现只读题目质检与异常标记。

完成标准：

- 管理员可以从导入结果到题库发布完成最小闭环。
- 所有管理写操作有权限和审计。

## P4 — Complete Student Learning Loop

- [x] 练习历史和历史结果回看。
- [ ] 错题掌握规则与再练反馈。
- [ ] 题目收藏/存疑长期化是否需要独立模型。
- [ ] 基础学习统计：练习次数、正确率、错题趋势。
- [ ] 题库推荐/最近使用，不先做复杂算法。
- [ ] 主观题自评流程。
- [ ] 填空题判分。
- [ ] 编程与 Office 操作题采用独立执行/评测设计，不塞进现有 objective grader。

## P5 — Final Visual System

进入条件：

- P1 学生 sitemap 稳定。
- P3 管理工作流稳定。
- 主要 API contract 不再频繁改变。
- Web 目录已按 feature 拆分。

工作：

- [ ] 建立 BKYExam 品牌方向和设计原则。
- [ ] 建立 primitive/semantic/component tokens。
- [ ] 分别设计学生端与管理端视觉层级。
- [ ] 完成 typography、spacing、color、form、table、dialog、navigation、feedback 规范。
- [ ] 完成 desktop/tablet/mobile responsive。
- [ ] 完成键盘、focus、对比度、读屏等无障碍。
- [ ] 对登录、首页、题库、练习、提交、结果、错题、管理工作流逐页验收。

原则：

> 最终视觉放后，但前端流程和低保真实现不能放后。

## P6 — Production Readiness

- [ ] Linux systemd/Nginx 自动化部署。
- [ ] 正式域名、TLS、Cloudflare 和 proxy 验收。
- [ ] secrets 管理与 Cookie security。
- [ ] PostgreSQL 备份、恢复和迁移回滚方案。
- [ ] structured logging、metrics、health、alerts。
- [ ] rate limit、CSRF 策略、安全 headers。
- [ ] 数据保留、账户删除和隐私规则。
- [ ] 小范围真实用户试用与问题回收。

## Explicitly Deferred

- 微服务拆分。
- 复杂消息队列。
- AI 错因分析。
- 在线多人监考。
- 在 override/ownership 设计完成前直接编辑原始题目。
- 在两个前端出现真实复用前创建共享 UI package。
