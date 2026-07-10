# System Status

状态日期：**2026-07-10**

本文记录“已经被代码和真实环境证明的能力”，不是愿望清单。后续每个里程碑完成后应更新本页。

## Executive Summary

当前系统已经达到：

- **学生客观题 MVP：可内部试用。**
- **真实题库 + PostgreSQL + 浏览器闭环：已跑通。**
- **管理平台：尚未开始实现。**
- **完整生产产品：尚未达到。**

完整度需要按不同口径理解：

| Scope | 估算完整度 | 说明 |
| --- | ---: | --- |
| 学生客观题核心闭环 | **约 80%** | 登录、题库、练习、断点、整卷提交、结果、错题再练均可用；历史、账户、统计和部分 UX 未完成 |
| 公开生产就绪度 | **约 55%** | 缺正式身份策略、CI 真实 DB、监控、备份、安全与部署验收 |
| 完整产品愿景 | **约 50–55%** | 分母包含清晰学生层、管理平台、全题型、运营与生产能力 |

这些百分比是工程评估，不是测试覆盖率。它们用于讨论下一步优先级，不能替代验收标准。

## Verified Automated Checks

2026-07-10 在 Node.js `24.11.1` 上完成：

```text
npm run test       PASS
npm run typecheck  PASS
npm run build      PASS
```

测试结果：

| Workspace | Test files | Tests |
| --- | ---: | ---: |
| `packages/shared` | 1 | 2 |
| `apps/api` | 29 | 226 |
| `apps/web` | 1 | 27 |
| **Total** | **31** | **255** |

生产构建结果：

- shared TypeScript build：通过。
- API TypeScript build：通过。
- Web Vite build：通过。
- Web bundle：约 `219.49 kB` JS（gzip `68.50 kB`）。
- Web CSS：约 `19.24 kB`（gzip `4.79 kB`）。

## Verified Corpus And Database

真实题库解析统计：

```json
{
  "classifications": 2941,
  "questions": 89922,
  "rawOptions": 180323,
  "questionTypes": {
    "fill_blank": 4697,
    "single_choice": 30980,
    "essay": 1023,
    "unknown": 6803,
    "multiple_choice": 7674,
    "yes_no": 14393,
    "office_operation": 68,
    "reading": 11513,
    "cloze": 11208,
    "operation": 1076,
    "programming": 40,
    "short_answer": 206,
    "ai": 241
  }
}
```

在真实 PostgreSQL 14 上执行迁移、完整导入和 smoke：

```json
{
  "classifications": 2941,
  "questions": 89922,
  "questionOptions": 154899,
  "skippedOrphanOptions": 25424,
  "bankMappings": 2662
}
```

说明：

- `skippedOrphanOptions` 的 `questionId` 在导出的题目文件中不存在，无法满足外键，因此被明确跳过并计数。
- 导入是事务化、批量、幂等 upsert。
- 本次完整导入约 18 秒，具体时间受磁盘和 PostgreSQL 环境影响。

## Verified Real API Flow

使用 PostgreSQL repository 和真实导入数据验证：

1. 登录并创建学生/服务端 session。
2. `GET /auth/me` 恢复当前学生。
3. 读取 473 个当前可见且含客观题的学生题库入口。
4. 从真实 `2025年C++程序设计` 创建练习会话。
5. 保存单选、多选和 `false` 判断题草稿。
6. 保存存疑状态与当前位置。
7. 重新 GET session，草稿、`false`、存疑和位置均准确恢复。
8. 整卷提交，session 进入 `completed`。
9. 已答题生成判分结果；未答题不生成 attempt。
10. 完成后继续改草稿返回 `409`。
11. 错误客观题进入错题本。
12. 错题详情返回真实题干、选项、规范化参考答案与解析。
13. 标记掌握和 `includeMastered` 生效。
14. 从错题集合创建普通再练 session。
15. 退出后受保护路由返回 `401`。

验证过程中发现并修复：

- 错题详情原先会把参考答案作为逗号分隔 UUID 原文返回；现在按题型规范化为 `string[] | boolean | string`。
- 错题界面原先会显示用户最近答案的原始 option UUID；现在详情映射为选项内容，列表只显示“已选择 N 项”。
- 错题再练创建后，前端原先没有完整恢复草稿/存疑/位置状态；现在统一通过 `applyPracticePayload` hydration。

