# Production Deployment Evidence Runbook

状态：**B9.14 已完成真实服务器 staging deployment evidence，PR #2 仍待 review/merge，2026-07-15。**

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
- Initial B9.13 evidence commit: `07a7892b0a6ea5e50fdeb5f4ec60090bdd54dc84`
- Remote workflow: `Quality` active, workflow id `313324672`, path `.github/workflows/quality.yml`
- Pull request: `#2`，`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/pull/2`
- PR state: **open**
- PR mergeability: `MERGEABLE`
- PR review decision: `REVIEW_REQUIRED`
- Initial PR workflow run: **success**，run `29376220149`
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
remote_ci = passed for initial B9.13 PR evidence commit 07a7892
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

后续提交应以 PR #2 最新 status checks 为准；本节固定的是 B9.13 首次 PR / branch protection 证据快照。

本阶段已完成“推送分支 + PR + branch protection + required checks + PR CI 跑绿”。仍未 review/merge，也未部署到真实目标环境。


## 5. B9.14 Staging Evidence Snapshot

2026-07-15 在 `exam.acgbot.cc.cd` 完成真实服务器 staging 部署验证。

```text
target = https://exam.acgbot.cc.cd
origin = root@47.88.33.54
repo_dir = /srv/bkyexam-practice-platform
backup_dir = /srv/bkyexam-backups/b9.14-20260715080815
commit = 1686c6e27a23029c6cc53c8a22ddb843c3d332d7
branch = codex/practice-platform-stabilization
```

部署结果：

| Gate | Result |
| --- | --- |
| `npm ci` / build | PASS |
| DB migrations `0001`–`0011` | PASS |
| Full question bank import | PASS：2941 classifications / 89922 questions / 154899 options / 2662 mappings |
| DB smoke | PASS |
| Legacy student password migration | PASS：13 old passwordless accounts migrated and retained |
| Formal accounts | PASS：`admin` super_admin + `202502040201`–`202502040230` `2班` students |
| Production gate | PASS：`ok=true`, `legacyPasswordlessStudents=0` |
| HTTPS functional smoke | PASS：health/readiness/metrics/banks/student login/practice create/admin login/admin me |
| Deployment evidence CLI | PASS：`ready=true`, `14 pass / 0 warn / 0 fail` |

目标环境证据：

```text
/srv/bkyexam-backups/b9.14-20260715080815/production-gate-clean.json
/srv/bkyexam-backups/b9.14-20260715080815/http-functional-smoke.json
/srv/bkyexam-backups/b9.14-20260715080815/perf-smoke.json
/srv/bkyexam-backups/b9.14-20260715080815/deployment-evidence-input.json
/srv/bkyexam-backups/b9.14-20260715080815/deployment-evidence-report.json
```

凭据只在服务器受限路径，不写入 Git、不在日志中输出明文：

```text
/root/bkyexam-credentials/LATEST
/root/bkyexam-credentials/bkyexam-b9.14-credentials-20260715093217.csv
/srv/bkyexam-backups/b9.14-20260715080815/legacy-student-password-migration-credentials.csv
```

远端 CI 使用 PR #2 最新已通过 run：

```text
run = 29380130674
url = https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29380130674
headSha = 1686c6e27a23029c6cc53c8a22ddb843c3d332d7
quality = success
postgres-integration = success
```

本节把 B9.14 判定为 **staging-ready**。正式公开 production 仍需 owner/reviewer 处理 PR #2、确认凭据交付流程，并补外部监控告警/系统性压测。

## 6. 进入正式前端前的建议

在正式前端设计前，建议先完成：

1. 完成 PR review / merge 决策。
2. 做 B9.15 staging operations hardening：外部 uptime/alerting 最小闭环、systemd/nginx/env/backup runbook 复核。
3. 补一轮可重复轻量压测：health/readiness/banks/login/practice create，并记录阈值。
4. 复核凭据交付与首次改密流程，避免 admin/student 初始密码散落。
5. 审核管理平台信息架构和账号运营流程，再决定是否进入管理前端设计。
6. 学生正式前端视觉仍放最后，等后端运维基线、性能边界和管理端 IA 稳定后再做。

## 7. B9.34 Current-HEAD Evidence Snapshot

2026-07-16 完成 current-HEAD staging re-baseline：

```text
commit = c8b310e950c6c31faa7f8e45c8f6bd9d435eceb5
migrations = 0001..0013
target = https://exam.acgbot.cc.cd
production gate = ok
deployment evidence = ready=true, 14 pass / 0 warn / 0 fail
remote CI run = 29488810116
quality = pass
postgres-integration = pass
```

新增发布证据：

- `/` 与 `/admin/` 分别服务学生 Web 和独立 Admin；
- reset import 受 `ADMIN_IMPORT_ENABLE_RESET=false` 独立门禁保护；
- reset gate 关闭时返回 422，数据库计数不变；
- 非 reset true import 成功并保留学生学习数据；
- 最终 31 MiB target dump 已隔离恢复，全部跟踪表计数一致；
- write/reset gate 在验收后均恢复为 `false`；
- 目标 2 vCPU 主机连续全量 import 后出现磁盘 I/O 饱和，已明确限制为维护窗口操作。

服务器 evidence：

```text
/srv/bkyexam-backups/b9.34-20260716165318/evidence/deployment-evidence-input-final.json
/srv/bkyexam-backups/b9.34-20260716165318/evidence/deployment-evidence-report-final.json
/srv/bkyexam-backups/b9.34-20260716165318/evidence/final-restore-drill-report.json
/srv/bkyexam-backups/b9.34-20260716165318/evidence/final-post-deploy-audit.txt
```

完整说明见 [`b9.34-current-head-staging-rebaseline.md`](b9.34-current-head-staging-rebaseline.md)。
