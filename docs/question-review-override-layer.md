# Question Review Override Layer

状态日期：**2026-07-15**

B9.26 把题目质检从 preview/flag 队列推进到“可修订题目展示内容”的最小闭环。核心原则是：**不直接改导入原始表 `questions` / `question_options`**，因为全量题库导入会对这两张表执行 upsert 覆盖；人工修订必须放在独立 override 层。

## 已完成

- 新增 migration `0012_question_review_overrides.sql`：
  - `question_overrides`：按 `question_id` 保存题干、答案原文、解析原文、note、version、updated_by_admin_id。
  - `question_option_overrides`：按 `option_id` 保存选项文案覆盖。
  - 两张表均 `ON DELETE CASCADE` 绑定原始题目/选项。
- shared Admin v1 contract 新增：
  - `AdminQuestionReviewDetailV1Schema`。
  - `AdminQuestionReviewOptionV1Schema`。
  - `UpdateAdminQuestionOverrideRequestV1Schema`。
  - `AdminQuestionOverrideResponseV1Schema`。
- 后端新增：
  - `GET /api/admin/question-review/:questionId`：返回完整 effective 题目详情。
  - `PATCH /api/admin/question-review/:questionId/override`：基于 `expectedVersion` 保存题干/答案/解析/选项覆盖。
  - `question_review.override_update` audit log。
  - `409` optimistic concurrency conflict。
- 读取链路已改为优先读取 effective 内容：
  - Practice 创建/恢复/单题保存/整卷提交/单题提交读取 effective `content`、effective `answerRaw` 和 effective option content。
  - Wrongbook 列表/详情读取 effective 题干、答案、解析和选项。
  - Learning review marks 读取 effective content preview。
- Admin UI：
  - `/admin/question-review/:questionId` 现在会单独加载完整详情。
  - 详情页支持编辑题干、答案原文、解析、选项文案和 override note。
  - 保留已有 add flag、resolve/ignore、excludedFromPractice 操作。
- 测试：
  - shared contract 覆盖 override request/response。
  - API route 覆盖 detail、override update、version conflict 和 audit。
  - PostgreSQL integration 覆盖 override 对学生练习题干/选项展示生效。
  - Admin Playwright smoke 覆盖详情加载和 override 保存。

## 明确未完成

- 未做富文本/图片题编辑器。
- 未做批量 override。
- 未做 override diff viewer、审批流或回滚 UI。
- 未做导入后的 override drift 报告。
- 未允许删除/清空某个 option override 的独立操作。
- 未解决主观题、编程题、Office 题的完整编辑与评测语义。
- 未做最终视觉精修。

## 后续建议

1. **B9.27：Import operation hardening**
   - 保持 true import gate。
   - 先补 import reset/cancel/retry 的后端语义或明确继续延期。
   - 给导入结果增加“override 受影响题目数/疑似 drift”报告会很有价值。
2. **B9.28：Admin workflow completeness review**
   - 从管理员视角串起 Student Accounts、Bank Mappings、Import Jobs、Question Review、Audit Logs、Admin Users。
   - 不急着做最终视觉，先确认命令、状态和权限是否还缺口。
3. **前端正式设计仍后置**
   - 当前 Admin UI 是功能性运营界面，不是最终视觉。
   - 等后端 command 和工作流更稳定后，再统一做学生端/管理端视觉系统。
