# Product And Module Boundaries

本文是后续产品设计、接口设计和目录拆分的共同边界。目标是解决三个当前问题：

1. 学生端“有什么、去哪做、做完去哪”不够清晰。
2. 管理平台没有被当作独立产品设计。
3. 后端按技术文件增长，业务职责开始混在一起。

## 1. Product Surfaces

BKYExam 应明确分成三个产品面，而不是一个页面不断追加按钮。

### Student Web

服务对象：做题和复盘的学生。

核心目标：

- 快速找到适合自己的题库。
- 随时继续未完成练习。
- 清楚知道当前题型、进度、未答和存疑状态。
- 安全提交并理解结果。
- 从错题进入订正和再练。

学生端不承担：

- 题库映射编辑。
- 导入任务操作。
- 内容发布审批。
- 系统运维配置。

### Admin Console

服务对象：题库维护者、内容运营者、系统管理员。

核心目标：

- 看到导入批次、数量、错误和数据健康状态。
- 将原始分类整理成学生能理解的题库。
- 控制题库名称、分类、标签、可见性和发布状态。
- 抽查题干、选项、答案与解析的质量。
- 处理异常数据和必要的学生支持。

管理端不应直接复用学生端页面并“多显示几个按钮”。它需要独立入口、权限、导航和任务流，建议后续创建 `apps/admin`。

### API / Data Platform

服务对象：学生端、管理端和离线导入任务。

核心目标：

- 提供稳定、可验证的业务 contract。
- 保持学生数据、题库数据和管理操作的权限边界。
- 在单体数据库事务内保证练习提交的一致性。
- 隐藏原始导出格式和数据库实现细节。

## 2. Student Information Architecture

学生端 P1 的具体路由、会话列表 contract、多 active-session 策略和验收标准见
[`student-information-architecture.md`](./student-information-architecture.md)。该文档优先于页面视觉实现。

### Core Objects

学生端只需要理解五类对象：

| Object | 用户理解 |
| --- | --- |
| 学习档案 | 当前固定用户名对应的进度与错题 |
| 题库 | 可以开始一组练习的内容集合 |
| 练习会话 | 一次固定题目集合，可暂停和继续 |
| 练习结果 | 已提交会话的得分与逐题反馈 |
| 错题条目 | 某题的错误历史、订正状态与再练入口 |

不要把 `classification`、`bank_mapping`、`practice_session_questions` 等内部模型直接暴露给学生。

### Target Navigation

```text
登录
  -> 学生首页
       |-- 继续练习
       |-- 选择题库
       |-- 错题本
       |-- 练习历史
       `-- 我的档案
```

当前已实现：

- 登录。
- 独立学生首页。
- 题库。
- 多个 active session 的明确列表与选择。
- 练习与结果。
- 错题本。
- 练习历史与历史结果入口。
- 首页、题库、练习、错题和历史的可恢复 URL。

当前缺失：

- 账户说明、身份安全和数据归属提示。
- 学习统计和长期进步反馈。
- active session 的归档/放弃操作与超过首屏 20 条时的“更多”交互。

### Student State Machines

在最终视觉设计前，必须先固定这些状态：

#### Identity

```text
anonymous -> authenticating -> authenticated
authenticated -> logging_out -> anonymous
```

还需要定义：

- 用户名不存在时是否自动创建。
- 正式环境是否必须密码/学校身份。
- 用户名冲突、忘记身份、共享用户名如何处理。

#### Practice Session

```text
creating -> active -> submitting -> completed
                  \-> save_failed
```

`completed` 必须只读。未来如需要重开，创建新 session，而不是回滚旧 session。

#### Draft

```text
empty -> dirty -> saving -> saved
                    \-> failed -> retrying
```

#### Wrongbook

```text
active -> mastered
mastered -> active  # 再次答错时自动恢复
```

未来需要决定“掌握”是永久手动标记，还是由再练正确次数自动推断。

## 3. Admin Information Architecture

管理端第一版建议只做四个一级任务：

```text
管理首页
  |-- 题库整理
  |-- 导入任务
  |-- 题目质检
  `-- 系统状态
```

### Bank Curation

最小工作流：

1. 查看自动生成的 mapping。
2. 按 `status=review`、分类、qGroup、是否可见筛选。
3. 查看原始名称、父节点、直接题数和后代题数。
4. 编辑展示名称、学科、分类、标签、说明和可见性。
5. 预览学生端效果。
6. 发布或隐藏。

需要的后端能力：

- 管理员鉴权与 RBAC。
- mapping 列表、详情、编辑、批量状态修改。
- optimistic concurrency 或版本字段，避免多人覆盖。
- 审计日志。

### Import Operations

最小工作流：

1. 创建/触发导入任务。
2. 查看正在解析的文件和进度。
3. 查看 imported/skipped/failed 数量。
4. 下载或查看错误摘要。
5. 完成后运行数据健康检查。

当前导入器是 CLI 同步任务，还没有 job table、状态 API 和管理 UI。

### Question Review

第一版只做查看与隐藏/标记异常，不急于在平台内编辑所有原始题目：

