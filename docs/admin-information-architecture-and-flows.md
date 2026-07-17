# Admin Information Architecture And Functional Flows

状态日期：**2026-07-17**

本文定义 Admin 平台的目标信息架构、角色边界和关键运营流程。它用于后续功能审核与正式视觉设计，不把 System Status 当作所有运营数据的万能 dashboard。

## 1. Admin 平台目标

Admin 平台服务三个责任域：

1. **账号运营**：学生账号、管理员账号和会话安全。
2. **内容运营**：题库 mapping、导入任务、题目质检和有效 override。
3. **系统治理**：系统状态、审计和高风险操作门禁。

## 2. 角色与权限

| 角色 | 主要职责 |
| --- | --- |
| `content_editor` | 题库整理、题目质检、草稿和内容修订 |
| `operator` | 学生账号、导入任务、系统状态 |
| `super_admin` | 全部权限、管理员账号、高风险 reset |

Import Jobs 权限已经拆分：

```text
import_job:read
import_job:create
import_job:cancel
import_job:retry
```

Question Review 审批使用独立：

```text
question_review:approve
```

内容编辑者不应默认审批自己的 pending revision。

## 3. 目标信息架构

```mermaid
flowchart TD
    Login[Admin Login] --> Guard[Session and RBAC Guard]
    Guard --> System[System Status]
    Guard --> Students[Student Accounts]
    Guard --> Mappings[Bank Mappings]
    Guard --> Imports[Import Jobs]
    Guard --> Review[Question Review]
    Guard --> Audit[Audit Logs]
    Guard --> Users[Admin Users]

    Students --> StudentList[List and filters]
    Students --> StudentCreate[Create and bulk create]
    Students --> StudentDetail[Detail edit reset revoke]

    Mappings --> MappingList[List and filters]
    Mappings --> MappingDetail[Detail and optimistic edit]
    Mappings --> MappingBulk[Bulk publish status]

    Imports --> ImportList[History and status]
    Imports --> ImportCreate[Dry run or gated import]
    Imports --> ImportDetail[Realtime detail errors cancel retry]

    Review --> ReviewQueue[Review queue]
    Review --> ReviewDetail[Question detail and diff]
    Review --> Revision[Draft submit approve reject rollback]

    Audit --> AuditDetail[Before after metadata]
    Users --> UserDetail[Create roles status password]
```

## 4. 导航和页面矩阵

| 一级页面 | 主要读权限 | 写权限 | 关键状态 |
| --- | --- | --- | --- |
| System Status | `system_status:read` | 无 | DB/corpus/import/quality health |
| Student Accounts | `student_account:read` | write/reset/revoke | active/disabled/locked/reset required |
| Bank Mappings | `bank_mapping:read` | write/publish | draft/review/active/hidden/version conflict |
| Import Jobs | `import_job:read` | create/cancel/retry | queued/running/succeeded/failed/cancelled |
| Question Review | `question_review:read` | write/approve | draft/pending/approved/rejected/rollback |
| Audit Logs | `audit_log:read` | 无 | success/failure and actor/resource |
| Admin Users | `admin_user:manage` | manage | active/disabled/roles/last super admin |

未来如增加 Admin Dashboard，应新增独立 ops summary API，不应改变 System Status 的健康检查口径。

## 5. Admin 登录与 RBAC

```mermaid
sequenceDiagram
    actor Admin
    participant UI as Admin Web
    participant API as Admin Auth API
    participant DB as PostgreSQL

    Admin->>UI: 输入 loginName 和 password
    UI->>API: POST /api/admin/auth/login
    API->>DB: 查找账号
    alt disabled
        API-->>UI: 403 disabled
    else locked
        API-->>UI: 423 locked
    else invalid password
        API->>DB: 更新失败计数和锁定状态
        API-->>UI: 401 invalid credentials
    else success
        API->>DB: 清空失败状态并记录 last login
        API-->>UI: admin roles permissions session
        UI->>UI: 按 permission 构建导航和路由守卫
    end
```

## 6. Student Accounts 运营流

```mermaid
flowchart TD
    List[学生列表] --> Filter[按状态 班级 组别 锁定搜索]
    Filter --> Detail[学生详情]
    List --> Create[单个创建]
    List --> Bulk[批量创建]
    Detail --> Edit[修改姓名 班级 组别 状态]
    Detail --> Reset[重置密码]
    Detail --> Revoke[撤销 sessions]
    Reset --> ResetRequired[passwordResetRequired=true]
    Reset --> Revoke
    Edit --> Audit[写审计]
    Create --> Audit
    Bulk --> Partial[created skipped failed]
    Partial --> Audit
```

