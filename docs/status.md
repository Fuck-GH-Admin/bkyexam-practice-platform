# System Status

状态日期：**2026-07-15**

本文记录“已经被代码和真实环境证明的能力”，不是愿望清单。后续每个里程碑完成后应更新本页。

## Executive Summary

当前系统已经达到：

- **学生客观题 MVP：可内部试用。**
- **真实题库 + PostgreSQL + 浏览器闭环：已跑通。**
- **Practice 后端模块化第一步：已完成无行为变化拆分。**
- **学习后端：Learning Dashboard/Trends/Goals/Review Marks 已形成后端 MVP+，支持学习概览、趋势、目标反馈、题目收藏和长期复习标记。**
- **管理平台：Admin Auth/RBAC/Audit foundation、管理员登录失败锁定、Bank Mapping read/write API、System Status API、Import Jobs dry-run/Error Report API、受 `ADMIN_IMPORT_ENABLE_WRITE=true` 保护的 true import mode、Question Review Flags API、Audit Log read API、Admin User manage API、Admin Student Manage API 与 super_admin bootstrap CLI 已实现；B9.19 已创建独立 `apps/admin`，完成 Admin Login、System Status 与 Student Accounts Operational MVP；B9.20 已完成 Admin P1 工作流缺口审查；B9.21 已实现 Bank Mappings P1 UI；Import true write/reset/cancel/retry 与完整 Question Review editor 后置。**
- **生产就绪前置：已新增公开 readiness、request id、结构化未捕获错误、基础安全 headers、可配置 rate limit / CSRF origin check、隔离 PostgreSQL backup/restore 演练、结构化 HTTP request log hook、`/api/health/metrics` smoke endpoint、正式身份安全策略文档、学生身份安全数据模型、Admin Student Manage API、学生密码登录 enforcement、生产 gate CLI、旧账号迁移写入 CLI 与 runbook、生产部署证据校验 CLI；B9.13 已完成 PR、PR CI、`main` branch protection / required checks；B9.14 已完成真实服务器 staging 部署、目标数据库 production gate、旧账号迁移、正式 2班学生账号初始化、HTTPS 功能 smoke、轻量性能证据和 deployment evidence ready；B9.15 已完成服务器侧 synthetic healthcheck timer、实机 post-deploy backup/restore drill、staging load baseline、PR review/merge 决策记录、凭据交付 runbook、管理平台 IA/account ops 审查稿、B9.16 前端开工前审查包、B9.17 学生账号启用最小 UI、B9.18 Admin 静态 wireframe 审查包、B9.19 Admin Operational MVP、B9.20 Admin P1 工作流缺口审查和 B9.21 Bank Mappings P1 UI；仍缺第三方通知目标/外部监控接入、持续性能压测、PR human approval/merge、完整管理前端与正式生产发布验收。**
- **完整生产产品：尚未达到。**

完整度需要按不同口径理解：

