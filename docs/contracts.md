# Versioned API Contracts

状态日期：**2026-07-11**

本页描述跨 API、学生端和 repository 使用的稳定数据边界。当前版本号是代码命名空间中的 `v1`，不会额外写入每个 HTTP response。

## Source Of Truth

Practice 与 Wrongbook 的共享 contract 位于：

```text
packages/shared/src/contracts/v1/
  common.ts
  practice.ts
  wrongbook.ts
```

`packages/shared/src/index.ts` 统一导出 schema、常量和由 Zod 推导的 TypeScript 类型。

当前执行链：

```text
PostgreSQL / memory repository
  -> shared DTO type
  -> Fastify route response Schema.parse
  -> JSON
  -> Web api helper response Schema.parse
  -> React state
```

因此 Practice/Wrongbook 的成功响应如果偏离 v1：

- API 会把 repository/编排错误作为 `500` 暴露，而不是发送不可信 payload。
- Web 不会把不符合 contract 的响应直接写入页面状态。

大多数 Fastify 请求参数仍保留现有手写 parser，以维持既有错误消息和兼容行为。`GET /api/practice/sessions` 已直接使用 `ListPracticeSessionsRequestV1Schema`；其余共享 request schema 后续逐路由迁移。

## Covered Contracts

| Context | Main schemas |
| --- | --- |
| Practice | `PracticeSessionV1Schema`, `PracticeQuestionV1Schema`, `PracticePayloadV1Schema`, `PracticeSubmitSessionResponseV1Schema` |
| Practice session collection | `PracticeSessionCardV1Schema`, `PracticeSessionPageV1Schema`, `ListPracticeSessionsRequestV1Schema` |
| Legacy Practice submit | `PracticeSubmitAnswerResponseV1Schema`, `SubmitPracticeAnswerRequestV1Schema` |
| Wrongbook | `WrongQuestionItemV1Schema`, `WrongQuestionDetailV1Schema`, list/detail/review/mastered response schemas |
| Shared primitives | UUID、option ID、submitted answer、correct answer |

当前未覆盖：

- Auth response。
- Bank/Catalog response。
- Admin API。
- 通用 error response 的版本化 schema。

## Frozen V1 Semantics

### IDs

- 新 Practice response 使用小写 canonical UUID。
- Wrongbook response 从 PostgreSQL 输出小写 canonical UUID。
- 旧逐题提交 endpoint 为兼容历史调用，允许并保留大小写 UUID。
- option ID 被视为非空 opaque string；客户端不能假设它一定是 UUID。

### Answers

```ts
type SubmittedAnswerV1 = string[] | boolean | string;
```

- `false` 是有效且已作答的判断题答案。
- 空数组和空白文本在 Web model、Practice repository 提交及会话卡片计数中都按“未答”处理。
- `correctAnswer` 使用同一联合类型，支持客观题、判断题和暂时需要自评的其他题型。

### Practice Question

- `markedForReview` 是 required boolean，不再由各端自行猜默认值。
- `draftAnswer` 可选，且必须保留 `false`。
- `isCorrect` 可为 `true | false | null`；`null` 表示无法自动判定。
- `correctAnswer` 与 `needsSelfReview` 只在结果可用时出现。

### Practice Session

- `currentSort` 是 required positive integer。
- `completedCount <= questionCount`。
- `correctCount <= completedCount`。
- completed session 可以存在未答题，因此不要求 `completedCount === questionCount`。

`completedCount` 的 v1 固定语义由常量声明：

```ts
PRACTICE_COMPLETED_COUNT_SEMANTICS_V1
  = "answered_or_graded_questions"
```

它表示实际有答案并产生判分/自评结果的题数，不表示 session 总题数。未来如改名为 `answeredCount`，必须通过新 contract 版本或明确的兼容迁移完成，不能静默改变字段含义。

### Practice Session Card And Page

- `origin` 必须是 `bank | wrongbook`。
- `answeredCount <= questionCount`。
- `correctCount <= answeredCount`。
- `reviewCount <= questionCount`。
- active session 的 `completedAt` 必须为 `null`。
- completed session 的 `completedAt` 必须是带时区的 ISO timestamp。
- active `answeredCount` 表示“已有判定或存在非空草稿”的题数；completed `answeredCount` 等于最终 answered/graded count。
- page 固定返回 `limit`、`offset` 和 `hasMore`，`limit` 范围为 `1..50`。

该 card 是首页/历史的展示 contract，不替代完整 `PracticeSessionV1`。结果详情继续使用 `PracticePayloadV1Schema`，避免维护第二份题目和判分真相。

### Wrongbook

- `wrongCount` 必须为正整数。
- 列表与详情 contract 分离。
- `lastAnswer` 在 v1 仍是数据库序列化字符串。
- 详情的 `correctAnswer` 已规范化为 typed answer。
- review session response 必须返回 canonical session UUID 与正数题量。

## Versioning Rules

以下变化可以在评审后保留 v1：

- 新增真正可选、旧客户端可忽略的字段。
- 放宽不改变现有数据解释的输入兼容性。
- 修复实现，使其重新符合已经声明的 v1。

以下变化必须创建 v2 或提供显式兼容层：

- 删除或重命名字段。
- 把 optional 字段改为 required。
- 改变 `completedCount`、`isCorrect=null` 等字段语义。
- 改变 answer 的结构或 option ID 的解释。
- 让同一字段在学生端与管理端表达不同对象。

旧 endpoint 的兼容例外应使用明确命名的 schema，不能通过放松所有新接口的 contract 来掩盖。

## Build And Test

shared package 的运行时入口指向 `packages/shared/dist`。根脚本会先执行：

```sh
npm run build:shared
```

然后再运行 API/Web 的 dev、test、typecheck、build 或 E2E。`npm ci` 也会通过 root `prepare` 构建 shared。

当前回归包括：

- shared schema 的边界、`false`、计数不变量和 legacy UUID 测试。
- Fastify route 对不合法 repository payload fail-closed 的测试。
- Web model 对空白文本、`false` 和 option answer 的测试。
- Playwright mock API 通过同一 Web runtime parser。
- 真实 PostgreSQL integration 通过 API route runtime parser。

## Remaining Contract Debt

- Auth 与 Catalog DTO 仍由各端手写。
- 请求 parser 尚未统一到共享 Zod schema。
- `lastAnswer` 尚未改为 typed answer。
- 旧逐题 submit 与整卷 submit 同时存在。
- Web 当前直接把 Zod 打进主 bundle；引入 URL router 与 feature splitting 时应评估按页面拆包。
- Admin contract 尚未定义。
