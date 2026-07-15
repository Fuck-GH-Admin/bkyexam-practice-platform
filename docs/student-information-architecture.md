# Student Information Architecture v1

**状态：已定稿，作为学生端 P1 的实现与验收边界。**  
**更新时间：2026-07-15**

这份文档先固定学生“看见什么、从哪里进入、能否回到哪里”的产品结构；它不规定最终的视觉风格。最终视觉设计必须建立在这些稳定的对象、路由和状态之上，而不是反过来用页面样式决定业务结构。

## 1. 决策

1. **首页不是题库列表。** 首页是学生个人工作台：恢复未完成练习、进入题库、错题本和练习历史。
2. **一个学生可以同时有多个 active 练习。** 创建新练习不会静默覆盖、删除或提交旧练习；首页按最近活动时间展示，学生明确选择要恢复的会话。
3. **每次练习是不可变的题目集合。** 完成后只读；重新练习或从错题再练一律创建新 session。
4. **练习历史只展示已完成会话。** 历史卡片进入已有的会话详情/结果 payload，不复制另一套“结果真相”。
5. **URL 是可恢复的界面状态。** 刷新、浏览器前进/后退或直接打开链接后，登录状态恢复时应回到相同的功能页；练习页以 session id 为唯一入口。
6. **本阶段只落实低保真信息架构。** 不进行最终视觉换肤、不引入设计系统大重构，也不以学生端页面承载管理功能。

## 2. 学生对象与用语

学生端只暴露以下产品对象：

| 对象 | 面向学生的含义 | 后端事实来源 |
| --- | --- | --- |
| 题库 | 可以选择并开始的一组学习内容 | `bank_mappings` / `classifications` |
| 练习 | 一次固定题目集合，可暂停、继续或提交 | `practice_sessions` |
| 练习进度 | 当前答题、存疑和位置状态 | `practice_session_drafts` / session `current_sort` |
| 练习结果 | 已提交会话的得分和逐题反馈 | session questions / attempts |
| 错题 | 需要订正或再练的学习记录 | `wrong_questions` |

内部术语 `classification`、`mapping`、`draft row`、`attempt` 不作为学生 UI 的主概念出现。

## 3. 路由与一级入口

登录后的学生端固定为下列 URL。页面可使用轻量路由实现，不要求本阶段引入第三方路由库。

| URL | 页面 | 主要任务 |
| --- | --- | --- |
| `/` | 首页 | 选择继续某个未完成练习，或进入其他学习任务 |
| `/banks` | 题库 | 搜索、筛选题库并创建新练习 |
| `/practice/:sessionId` | 练习/结果 | 恢复 active 会话，或查看 completed 会话结果 |
| `/wrong-questions` | 错题本 | 查看、订正、标记掌握、从错题再练 |
| `/history` | 练习历史 | 查看已完成练习并进入结果详情 |

未登录时，受保护路由停留在登录界面；登录恢复后再加载原 URL 对应的数据。不存在的 session、其他学生的 session 和无效 URL 必须显示明确错误或回到可用入口，不能展示其他学生的数据。

## 4. 首页工作台

首页按任务，而不是按数据库表组织：

```text
首页
  ├─ 继续练习
  │    ├─ active session A（最近活动）
  │    ├─ active session B
  │    └─ …
  ├─ 选择题库
  ├─ 错题本
  └─ 练习历史
```

### Active session 卡片

每张卡片至少显示：

- 题库名称；
- 来源：`题库练习` 或 `错题再练`；
- 模式、题目总数；
- 已答数 `answeredCount`，不是 `completedCount`；
- 存疑数 `reviewCount`；
- 最近活动时间；
- “继续”操作，目标为 `/practice/:sessionId`。

**排序和数量策略：**

- 后端按 `updatedAt DESC, id DESC` 排序；
- 草稿答案、清除草稿、存疑标记和题号进度变更都必须刷新 session 的 `updatedAt`；
- 本阶段不设置会悄悄淘汰数据的 active-session 硬上限；
- 单次列表响应最多返回 20 条，使用 `offset` / `hasMore` 分页。首页先展示第一页，后续可增加“更多”操作。

因此，“继续练习”永远是学生主动选择的会话；旧行为“自动打开接口返回的第一条 active session”被废弃。

## 5. 题库、练习和结果

### 开始新练习

题库页创建一个新的 `origin=bank` session。它不会影响其他 active session。题目顺序和题目集合在创建时锁定。

### 从错题再练

错题本创建一个新的 `origin=wrongbook` session。即使题目来自多个原始分类，session 的来源仍然是错题再练；`bankName` 仅作为展示性归属，不改变题目事实来源。

### 已完成练习

提交成功后：