| Scope | 估算完整度 | 说明 |
| --- | ---: | --- |
| 学生客观题核心闭环 | **约 95%** | 登录、首页、多会话、真实题库、练习、断点、整卷提交、结果、历史、错题再练、学习概览、趋势、目标和长期复习标记 API 均可用；B9.14 已在 staging 完成学生登录和创建练习 smoke；归档、Learning 前端、部分 UX 和最终视觉仍未完成 |
| 公开生产就绪度 | **约 92%** | 已补第一个管理员 bootstrap、Admin User manage API、Admin Student Manage API、学生密码登录 enforcement、管理员登录失败锁定、生产 gate CLI、旧账号迁移写入 CLI/runbook、部署证据校验 CLI、gated true import、readiness、request id、安全 headers、可配置 rate limit/CSRF origin check、backup/restore drill、结构化 request log hook、metrics smoke endpoint、正式身份安全策略文档、学生身份安全数据模型、PR CI、`main` branch protection / required checks、B9.14 真实服务器 staging 部署证据，以及 B9.15 synthetic healthcheck、实机 restore drill、staging load baseline、凭据交付 runbook、PR 决策记录、B9.16 前端开工前审查包、B9.17 学生账号启用最小 UI、B9.18 Admin 静态 wireframe 审查包、B9.19 Admin Operational MVP、B9.20 Admin P1 工作流缺口审查和 B9.21 Bank Mappings P1 UI；仍缺 PR human approval/merge、第三方告警通知接入、持续性能压测、完整管理前端和正式生产发布验收 |
| 完整产品愿景 | **约 86%** | 学生信息架构、学习概览/趋势/目标/长期复习标记 API、管理端后端 contract、Admin Auth/RBAC/Audit foundation、管理员登录失败锁定、Bank Mapping read/write API、System Status API、Import Jobs dry-run/Error Report/true import gate、Question Review Flags API、Audit Log read API、Admin User manage API、Admin Student Manage API、super_admin bootstrap CLI、学生身份安全数据模型、学生密码登录 enforcement、旧账号迁移 CLI、生产 gate runbook、部署证据校验 CLI、真实 staging 验收、B9.15 运维基线、管理平台 IA 初稿、B9.16 前端开工前审查包、B9.17 学生账号启用最小 UI、B9.18 Admin 静态 wireframe 审查包、B9.19 Admin Operational MVP、B9.20 Admin P1 工作流缺口审查和 B9.21 Bank Mappings P1 UI 已落地，但分母仍包含完整管理前端、最终学生前端、Learning 前端、全题型、运营与生产能力 |

这些百分比是工程评估，不是测试覆盖率。它们用于讨论下一步优先级，不能替代验收标准。

## Verified Automated Checks

2026-07-15 在 Node.js `24.11.1` 上完成：

```text
npm run verify:docker  PASS
```

测试结果：

| Workspace | Test files | Tests |
| --- | ---: | ---: |
| `packages/shared` | 2 | 26 |
| `apps/api` | 58 | 431 |
| `apps/web` | 2 | 33 |
| `apps/admin` | 1 | 7 |
| **Total** | **63** | **497** |

仓库内 Playwright smoke：

| Project | Scenario | Result |
| --- | --- | --- |
| `desktop-chromium` | 草稿、URL 刷新续答、整卷提交、历史结果、错题详情 | PASS |
| `desktop-chromium` | 多 active session、浏览器 back/forward 与 session URL 恢复 | PASS |
| `desktop-chromium` | 临时密码账号强制改密后回到原练习 URL | PASS |
| `mobile-chromium` | 练习台、提交检查与横向溢出 | PASS |
| `desktop-chromium` | Admin Login、System Status、Student Accounts 与 Bank Mappings 操作 smoke | PASS |

Playwright 实际报告为 `5 passed`；project 通过 tag 过滤，因此每个场景只在目标 viewport 执行一次。

真实 PostgreSQL integration profile：

| Database | Test files | Tests |
| --- | ---: | ---: |
| 临时 PostgreSQL 16 / `bkyexam_test` | 1 | 1 |

该测试从空数据库执行十一份 migration，装载最小 fixture，并通过真实 PostgreSQL repository 与 Fastify route 完成 readiness/DB health、metrics smoke、学生身份安全字段、无密码默认失败、密码登录、临时密码登录、学生改密、Admin Auth/RBAC/audit、管理员登录失败锁定字段、Admin bootstrap、Admin Audit Log read、Admin User manage list/detail/create/update/last-super-admin guard/audit、Admin Student Manage list/detail/create/bulk-create/update/reset-password/revoke-session/audit、Admin Bank Mapping list/detail/update/bulk-status、Admin System Status、Admin Import Jobs dry-run 创建/list/detail/error-report/audit/status summary、true import mode 写入/幂等/失败回滚/reset gate、Admin Question Review flag/exclusion/status summary、题库、多 active session、草稿/断点、会话集合、整卷提交、历史结果、错题、`origin=wrongbook`、学习概览统计、学习趋势/streak、学习目标与错题复习反馈、题目收藏/长期复习标记、所有权隔离和退出闭环。Docker runner 在测试后自动删除临时数据库容器。

