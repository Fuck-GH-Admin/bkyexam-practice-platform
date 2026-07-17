# B9.21 Admin Bank Mappings P1 UI

状态日期：**2026-07-15**

目标：按 B9.20 结论，在 `apps/admin` 里补一个轻量、功能性的 Bank Mappings P1 工作流。这个阶段只验证真实字段、真实写操作、权限和错误状态，不做最终视觉打磨。

## 1. 本阶段结论

```text
Bank Mappings nav = implemented
Bank Mappings list/filter/page = implemented
Bank Mapping detail/edit = implemented
Publish controls = permission-gated
Bulk status = implemented with partial result
visual polish = deferred
Import true write/reset/cancel/retry = deferred in B9.21; implemented in B9.27
Question Review full editor = deferred
```

B9.21 把 B9.19 中的 Bank Mappings placeholder 升级为可运行功能页。它复用既有 Admin shell、RBAC sidebar、shared v1 contract parse 和 Admin API wrapper。

## 2. 已实现范围

### Navigation / route

- `/admin/bank-mappings` 进入题库整理列表。
- `/admin/bank-mappings/:bankId` 打开右侧详情编辑面板。
- Sidebar 中 Bank Mappings 不再显示 placeholder。
- 页面仍保持 Admin app 的朴素功能样式，不做品牌/视觉系统。

### List / filter / page

调用：`GET /api/admin/bank-mappings`

已支持：

- keyword。
- status：`review` / `active` / `hidden` / `deprecated`。
- visible：`true` / `false`。
- subjectCategory / subjectName。
- hasObjectiveQuestions。
- qGroup。
- limit / offset 翻页。

列表展示：

- `bankName` / `rawName`。
- subjectCategory / subjectName。
- status / visible / no-objective / child-bank badges。
- direct / descendant / objective question counts。
- updatedBy / updatedAt。
- version。

### Detail / edit

调用：

- `GET /api/admin/bank-mappings/:bankId`
- `PATCH /api/admin/bank-mappings/:bankId`

可编辑字段：

- bankName。
- subjectCategory。
- subjectName。
- difficulty。
- examPurpose。
- audience。
- keywords。
- description。
- notes。

发布字段：

- status。
- visible。

发布字段只有 `bank_mapping:publish` 权限时可改；普通 `bank_mapping:write` 只能保存文案字段。

保存使用 `expectedVersion`，后端返回 `409` 时显示版本冲突提示。`objectiveQuestionCount=0` 时页面给出发布风险提示，最终仍以后端 `422` 为准。

### Bulk status

调用：`POST /api/admin/bank-mappings/bulk-status`

已支持：

- 当前页多选。
- 批量改 status。
- 批量改 visible。
- 每项带 `expectedVersion`。
- 渲染 `updated[]` / `failed[]` partial result。

## 3. Contract parsing

本阶段新增使用的 shared v1 schema：

- `AdminBankMappingListResponseV1Schema`
- `AdminBankMappingDetailResponseV1Schema`
- `UpdateAdminBankMappingRequestV1Schema`
- `BulkUpdateAdminBankMappingStatusRequestV1Schema`
- `BulkUpdateAdminBankMappingStatusResponseV1Schema`

所有成功响应进入 React state 前继续执行 schema parse；非 2xx 继续走 `ApiErrorResponseV1Schema`。

## 4. 验证范围

新增/扩展测试：

- `apps/admin/src/App.test.ts`
  - Bank Mapping route parse/build。
  - Bank Mapping list query builder。
  - Bank Mapping status badge helper。
- `tests/e2e/mockAdminApi.ts`
  - stateful Bank Mapping list/detail/patch/bulk-status mock。
- `tests/e2e/admin-smoke.spec.ts`
  - Admin Login。
  - System Status。
  - Student Accounts。
  - Bank Mappings list/detail/edit/bulk-status。

阶段验证命令：

```text
npm run typecheck -w @bkyexam-practice/admin  PASS
npm run test -w @bkyexam-practice/admin  PASS, 1 file / 7 tests
npm run typecheck:e2e  PASS
npm run test:e2e  PASS, 5 passed
```

最终阶段验证：`npm run verify:docker` PASS。

## 5. 明确不做

- 不做最终视觉设计系统。
- 不重构 Admin app 大文件结构。
- B9.21 本阶段不做 Import Jobs true write/reset/cancel/retry；该能力已在 B9.27 补齐最小闭环。
- 不做 Import queue/worker。
- 不做 Question Review full question detail/editor。
- 不做 Audit Logs diff polish。
- 不新增后端 contract。

## 6. 下一步建议

B9.21 之后有两个合理方向：

1. **B9.22 Import Jobs dry-run/history UI**：只做 dry-run、历史、详情、错误摘要，不碰 true import reset/cancel/retry；reset/cancel/retry 后续已在 B9.27 补齐。
2. **B9.22 Question Review preview UI**：只做 open flags 队列、add/resolve/ignore/exclude，不做完整题目编辑器。

如果继续保持“少费事、先功能、后风格”的原则，建议先做 **Import Jobs dry-run/history UI**，因为它能验证题库导入结果和错误摘要，且不要求新增后端。
