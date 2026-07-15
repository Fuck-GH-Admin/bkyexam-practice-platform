# B9.24 Admin Audit Logs Read-only UI

状态日期：**2026-07-15**

目标：把已存在的 Admin Audit Log read API 暴露为可运行的只读审计日志页面，帮助核查账号、题库、导入和质检操作；仍不做复杂 diff viewer、导出、统计 dashboard 或最终视觉系统。

## 1. 本阶段结论

```text
/admin/audit-logs = implemented
audit log list/filter/page = implemented
audit log preview panel = implemented
before/after/metadata JSON preview = implemented
complex diff viewer = deferred
export = deferred
visual polish = deferred
```

B9.24 将 `Audit Logs` 从 placeholder 升级为功能性只读页面。该页面只依赖既有 shared v1 contract 和后端 `GET /api/admin/audit-logs`，没有新增后端 contract。

## 2. 已实现范围

### 路由与导航

- Sidebar 中 `Audit Logs` 已按 `audit_log:read` 权限显示为功能页。
- 新增 `/admin/audit-logs` 列表页。
- 新增 `/admin/audit-logs/:auditLogId` 选中日志预览面板。
- 直接访问 detail URL 时，如果当前列表过滤条件无法返回该日志，会提示当前后端没有单独 GET detail endpoint，需要从列表重新选择或调整过滤条件。

### List / filters / pagination

支持以下查询字段：

- `actorAdminId`。
- `action`。
- `resourceType`。
- `resourceId`。
- `result=success|failure`。
- `createdFrom` / `createdTo`。
- `limit/offset` 分页。

列表展示：

- actor displayName/loginName，actor 为空时显示 system。
- action。
- resourceType/resourceId。
- result、resourceType、system/admin actor 等 badge。
- metadata keys。
- createdAt。

### Detail preview

详情面板展示：

- id。
- actor。
- action。
- resourceType/resourceId。
- result。
- createdAt。
- before JSON preview。
- after JSON preview。
- metadata JSON preview。

## 3. 验证结果

本阶段新增或扩展测试：

- `apps/admin/src/App.test.ts`：新增 Audit Logs route、query builder 和 badge helper 覆盖。
- `tests/e2e/mockAdminApi.ts`：新增 stateful Audit Logs mock API，覆盖 list/filter。
- `tests/e2e/admin-smoke.spec.ts`：Admin smoke 扩展到 Audit Logs 导航、列表和 JSON preview。

已通过的阶段验证：

```text
npm run test -w @bkyexam-practice/admin  PASS, 1 file / 10 tests
npm run typecheck -w @bkyexam-practice/admin  PASS
npm run typecheck:e2e  PASS
npm run build -w @bkyexam-practice/admin  PASS
npm run test:e2e  PASS, 5 passed
npm run verify:docker  PASS
```

完整质量门已通过：63 个 Vitest 文件 / 500 tests、5 条 Playwright smoke、1 条 PostgreSQL integration。

## 4. 明确未完成

B9.24 不声明完成以下内容：

- 单条 audit log detail API。
- 复杂 diff viewer。
- JSON 高亮或字段级对比。
- 审计日志导出。
- 审计统计 dashboard。
- Audit retention / archival policy。
- Admin Users UI（已在 B9.25 完成）。
- 完整 Question Review editor / override 层。
- 最终视觉设计系统。

## 5. 下一步建议

B9.25 后，Admin P1 工作流中已经可运行的部分包括：Student Accounts、System Status、Bank Mappings、Import Jobs dry-run/history、Question Review preview、Audit Logs read-only 和 Admin Users management UI。

下一步建议做 **B9.26 完整 Question Review editor / override**：

- Question Review 真正的编辑器与 override 层。
- Import true write / reset / cancel / retry。
- 最终视觉系统。

Admin Users management UI 已在 B9.25 完成；下一步应优先补仍未闭环的题目编辑/导入控制语义。