隔离 backup/restore drill：

```text
npm run ops:backup-restore:docker  PASS
```

该演练在临时 PostgreSQL 16 上执行十一份 migration，写入覆盖核心业务表的最小 fixture，使用 `pg_dump` 生成 backup，恢复到 `bkyexam_restore_test`，并比较源库/恢复库关键表计数一致。

生产 gate dry-run：

```text
npm run ops:production-gate -- --skip-db  PASS
```

该命令在 production-safe fixture env 下验证 env gate 可输出 JSON report；真实发布前仍必须连接目标 `DATABASE_URL` 运行完整 gate，确认 `legacyPasswordlessStudents=0`。

旧账号迁移工具单元/CLI 验证：

```text
npm run test -w @bkyexam-practice/api -- legacyStudentPasswordMigration  PASS
```

该测试覆盖 dry-run、`--apply` 写入、credential CSV 输出、PostgreSQL SQL shape、CLI transaction，以及 JSON/audit 不泄露明文临时密码。

生产部署证据模板验证：

```text
npm run ops:deployment-evidence -- --template  PASS
```

该命令可生成 deployment evidence JSON 模板；`--evidence=<file> --require-ready` 会在远端 CI、branch protection、production gate、旧账号迁移和 rollback/smoke 证据缺失时返回非 0。

B9.14 真实服务器 staging deployment evidence：

```text
target = https://exam.acgbot.cc.cd
commit = 1686c6e27a23029c6cc53c8a22ddb843c3d332d7
production gate = ok=true
legacyPasswordlessStudents = 0
HTTP smoke = PASS
deployment evidence = ready=true, 14 pass / 0 warn / 0 fail
```

目标环境证据文件保存在服务器：

```text
/srv/bkyexam-backups/b9.14-20260715080815/production-gate-clean.json
/srv/bkyexam-backups/b9.14-20260715080815/http-functional-smoke.json
/srv/bkyexam-backups/b9.14-20260715080815/perf-smoke.json
/srv/bkyexam-backups/b9.14-20260715080815/deployment-evidence-report.json
```

B9.14 初始化了 `admin` super_admin 和 `202502040201`–`202502040230` 的 `2班` 学生账号；旧 13 个无密码账号已保留并迁移到临时密码，最终 `students=43`、`legacyPasswordlessStudents=0`、`passwordResetRequiredStudents=43`。凭据仅保存在服务器受限目录 `/root/bkyexam-credentials/LATEST`，未写入 Git。

B9.15 staging operations baseline：

```text
target = https://exam.acgbot.cc.cd
synthetic healthcheck timer = active/enabled, every 5 minutes
latest synthetic healthcheck = ok=true
post-deploy backup/restore drill = PASS
staging load baseline = PASS, 27 checks / 0 failures
PR #2 merge decision = CI green, blocked only by required human review
credential delivery runbook = docs/credential-delivery-runbook.md
admin IA/account ops review = docs/admin-console-ia.md
```

B9.15 目标环境证据文件保存在服务器：

```text
/srv/bkyexam-backups/b9.15-20260715104214/restore-drill-report.json
/srv/bkyexam-backups/b9.15-20260715104214/load-baseline.json
/var/log/bkyexam-healthcheck/checks.jsonl
```

B9.15 没有声明已接入第三方通知目标；当前完成的是服务器侧 synthetic monitor、systemd alert hook 和可审计证据。

B9.16 pre-frontend review packet：

```text
formal frontend visual work = hold
student P0 activation gap = first password change / account identity surface
admin first useful slice = Student Accounts + System Status
recommended admin app shape = separate apps/admin
review packet = docs/frontend-kickoff-review.md
```

