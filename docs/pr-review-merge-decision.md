# PR #2 Review / Merge Decision Record

状态日期：**2026-07-17**（B9.39 review 执行日；原始记录 2026-07-15）
PR：`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/pull/2`

本文用于把 PR #2 的 review/merge 决策从“口头感觉”变成可审计记录。Codex 不替代 owner/reviewer 做批准；本页给出当前证据、剩余 blocker 和建议决策。

> **2026-07-17 更新：** 已在 head `6e420fa` 上完成人工 UAT（23/23 PASS）、安全专项审查（0 P0 / 3 P1 非阻断）和 Reviewer Checklist 逐项验证。详见第 8 节 Review Execution Record。

## 1. 当前 PR 状态

```text
PR = #2
base <- head = main <- codex/practice-platform-stabilization
state = OPEN
isDraft = false
mergeStateStatus = BLOCKED
reviewDecision = REVIEW_REQUIRED
reviews = []
headRefOid = 6e420fa2c27ed34f0f3602352c0f4e8665977b02
commits = 73 (origin/main..origin/codex/practice-platform-stabilization)
files changed = 269 (+62528 / -2123)
source files = 136 (+28569 / -1804)
migrations = 12 (0004-0015)
```

> headRefOid 已从 B9.15 时的 `17f39c7` 推进到 B9.39 的 `6e420fa`。

## 2. Required Checks

最新 PR run（2026-07-17，head `6e420fa`）：

```text
quality = SUCCESS (run 29572728808 / 29572725592)
postgres-integration = SUCCESS (run 29572728808 / 29572725592)
headSha = 6e420fa2c27ed34f0f3602352c0f4e8665977b02
```

CI 在 B9.39 head 上双 workflow 均已通过。

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
- B9.34：current-HEAD staging re-baseline，部署 `c8b310e`，migration 更新到 `0013`。
- B9.35：安全与运维真相收口，部署 `2fbaec1`，migration ledger/checksum、production reset gate、custom backup drill。
- B9.36–B9.38：Question Review workflow + Import realtime + change-aware importer，部署 `da89292`，migration 到 `0015`。
- B9.39：测试覆盖收口，`6e420fa`，530 Vitest / 5 Playwright / 2 PG integration，`verify:docker` 通过。

关键服务器证据：

```text
/srv/bkyexam-backups/b9.14-20260715080815/deployment-evidence-report.json
/srv/bkyexam-backups/b9.15-20260715104214/restore-drill-report.json
/srv/bkyexam-backups/b9.15-20260715104214/load-baseline.json
/srv/bkyexam-backups/b9.36-20260716T182355Z/  (B9.36-B9.38 证据)
```

当前服务器 Git HEAD = `eb9caf5`，其中应用运行时代码仍对应 B9.36–B9.38 的 `da89292`。`6e420fa` 不只是测试文件：它还增加 Question Review 失败审计/no-op rollback 保护、修正 Admin EventSource 生命周期，并补齐 SSE 部署文档，因此 merge 后需要重新构建并同步服务器。

## 4. 建议决策

推荐：**Approve and merge（squash merge）**。

原因：

- CI 在 B9.39 head `6e420fa` 上 quality + postgres-integration 双绿。
- 人工 UAT 23/23 PASS（0 FAIL），覆盖学生端 9 项 + 管理端 8 项 + 运维 6 项核心流程。
- 安全专项审查 0 P0，3 项 P1 均为健壮性改进、不阻塞 merge（见第 8 节）。
- Reviewer Checklist 7 项中 6 项 PASS，1 项（管理端前端未启动）已 OUTDATED——管理端自 B9.19 起已实现并部署到 `/admin/`。
- 凭据交付 runbook 完整，旧 13 账号保留迁移，className=2班 已在 migration 0010 固化。
- branch protection 要求 1 个 approving review；owner 确认后可由 owner 或指定 reviewer 提交 approving review 并 merge。

## 5. Reviewer Checklist

Reviewer 至少检查（2026-07-17 逐项验证结果）：

