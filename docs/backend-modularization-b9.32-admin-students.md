# B9.32 Admin Students backend modularization

状态日期：**2026-07-16**

目标：在 B9.31 Admin Question Review split 之后，继续拆分 Admin 账号运营侧的大文件 `apps/api/src/admin/adminStudents.ts`，但不改变 Student Accounts list/detail/create/bulk-create/update/reset-password/revoke-session 的 public API、route contract 或 SQL 行为。

## 1. 本阶段结论

```text
Admin Students facade = implemented
service split = implemented
types split = implemented
memory repository split = implemented
PostgreSQL repository split = implemented
mappers/utils split = implemented
public import path compatibility = preserved
behavior changes = none intended
```

## 2. 代码变更

原：

```text
apps/api/src/admin/adminStudents.ts
```

同时包含：

- public repository interface / input / result types
- Admin Student service
- memory repository
- PostgreSQL repository
- row types
- mappers
- normalization helpers
- transaction helpers

现拆为：

```text
apps/api/src/admin/adminStudents.ts                  # thin compatibility facade
apps/api/src/admin/admin-students/index.ts           # module exports
apps/api/src/admin/admin-students/types.ts           # public contract + internal row types
apps/api/src/admin/admin-students/service.ts         # create/bulk/update/reset service
apps/api/src/admin/admin-students/memoryRepository.ts
apps/api/src/admin/admin-students/pgRepository.ts
apps/api/src/admin/admin-students/mappers.ts
apps/api/src/admin/admin-students/utils.ts
```

旧 import path 继续有效：

```ts
import {
  createAdminStudentService,
  createMemoryAdminStudentRepository,
  createPgAdminStudentRepository,
} from '../admin/adminStudents.js';
```

因此 routes、integration tests 和现有调用侧不需要迁移。

## 3. 行为边界

本阶段只做结构调整：

- 不新增 endpoint。
- 不改变 shared contract。
- 不改变 PostgreSQL SQL 语义。
- 不改变 memory repository fixture 行为。
- 不改变 Admin Student routes 的 schema validation / error mapping。
- 不改变批量创建、密码重置、revoke sessions、className/groupName 推断策略。

## 4. 验证

已跑局部验证：

```text
npm run typecheck -w @bkyexam-practice/api
npm run test -w @bkyexam-practice/api -- tests/admin/adminStudents.test.ts tests/routes/adminStudents.test.ts
```

阶段收尾已通过全量：

```text
npm run verify:docker
```

作为最终绿灯。

## 5. 仍未做

- `admin/bankMappings.ts` 仍可继续拆 read/write repository 与 mapper。
- route-level validation / error mapping helpers 仍可继续收敛。
- Admin dashboard / ops summary 仍后置。
- Import Jobs realtime progress 事件流仍后置。
- 最终前端视觉仍后置。