B9.16 没有声明已开始正式前端实现；当前完成的是前端开工前的信息架构、页面顺序和 owner 审核问题清单。

B9.17 student activation UI：

```text
student login password input = implemented
/account/password = implemented
passwordResetRequired auth gate = implemented
change password API call = implemented
return to original route after activation = implemented
e2e activation smoke = PASS
```

B9.17 没有声明已完成整体学生端视觉或管理端前端；当前完成的是学生临时密码账号启用闭环。

B9.18 admin static wireframe review：

```text
admin static review packet = docs/admin-static-wireframe-review.md
recommended apps/admin boundary = confirmed as proposal
B9.19 first slice = Admin Login + System Status + Student Accounts
formal admin implementation = not started
visual polish = deferred
```

B9.18 没有声明已完成管理端前端；当前完成的是管理端页面、权限、状态和操作确认流的静态审查包。

B9.19 admin operational MVP：

```text
admin app = apps/admin
admin login/session guard/logout = implemented
system status dashboard = implemented
student accounts list/detail/create/bulk-create/update/reset-password/revoke-sessions = implemented
Bank Mappings list/detail/edit/bulk-status = implemented in B9.21
admin e2e smoke = PASS
placeholder pages = Import Jobs / Question Review / Audit Logs / Admin Users
```

B9.19 没有声明已完成完整管理平台或最终视觉；B9.21 之后当前完成的是账号运营与题库整理可用的最小 Admin runtime slice。详见 [`admin-operational-mvp.md`](admin-operational-mvp.md) 和 [`admin-bank-mappings-p1-ui.md`](admin-bank-mappings-p1-ui.md)。

B9.20 admin P1 workflow gap review：

```text
review packet = docs/admin-p1-workflow-gap-review.md
Bank Mappings P1 UI = recommended next
Import Jobs = dry-run/history/error-report UI only before queue/control backend
Question Review = preview-level flag/exclusion UI before full question detail/editor
System Status = keep health-oriented; ops summary should be separate if needed
```

B9.20 没有新增运行时代码或改变 API contract；当前完成的是管理端 P1 工作流和后端缺口确认。

B9.21 admin Bank Mappings P1 UI：

```text
runtime page = /admin/bank-mappings
list/filter/page = implemented
bank mapping detail/edit = implemented
publish controls = permission-gated
bulk status partial result = implemented
visual polish = deferred
```

B9.21 没有新增后端 contract；当前完成的是题库整理的功能性管理 UI，不声明完整管理平台或最终视觉完成。详见 [`admin-bank-mappings-p1-ui.md`](admin-bank-mappings-p1-ui.md)。

全量题库慢速 smoke：

最后一次完整运行日期为 2026-07-10：

```text
npm run smoke:import:full:docker -- <questionbank-dir>  PASS
```

| Step | Result |
| --- | ---: |
| 解析完整源题库 | 2941 classifications / 89922 questions / 180323 raw options |
| 第一次导入 | 154899 options / 25424 skipped / 2662 mappings |
| 第二次幂等导入 | 计数完全一致 |
| 数据库最终 smoke | 2941 / 89922 / 154899 / 2662 |
| 本地 Docker 总耗时 | 约 142.1 秒 |

慢速 profile 会把解析结果与 `currentCorpusBaseline.ts` 固定基线逐项比较，并在隔离数据库连续执行两次导入。它依赖仓库外的完整题库，因此不放入每次提交的 CI。

生产构建结果：

- shared TypeScript build：通过。
- API TypeScript build：通过。
- Web Vite build：通过。
- Admin Vite build：通过。
- Web bundle：约 `324.29 kB` JS（gzip `93.74 kB`）。
- Web CSS：约 `20.91 kB`（gzip `5.11 kB`）。
- Admin bundle：约 `333.10 kB` JS（gzip `94.15 kB`）。
- Admin CSS：约 `5.83 kB`（gzip `1.94 kB`）。