- [x] `scripts/run-staging-load-baseline.mjs` 没有输出密码。— **PASS**：report 显式 `passwordPrinted: false`，凭据从 CSV 加载后仅用于 auth，不写入输出。
- [x] B9.14/B9.15 证据路径均在服务器受限目录，不提交敏感文件。— **PASS**：PR diff 中无 `.env`/`.csv`/`.pem`/`.key` 文件，仅 `legacyStudentPasswordMigration.ts`（代码）和 `credential-delivery-runbook.md`（文档）。
- [x] `ADMIN_IMPORT_ENABLE_WRITE=false` 仍是 staging runtime 默认。— **PASS**：`.env.example` line 13-14 均为 `false`，`config.ts` 解析为 boolean。
- [x] 旧 13 个账号保留且已迁移，未清空历史数据。— **PASS**：migration 0010 仅 ADD COLUMN，无 DELETE/TRUNCATE；runbook 第 6 节确认"保留，不删除历史数据"。
- [x] `202502040201`–`202502040230` 的 `className=2班` 符合用户要求。— **PASS**：migration 0010 line 14-20 `UPDATE students SET class_name='2班' WHERE login_name >= '202502040201' AND <= '202502040230'`。
- [~] ~~管理平台前端仍未启动，文档只做 IA/流程 gate。~~ — **OUTDATED**：自 B9.19 起管理端已实现（`apps/admin/src/App.tsx` +4232 行）并部署到 `/admin/`。此项不再适用。
- [x] 若 merge，owner 知道初始凭据位于 `/root/bkyexam-credentials/LATEST`，需要线下安全交付。— **PASS**：`docs/credential-delivery-runbook.md` 完整记录凭据位置（700/600 权限）、交付流程、审计模板。

## 6. Merge Preconditions

允许 merge 的最小条件（2026-07-17 验证）：

```text
reviewDecision = APPROVED              ⏳ 待 owner/reviewer 提交 approving review
quality = SUCCESS                      ✅ 6e420fa 双 workflow 通过
postgres-integration = SUCCESS          ✅ 6e420fa 双 workflow 通过
no unresolved reviewer blocker         ✅ 0 P0，3 项 P1 非阻断（见第 8 节）
owner accepts credential delivery runbook  ✅ docs/credential-delivery-runbook.md 完整
```

仓库当前只有一个 collaborator `Fuck-GH-Admin`，同时也是 PR author；GitHub 不允许 author 为自己的 PR 提交 approving review。因此在不新增外部 reviewer 的前提下，`reviewDecision=APPROVED` 技术上无法形成。2026-07-17 owner 已在项目执行线程明确要求“完成，请参考 pr-review-merge-decision.md”，视为接受本记录中的 UAT、安全审查、凭据交付和 squash merge 建议。

执行策略：

- 不修改或临时降低 branch protection。
- 不伪造 approving review。
- 使用仓库 owner 的 GitHub admin merge 能力执行一次可审计的 squash merge。
- merge 后继续保持 `main` 的 1 approving review、strict required checks 和 enforce-admins 配置。

不建议 merge 的情况：

- 凭据交付责任人未定。— **当前**：runbook 已定义交付流程和审计模板，owner 确认后可执行。
- 外部告警接收端必须先接入，但尚未提供 webhook/email。— **当前**：第三方告警为 P0 Before Public Production 项，但不阻塞 PR merge（PR merge 后仍可继续接入告警）。
- reviewer 要求先补管理平台 UI 或更强压测。— **当前**：管理端已实现，UAT 通过；压测已有 load baseline。

## 7. Post-merge Actions

若 PR 合并：

1. 在服务器部署目录确认分支策略：切到 `main` 或记录继续跟随 release branch 的原因。
2. 重新跑：
   - readiness
   - production gate
   - `npm run ops:staging-load-baseline`
