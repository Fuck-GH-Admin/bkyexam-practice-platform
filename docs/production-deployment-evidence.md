# Production Deployment Evidence Runbook

状态：**B9.12 已记录首次远端 CI 验收，2026-07-15。**

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

2026-07-15 在用户确认后推送当前工作分支，使用 `gh` 和远端 Git 查询得到：

- Repository: `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform`
- Default branch: `main`
- Remote branch: `codex/practice-platform-stabilization`
- Remote branch commit: `96f0dc090adb44dba21ba65354af823cafd48d44`
- Remote workflow: `Quality` active, workflow id `313324672`, path `.github/workflows/quality.yml`
- Remote workflow run: **success**，run `29373386558`
- Workflow run URL: `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29373386558`
- Job `quality`: **success**，job `87221554824`
- Job `postgres-integration`: **success**，job `87221554819`
- Pull request for the branch: **不存在**
- `main` branch protection: **未启用**（GitHub API 返回 `Branch not protected`）

因此当前状态是：

```text
production-ready = false
remote_ci = passed for initial branch commit 96f0dc0
blockers = main branch not protected, pull request/review absent, target env production gate absent, deployment smoke absent, external monitoring/performance evidence absent
```

本阶段已完成“推送分支 + 远端 CI 首次跑绿”。仍未创建 PR，也未替项目 owner 修改 branch protection 或部署到真实目标环境。

## 5. 进入正式前端前的建议

在正式前端设计前，建议先完成：

1. 创建 PR 或保持 release branch 流程明确化。
2. 设置 default branch protection 和 required checks，至少要求 `quality` 与 `postgres-integration`。
3. 对 staging/prod-like 数据库跑完整 production gate。
4. 若仍有旧无密码账号，执行 legacy student password migration 并重新跑 production gate。
5. 跑目标环境 health/readiness/metrics/admin login/student login/create practice session smoke。
6. 补一轮最低限度性能证据：关键 API 基准、真实题库导入耗时、数据库查询热点和 Web bundle/code-splitting 评估。
7. 保存本 runbook 的 evidence JSON 和 report JSON。