主 JS 当前包含 Web 运行时 Zod response validation 和所有学生页面；内部 MVP 可以接受，下一轮 Web modularization 应引入 route-level code splitting。

## Verified Contract Boundary

Practice/Wrongbook/Learning/Auth/Catalog/Admin/Error/Health/Observability v1 contract 已落到 `packages/shared/src/contracts/v1`：

- API repository DTO 直接引用共享类型。
- Fastify 在发送 Practice/Wrongbook/Learning/Auth/Catalog/Health/Metrics 成功响应前执行共享 schema parse。
- Auth v1 contract 已支持学生 `className/groupName`、顶层 `passwordResetRequired`、正式密码登录 request 和学生改密 request/response。
- `/api/health/readiness` 使用 shared readiness schema parse，并在 PostgreSQL profile 中执行真实 `SELECT 1`。
- `/api/health/metrics` 使用 shared metrics schema parse，覆盖 HTTP total requests、状态桶、per-route 计数、平均耗时和进程内存摘要。
- 所有响应带 `x-request-id`；未捕获错误和 guardrail 错误返回结构化 `requestId`。
- Web 在把对应响应写入 React state 前执行同一共享 schema parse。
- Web 对非 2xx 响应按 `ApiErrorResponseV1Schema` 读取错误消息。
- route 回归验证 repository 返回不合法 Practice/Wrongbook/Learning/Auth/Catalog/Admin 数据时 fail closed 为 `500`。
- `false` 判断题答案、opaque option ID、legacy 大小写 UUID 和部分作答 completed session 均有 contract 回归。
- `completedCount` 的 v1 语义固定为 `answered_or_graded_questions`。
- 会话卡片/page contract 固定 `origin`、active/completed timestamp、answered/review counters 和分页边界。
- 学生 catalog contract 固定 `visible=true` 和非负 `questionCount`。
- Learning contract 固定 dashboard/trends/goals/review-marks 的计数不变量、UTC 日期桶、目标进度、feedback signal 枚举、收藏/长期复习标记边界。
- Admin contract 固定 Auth/RBAC、Bank Mapping read/write、System Status、Import Job dry-run/error report/true import gate、Question Review 与 Audit Log read 的 request/response 边界。

详细规则见 [contracts.md](contracts.md)。

## Verified Backend Module Boundary

2026-07-13 完成 Phase B1：Practice 后端无行为变化拆分。

当前实际结构：

```text
apps/api/src/modules/practice/
  contracts.ts          # DTO aliases、PracticeRepository、CompletedSessionError
  grading.ts            # objective grading rules
  answerCodec.ts        # submit/draft answer serialization and parsing
  resultMapper.ts       # GradeResult -> response DTO
  sessionService.ts     # explicit question-id session creation boundary
  memoryRepository.ts   # route-test friendly in-memory repository
  pgRepository.ts       # PostgreSQL SQL and transaction implementation
  repository.ts         # module barrel

apps/api/src/practice/
  grading.ts            # compatibility barrel
  repository.ts         # compatibility barrel
```

保持不变：

- 现有 import path 仍可使用 `../practice/repository.js` 与 `../practice/grading.js`。
- HTTP contract 未变。
- shared v1 schema 未变。
- PostgreSQL transaction 语义未变。
- Web 行为与 API response 未变。

2026-07-13 完成 Phase B2：Wrongbook 再练不再由 Wrongbook repository 直接写 Practice 表。

当前边界：

```text
WrongQuestionRepository
  -> listReviewCandidates()

WrongQuestionService
  -> PracticeSessionService.createSessionFromQuestionIds({
       mode: 'sequential',
       origin: 'wrongbook'
     })

PracticeSessionService
  -> INSERT practice_sessions
  -> INSERT practice_session_questions
```

保持不变：

