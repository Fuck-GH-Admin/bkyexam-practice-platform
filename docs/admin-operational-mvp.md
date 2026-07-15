# B9.19 Admin Operational MVP

状态日期：**2026-07-15**

目标：把 B9.18 静态 wireframe 中最小可运营管理入口落成可运行代码，但仍不进入最终视觉系统或完整管理平台。

## 1. 本阶段结论

```text
apps/admin = implemented
Admin Login = implemented
System Status dashboard = implemented
Student Accounts operations = implemented
Bank Mappings = implemented in B9.21
Import/Review/Audit/Admin Users = placeholder only
visual polish = deferred
```

B9.19 已创建独立 `apps/admin` workspace。它与学生端 `apps/web` 分离，使用 `/admin/*` 路由、独立 Admin session 恢复、独立 Vite dev server（5174）和独立构建产物。

## 2. 已实现范围

### Admin shell

- `/admin/login` 管理员登录。
- `/admin` / `/admin/system` 系统状态页。
- `/admin/students` 学生账号列表。
- `/admin/students/:studentId` 学生详情与账号安全操作。
- `/admin/students/create` 单个创建学生。
- `/admin/students/bulk-create` JSON/CSV paste 批量创建学生。
- Sidebar 根据当前管理员 `permissions` 过滤可见导航。
- 直接访问无权限页面时显示 403 panel。
- Bank Mappings 已在 B9.21 升级为 P1 功能页；Import Jobs、Question Review、Audit Logs、Admin Users 仍只做 placeholder，不开放半成品写操作。

### Contract parsing

所有已调用 Admin API 都在写入 React state 前使用 shared v1 schema parse：

- `AdminLoginResponseV1Schema`
- `AdminMeResponseV1Schema`
- `AdminLogoutResponseV1Schema`
- `AdminSystemStatusResponseV1Schema`
- `AdminStudentListResponseV1Schema`
- `AdminStudentDetailResponseV1Schema`
- `BulkCreateAdminStudentsRequestV1Schema`
- `BulkCreateAdminStudentsResponseV1Schema`
- `CreateAdminStudentRequestV1Schema`
- `UpdateAdminStudentRequestV1Schema`
- `ResetAdminStudentPasswordRequestV1Schema`
- `ResetAdminStudentPasswordResponseV1Schema`
- `RevokeAdminStudentSessionsResponseV1Schema`
- `ApiErrorResponseV1Schema`

### System Status

`GET /api/admin/system/status` 已展示：

- API service/version。
- database ok、migrationCount、currentMigration。
- corpus classifications/questions/options/bankMappings/visibleBanks。
- import table/running/latest job summary。
- quality table/open/blocking/excluded summary。

未伪造 System Status API 当前没有的字段，例如外部告警、学生待改密总数、锁定学生总数。

### Student Accounts

`apps/admin` 已支持：

- list + keyword/class/group/status/passwordResetRequired/lockedOnly 过滤。
- detail。
- 单个创建。
- 批量创建：支持 JSON 或简单 CSV paste，客户端转换为 contract JSON 后提交。
- 更新 displayName/status/className/groupName。
- 重置密码：设置临时密码，默认撤销会话，成功后只显示 `revokedSessions`，不保存或回显临时密码。
- 撤销所有会话。
- partial-result 渲染：`created[]` / `skipped[]` / `failed[]`。

## 3. 验证结果

本阶段新增测试：

- `apps/admin/src/App.test.ts`：Admin route、RBAC nav、student query、bulk input parser、student status badge。
- `tests/e2e/admin-smoke.spec.ts`：浏览器 smoke 覆盖 Admin Login、System Status、Student Accounts list/detail/update/reset/revoke/create/bulk-create。
- `tests/e2e/mockAdminApi.ts`：浏览器层 Admin API stateful mock。

已通过的阶段验证：

```text
npm run test -w @bkyexam-practice/admin  PASS, 1 file / 5 tests
npm run typecheck -w @bkyexam-practice/admin  PASS
npm run build -w @bkyexam-practice/admin  PASS
npm run typecheck:e2e  PASS
npm run test:e2e  PASS, 5 passed
```

`npm run build` 现在包含 `@bkyexam-practice/admin`。
`npm run test:e2e` 现在同时启动学生 Web（5173）和 Admin Web（5174）。

## 4. 明确未完成

B9.19 不声明完成以下内容：

- 最终视觉设计系统。
- 完整管理平台。
- Bank Mapping UI 已在 B9.21 补为功能性 P1；仍未做最终视觉。
- Import Jobs UI / true import 操作 UI。
- Question Review UI。
- Audit Logs UI。
- Admin Users UI。
- import reset、异步 worker、cancel/retry。
- public student registration / recovery。
- public admin registration。
- Learning Dashboard 前端。

## 5. 下一步建议

B9.19 后续已经完成 B9.20 工作流缺口审查与 B9.21 Bank Mappings P1 UI。最新记录见 [`admin-p1-workflow-gap-review.md`](admin-p1-workflow-gap-review.md) 与 [`admin-bank-mappings-p1-ui.md`](admin-bank-mappings-p1-ui.md)。原 B9.20 建议是先用真实 `apps/admin` 骨架验证：

1. Bank Mappings list/detail/edit 的最小 UI 是否需要新增后端字段。
2. Import Jobs list/detail/error-report 的 UI 是否需要异步/队列前先补状态字段。
3. Question Review list/detail/flag/exclusion 的 UI 是否足够运营使用。
4. Admin Users 是否应进入下一版，还是继续只靠 CLI/API。
5. 是否需要一个 Admin dashboard summary API，避免 System Status 承担账号运营统计。

仍建议暂缓最终视觉精修：当前管理端已经可以运营学生账号，但题库整理、导入和质检工作流还未通过可运行界面暴露全部状态。