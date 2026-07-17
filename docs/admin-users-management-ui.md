# B9.25 Admin Users management UI

状态日期：**2026-07-15**

## 1. 目标

B9.25 把 `Admin Users` 从 placeholder 升级为最小可运营页面，直接暴露后端 `GET /api/admin/users`、`GET /api/admin/users/:adminId`、`POST /api/admin/users` 和 `PATCH /api/admin/users/:adminId`。

## 2. 已完成

- `/admin/users` list/filter/page。
- `/admin/users/:adminId` detail/edit panel。
- `/admin/users/create` create panel。
- displayName、status、roles、password reset。
- 角色选择最少 1 个，避免空角色提交。
- Admin unit tests、mock Admin API、Playwright smoke。

## 3. 这次不做

- MFA / SSO。
- 邀请邮件 / 通知。
- 复杂安全策略 UI。
- 权限编辑器。
- 最终视觉与交互动效。

## 4. 验证

已通过：

- `npm run test -w @bkyexam-practice/admin`
- `npm run typecheck -w @bkyexam-practice/admin`
- `npm run typecheck:e2e`
- `npm run test:e2e`
- `npm run verify:docker`

最新完整验证结果：

- 501 Vitest tests
- 5 Playwright tests
- 1 PostgreSQL integration test

Admin build 输出：

- CSS `6.50 kB`，gzip `2.09 kB`
- JS `378.88 kB`，gzip `102.06 kB`

## 5. 下一步建议

若继续前端，优先级建议为：

1. 完整 Question Review editor / override。
2. Import true write / reset / cancel / retry。
3. 最终视觉统一与可用性打磨。