- `/api/wrong-questions/review-sessions` response 未变。
- `origin=wrongbook` 未变。
- ownership boundary 未变。
- PostgreSQL integration 仍覆盖错题再练 session 创建与读取。

## Verified Corpus And Database

真实题库解析统计：

```json
{
  "classifications": 2941,
  "questions": 89922,
  "rawOptions": 180323,
  "questionTypes": {
    "fill_blank": 4697,
    "single_choice": 30980,
    "essay": 1023,
    "unknown": 6803,
    "multiple_choice": 7674,
    "yes_no": 14393,
    "office_operation": 68,
    "reading": 11513,
    "cloze": 11208,
    "operation": 1076,
    "programming": 40,
    "short_answer": 206,
    "ai": 241
  }
}
```

在真实 PostgreSQL 14 上执行迁移、完整导入和 smoke：

```json
{
  "classifications": 2941,
  "questions": 89922,
  "questionOptions": 154899,
  "skippedOrphanOptions": 25424,
  "bankMappings": 2662
}
```

说明：

- `skippedOrphanOptions` 的 `questionId` 在导出的题目文件中不存在，无法满足外键，因此被明确跳过并计数。
- 导入是事务化、批量、幂等 upsert。
- 本次完整导入约 18 秒，具体时间受磁盘和 PostgreSQL 环境影响。

## Verified Real API Flow

使用 PostgreSQL repository 和真实导入数据验证：

1. 登录并创建学生/服务端 session。
2. `GET /auth/me` 恢复当前学生。
3. 读取 473 个当前可见且含客观题的学生题库入口。
4. 从真实 `2025年C++程序设计` 创建练习会话。
5. 保存单选、多选和 `false` 判断题草稿。
6. 保存存疑状态与当前位置。
7. 重新 GET session，草稿、`false`、存疑和位置均准确恢复。
8. 整卷提交，session 进入 `completed`。
9. 已答题生成判分结果；未答题不生成 attempt。
10. 完成后继续改草稿返回 `409`。
11. 错误客观题进入错题本。
12. 错题详情返回真实题干、选项、规范化参考答案与解析。
13. 标记掌握和 `includeMastered` 生效。
14. 从错题集合创建普通再练 session。
15. active/history 集合返回题库名、来源、草稿进度、存疑数与稳定时间排序。
16. 错题再练 session 记录 `origin=wrongbook`。
17. 学习概览 API 返回 session/attempt/accuracy/recent bank/question type/wrongbook 聚合。
18. 学习趋势 API 返回 7..90 日 UTC 日期桶、正确率和 activity streak。
19. 学习目标 API 持久化目标设置，并返回今日/近 7 日进度和错题复习反馈信号。
20. 学习复习标记 API 可创建、列表过滤、隔离其他学生并删除题目收藏/长期复习标记。
21. 其他学生无法读取 session 列表、详情、错题或 review marks。
22. 退出后受保护路由返回 `401`。

验证过程中发现并修复：

- 错题详情原先会把参考答案作为逗号分隔 UUID 原文返回；现在按题型规范化为 `string[] | boolean | string`。
- 错题界面原先会显示用户最近答案的原始 option UUID；现在详情映射为选项内容，列表只显示“已选择 N 项”。
- 错题再练创建后，前端原先没有完整恢复草稿/存疑/位置状态；现在统一通过 `applyPracticePayload` hydration。

## Verified Browser Flow

在真实 Vite Web + 真实 Fastify API + 真实 PostgreSQL 上完成桌面 Chrome smoke：

- 登录。
- 搜索并进入真实 C++ 题库。
- 作答、自动保存、标记存疑。
- 切换题型。
- 刷新页面。
- 继续练习并恢复到刷新前题目。
- 确认第一题存疑状态仍在服务端。
- 打开提交前检查。
- 确认提交整卷。
- 查看只读结果。
- 进入错题本并查看真实错题。
- 无意外 HTTP 错误、console runtime error 或 page error。

