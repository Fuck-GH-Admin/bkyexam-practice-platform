# Legacy Student Password Migration

状态：**B9.9 已完成，2026-07-15。**

本 runbook 用于把旧的 `password_hash IS NULL` 学生账号迁移为“临时密码 + 强制改密”状态。它只处理旧无密码账号，不覆盖已经有密码的学生。

## 命令

默认 dry-run，不写库：

```sh
npm run ops:legacy-student-password-migration -- --limit=50
```

正式写入需要显式 `--apply`，并选择一种临时密码交付方式：

### 方式 A：统一临时密码来自环境变量

```sh
STUDENT_MIGRATION_TEMP_PASSWORD='change-me-offline' \
npm run ops:legacy-student-password-migration -- --apply --limit=50
```

也可以指定变量名：

```sh
LEGACY_TEMP_PASSWORD='change-me-offline' \
npm run ops:legacy-student-password-migration -- --apply --password-env=LEGACY_TEMP_PASSWORD
```

工具不会把明文密码写入 JSON 输出或 audit log。

### 方式 B：工具生成每人独立临时密码并写入本地凭据文件

```sh
npm run ops:legacy-student-password-migration -- \
  --apply \
  --limit=50 \
  --credentials-out=artifacts/ops/legacy-student-password-migration/credentials.csv
```

`artifacts/` 已在 `.gitignore` 中，凭据文件仍必须只通过线下可信渠道分发，并在完成交付后按运维制度销毁或加密归档。

## 写入行为

对每个被迁移学生：

- 仅当 `students.password_hash IS NULL` 时更新。
- 写入新的 `password_hash`。
- 设置 `password_reset_required=true`。
- 设置 `password_changed_at=NULL`。
- 清空 `failed_login_count`。
- 清空 `failed_login_window_started_at`。
- 清空 `locked_until`。
- 默认撤销未过期 student session；可用 `--no-revoke-sessions` 关闭。

工具在 `--apply` 模式下使用数据库 transaction，并写入一条不含明文密码的 audit log：

```text
action=student_account.legacy_password_migration
resourceType=student
resourceId=legacy-passwordless
```

## Exit code

- `0`：执行成功，且无 skipped。
- `1`：参数、数据库连接或执行异常。
- `2`：执行完成但存在 skipped，例如并发更新导致某个账号已不再是 `password_hash IS NULL`。

## 与 production gate 的关系

公开生产前：

1. 先跑 `npm run ops:production-gate -- --sample-limit=50`。
2. 如果 `legacyPasswordlessStudents > 0`，执行本迁移工具。
3. 再跑 production gate。
4. 只有当 `legacyPasswordlessStudents = 0` 且 environment blocking checks 全部通过时，继续发布审批。

## 明确不做

- 不处理已经有密码的学生。
- 不把明文临时密码写入 audit log、文档或 Git。
- 不开放公网学生注册。
- 不实现邮箱/短信找回。
- 不创建前端管理页面。
