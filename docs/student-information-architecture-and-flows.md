# Student Information Architecture And Functional Flows

状态日期：**2026-07-17**

本文是学生端后续产品审核和正式视觉设计的功能真相源。它描述页面对象、导航、状态和业务流程，不规定最终颜色、字体或组件风格。

## 1. 学生端目标

学生端第一目标不是“考试系统”，而是：

> 帮助学生快速进入练习、可靠保存过程、理解结果，并通过错题与学习反馈继续下一轮。

核心对象：

- 学生账号；
- 题库；
- 练习会话；
- 题目草稿；
- 提交结果；
- 错题；
- 学习目标；
- 收藏/长期复习标记。

## 2. 目标信息架构

```mermaid
flowchart TD
    Login[登录] --> Activation{需要首次改密?}
    Activation -->|是| Password[修改临时密码]
    Activation -->|否| Home[学生首页]
    Password --> Home

    Home --> Continue[继续练习]
    Home --> Banks[选择题库]
    Home --> Learning[学习中心]
    Home --> Wrongbook[错题本]
    Home --> History[练习历史]
    Home --> Account[账号信息]

    Banks --> BankDetail[题库说明与模式]
    BankDetail --> Practice[练习台]
    Continue --> Practice
    Practice --> SubmitCheck[提交检查]
    SubmitCheck --> Result[结果回看]
    Result --> Wrongbook
    Result --> Learning

    Wrongbook --> WrongDetail[错题详情]
    WrongDetail --> ReviewSession[错题再练]
    ReviewSession --> Practice

    Learning --> Dashboard[学习概览]
    Learning --> Trends[趋势]
    Learning --> Goals[目标]
    Learning --> Marks[收藏与长期复习]
```

### 页面状态

| 区域 | 当前实现 | 下一轮设计 |
| --- | --- | --- |
| 登录 | 已实现 | 明确错误、锁定、禁用和帮助入口 |
| 首次改密 | 已实现 | 优化密码规则说明和成功反馈 |
| 首页 | 已实现 | 重排继续练习/推荐动作优先级 |
| 题库 | 已实现 | 服务端筛选、分页和题库详情 |
| 练习台 | 已实现 | 状态反馈、键盘操作、移动端打磨 |
| 结果/历史 | 已实现 | 强化结果摘要和后续动作 |
| 错题本 | 已实现 | 增加错因和掌握规则属于后续 |
| Learning | 后端已实现 | 新增正式学生页面 |
| Account | 轻量实现 | 账号、班级、组别、退出和安全状态 |

## 3. 登录与首次启用

```mermaid
sequenceDiagram
    actor Student as 学生
    participant Web as Student Web
    participant API as Auth API
    participant DB as PostgreSQL

    Student->>Web: 输入用户名和密码
    Web->>API: POST /api/auth/login
    API->>DB: 校验账号状态、锁定和密码
    alt 登录失败
        API-->>Web: 400/401/403/423
        Web-->>Student: 显示对应错误与下一步
    else 登录成功且需要改密
        API-->>Web: session + passwordResetRequired=true
        Web->>Web: 跳转 /account/password
        Student->>Web: 提交当前密码和新密码
        Web->>API: POST /api/auth/password/change
        API->>DB: 更新密码并解除首次改密门禁
        API-->>Web: success
        Web->>Web: 返回原目标路由或首页
    else 正常登录
        API-->>Web: session + student
        Web->>Web: 进入原目标路由或首页
    end
```

必须保留：

- 首次改密不仅是前端跳转，Practice/Wrongbook/Learning API 也会拒绝访问；
- 刷新后通过 `/api/auth/me` 恢复 session；
- 登录前请求的目标路由在启用完成后恢复；
- 退出后清空学生和练习状态。

## 4. 开始与恢复练习

```mermaid
flowchart TD
    Entry{入口} -->|题库| Choose[选择题库]
    Entry -->|首页继续| Active[选择 active session]
    Entry -->|错题再练| WrongReview[创建 wrongbook session]

    Choose --> Mode[选择 random 或 sequential]
    Mode --> Create[创建锁题 session]
    WrongReview --> Create
    Active --> Load[读取 session]
    Create --> Load
    Load --> Hydrate[恢复题目 草稿 存疑 当前位置]
    Hydrate --> Desk[练习台]
```

规则：