开发模式下 React StrictMode 会执行两次匿名 session bootstrap，因此登录前出现两次预期的 `/api/auth/me -> 401`；它们不是业务失败。生产 build 不执行 StrictMode 的开发期 effect 重放。

另有 mock API 响应式 smoke 覆盖：

- 独立学生首页和多个 active session。
- 首页、练习、历史和错题的 URL 导航。
- 刷新 session URL 直接恢复练习。
- 浏览器 back/forward 恢复首页和已选 session。
- Desktop practice。
- Desktop submit check。
- Desktop completed result。
- Desktop history result entry。
- Mobile practice。
- Mobile submit check。
- 横向溢出检查。

该 smoke 现已固化为仓库内 `playwright.config.ts` 与 `tests/e2e/`，可通过 `npm run test:e2e` 重复执行。它用于稳定验证浏览器交互和前端状态恢复，不替代 PostgreSQL repository、Fastify route 与真实导入数据的 integration test。

## Feature Completeness Matrix

| Area | 状态 | 估算 | 已有 | 主要缺口 |
| --- | --- | ---: | --- | --- |
| Corpus parser/import | 稳定 | 90% | 全量解析、事务导入、幂等 upsert、smoke | 进度事件、错误报告 UI、增量策略 |
| Bank mapping/catalog | 可用 | 75% | 自动映射、可见性、搜索筛选、v1 runtime contract | 管理编辑、审批、审计、质量抽查 |
| Student identity/session | 正式密码主链路已落地 | 91% | 固定用户名、密码登录、Cookie session、恢复/退出、v1 runtime contract、`className/groupName`、`passwordResetRequired`、学生改密、账号状态、失败计数/临时锁定、旧账号保留、Admin Student Manage list/detail/create/bulk-create/update/reset-password/revoke-session/audit、旧账号迁移审计 gate、旧账号迁移写入 CLI/runbook、真实 staging 迁移、凭据交付 runbook、学生首次改密前端入口和账号身份显示 | 找回、身份合并、批量导入 UI、设备/会话管理 UI |
| Objective practice | 核心可用 | 92% | 创建、锁题、草稿、断点、存疑、多会话、整卷判分、结果、历史、v1 runtime contract | 会话归档、计时/考试策略、更多异常 UX |
| Wrongbook | 核心可用 | 80% | 自动归集、详情、掌握、筛选、再练、v1 runtime contract | 错因、学习计划、掌握规则、历史趋势 |
| Learning analytics | 后端 MVP+ | 68% | 学习概览 API、最近题库、题型正确率、错题掌握摘要、7..90 日趋势、activity streak、学习目标、错题复习反馈信号、题目收藏/长期复习标记、v1 runtime contract | 前端展示、推荐策略、完整长期学习档案 |
| Student product shell | 功能性 | 80% | 密码登录、首次改密、账号身份显示、首页、题库、练习、错题、历史、稳定 URL | 档案、首屏之外分页操作、统一空/错/加载状态、最终视觉 |
| Admin console | P1 运营 UI 局部可用，完整工作流 UI 未完成 | 74% | 数据字段、自动 mapping、后端 contract、Admin Auth/RBAC/session/audit foundation、管理员登录失败锁定、`/api/admin/auth/*`、Admin User manage API、Admin Student Manage API、Bank Mapping read/write API、System Status API、Import Jobs dry-run/Error Report/true import gate、Question Review Flags API、Audit Log read API、super_admin bootstrap、practice exclusion、optimistic concurrency、audit、管理平台 IA/account ops 审查稿、B9.18 静态 wireframe 审查包、独立 `apps/admin`、Admin Login、System Status dashboard、Student Accounts list/detail/create/bulk-create/update/reset-password/revoke-sessions、Bank Mappings list/filter/detail/edit/bulk-status、admin Playwright smoke | Import Jobs/Question Review/Audit Logs/Admin Users 完整 UI、reset import/异步队列/取消重试、正式视觉与可用性验收 |
| Subjective/complex grading | 早期 | 10% | 类型已导入，grader 可返回 self-review 语义 | 填空、简答、编程、Office、材料题完整流程 |
| Operations | 可重复验证 | 90% | 配置、migration、全量幂等 import smoke、Playwright、PostgreSQL integration、CI workflow、PR CI、`main` branch protection / required checks、部署文档、readiness、request id、安全 headers、可配置 rate limit/CSRF origin check、backup/restore drill、structured request log、metrics smoke endpoint、production gate CLI、legacy password migration CLI、production operations runbook、旧账号迁移 runbook、CI evidence 模板、真实 staging 部署、server-side synthetic healthcheck timer、实机 restore drill、staging load baseline、凭据交付 runbook | PR human approval/merge、第三方告警通知接入、持续性能压测、正式生产发布验收 |

