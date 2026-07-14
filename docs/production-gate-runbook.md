# Production Gate And Student Identity Migration Runbook

状态日期：**2026-07-15**

本文是 B9.8 的生产发布门槛与旧学生账号迁移 runbook。它不替代真实部署审批；它把“能否公开生产发布”的最低后端证据变成可重复命令和可审计记录。

## 1. 新增命令

```sh
npm run ops:production-gate
```

该命令会：

1. 检查生产关键环境变量。
2. 连接 `DATABASE_URL`。
3. 汇总 `students` 正式身份迁移状态。
4. 输出 JSON report。
5. 按结果返回 exit code。

Exit code：

| Code | 含义 |
| ---: | --- |
| `0` | 所有 blocking gate 通过；可能仍有 warning。 |
| `1` | 命令执行失败，例如缺少 `DATABASE_URL` 或数据库连接失败。 |
| `2` | gate 正常执行，但存在 blocking failure。 |

可选参数：

```sh
npm run ops:production-gate -- --sample-limit=50
npm run ops:production-gate -- --skip-db
```

- `--sample-limit=N`：每类学生身份样本最多输出 `N` 条，范围 1..100，默认 20。
- `--skip-db`：只检查环境变量，不连接数据库；适合先审查 deployment env，不适合最终发布。

建议把正式发布前报告保存到 artifacts：

```powershell
New-Item -ItemType Directory -Force artifacts\production-gate | Out-Null
npm run ops:production-gate -- --sample-limit=50 *> artifacts\production-gate\production-gate-2026-07-15.json
```

## 2. Environment Gate

`ops:production-gate` 当前检查：

| Check | Blocking | 规则 |
| --- | --- | --- |
| `NODE_ENV` | no | 生产应为 `production`，否则 warning。 |
| `DATABASE_URL` | yes | 必须存在。 |
| `USE_DATABASE` | yes | 必须为 `true`，禁止公开生产 memory mode。 |
| `COOKIE_SECRET` | yes | 不能缺失、不能是开发默认值，长度至少 24。 |
| `COOKIE_SECURE` | yes | 必须为 `true`，生产 Cookie 只走 HTTPS。 |
| `STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED` | yes | 必须不是 `true`。 |
| `RATE_LIMIT_ENABLED` | yes | 必须为 `true`。 |
| `CSRF_ORIGIN_CHECK_ENABLED` + `CSRF_ALLOWED_ORIGINS` | yes | 必须开启，并且 allowlist 使用 HTTPS 生产域名，不能是 localhost。 |
| `ADMIN_BOOTSTRAP_*` | no | runtime env 中仍存在会 warning；bootstrap 后应删除。 |
| `ADMIN_IMPORT_ENABLE_WRITE` | no | 如果为 `true` 会 warning；只应在受控导入窗口开启。 |
| `STUDENT_MIGRATION_TEMP_PASSWORD` | no | 如果仍在 runtime env 中会 warning；只应在受控迁移 CLI 调用时临时存在。 |

## 3. Student Identity Migration Gate

数据库检查会汇总：

- `totalStudents`
- `activeStudents`
- `disabledStudents`
- `passwordProtectedStudents`
- `legacyPasswordlessStudents`
- `passwordResetRequiredStudents`
- `lockedStudents`

并输出以下样本：

- `samples.legacyPasswordless`
- `samples.passwordResetRequired`
- `samples.locked`

Blocking rule：

- `legacyPasswordlessStudents > 0` 是 blocking failure。

Warning rule：

- `passwordResetRequiredStudents > 0`：允许存在，但运营必须知道这些学生登录后需要改密。
- `lockedStudents > 0`：允许存在，但发布前应确认是否等待锁定过期或由管理员介入。
- `totalStudents = 0`：允许空库 staging，但真实生产应有明确导入/建号计划。

## 4. 旧账号迁移步骤

正式模式下旧账号保留，不删除 `practice_sessions`、`practice_attempts`、`wrong_questions`、`student_learning_goals`、`question_bookmarks` 等学习数据。

迁移步骤：

1. 先跑本地质量门和备份恢复演练：

   ```sh
   npm run verify:docker
   npm run ops:backup-restore:docker
   ```

2. 在目标环境确认生产 env：

   ```sh
   npm run ops:production-gate -- --skip-db
   ```

3. 在 staging/production candidate DB 上跑完整 gate：

   ```sh
   npm run ops:production-gate -- --sample-limit=50
   ```

4. 如果 `legacyPasswordlessStudents > 0`：

   - 从 report 的 `samples.legacyPasswordless` 和数据库只读查询确认账号清单。
   - 先 dry-run：

     ```sh
     npm run ops:legacy-student-password-migration -- --limit=50
     ```

   - 再选择一种受控写入方式：

     ```sh
     STUDENT_MIGRATION_TEMP_PASSWORD='change-me-offline' \
     npm run ops:legacy-student-password-migration -- --apply --limit=50
     ```

     或生成每人独立临时密码到 gitignored 凭据文件：

     ```sh
     npm run ops:legacy-student-password-migration -- \
       --apply \
       --limit=50 \
       --credentials-out=artifacts/ops/legacy-student-password-migration/credentials.csv
     ```

   - 工具会写入 password hash、设置 `password_reset_required=true`、清空失败/锁定状态，并默认撤销未过期 student session。
   - 临时密码只通过线下可信渠道发给对应学生，不写入 audit log、文档或 Git。
   - 细节见 [`legacy-student-password-migration.md`](./legacy-student-password-migration.md)。

5. 再次运行：

   ```sh
   npm run ops:production-gate -- --sample-limit=50
   ```

6. 只有当 `legacyPasswordlessStudents = 0` 且 environment blocking checks 全部通过时，才能继续部署审批。

## 5. 发布前最小证据包

每次准备公开生产发布，至少保留：

- `npm run verify:docker` 输出。
- `npm run ops:backup-restore:docker` 输出。
- `npm run ops:production-gate` JSON report。
- 当前 Git commit。
- 当前 migration 名称。
- 远端 CI workflow run URL。
- branch protection 截图或文字确认。
- rollback plan。

证据位置建议：

```text
artifacts/production-gate/<date>/
```

## 6. B9.9/B9.10 后仍未完成

- 尚未实现更细粒度 login route rate limit。
- 尚未完成远端 CI/branch protection 实际确认。
- 尚未开始正式管理端前端。
