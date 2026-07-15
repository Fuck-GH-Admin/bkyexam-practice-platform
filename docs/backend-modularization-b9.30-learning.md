# B9.30 Learning backend modularization

状态日期：**2026-07-16**

目标：在 B9.29 Import Jobs repository split 之后，继续拆分当前后端最大的 `apps/api/src/learning/repository.ts`，但不改变 Learning Dashboard / Trends / Goals / Review Marks 的 public API、route contract 或 SQL 行为。

## 1. 本阶段结论

```text
Learning repository facade = implemented
memory repository split = implemented
PostgreSQL repository split = implemented
row/shared type split = implemented
metric/date/mapper utilities split = implemented
public import path compatibility = preserved
Admin broader split = deferred
```

## 2. 代码变更

原：

```text
apps/api/src/learning/repository.ts
```

同时包含：

- repository interface
- memory dashboard/goals/review-marks implementation
- PostgreSQL dashboard/trends/goals/review-marks SQL
- row type definitions
- date/count/accuracy helpers
- goal progress/feedback builder
- review mark row mapper

现拆为：

```text
apps/api/src/learning/repository.ts         # thin facade, preserves old import path
apps/api/src/learning/types.ts              # repository contract, memory DTO types, row types
apps/api/src/learning/memoryRepository.ts   # in-memory implementation
apps/api/src/learning/pgRepository.ts       # PostgreSQL implementation and SQL loaders
apps/api/src/learning/utils.ts              # metrics/date/mappers/goal feedback helpers
```

旧 import path 继续有效：

```ts
import {
  createMemoryLearningDashboardRepository,
  createPgLearningDashboardRepository,
} from '../learning/repository.js';
```

因此 routes、integration tests 和现有调用侧不需要迁移。

## 3. 行为边界

本阶段只做结构调整：

- 不新增 endpoint。
- 不改变 shared contract。
- 不改变 PostgreSQL SQL 语义。
- 不改变 memory repository fixture 行为。
- 不改变 Learning routes 的 schema validation / error mapping。

## 4. 验证

已跑局部验证：

```text
npm run typecheck -w @bkyexam-practice/api
npm run test -w @bkyexam-practice/api -- tests/learning/repository.test.ts tests/routes/learning.test.ts
```

阶段收尾已通过全量：

```text
npm run verify:docker
```

作为最终绿灯。

## 5. 仍未做

- `admin/questionReview.ts` 仍是当前最大 Admin 大文件，可继续拆 flags / overrides / effective question / mapper。
- `admin/adminStudents.ts` 可继续拆 memory/pg/mapper/service。
- `admin/bankMappings.ts` 可继续拆 read/write repository 与 mapper。
- `practice` route/service validation 与错误映射仍可继续收敛。
- Import Jobs 实时 progress 事件流仍后置。