- 查看题干、选项、答案、解析、来源分类。
- 标记答案异常、选项缺失、内容乱码、重复题。
- 必要时从学生题库中排除。

直接编辑原始题目会引入“下次导入是否覆盖”的数据所有权问题，必须先设计 override 层。

### System Status

- API/DB health。
- 最近导入结果。
- 数据量与异常量。
- 最近失败任务。
- 后续再增加用户与练习指标。

## 4. Backend Bounded Contexts

### Identity

拥有：

- student/admin identity。
- credentials。
- login session。
- role/permission。

不拥有：

- 练习进度。
- 错题。

### Catalog

拥有：

- classification 的产品化视图。
- bank mapping。
- 可见性、发布状态、标签和说明。

不拥有：

- 学生练习结果。

### Practice

拥有：

- practice session 生命周期。
- locked question order。
- draft、progress、review flag。
- grading orchestration。
- attempt 记录。

不拥有：

- 题库编辑。
- 错题本展示规则。

### Wrongbook / Learning Record

拥有：

- 错题聚合。
- mastered 状态。
- 错题详情 contract。
- 从错题集合创建再练输入。

当前再练 session 已通过 `WrongQuestionService -> PracticeSessionService` 创建；Wrongbook repository 不直接写 Practice 表。

### Import

拥有：

- 原始格式解析。
- normalizer。
- idempotent import。
- import report。

不拥有：

- 手工产品文案和发布审批。

### Admin

拥有：

- 管理命令。
- 审计日志。
- import job orchestration。
- content review workflow。

Admin 通过 Catalog/Import/Identity 的 service 操作数据，不应该让 route 任意执行 SQL。

## 5. Contract Rules

1. API 使用产品语义命名，不泄露 source export 字段。
2. 所有跨 app DTO 最终放入 `packages/shared` 并用 Zod 验证。
3. 列表 DTO 与详情 DTO 分离，避免一次返回全部题目内容。
4. command 与 query 分离命名，但不引入复杂 CQRS 框架。
5. 学生 API 与管理 API 使用清晰 namespace：

```text
/api/auth/*
/api/banks/*
/api/practice/*
/api/wrong-questions/*
/api/admin/*
```

6. 管理 API 的每个写操作必须有管理员身份、权限检查和审计信息。
7. 练习提交保持单数据库事务。
8. 未答、答错、未判定、自评四种状态必须在 contract 中可区分。

当前落地状态：

- Practice/Wrongbook 已建立 `contracts/v1`，API 输出和 Web 输入均执行 runtime parse。
- `completedCount` 已固定为 answered/graded questions 语义。
- Auth、Catalog、Admin Auth、Admin Bank Mapping read/write、通用 error 已迁入 shared v1；Admin 其余后端 contract 已完成设计，但 shared schema/route 尚未实现。
- 详细版本规则见 [contracts.md](contracts.md)。

## 6. Frontend Timing Decision

结论不是“前端完全不想”或“先做完整前端”，而是：

> **现在先设计功能、信息架构和交互流程；后端 contract 与 command 稳定后再做可运行前端；最终视觉系统最后做。**

推荐三层推进：

### Layer A — Now: Functional Product Skeleton

- 固定学生端和管理端导航。
- 固定对象、状态机、空状态、错误状态。
- 用文档、流程图、字段表和必要的静态 wireframe 定义功能。
- 不在这个阶段启动正式 `apps/admin` 或大规模 UI 实现。
- 目标是尽早暴露后端缺失 contract，而不是先堆页面。

### Layer B — Next: Contract And Backend Workflow Stabilization

- 补齐管理工作流。
- 补齐练习历史、身份策略和数据语义。
- 扩展已建立的共享 contract，并继续拆分大文件。
- 用 API tests、integration tests、脚本和必要的极简调试入口 dogfood 真实数据。
- 仍然避免把不稳定业务语义固化成正式前端。

### Layer C — Later: Runnable Frontend

- 在后端 command/query 稳定后实现学生端缺口和管理端界面。
- 优先实现真实工作流、表单状态、错误状态、权限守卫和数据反馈。
- 先做到功能可信，再进入视觉精修。

### Layer D — Last: Final Visual Design

- 统一品牌、排版、颜色、组件、动效和无障碍。
- 学生端与管理端分别建立视觉层级。
- 做完整 responsive 和可用性测试。
- 只在已经稳定的流程上精修，不再靠视觉稿猜业务。

前端在 Layer A/B 是“产品规格探针”，不是装饰，也不是正式实现；可运行前端放到 Layer C，最终视觉精修放到 Layer D，可以避免再次出现漂亮页面与真实状态/后端语义冲突。

## 7. Decision Gate Before Final UI

满足以下条件后再进入完整视觉设计：

- 学生端导航和页面清单已确认。
- 管理端 MVP 工作流已确认。
- Identity、Catalog、Practice、Wrongbook 的 API contract 已稳定。
- active/completed/empty/error/loading 状态有测试或验收标准。
- 真实题库已跑通关键流程。
- 目录拆分完成到可独立维护各 feature。
- 需求变更不再频繁修改底层数据模型。
