# B9.29 Backend modularization follow-up

状态日期：**2026-07-16**

目标：在 B9.28 worker 落地后，继续把刚变大的 Import Jobs 后端边界拆清楚，避免 `repository.ts` 重新变成混合 memory / PostgreSQL / mapper / worker 状态机的大文件。

## 1. 本阶段结论

```text
Import Jobs repository facade = implemented
memory repository split = implemented
PostgreSQL repository split = implemented
row mapper split = implemented
public importJobs facade compatibility = preserved
Learning/Admin broader split = deferred
```

## 2. 代码变更

原：

```text
apps/api/src/admin/import-jobs/repository.ts
```

同时包含：

- memory repository
- PostgreSQL repository
- row mapper / clone helper
- worker 新增的 queue/claim/heartbeat/recover SQL

现拆为：

```text
apps/api/src/admin/import-jobs/repository.ts        # thin facade
apps/api/src/admin/import-jobs/memoryRepository.ts  # in-memory implementation
apps/api/src/admin/import-jobs/pgRepository.ts      # PostgreSQL implementation
apps/api/src/admin/import-jobs/jobMapper.ts         # row mapping / clone helper
```

`apps/api/src/admin/importJobs.ts` 仍保持兼容 facade：

```ts
export * from './import-jobs/index.js';
```

因此现有 route、tests 和外部 import path 不需要改。

## 3. 验证

已跑：

```text
npm run typecheck -w @bkyexam-practice/api
```

最终阶段已通过 `npm run verify:docker`。

## 4. 仍未做

- `learning/repository.ts` 仍是最大大文件，后续应拆 dashboard/trends/goals/bookmarks 子仓储。
- `admin/questionReview.ts` 仍可继续拆 repository/override/flag/effective view。
- `admin/adminStudents.ts`、`admin/bankMappings.ts` 可按 memory/pg/mapper/service 继续拆。
- route-level validation/error mapping 仍可抽通用 helpers。