## Known Product And Technical Risks

### P0 Before Public Production

- 学生密码登录 enforcement、旧账号迁移审计 gate、旧账号迁移写入 CLI、部署证据校验 CLI、PR CI、`main` branch protection/required checks、B9.14 目标环境迁移执行证据与 B9.16 前端开工前审查包已落地；公开生产前仍需正式改密前端入口、PR human approval/merge、第三方告警通知接入和最终发布参数验收。
- 已有 Admin Auth/RBAC/session/audit foundation、题库整理 API、System Status、Import Jobs dry-run/Error Report/true import gate、Question Review Flags API、Audit Log read API、Admin User manage API、Admin Student Manage API、super_admin bootstrap 与管理平台 IA/account ops 审查稿，Bank Mappings 功能性 UI 已落地；仍缺 Import Jobs/Question Review/Audit/Admin Users 正式运营 UI、导入 reset/队列化和完整审核流程。
- 已有基础 readiness、request id、安全 headers、可配置 rate limit/CSRF origin check、隔离 backup/restore drill、结构化 request log、metrics smoke endpoint、服务器侧 synthetic healthcheck timer、实机 restore drill 和最低限度 staging load baseline；仍没有第三方告警通知目标、长期性能压测和正式生产数据量级恢复策略。
- 已对 `https://exam.acgbot.cc.cd` 做 staging smoke、load baseline 与 restore drill；仍未声明正式公开生产发布完成。

### P1 Before Large Feature Expansion

- `App.tsx` 和 Practice routes 仍偏大；Practice repository 已拆成模块，但 submit service、route validation 与错误映射仍待后续分离。
- Auth、Catalog、Practice、Wrongbook、Learning、Admin、Error 与 Health DTO 已迁入 shared v1；request parser 仍未统一。
- session 集合已有后端分页，但首页/历史尚无“加载更多”、放弃或归档 active session 的交互。
- 轻量 History API router 尚无 route-level code splitting、navigation guard 与统一错误页。
- `completedCount` 已在 v1 contract 固定为 answered/graded count，但字段名称仍容易误解；未来更名必须走显式版本迁移。
- Wrongbook 再练已改为 service 间协作；后续仍应把 wrongbook 目录迁入 `modules/wrongbook` 并继续拆 route validation。

### P2 Quality Debt

- CI workflow 已在 PR #2 上跑绿；`main` 已启用 branch protection / required checks；PR review 仍未发生。
- Web 运行时 contract validation 增加了主 bundle 体积，后续应结合 router/code splitting 优化。
- 未系统验证键盘可达性、读屏和完整无障碍。
- 未对超长题干、富文本、图片题和异常 Unicode 做专项视觉验收。

## Release Interpretation

当前最准确的发布标签：

> **Objective Practice Internal MVP / 学生客观题内部试用版**

不应把当前版本描述为：

- 完整在线考试平台。
- 完整学习管理系统。
- 已完成管理后台。
- 已具备公开生产安全。
