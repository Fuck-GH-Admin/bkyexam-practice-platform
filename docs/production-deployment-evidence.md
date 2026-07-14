# Production Deployment Evidence Runbook

状态：**B9.11 已建立，2026-07-15。**

本文把“能不能公开生产发布”的最后一层证据固定成可执行命令和可审计 JSON。它不代表当前已经可公开发布；它用于阻止缺少远端 CI、branch protection、目标环境 production gate 或 rollback 证据的发布。

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

2026-07-15 使用 `gh` 和远端 Git 查询得到：

- Repository: `https://github.com/Fuck-GH-Admin/bkyexam-practice-platform`
- Default branch: `main`
- Remote pushedAt: `2026-07-07T04:21:20Z`
- Remote `codex/practice-platform-stabilization` branch: **不存在**
- Remote workflows: **空**
- Remote workflow runs: **空**
- `main` branch protection: **未启用**（GitHub API 返回 `Branch not protected`）

因此当前状态是：

```text
production-ready = false
blockers = remote branch not pushed, remote CI absent, main branch not protected, target env evidence absent
```

本阶段只固定证据工具和审计事实，不替项目 owner 擅自推送分支、开 PR 或修改 branch protection。

## 5. 进入正式前端前的建议

在正式前端设计前，建议先完成：

1. 推送当前工作分支或创建 PR。
2. 确认 GitHub Actions 首次运行 `quality` 和 `postgres-integration`。
3. 设置 default branch protection 和 required checks。
4. 对 staging/prod-like 数据库跑完整 production gate。
5. 若仍有旧无密码账号，执行 legacy student password migration 并重新跑 production gate。
6. 保存本 runbook 的 evidence JSON 和 report JSON。
