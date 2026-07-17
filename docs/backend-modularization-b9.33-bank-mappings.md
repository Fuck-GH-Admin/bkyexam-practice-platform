# B9.33 Admin Bank Mappings backend modularization

状态日期：**2026-07-16**

目标：在 B9.32 Admin Students split 之后，继续拆分 Admin 题库运营侧的大文件 `apps/api/src/admin/bankMappings.ts`，但不改变 Bank Mappings list/detail/update/bulk-status 的 public API、route contract 或 SQL 行为。

## 1. 本阶段结论

```text
Bank Mappings facade = implemented
types split = implemented
memory repository split = implemented
PostgreSQL repository split = implemented
mappers split = implemented
domain rules split = implemented
public import path compatibility = preserved
behavior changes = none intended
```

## 2. 代码变更

原：

```text
apps/api/src/admin/bankMappings.ts
```

同时包含：

- public repository interface / input / result types
- memory repository
- PostgreSQL repository
- row types
- mapper helpers
- student visibility preview rules
- publish guard rules
- PostgreSQL update SQL helpers
- transaction helpers

现拆为：

```text
apps/api/src/admin/bankMappings.ts                 # thin compatibility facade
apps/api/src/admin/bank-mappings/index.ts          # module exports
apps/api/src/admin/bank-mappings/types.ts          # public contract + internal row types
apps/api/src/admin/bank-mappings/memoryRepository.ts
apps/api/src/admin/bank-mappings/pgRepository.ts
apps/api/src/admin/bank-mappings/mappers.ts
apps/api/src/admin/bank-mappings/rules.ts
```

旧 import path 继续有效：

```ts
import {
  createMemoryAdminBankMappingRepository,
  createPgAdminBankMappingRepository,
} from '../admin/bankMappings.js';
```

因此 routes、integration tests 和现有调用侧不需要迁移。

## 3. 行为边界

本阶段只做结构调整：

- 不新增 endpoint。
- 不改变 shared contract。
- 不改变 PostgreSQL SQL 语义。
- 不改变 memory repository fixture 行为。
- 不改变 Admin Bank Mappings routes 的 schema validation / error mapping。
- 不改变 `active_without_objective_questions` 发布 guard。
- 不改变 bulk status 的 partial success / failed 语义。

## 4. 验证

已跑局部验证：

```text
npm run typecheck -w @bkyexam-practice/api
npm run test -w @bkyexam-practice/api -- tests/admin/bankMappings.test.ts tests/routes/adminBankMappings.test.ts
```

阶段收尾已通过全量：

```text
npm run verify:docker
```

作为最终绿灯。

## 5. 仍未做

- route-level validation / error mapping helpers 仍可继续收敛。
- Import Jobs realtime progress 事件流仍后置。
- Question Review diff / approval / rollback / bulk operations 仍后置。
- Admin dashboard / ops summary 仍后置。
- 最终前端视觉仍后置。