- session 进入 `completed`，写入 `completedAt`；
- 题目、作答、判定和汇总只读；
- `/practice/:sessionId` 直接渲染既有结果 payload；
- 历史列表中的“查看结果”复用该 URL。

## 6. 会话列表 Contract

新增的学生会话集合 endpoint：

```text
GET /api/practice/sessions?status=active|completed&limit=1..50&offset>=0
```

响应：

```ts
{
  sessions: Array<{
    id: string;
    bankId: string;
    bankName: string;
    origin: 'bank' | 'wrongbook';
    mode: 'random' | 'sequential';
    questionCount: number;
    answeredCount: number;
    correctCount: number;
    reviewCount: number;
    currentSort: number;
    status: 'active' | 'completed';
    createdAt: string;   // ISO-8601
    updatedAt: string;   // ISO-8601
    completedAt: string | null; // ISO-8601，仅 completed 有值
  }>;
  page: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

字段规则：

- `answeredCount`：active session 中已经判定或有非空草稿答案的题数；completed session 中等于已判定/已作答数。
- `correctCount`：当前已有判定的正确数；整卷提交主路径中 active session 通常为 `0`，legacy 逐题判分可能使其非零。
- `reviewCount`：已标记“稍后复查”的题数。
- `completedCount` 仍属于完整 session/结果 contract，其语义是 `answered_or_graded_questions`；不用于首页进度展示，避免把“已经提交判定”误解为“已经暂存作答”。
- `bankName` 是展示字段，优先使用学生可见题库映射名，缺失时回退为分类名称。
- `origin` 是会话创建目的，不是权限或题目来源判定依据。

历史结果详情不创建重复 endpoint：继续使用 `GET /api/practice/sessions/:sessionId`，并由服务端按 student ownership 校验。

旧的 `GET /api/practice/sessions/active` 暂时保留，供兼容调用；新学生端只使用集合 endpoint。

## 7. 验收标准

### 后端

- [x] 数据库记录 session `origin`，已有数据迁移为 `bank`。
- [x] active 会话查询可按学生、状态、时间稳定分页，不泄露其他学生数据。
- [x] 写入草稿、清空草稿、切换存疑和保存题号都更新会话最近活动时间。
- [x] 完成会话按 `completedAt DESC` 返回，且结果详情仍由既有 ownership 规则保护。
- [x] API 在路由边界使用共享 Zod contract 解析输出，异常数据 fail closed。

### 学生端

- [x] 首页明确显示多个 active 会话，不自动选择第一条。
- [x] 首页、题库、错题本、历史和会话详情均有稳定 URL。
- [x] 刷新 `/practice/:sessionId` 后可恢复相应 active 练习或 completed 结果。
- [x] 历史页只显示 completed 会话，点击后打开同一份结果详情。
- [x] 浏览器前进/后退切换页面时不会把 session 数据误写到另一条会话。

### 本阶段明确不做

- 最终视觉语言、配色、组件库和动效；
- 学习画像、趋势图、学习计划、通知；
- 学生账户安全产品化（密码、学校 SSO、找回、设备管理）；
- `apps/admin` 的实现、RBAC、导入任务平台和题库编辑器；
- 跨题库错题再练的“展示题库”精细归因。

这些项在学生流程稳定、真实使用路径清楚后，再由独立设计阶段处理。

## 8. B9.16 前端开工前补充：账号启用

正式身份安全策略已经落地后，学生端 P0 需要补一个“账号启用”入口，但这仍不等于开始最终视觉重做。

建议新增或确认的入口：

| URL / Surface | 状态 | 目的 |
| --- | --- | --- |
| `/account/password` | B9.17 已实现 | `passwordResetRequired=true` 时强制学生修改临时密码，也可由用户菜单进入普通改密 |
| 用户菜单 / 账号页身份卡 | B9.17 已实现 | 展示 loginName、displayName、className、groupName 和是否待改密 |
| `/learning` | B9.16 提议，后续 P1 | 承载 Learning Dashboard/Trends/Goals/Review Marks，而不是继续堆到首页 |

账号启用规则：

- 登录响应或 `GET /api/auth/me` 返回 `passwordResetRequired=true` 时，学生必须先进入改密流程。
- 改密使用 `POST /api/auth/password/change`；成功后重新加载 `auth me` 并回到原目标页或首页。
- 改密页只处理当前密码、新密码、确认新密码和错误状态，不加入注册、找回、邮箱/短信验证。
- 管理员重置密码后学生再次进入同一流程。

完整前端开工前审查包见 [`frontend-kickoff-review.md`](./frontend-kickoff-review.md)。B9.17 已实现账号启用最小 UI；后续仍应先做 Admin 静态 wireframe，再考虑正式视觉重做。
