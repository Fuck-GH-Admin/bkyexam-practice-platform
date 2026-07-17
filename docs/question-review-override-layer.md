# Question Review Override Workflow

状态日期：**2026-07-16**

B9.26 建立了不修改导入原表的 override 层；B9.36 在此基础上补齐字段级 diff、草稿提交、审批/驳回和可审计回滚。核心原则仍然是：

> `questions` / `question_options` 是导入事实层；人工复核通过 revision workflow 维护，只有 approved revision 才写入 effective override。

## 已完成

### 数据模型

- `0012_question_review_overrides.sql`
  - `question_overrides`
  - `question_option_overrides`
- `0014_question_review_workflow.sql`
  - `question_override_revisions`
  - revision 状态：`draft / pending_review / approved / rejected`
  - 保存题干、答案、解析、选项覆盖快照和 immutable diff JSON
  - 保存创建者、审批者、提交/审批时间、审批意见、应用后的 effective version 和 rollback 来源
  - 每题最多一个 active `draft/pending_review` revision

### 工作流

1. 内容编辑者保存草稿：
   - `PATCH /api/admin/question-review/:questionId/override`
   - 同时校验 `expectedVersion` 和 `expectedDraftVersion`
   - 保存草稿不会改变学生侧 effective 内容
2. 内容编辑者提交审批：
   - `POST /api/admin/question-review/:questionId/override/submit`
   - `draft -> pending_review`
3. 具有 `question_review:approve` 权限的管理员审批：
   - `POST .../override/approve`
   - `pending_review -> approved`
   - approval 在事务中把 revision snapshot 应用到 `question_overrides` / `question_option_overrides`
4. 审批者驳回：
   - `POST .../override/reject`
   - `pending_review -> rejected`
   - 不改变学生侧 effective 内容
5. 审批者回滚：
   - `POST .../override/rollback`
   - 以历史 approved revision 为来源创建新的 approved revision
   - 不删除或改写历史记录

### Diff 与并发

- detail response 同时返回：
  - `source`：导入原始题干/答案/解析
  - `override` / `overrideVersion`：当前已批准 effective override
  - `workflow.activeRevision`
  - `workflow.revisions`
- 每个 revision 保存字段级 `diff`，覆盖题干、答案、解析和选项文案。
- 保存草稿校验 effective version 与 draft version。
- approve/reject/rollback 校验当前 effective version。
- PostgreSQL 路径锁定 question 行，避免同题审批和回滚并发穿透。

### 权限与审计

- `question_review:read`：读取列表、详情、diff 和历史。
- `question_review:write`：保存草稿、提交审批、flag/exclusion。
- `question_review:approve`：审批、驳回、回滚。
- 当前 `content_editor` 只有 read/write；`super_admin` 拥有 approve。
- audit action：
  - `question_review.override_draft_save`
  - `question_review.override_submit`
  - `question_review.override_approve`
  - `question_review.override_reject`
  - `question_review.override_rollback`

### Admin UI

- 编辑区以 active draft 为准；无草稿时从当前 effective 内容开始。
- 显示字段级 before/after diff。
- 支持保存草稿、提交审批。
- 审批权限角色可填写意见并批准/驳回。
- 显示 revision history，并可回滚到历史 approved revision。
- 当前界面仍是功能性运营 UI，不是最终视觉。

### 学生读取语义

- Practice、Wrongbook、Learning 仍只读取已批准的 effective override。
- draft、pending_review、rejected revision 不会泄漏到学生端。
- 全量题库导入不会覆盖 revision 历史或 effective override 表。

## 验证

- shared contract：revision/status/diff/workflow/request schema。
- route tests：draft、diff、submit、approve、reject、rollback、权限和版本冲突。
- PostgreSQL integration：草稿不生效，审批后学生读取生效，回滚保留历史。
- Admin Playwright smoke：保存草稿、显示 diff、提交、审批和回滚。

## 仍未完成

- 富文本、图片题和附件编辑。
- 批量 override / 批量审批。
- 导入后 source drift 与 approved override 的自动冲突报告。
- 审批通知、待办订阅和 SLA。
- 主观题、编程题、Office 题的完整编辑与评测语义。
- 最终视觉精修。