关键确认：

- 密码不进入 response/audit；
- reset 后默认撤销已有 session；
- disabled/locked/reset-required 状态必须清楚显示；
- bulk create 必须显示逐条失败，不只显示总数。

## 7. Bank Mapping 发布流

```mermaid
flowchart LR
    Import[导入生成 mapping] --> Review[运营筛选和检查]
    Review --> Edit[编辑名称 分类 关键词 描述]
    Edit --> Version{expectedVersion 匹配?}
    Version -->|否| Conflict[409 刷新并重新比较]
    Version -->|是| Objective{存在客观题?}
    Objective -->|否| Block[禁止 active publish]
    Objective -->|是| Publish[active and visible]
    Publish --> StudentCatalog[学生题库目录]
    Edit --> Audit[审计 before after metadata]
    Publish --> Audit
```

批量状态操作必须：

- 展示 `updated[]`；
- 展示 `failed[]`；
- version conflict 后刷新列表；
- 不把部分失败显示成整体成功。

## 8. Import Jobs 流程

```mermaid
flowchart TD
    Start[创建任务] --> Mode{dry run or import}
    Mode --> Dry[Dry run]
    Dry --> Summary[解析摘要和错误]
    Summary --> Decision{是否执行 true import}
    Decision -->|否| End[结束]
    Decision -->|是| Gate{write gate enabled?}
    Mode -->|import| Gate
    Gate -->|否| Blocked[422 blocked]
    Gate -->|是| Reset{reset requested?}
    Reset -->|否| Queue[queued]
    Reset -->|是| Super{super admin and reset gate?}
    Super -->|否| Blocked
    Super -->|是| Queue
    Queue --> Worker[worker claim and heartbeat]
    Worker --> Progress[SSE progress]
    Progress --> Success[succeeded]
    Progress --> Failure[failed]
    Progress --> Cancel[cancelled]
    Failure --> Retry[retry]
    Cancel --> Retry
    Retry --> Queue
```

操作规则：

- create/cancel/retry 使用独立权限；
- UI 显示 queued/running/terminal；
- SSE 断线使用 Last-Event-ID 恢复；
- reset 必须明确提示会级联删除学习数据；
- routine import 不允许 reset；
- error report 与 summary 不得输出密码或秘密环境变量。

## 9. Question Review 流程

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Draft: 编辑并保存
    Draft --> Pending: 提交审批
    Pending --> Approved: 审批通过
    Pending --> Rejected: 驳回
    Rejected --> Draft: 重新编辑
    Approved --> Draft: 创建下一次修订
    Approved --> Approved: 回滚生成新的 approved revision
```

```mermaid
sequenceDiagram
    actor Editor as Content Editor
    actor Approver as Approver
    participant API as Question Review API
    participant Raw as Imported Raw Tables
    participant Revision as Revision Store
    participant Effective as Effective Override

    Editor->>API: 保存 draft
    API->>Revision: 保存不可变版本和 diff
    Editor->>API: submit
    API->>Revision: pending_review
    Approver->>API: approve or reject
    alt approve
        API->>Effective: 应用 effective snapshot
        API->>Revision: approved
    else reject
        API->>Revision: rejected
    end
    Note over Raw: 原始导入题目不被人工直接修改
```

## 10. Audit 和高风险操作

所有管理写操作至少记录：

- actor；
- action；
- resource type/id；
- before；
- after；
- metadata；
- result；
- timestamp。

高风险操作确认层级：

| 操作 | 确认 |
| --- | --- |
| 学生密码重置 | 明确将要求首次改密并撤销 session |
| 禁用管理员 | last-super-admin guard |
| mapping 发布 | objective question 检查和 version |
| true import | write gate |
| reset import | super_admin + reset gate + 维护窗口 |
| Question Review approve | 独立 approve permission |
| rollback | 选择历史 revision，禁止 no-op rollback |

## 11. 全局页面状态

Admin 页面统一处理：

- loading；
- empty；
- forbidden；
- unauthenticated/session expired；
- validation error；
- version conflict；
- partial success；
- destructive confirmation；
- background running/realtime reconnect；
- audit write failure或服务端失败。

## 12. 正式视觉开工条件

owner 在视觉设计前需要确认：

- 是否新增独立 Admin Dashboard；
- Student Accounts 是否需要导入文件而非 paste CSV；
- Bank Mapping 发布是否增加第二人审批；
- Question Review 批量审批的责任边界；
- Import error 下载和事件保留周期；
- 管理端主要使用 desktop 还是兼顾 tablet。