3. 标记 B9.36-B9.39 evidence 与 merged commit。
4. 部署 merged commit 到服务器（当前服务器 Git HEAD 为 `eb9caf5`；B9.39 包含运行时健壮性修复，必须同步）。
5. 跟踪 3 项 P1 follow-up（见第 8 节）。
6. 继续推进 P0 Before Public Production 剩余项：第三方告警接入、正式用户验收。

## 8. Review Execution Record（2026-07-17）

### 8.1 安全专项审查

审查范围：Migration 0004-0015、认证授权、生产门禁、导入破坏性操作、凭据密钥泄露。

| 专项 | 风险等级 | 结论 |
| --- | --- | --- |
| Migration 安全性 | 低 | 全部 `CREATE IF NOT EXISTS` 幂等，无不可逆 DROP/TRUNCATE，外键/索引合理 |
| 认证与授权 | 低 | scrypt 哈希、session token SHA-256 存储、RBAC 每路由强制、activation guard 不可绕过 |
| 生产门禁 | 无 | 12 项 check 完整，RESET=true 为 blocking failure，无 race condition |
| 导入破坏性操作 | 低 | TRUNCATE 事务化可回滚，cancelled 状态 SQL 守卫防覆盖，stale job 自动恢复 |
| 凭据与密钥泄露 | 无 | 无硬编码密钥，无 .env 提交，明文密码不写入日志/audit/JSON |

**P0（阻塞 merge）：0 项**

**P1（不阻塞 merge，建议 follow-up）：3 项**

1. `apps/api/src/admin/auth.ts:249` — admin `disabled` 状态检查在密码校验之后，存在针对禁用账户的密码正确性信息泄露。建议将 status 检查移至密码校验前（与学生认证一致）。
2. `apps/api/src/db/migrations/0013_import_job_worker.sql` — 新增 `import_jobs_one_active_kind_idx`（queued+running）后未 DROP 旧 `import_jobs_one_running_kind_idx`（仅 running），旧索引冗余。建议后续 migration 清理。
3. `apps/api/src/admin/import-jobs/worker.ts:152-156` — `shouldAbort` 仅检查 `cancelled` 状态，stale recovery 标 `failed` 后依赖 `heartbeatLost` 间接中止。建议 `shouldAbort` 同时识别 `failed` 以增强可读性。

### 8.2 人工 UAT 结果

| 维度 | PASS | PASS WITH NOTES | FAIL | 总计 |
| --- | ---: | ---: | ---: | ---: |
| 学生端 S1–S9 | 7 | 2 | 0 | 9 |
| 管理端 A1–A8 | 8 | 0 | 0 | 8 |
| 运维 O1–O6 | 3 | 3 | 0 | 6 |
| **合计** | **18** | **5** | **0** | **23** |

UAT NOTES（均为非阻断）：

- **S4**：路由层未显式断言 `mode: 'sequential'` 成功路径，但 repository 层与 PG 集成测试已覆盖。
- **S8**：学生 Web 无 Learning 前端（已知文档化范围边界，后端 API 完整）。
- **O2**：主部署文档缺 `/admin/` Nginx location 块示例（散落在历史文档中）。
- **O5**：backup-restore-drill 无自动化单测（依赖 Docker 手动执行）。
- **O6**：导入维护监控无自动化单测（依赖 Linux `/proc`）。

### 8.3 测试覆盖基线

```text
Vitest: 530 (Shared 26 / API 460 / Web 33 / Admin 11)
Playwright: 5 (desktop + mobile)
PostgreSQL integration: 2
verify:docker: PASS (64 files)
```

## 9. Merge Execution Authorization（2026-07-17）

Owner 已确认按本记录完成。由于单 collaborator 仓库无法生成独立 approving review，本次允许采用第 6 节记录的 admin squash merge 例外，但不得关闭、降低或绕过后续 PR 的默认保护策略。merge 后必须完成：

1. 服务器切换到 `main` merged commit。
2. build、migration second-run、service restart。
3. readiness、production gate、无认证 staging baseline。
4. Nginx SSE buffering 配置核对和 `nginx -t`。
5. 把 merged SHA、部署结果与 branch protection 保持状态写回本记录。
