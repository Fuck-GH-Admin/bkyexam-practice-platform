# B9.31 Admin Question Review backend modularization

状态日期：**2026-07-16**

目标：在 B9.30 Learning repository split 之后，继续拆分 Admin 侧最大的大文件 `apps/api/src/admin/questionReview.ts`，但不改变 Question Review list/detail/flag/exclusion/override 的 public API、route contract 或 SQL 行为。

## 1. 本阶段结论

```text
Question Review facade = implemented
types split = implemented
memory repository split = implemented
PostgreSQL repository split = implemented
mappers/effective DTO helpers split = implemented
public import path compatibility = preserved
behavior changes = none intended
```

## 2. 代码变更

原：

```text
apps/api/src/admin/questionReview.ts
```

同时包含：

- public repository interface / input / result types
- row types
- memory implementation
- PostgreSQL list/detail/update/override SQL
- transaction helpers
- flag helpers
- question detail mapper / effective question mapper
- preview / timestamp helpers

现拆为：

```text
apps/api/src/admin/questionReview.ts                 # thin compatibility facade
apps/api/src/admin/question-review/index.ts          # module exports
apps/api/src/admin/question-review/types.ts          # public contract + internal row types
apps/api/src/admin/question-review/memoryRepository.ts
apps/api/src/admin/question-review/pgRepository.ts
apps/api/src/admin/question-review/mappers.ts
```

旧 import path 继续有效：

```ts
import {
  createMemoryAdminQuestionReviewRepository,
  createPgAdminQuestionReviewRepository,
} from '../admin/questionReview.js';
```

因此 routes、integration tests 和现有调用侧不需要迁移。

## 3. 行为边界

本阶段只做结构调整：

- 不新增 endpoint。
- 不改变 shared contract。
- 不改变 PostgreSQL SQL 语义。
- 不改变 memory repository fixture 行为。
- 不改变 Admin Question Review routes 的 schema validation / error mapping。
- 不实现 diff/审批/回滚/批量操作。

## 4. 验证

已跑局部验证：

```text
npm run typecheck -w @bkyexam-practice/api
npm run test -w @bkyexam-practice/api -- tests/admin/questionReview.test.ts tests/routes/adminQuestionReview.test.ts
```

阶段收尾已通过全量：

```text
npm run verify:docker
```

作为最终绿灯。

## 5. 仍未做

- Question Review diff / approval / rollback / bulk operations。
- `admin/adminStudents.ts` 仍可继续拆 memory/pg/mapper/service。
- `admin/bankMappings.ts` 仍可继续拆 read/write repository 与 mapper。
- route-level validation / error mapping helpers 仍可继续收敛。
- Import Jobs realtime progress 事件流仍后置。
