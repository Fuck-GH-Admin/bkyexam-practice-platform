# Credential Delivery And First Password Change Runbook

状态日期：**2026-07-15**
适用环境：`https://exam.acgbot.cc.cd`

本文固定管理员和学生初始密码的交付、首次改密和旧账号处理流程。目标是避免“凭据在聊天、Git、日志中散落”。

## 1. 当前凭据位置

最终有效账号 CSV 只保存在服务器受限目录：

```text
/root/bkyexam-credentials/LATEST
/root/bkyexam-credentials/bkyexam-b9.14-credentials-20260715093217.csv
```

旧账号迁移生成的临时密码 CSV：

```text
/srv/bkyexam-backups/b9.14-20260715080815/legacy-student-password-migration-credentials.csv
```

权限要求：

```text
/root/bkyexam-credentials = 700
*.csv = 600
```

禁止：

- 禁止把 CSV commit 到 Git。
- 禁止在 GitHub issue/PR/comment 中贴密码。
- 禁止在群聊公开贴完整 CSV。
- 禁止把 `/srv/bkyexam-backups/...` 整目录打包给非运维人员。

## 2. 当前账号批次

| Batch | Scope | Count | Notes |
| --- | --- | ---: | --- |
| 管理员 | `admin` | 1 | `super_admin`，displayName=`系统管理员` |
| 正式学生 | `202502040201`–`202502040230` | 30 | `className=2班`，`passwordResetRequired=true` |
| 旧账号 | 部署前 13 个无密码账号 | 13 | 已保留、已迁移临时密码、`passwordResetRequired=true` |

当前生产 gate 显示：

```text
students = 43
legacyPasswordlessStudents = 0
passwordResetRequiredStudents = 43
lockedStudents = 0
```

`passwordResetRequiredStudents=43` 是预期状态：所有临时密码账号首次登录后应改密。

## 3. 凭据交付流程

推荐流程：

1. 运维在服务器读取 `/root/bkyexam-credentials/LATEST` 指向的 CSV。
2. 按 `accountType` 拆分管理员和学生。
3. 管理员密码只交付给 owner 或指定超级管理员。
4. 学生密码按班级/学号单独交付，禁止全班公开同一表格。
5. 交付后记录：
   - 交付时间。
   - 交付人。
   - 接收人。
   - 交付范围。
   - 是否要求首次改密。
6. 不在记录中保存明文密码，只保存账号范围和 CSV 文件路径。

建议交付记录模板：

```text
deliveredAt:
deliveredBy:
receivedBy:
accountRange:
credentialSourcePath:
passwordsIncludedInRecord: no
firstPasswordChangeRequired: yes
notes:
```

## 4. 学生首次登录与改密

学生流程：

1. 打开 `https://exam.acgbot.cc.cd`。
2. 用学号/用户名 + 初始密码登录。
3. 系统返回 `passwordResetRequired=true`。
4. 前端正式实现前，必须确保改密入口可用；后端 API 为：

```http
POST /api/auth/password/change
Cookie: bky_session=<student session>
Content-Type: application/json
Origin: https://exam.acgbot.cc.cd

{
  "currentPassword": "<initial password>",
  "newPassword": "<new password>"
}
```

成功后：

```json
{
  "success": true,
  "passwordResetRequired": false
}
```

改密后旧密码失效，登录失败计数和锁定状态会清空。

## 5. 管理员重置密码

管理员重置学生密码应走 Admin Student Manage API：

```http
POST /api/admin/students/:studentId/reset-password
Cookie: bky_admin_session=<admin session>
Content-Type: application/json
Origin: https://exam.acgbot.cc.cd

{
  "newPassword": "<temporary password>",
  "revokeSessions": true
}
```

后端行为：

- 写入新 hash。
- 设置 `passwordResetRequired=true`。
- 清空 failed login / lock state。
- 默认建议撤销未过期 session。
- 写 audit log。
- API 不返回明文密码；明文只由管理员在生成/交付时短暂持有。

## 6. 旧账号处理

旧账号策略：保留，不删除历史数据。

当前处理状态：

- 原 `password_hash IS NULL` 的 13 个账号已全部迁移。
- 每个旧账号获得独立临时密码。
- 所有旧账号仍需首次改密。
- 旧 session 已撤销。

若后续发现新的 legacy passwordless account：

```powershell
npm run ops:legacy-student-password-migration -- --limit=1000
npm run ops:legacy-student-password-migration -- --apply --limit=1000 --credentials-out=<secure-path.csv>
npm run ops:production-gate -- --sample-limit=50
```

## 7. 前端前必须确认

正式前端设计前，必须明确：

- 登录页如何提示首次改密。
- `passwordResetRequired=true` 是否强制跳转改密页。
- 学生忘记密码时展示“联系管理员重置”，不做公网找回。
- 管理员重置密码时是否必须二次确认。
- 管理员是否可以批量导出初始密码；默认不建议从 UI 导出明文密码。
