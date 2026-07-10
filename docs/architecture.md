# Architecture

## Architectural Position

BKYExam 当前采用 **模块化单体**：

```text
Browser
  |
  v
Vite dev server / Nginx
  |-- static React application
  `-- /api/*
        |
        v
    Fastify API
        |
        v
    PostgreSQL
```

这个阶段继续保持一个 API 进程和一个 PostgreSQL 数据库。现有规模、团队协作方式和部署目标都不需要微服务；过早拆服务只会增加鉴权、事务、部署和调试成本。

## Runtime Components

### `apps/web`

React 19 + Vite 学生端。

当前可用页面/状态：

- 未登录身份入口。
- 独立学生首页，显示多个进行中练习。
- 题库浏览、搜索和筛选。
- 按 session URL 恢复活跃练习。
- 客观题练习台。
- 提交前检查。
- 练习历史与已完成结果回看。
- 错题本、错题详情和错题再练。

轻量 History API router 位于 `src/app/router.ts`，固定 `/`、`/banks`、`/practice/:sessionId`、`/wrong-questions` 和 `/history`。练习功能位于 `features/practice`，首页/历史会话展示位于 `features/sessions`；auth、catalog、wrongbook 与大部分 app shell 编排仍集中在 `App.tsx`。

### `apps/api`

Fastify API，负责：

- 学生身份和服务端 Cookie 会话。
- 题库目录读取。
- 练习会话、题目锁定、进度、草稿和存疑状态。
- 整卷提交、客观题判分和练习记录。
- 错题本及错题再练。
- 题库导入、映射生成、迁移和数据库 smoke。

API 通过 repository 边界支持内存实现与 PostgreSQL 实现。真实运行必须使用 PostgreSQL；内存实现主要服务于快速 route 测试。

### `packages/shared`

共享 Zod schema、versioned API contract 与 TypeScript 类型。

当前 `contracts/v1` 已覆盖 Practice 与 Wrongbook 的主要 response、请求模型和 answer/UUID primitive。API repository、Fastify route 与 Web state 使用同一套类型；成功响应在服务器发送前和 Web 接收后各执行一次 runtime parse。

```text
repository
  -> shared DTO
  -> API Schema.parse
  -> HTTP
  -> Web Schema.parse
  -> feature state
```

Auth、Catalog、通用 error 和未来 Admin contract 尚未迁入 shared。详细规则见 [contracts.md](contracts.md)。

### PostgreSQL

运行时唯一持久化数据源。Web 和 API 在正常请求中不会扫描原始 `.txt` 文件。

### Import Pipeline

原始导出文件只作为离线输入：

```text
questionbank/*.txt
  -> parser
  -> normalized in-memory records
  -> transactional upsert
  -> classifications/questions/options/bank_mappings
```

## Current Business Contexts

当前代码已经自然形成六个业务上下文，但物理目录还没有完全对齐：

| Context | 当前职责 | 当前主要位置 |
| --- | --- | --- |
| Identity | 学生身份、密码占位、Cookie session | `auth/`, `routes/auth.ts` |
| Catalog | 学生可见题库、分类与映射 | `repositories/bankRepository.ts`, `routes/banks.ts`, `mapping/` |
| Practice | 会话、题目锁定、草稿、进度、存疑、提交、判分 | `practice/`, `routes/practice.ts` |
| Wrongbook | 错题列表、详情、掌握状态、再练会话 | `wrongQuestions/`, `routes/wrongQuestions.ts` |
| Import | 源文件解析、规范化、批量导入 | `import/` |
| Platform | 配置、数据库连接、迁移、HTTP 装配 | `config.ts`, `db/`, `app.ts`, `index.ts` |

管理端将成为第七个上下文，但尚未实现。

## Practice Lifecycle

### Create

1. API 验证题库映射存在且 `visible=true`。
2. 递归读取题库分类及后代分类。
3. 按题型、模式和数量选择题目。
4. 创建 `practice_sessions`。
5. 将题目及顺序锁定到 `practice_session_questions`。
6. 返回不含原始答案的题目与选项。

### Draft And Resume

- 选择答案后写入 `practice_session_drafts`。
- 清空答案时删除草稿；如果该题仍被标记存疑，则保留只有存疑状态的草稿行。
- 跳题时更新 `practice_sessions.current_sort`。
- 存疑状态写入服务端，不是浏览器临时状态。
- 草稿、清空草稿和存疑变更都会刷新父 session 的 `updated_at`。
- 重新登录或刷新后，GET session 返回草稿、当前位置和存疑状态。

### Session Discovery And History

- `GET /api/practice/sessions?status=active` 返回多个进行中会话，按最近活动时间稳定排序。
- 首页不再自动恢复第一条；学生明确选择 session 后进入 `/practice/:sessionId`。
- `GET /api/practice/sessions?status=completed` 返回历史卡片。
- 历史卡片继续进入同一个 `/practice/:sessionId` 详情，不复制结果模型。
- session `origin` 区分普通题库练习与错题再练。

### Whole-Session Submission

1. 前端等待已排队的草稿保存完成。
2. API 在事务中锁定当前学生的 active session。
3. 对存在有效草稿且尚未判分的题目执行 `gradeAnswer`。
4. 写入 `practice_attempts`。
5. 更新锁定题目的 `answered_at` 与 `is_correct`。
6. 错误客观题 upsert 到 `wrong_questions`。
7. 更新 `completed_count`、`correct_count`，并把 session 标记为 `completed`。
8. 完成后的草稿、存疑、进度和重复提交修改返回 `409`。

语义约定：

- `questionCount`：本次锁定的总题数。
- `completedCount`：本次实际有答案并产生判分/自评结果的题数，不是总题数。
- 未答题可以随整卷提交结束会话，但不会产生 `practice_attempts`。
- `results` 只包含本次产生结果的已答题。

该语义已由 `PRACTICE_COMPLETED_COUNT_SEMANTICS_V1 = "answered_or_graded_questions"` 固定；未来字段更名或语义变化必须显式升级 contract。

旧的逐题提交 endpoint 仍保留兼容，但当前学生端以草稿优先、整卷提交为主路径。

## Wrongbook Lifecycle

- 客观题答错时以 `(student_id, question_id, bank_id)` 唯一键 upsert。
- 重复答错增加 `wrong_count`，更新最近答案，并重新设为未掌握。
- 列表只返回摘要字段。
- 详情按需 join 题干、选项、规范化参考答案和解析。
- “再练本组”复用普通 `practice_sessions`，不另建一套练习引擎。

## Current Structural Debt

这些问题不会阻止当前闭环运行，但已经影响继续开发：

1. `apps/web/src/App.tsx` 已移出 practice UI、router 与 session card/page，但仍承担 app shell、API 调用、auth、catalog、wrongbook 和跨页面状态。
2. `apps/api/src/practice/repository.ts` 同时包含 contract、memory repository、PostgreSQL SQL、事务和部分业务编排。
3. `apps/api/src/routes/practice.ts` 体积较大，手写重复鉴权/UUID/错误映射。
4. Catalog 的 memory repository 在 route 文件中，而 PostgreSQL repository 位于通用 `repositories/`，边界不一致。
5. Practice/Wrongbook DTO 已共享，但 Auth、Catalog 与通用 error contract 仍在各端重复或手写。
6. 当前轻量 router 可恢复页面，但尚无 route-level code splitting、统一 navigation guard 或共享 API/error 层。
7. 管理平台没有独立应用、权限模型和 API namespace。

## Target Physical Structure

目标是渐进迁移到以下结构，而不是一次性搬完：

```text
apps/
  web/
    src/
      app/                 # 入口、router、shell、session bootstrap
      features/
        auth/
        catalog/
        practice/
        wrongbook/
        sessions/
      shared/
        api/
        ui/
        format/

  admin/                   # 独立管理端，后续创建
    src/
      app/
      features/
        auth/
        bank-curation/
        imports/
        question-review/
        operations/

  api/
    src/
      modules/
        auth/
          contracts.ts
          routes.ts
          service.ts
          memoryRepository.ts
          pgRepository.ts
        catalog/
        practice/
        wrongbook/
        admin/
      jobs/
        import/
      platform/
        config/
        db/
        http/
      app.ts
      index.ts

packages/
  shared/                  # 稳定的跨应用 schema/DTO
```

暂不创建共享 UI 包。只有学生端和管理端已经出现真实重复、视觉系统稳定后，才考虑 `packages/ui`。

## Refactor Rules

1. **先写边界与 contract，再移动文件。**
2. 每次只迁移一个垂直业务切片，并保持 API 与行为不变。
3. 每次迁移都要通过全量 test、typecheck、build。
4. PostgreSQL repository 的事务语义不能在纯目录整理中改变。
5. 不把 SQL、Fastify request/reply 或 React state 泄露进共享 domain contract。
6. 不为“看起来整洁”引入微服务、事件总线或复杂 DDD 框架。
7. 管理端单独建 `apps/admin`，不要混进学生端导航和 bundle。

## Deployment Shape

本地和首个生产版本都保持：

```text
Nginx
  |-- apps/web/dist
  |-- future apps/admin/dist under an admin path/host
  `-- proxy /api/* -> Fastify

Fastify
  `-- PostgreSQL
```

生产环境需要 `USE_DATABASE=true`、安全 Cookie、真实密钥、数据库迁移、题库导入、备份和可观测性。详见 [deployment.md](deployment.md)。
