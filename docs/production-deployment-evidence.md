# Production Deployment Evidence Runbook

状态：**B9.13 已记录 PR / branch protection / required checks，2026-07-15。**

本文把“能不能公开生产发布”的最后一层证据固定成可执行命令和可审计 JSON。它不代表当前已经可公开发布；它用于阻止缺少远端 CI、branch protection、目标环境 production gate、rollback、deployment smoke 或性能验证证据的发布。

## 1. 生成证据模板

```sh
npm run ops:deployment-evidence -- --template \
  --output=artifacts/production-evidence/deployment-evidence-template.json
```

模板会包含：

- release commit / branch / target environment
- local gates
- remote CI
- branch protection
- rollback plan
- target deployment smoke

`artifacts/` 不提交 Git。正式证据应放在受限运维目录或 release 附件中。

## 2. 填写证据

必须填入或附上：

| Section | Required evidence |
| --- | --- |
| `release` | commit、branch、target environment、operator |
| `localGates.verifyDocker` | `npm run verify:docker` PASS |
| `localGates.backupRestore` | `npm run ops:backup-restore:docker` PASS |
| `localGates.productionGate` | 目标数据库 `npm run ops:production-gate` PASS |
| `localGates.productionGateReport` | production gate JSON 摘要，必须 `ok=true` 且 `legacyPasswordlessStudents=0` |
| `localGates.legacyStudentMigration` | 旧账号迁移执行 PASS，或 production gate 证明无遗留无密码账号 |
| `remoteCi` | GitHub Actions run URL，`quality` 与 `postgres-integration` 均 PASS |
| `branchProtection` | default branch protected，PR required，required checks 包含 `quality` 和 `postgres-integration` |
| `deployment.rollbackPlan` | rollback 或 forward-fix 计划已确认 |
| `deployment.smoke` | 目标环境 health/readiness/metrics/admin login/student login smoke PASS |

## 3. 校验证据

```sh
npm run ops:deployment-evidence -- \
  --evidence=artifacts/production-evidence/deployment-evidence.json \
  --require-ready \
  --output=artifacts/production-evidence/deployment-evidence-report.json
```

Exit code：

- `0`：证据齐全且 production-ready。
- `1`：参数、JSON 或文件读取错误。
- `2`：证据可解析，但仍不满足 production-ready。

## 4. 当前远端状态审计结论

2026-07-15 在用户确认后推送当前工作分支、创建 PR 并配置 `main` branch protection，使用 `gh` 和远端 Git 查询得到：

- Repository: `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform`
- Default branch: `main`
- Remote branch: `codex/practice-platform-stabilization`
- Remote branch commit: `07a7892b0a6ea5e50fdeb5f4ec60090bdd54dc84`
- Remote workflow: `Quality` active, workflow id `313324672`, path `.github/workflows/quality.yml`
- Pull request: `#2`，`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/pull/2`
- PR state: **open**
- PR mergeability: `MERGEABLE`
- PR review decision: `REVIEW_REQUIRED`
- PR workflow run: **success**，run `29376220149`
- Workflow run URL: `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29376220149`
- Job `quality`: **success**，job `87230129856`
- Job `postgres-integration`: **success**，job `87230129819`
- `main` branch protection: **已启用**
- Required status checks: `quality`, `postgres-integration`
- Strict checks: **enabled**
- Required approving reviews: `1`
- Admin enforcement: **enabled**
- Required conversation resolution: **enabled**
- Force pushes / deletions: **disabled**

因此当前状态是：

```text
production-ready = false
remote_ci = passed for PR commit 07a7892
branch_protection = enabled
blockers = PR review absent, target env production gate absent, legacy migration closure absent, rollback plan absent, deployment smoke absent, external monitoring/performance evidence absent
```

B9.13 evidence CLI snapshot：

```text
npm run ops:deployment-evidence -- --evidence=<b9.13-pr-branch-protection.json> --require-ready
exit = 2
summary = 10 pass, 0 warn, 4 fail
remaining failing checks = production_gate_passed, legacy_student_migration_closed, rollback_plan_confirmed, deployment_smoke_passed
```

本阶段已完成“推送分支 + PR + branch protection + required checks + PR CI 跑绿”。仍未 review/merge，也未部署到真实目标环境。

## 5. 进入正式前端前的建议

在正式前端设计前，建议先完成：

1. 完成 PR review / merge 决策。
2. 对 staging/prod-like 数据库跑完整 production gate。
3. 若仍有旧无密码账号，执行 legacy student password migration 并重新跑 production gate。
4. 跑目标环境 health/readiness/metrics/admin login/student login/create practice session smoke。
5. 补一轮最低限度性能证据：关键 API 基准、真实题库导入耗时、数据库查询热点和 Web bundle/code-splitting 评估。
6. 保存本 runbook 的 evidence JSON 和 report JSON。
