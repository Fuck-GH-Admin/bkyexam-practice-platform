# Practice Desk Stabilized Implementation

状态：**已实现并验证**

日期：2026-07-10

## Source

本轮参考了早期 PC 练习台与提交检查视觉稿，但没有照搬早期实施计划中的本地状态和逐题提交语义。

## Final Decisions

- 保留“题目优先 + 右侧答题状态栏”的 PC 布局。
- 保留提交前检查 modal。
- 存疑状态写入服务端，不使用 local-only flags。
- 答案先保存为服务端 draft。
- 当前主路径是整卷提交，不是逐题立即判分。
- modal 的未答和存疑数据来自当前真实 session。
- “回看”关闭 modal 并定位到真实题目。
- 确认提交调用 `POST /api/practice/sessions/:sessionId/submit`。
- completed session 为只读结果状态。
- 不把早期全局登录页/主题重做一起迁移，避免在业务语义未稳定时再次大规模换肤。

## Code

```text
apps/web/src/features/practice/
  model.ts
  PracticeDesk.tsx
  SubmitCheckDialog.tsx
```

`App.tsx` 仍负责 session orchestration 和 API 调用，后续应迁入 `features/practice` service/hook，但本轮没有为目录整理改变运行语义。

## Verified States

- current
- answered
- unanswered
- flagged
- answered + flagged
- saving
- saved
- save failed
- active
- submitting
- completed
- correct
- wrong
- needs self review

## Responsive Behavior

- 宽屏：题目区 + sticky 状态栏。
- 中屏：状态栏移到题目下方。
- 手机：单列题目、sticky 操作区、单列提交检查内容。

## Superseded Assumptions

以下早期假设不再有效：

- flags 只存在于前端。
- 提交检查不改变 API。
- 每题通过 `/answers` 立即提交。
- 提交检查只是视觉演示。

如历史 HTML/plan 与本文冲突，以本文、[API](../api.md) 和当前代码为准。