## Verified Browser Flow

在真实 Vite Web + 真实 Fastify API + 真实 PostgreSQL 上完成桌面 Chrome smoke：

- 登录。
- 搜索并进入真实 C++ 题库。
- 作答、自动保存、标记存疑。
- 切换题型。
- 刷新页面。
- 继续练习并恢复到刷新前题目。
- 确认第一题存疑状态仍在服务端。
- 打开提交前检查。
- 确认提交整卷。
- 查看只读结果。
- 进入错题本并查看真实错题。
- 无意外 HTTP 错误、console runtime error 或 page error。

开发模式下 React StrictMode 会执行两次匿名 session bootstrap，因此登录前出现两次预期的 `/api/auth/me -> 401`；它们不是业务失败。生产 build 不执行 StrictMode 的开发期 effect 重放。

另有 mock API 响应式 smoke 覆盖：

- Desktop practice。
- Desktop submit check。
- Desktop completed result。
- Mobile practice。
- Mobile submit check。
- 横向溢出检查。

## Feature Completeness Matrix

| Area | 状态 | 估算 | 已有 | 主要缺口 |
| --- | --- | ---: | --- | --- |
| Corpus parser/import | 稳定 | 90% | 全量解析、事务导入、幂等 upsert、smoke | 进度事件、错误报告 UI、增量策略 |
| Bank mapping/catalog | 可用 | 75% | 自动映射、可见性、搜索筛选 | 管理编辑、审批、审计、质量抽查 |
| Student identity/session | MVP | 60% | 固定用户名、Cookie session、恢复/退出 | 正式凭据、角色、找回、身份合并、安全策略 |
| Objective practice | 核心可用 | 85% | 创建、锁题、草稿、断点、存疑、整卷判分、结果 | 历史入口、多会话管理、计时/考试策略、更多异常 UX |
| Wrongbook | 核心可用 | 80% | 自动归集、详情、掌握、筛选、再练 | 错因、学习计划、掌握规则、历史趋势 |
| Student product shell | 功能性 | 60% | 登录、题库、练习、错题 | 清晰首页、URL routes、历史、档案、统一空/错/加载状态 |
| Admin console | 未实现 | 5% | 数据字段与自动 mapping 为其提供基础 | 整个管理应用、RBAC、API、工作流、审计 |
| Subjective/complex grading | 早期 | 10% | 类型已导入，grader 可返回 self-review 语义 | 填空、简答、编程、Office、材料题完整流程 |
| Operations | 基础 | 55% | 配置、migration、import、smoke、部署文档 | CI DB、监控、日志治理、备份恢复、正式发布验收 |

## Known Product And Technical Risks

### P0 Before Public Production

- 当前登录策略接近“用户名即身份”，不适合公开环境。
- 没有管理员认证与权限。
- 没有 CI 中的真实 PostgreSQL integration job。
- 没有备份/恢复演练、监控和告警。
- 没有对正式域名部署进行本轮验收。

### P1 Before Large Feature Expansion

- `App.tsx`、Practice repository 和 Practice routes 过大。
- 前后端 DTO 有重复定义。
- 没有 URL routing 和练习历史。
- `completedCount` 实际语义是 answered/graded count，名称容易误解；当前已在文档固定语义，未来可在版本化 contract 中更名。
- Wrongbook repository 直接创建 Practice 表记录，长期应改为 service 间协作。

### P2 Quality Debt

- API route test 日志较吵。
- 缺正式 browser E2E 仓库配置；本轮 smoke 使用临时 Playwright runner。
- 未系统验证键盘可达性、读屏和完整无障碍。
- 未对超长题干、富文本、图片题和异常 Unicode 做专项视觉验收。

## Release Interpretation

当前最准确的发布标签：

> **Objective Practice Internal MVP / 学生客观题内部试用版**

不应把当前版本描述为：

- 完整在线考试平台。
- 完整学习管理系统。
- 已完成管理后台。
- 已具备公开生产安全。
