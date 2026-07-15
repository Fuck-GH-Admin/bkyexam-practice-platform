# PR #2 Review / Merge Decision Record

状态日期：**2026-07-15**
PR：`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/pull/2`

本文用于把 PR #2 的 review/merge 决策从“口头感觉”变成可审计记录。Codex 不替代 owner/reviewer 做批准；本页给出当前证据、剩余 blocker 和建议决策。

## 1. 当前 PR 状态

```text
PR = #2
base <- head = main <- codex/practice-platform-stabilization
state = OPEN
isDraft = false
mergeStateStatus = BLOCKED
reviewDecision = REVIEW_REQUIRED
reviews = []
headRefOid = 17f39c745be3a05514920f40d31c65ab53c9af7e
```

## 2. Required Checks

最新 PR run：

```text
run = 29383019342
url = https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/actions/runs/29383019342
headSha = 17f39c745be3a05514920f40d31c65ab53c9af7e
quality = SUCCESS
postgres-integration = SUCCESS
```

同时 push run `29383017574` 也已成功。

`main` branch protection：

```json
{
  "required_status_checks": ["quality", "postgres-integration"],
  "strict": true,
  "required_approving_review_count": 1,
  "dismiss_stale_reviews": true,
  "enforce_admins": true
}
```

因此 PR 当前被阻止的原因是 **缺少 1 个 approving review**，不是 CI 失败。

## 3. Release Evidence Summary

已完成：

- B9.13：PR、required checks、branch protection 已启用。
- B9.14：真实服务器 staging deployment evidence：`ready=true`, `14 pass / 0 warn / 0 fail`。
- B9.15：staging ops hardening baseline：healthcheck timer、backup/restore drill、load baseline 已完成。

关键服务器证据：

```text
/srv/bkyexam-backups/b9.14-20260715080815/deployment-evidence-report.json
/srv/bkyexam-backups/b9.15-20260715104214/restore-drill-report.json
/srv/bkyexam-backups/b9.15-20260715104214/load-baseline.json
```

## 4. 建议决策

推荐：**Hold until human review, then squash/rebase merge if reviewer accepts B9.15 docs and no new code concern appears.**

原因：

- CI 已绿。
- staging 已真实部署并跑通。
- 运维基线已补到可以继续内部试用。
- 但 branch protection 明确要求 1 个 approving review；不能由本次自动化过程绕过。

## 5. Reviewer Checklist

Reviewer 至少检查：

- [ ] `scripts/run-staging-load-baseline.mjs` 没有输出密码。
- [ ] B9.14/B9.15 证据路径均在服务器受限目录，不提交敏感文件。
- [ ] `ADMIN_IMPORT_ENABLE_WRITE=false` 仍是 staging runtime 默认。
- [ ] 旧 13 个账号保留且已迁移，未清空历史数据。
- [ ] `202502040201`–`202502040230` 的 `className=2班` 符合用户要求。
- [ ] 管理平台前端仍未启动，文档只做 IA/流程 gate。
- [ ] 若 merge，owner 知道初始凭据位于 `/root/bkyexam-credentials/LATEST`，需要线下安全交付。

## 6. Merge Preconditions

允许 merge 的最小条件：

```text
reviewDecision = APPROVED
quality = SUCCESS
postgres-integration = SUCCESS
no unresolved reviewer blocker
owner accepts credential delivery runbook
```

不建议 merge 的情况：

- 凭据交付责任人未定。
- 外部告警接收端必须先接入，但尚未提供 webhook/email。
- reviewer 要求先补管理平台 UI 或更强压测。

## 7. Post-merge Actions

若 PR 合并：

1. 在服务器部署目录确认分支策略：切到 `main` 或记录继续跟随 release branch 的原因。
2. 重新跑：
   - readiness
   - production gate
   - `npm run ops:staging-load-baseline`
3. 标记 B9.15 evidence 与 merged commit。
4. 开始 B9.16 或进入管理平台 IA 审核会，不直接开始视觉前端。
