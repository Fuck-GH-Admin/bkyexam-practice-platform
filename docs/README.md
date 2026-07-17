# Documentation Index And Sources Of Truth

状态日期：**2026-07-17**

本目录同时保存“当前真相源”和“阶段历史记录”。人工核查时不要把旧阶段文档中的当时结论当成当前状态；发生冲突时按以下优先级判断。

## 1. 当前真相源

建议按顺序阅读：

1. [Backend Final Closure](backend-final-closure.md)：当前客观题与运营后端冻结边界、B9.40 安全/权限/worker/migration 收尾。
2. [PR Review / Merge Decision](pr-review-merge-decision.md)：PR #2 合并、生产同步和 Nginx SSE 闭环。
3. [B9.36–B9.38 工作流、实时进度与容量收口](b9.36-b9.38-workflow-realtime-capacity.md)：Question Review 审批回滚、Import SSE 和 importer 持续容量证据。
4. [B9.35 安全与运维真相收口](b9.35-security-operational-truth-closure.md)：首次改密服务端门禁、migration ledger、真实 System Status、checksum、导入资源监控与 Learning 交付边界。
5. [当前进度总览](project-progress-overview.md)：当前完整度、模块完成度和主要缺口。
6. [系统状态](status.md)：测试数量、功能边界、已完成阶段和当前风险。
7. [后端完整度与后续规划](backend-completeness-plan.md)：后端范围、阶段历史和剩余后端债务。
8. [文档—代码一致性审计](documentation-code-consistency-audit-2026-07-16.md)：自动比对、已修复漂移和人工核查入口。

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
- [Student Information Architecture And Functional Flows](student-information-architecture-and-flows.md)
- [Admin Console IA](admin-console-ia.md)
- [Admin Information Architecture And Functional Flows](admin-information-architecture-and-flows.md)
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

截至 Backend Final Closure 已合并并部署：

```text
PR #2 runtime baseline = 5dbc9d858aa850fed8fd2ebd1703365c640d4461
PR #5 merge/runtime = 6a441a3718367fc5c1576c63f24d4c21ae7d216c
B9.40 database release = migrations 0001..0016
current migration = 0016_import_job_index_cleanup.sql
student entry = /
admin entry = /admin/
ADMIN_IMPORT_ENABLE_WRITE = false
ADMIN_IMPORT_ENABLE_RESET = false
```

B9.34 的 `c8b310e`、B9.35 的 `2fbaec1`、B9.36–B9.38 的 `da89292` 和 PR #2 runtime baseline `5dbc9d8` 均保留为历史/运行证据。B9.40 的真实服务器证据目录为 `/srv/bkyexam-backups/b9.40-20260717T144606Z/`，并以 [`backend-final-closure.md`](backend-final-closure.md) 定义当前后端冻结边界。
