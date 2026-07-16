# Documentation Index And Sources Of Truth

状态日期：**2026-07-16**

本目录同时保存“当前真相源”和“阶段历史记录”。人工核查时不要把旧阶段文档中的当时结论当成当前状态；发生冲突时按以下优先级判断。

## 1. 当前真相源

建议按顺序阅读：

1. [B9.35 安全与运维真相收口](b9.35-security-operational-truth-closure.md)：首次改密服务端门禁、migration ledger、真实 System Status、checksum、导入资源监控与 Learning 交付边界。
2. [文档—代码一致性审计](documentation-code-consistency-audit-2026-07-16.md)：自动比对、已修复漂移、剩余人工核查点；其中被 B9.35 修复的缺口以 B9.35 文档为准。
3. [当前进度总览](project-progress-overview.md)：当前完整度、模块完成度和主要缺口。
4. [系统状态](status.md)：测试数量、功能边界、已完成阶段和当前风险。
5. [B9.34 staging re-baseline](b9.34-current-head-staging-rebaseline.md)：B9.35 前的真实服务器部署、恢复演练、导入风险和容量证据。
6. [后端完整度与后续规划](backend-completeness-plan.md)：后端范围、阶段历史和剩余后端债务。
7. [下一优先级复核](next-priority-review-b9.34.md)：B9.34 决策依据；其“部署前基线”段落是历史输入。

## 2. 规范类文档

这些文档描述当前代码应遵循的边界：

- [Architecture](architecture.md)
- [Product Boundaries](product-boundaries.md)
- [API](api.md)
- [Versioned Contracts](contracts.md)
- [Database](database.md)
- [Deployment](deployment.md)
- [Testing](testing.md)
- [Production Operations](production-operations.md)
- [Production Gate](production-gate-runbook.md)
- [Credential Delivery](credential-delivery-runbook.md)
- [Identity Security Strategy](identity-security-strategy.md)
- [Importer](importer.md)
- [Mapping](mapping.md)

## 3. 学生端与管理端设计/实现文档

- [Student Information Architecture](student-information-architecture.md)
- [Admin Console IA](admin-console-ia.md)
- [Admin Backend Contract](admin-backend-contract.md)
- [Admin Operational MVP](admin-operational-mvp.md)
- [Admin Bank Mappings P1 UI](admin-bank-mappings-p1-ui.md)
- [Admin Import Jobs UI](admin-import-jobs-dry-run-ui.md)
- [Admin Question Review UI](admin-question-review-preview-ui.md)
- [Question Review Override Layer](question-review-override-layer.md)
- [Admin Audit Logs UI](admin-audit-logs-readonly-ui.md)
- [Admin Users UI](admin-users-management-ui.md)

其中 static wireframe、frontend kickoff 和 P1 gap review 文档保留当时决策，不代表最终实现状态：

- [Admin Static Wireframe Review](admin-static-wireframe-review.md)
- [Frontend Kickoff Review](frontend-kickoff-review.md)
- [Admin P1 Workflow Gap Review](admin-p1-workflow-gap-review.md)

## 4. 阶段证据与历史记录

以下文件是时间点快照，不应覆盖当前真相源：

- [B9.14 Staging Deployment Log](b9.14-staging-deployment-log.md)
- [Staging Operations Hardening](staging-operations-hardening.md)
- [CI Gate Evidence](ci-gate-evidence.md)
- [Production Deployment Evidence](production-deployment-evidence.md)：同时包含 B9.14 与后追加的 B9.34 snapshot。
- [PR Review / Merge Decision](pr-review-merge-decision.md)
- [Todo / Completed History](todo.md)
- `backend-modularization-b9.29.md`–`backend-modularization-b9.33.md`

## 5. 自动一致性检查

从仓库根目录执行：

```sh
npm run docs:audit
```

当前检查范围：

- 所有本地 Markdown 链接可解析；
- `.env.example` 覆盖 `apps/api/src/config.ts` runtime keys；
- `apps/api/src/routes/*.ts` 的 literal Fastify route 在 `docs/api.md` 有精确 method/path heading；
- `apps/api/src/db/migrations/*.sql` 均在 `docs/database.md` 有记录。

该命令不验证业务语义、动态 route、外部链接、服务器实时状态或历史数据真实性；这些仍需测试、staging smoke 和人工审查。

## 6. 当前版本辨识

截至 2026-07-16：

```text
staging functional deployment commit = c8b310e950c6c31faa7f8e45c8f6bd9d435eceb5
pre-audit server repository/documentation HEAD = 5ddbeadb6e7b3d42f70c8fe92df62b9001a0cba2
database schema = migrations 0001..0013
student entry = /
admin entry = /admin/
ADMIN_IMPORT_ENABLE_WRITE = false
ADMIN_IMPORT_ENABLE_RESET = false
```

功能部署 commit 与服务器仓库 HEAD 不同是因为后续提交仅刷新文档；判断运行时代码时看 `c8b310e`，判断当前仓库文档时以本文件所在的最新 Git HEAD 为准。`5ddbead` 是本轮审计开始时的服务器基线，不是永久固定的 current HEAD。
