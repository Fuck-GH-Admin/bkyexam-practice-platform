# B9.23 Admin Question Review Preview UI

状态日期：**2026-07-15**

目标：把已存在的 Admin Question Review 后端能力暴露为可运行的最小质检工作台。B9.26 之后，preview 阶段已被完整 detail/override 层补齐，但保留本页作为 preview 阶段的设计与验收记录。

## 1. 本阶段结论

```text
/admin/question-review = implemented
question review list/filter/page = implemented
detail preview = implemented
add flag = implemented
resolve / ignore flag = implemented
excludedFromPractice toggle = implemented
full question editor / override = superseded by B9.26
visual polish = deferred
```

B9.23 将 `Question Review` 从 placeholder 升级为功能性 preview UI。该页面只依赖既有 shared v1 contract 和后端 `GET /api/admin/question-review`、`PATCH /api/admin/question-review/:questionId`，没有新增后端 contract。

## 2. 已实现范围

### 路由与导航

- Sidebar 中 `Question Review` 已按 `question_review:read` 权限显示为功能页。
- 新增 `/admin/question-review` 队列页。
- 新增 `/admin/question-review/:questionId` 选中题目预览面板。
- 该阶段完成时，直接访问 detail URL 时如果列表过滤条件无法返回该题，会提示当前后端没有单独 GET detail endpoint；B9.26 已补齐独立 GET detail 与 override 保存。

### List / filters / pagination

支持以下查询字段：

- `status=open|resolved|ignored`，默认 `open`。
- `severity=low|medium|high|blocking`。
- `flagType=bad_answer|missing_option|bad_option|garbled_content|duplicate_question|wrong_type|needs_manual_review`。
- `questionType`。
- `bankId`。
- `keyword`。
- `limit/offset` 分页。

列表展示：

- questionId、questionType。
- bankName、bankId。
- contentPreview。
- answerPreview。
- optionCount。
- open flag 数量、blocking、excludedFromPractice 等 badge。

### Detail preview

详情面板展示：

- questionId。
- bankName/bankId。
- questionType。
- contentPreview。
- answerPreview。
- optionCount。
- excludedFromPractice。
- flags 列表、创建/处理人、创建/处理时间和 note。

### Write actions

在有 `question_review:write` 权限时可执行：

- add flag。
- resolve open flag。
- ignore open flag。
- toggle `excludedFromPractice`。
- 添加 flag 时可选择同时排除练习。

所有写请求都先通过 `UpdateAdminQuestionReviewRequestV1Schema.parse`，后端响应通过 `AdminQuestionReviewDetailResponseV1Schema.parse` 后再写入 React state。

## 3. 验证结果

本阶段新增或扩展测试：

- `apps/admin/src/App.test.ts`：新增 Question Review route、query builder 和 badge helper 覆盖。
- `tests/e2e/mockAdminApi.ts`：新增 stateful Question Review mock API，覆盖 list 与 PATCH add/resolve/ignore/exclude。
- `tests/e2e/admin-smoke.spec.ts`：Admin smoke 扩展到 Question Review 导航、详情、排除练习、添加 flag 和 resolve flag。

已通过的阶段验证：

```text
npm run test -w @bkyexam-practice/admin  PASS, 1 file / 9 tests
npm run typecheck -w @bkyexam-practice/admin  PASS
npm run typecheck:e2e  PASS
npm run build -w @bkyexam-practice/admin  PASS
npm run test:e2e  PASS, 5 passed
npm run verify:docker  PASS
```

完整质量门已通过：63 个 Vitest 文件 / 504 tests、5 条 Playwright smoke、1 条 PostgreSQL integration。

## 4. 明确未完成

B9.23 不声明完成以下内容：

- 完整题目详情读取 endpoint。
- 原始题目编辑器。
- 手工修题 override 层。
- 批量 resolve/ignore/exclude。
- 导出质检队列。
- 质检历史复杂筛选 UI。
- 与下一次导入冲突的 ownership/override 策略。
- Audit Logs UI。
- Admin Users UI（已在 B9.25 完成）。
- 最终视觉设计系统。

## 5. 后续记录

B9.23 后，B9.24 已完成 Audit Logs read-only UI，文档见 [`admin-audit-logs-readonly-ui.md`](admin-audit-logs-readonly-ui.md)。

B9.26 后，Admin P1 工作流中已经可运行的部分包括：Student Accounts、System Status、Bank Mappings、Import Jobs dry-run/history、Question Review preview/override、Audit Logs read-only 和 Admin Users management UI。下一步建议进入 import reset/cancel/retry 或 override diff/审批/回滚。