- 每个练习会话拥有稳定 URL；
- session 创建后锁定题目集合和顺序；
- random/sequential 只影响创建时选题；
- 多个 active session 可以同时存在；
- wrongbook session 使用 `origin=wrongbook`；
- 已完成 session 进入只读结果状态。

## 5. 作答、保存与提交

```mermaid
stateDiagram-v2
    [*] --> Active
    Active --> DraftSaving: 修改答案
    DraftSaving --> Active: 保存成功
    DraftSaving --> SaveFailed: 保存失败
    SaveFailed --> DraftSaving: 用户重试或再次修改
    Active --> ReviewMarked: 标记存疑
    ReviewMarked --> Active: 取消存疑
    Active --> SubmitCheck: 请求提交
    SaveFailed --> SubmitBlocked: 保存链未完成
    SubmitCheck --> Active: 返回继续作答
    SubmitCheck --> Completed: 确认整卷提交
    Completed --> [*]
```

提交检查至少展示：

- 已答题数；
- 未答题数；
- 存疑题数；
- 保存是否成功；
- 提交后不可继续修改。

## 6. 结果、错题与再练

```mermaid
flowchart LR
    Submit[整卷提交] --> Grade[客观题判分]
    Grade --> Result[结果页]
    Grade --> WrongUpsert[错误题进入错题本]
    Result --> Review[逐题回看]
    Result --> Wrongbook[查看错题]
    Wrongbook --> Detail[错题详情]
    Detail --> Mastered[标记掌握]
    Detail --> Repractice[再练本组]
    Repractice --> Session[新建 sequential wrongbook session]
```

结果页主要动作顺序：

1. 查看总览；
2. 回看错误/存疑题；
3. 进入错题本；
4. 再练；
5. 返回首页或选择新题库。

## 7. Learning 功能流

Learning 后端已经提供 dashboard、trends、goals 和 review marks，前端应作为一个完整学习中心设计。

```mermaid
flowchart TD
    LearningHome[学习中心] --> Summary[练习与正确率摘要]
    LearningHome --> Recent[最近题库]
    LearningHome --> TypeStats[题型表现]
    LearningHome --> WrongSummary[错题掌握摘要]
    LearningHome --> Trend[7到90日趋势]
    LearningHome --> Goal[学习目标]
    LearningHome --> Marks[收藏与长期复习]

    Goal --> Feedback{目标反馈}
    Feedback -->|继续练习| Banks[选择题库]
    Feedback -->|复习错题| Wrongbook[错题本]
    Feedback -->|低正确率| TypeStats
    Marks --> Practice[从题目上下文进入练习或回看]
```

第一版 Learning 前端不做复杂推荐算法，优先回答：

- 我最近练了多少？
- 正确率如何变化？
- 哪类题最弱？
- 还有多少错题未掌握？
- 今天下一步应该做什么？

## 8. 全局状态设计

每个学生页面都必须明确：

| 状态 | UI 要求 |
| --- | --- |
| loading | 保留页面骨架，不误显示空数据 |
| empty | 解释为什么为空，并提供下一步 |
| unauthorized | 回登录并保留目标路由 |
| password change required | 强制进入启用页 |
| forbidden | 显示账号状态或联系管理员 |
| validation error | 定位到字段 |
| save failed | 明确未保存并提供重试 |
| conflict/completed | 重新读取服务端状态 |
| offline/timeout | 不丢本地输入，允许重试 |

## 9. API 对照

| 页面 | 主要 API |
| --- | --- |
| 登录/恢复/退出 | `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` |
| 首次改密 | `/api/auth/password/change` |
| 题库 | `/api/banks` |
| 首页 active/history | `/api/practice/sessions` |
| 练习台 | `/api/practice/sessions/:id` 及 progress/drafts/review |
| 提交与结果 | `/api/practice/sessions/:id/submit` |
| 错题本 | `/api/wrong-questions` |
| Learning | `/api/learning/dashboard`, `/trends`, `/goals`, `/review-marks` |

## 10. 正式视觉开工条件

开始视觉设计前，先由 owner 审核：

- 首页是否以“继续练习”为第一优先级；
- Learning 是否独立为一级导航；
- 多 active session 是否保留；
- 题库详情需要展示哪些考试/学科信息；
- 错题“掌握”是否需要更严格规则；
- 移动端练习台的题号导航方式。

