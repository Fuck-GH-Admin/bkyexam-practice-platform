# B9.15 Staging Operations Hardening

状态日期：**2026-07-15**
目标环境：`https://exam.acgbot.cc.cd`
证据目录：`/srv/bkyexam-backups/b9.15-20260715104214`

本文记录 B9.15 的运维加固基线：外部于应用进程的 synthetic healthcheck、systemd/nginx/env/backup 复核、轻量负载基线、实机 backup/restore drill。它不是最终 SRE 手册；目标是在正式前端前，先保证后端目标环境可观察、可恢复、可复测。

## 1. 当前结论

```text
B9.15 staging ops baseline = PASS
api/nginx/postgresql = active
synthetic healthcheck timer = enabled + active
post-deploy backup/restore drill = PASS
load baseline = PASS, 27 checks / 0 failures
```

仍未完成：第三方 SaaS uptime、短信/邮件/IM webhook 告警、长期日志聚合和系统性压力测试。当前已完成的是“服务器外置于应用进程的最小 synthetic monitor + 可复测证据”。

## 2. Synthetic Healthcheck

已在服务器安装：

```text
/usr/local/bin/bkyexam-staging-healthcheck
/etc/systemd/system/bkyexam-healthcheck.service
/etc/systemd/system/bkyexam-healthcheck.timer
/etc/systemd/system/bkyexam-healthcheck-alert@.service
/var/log/bkyexam-healthcheck/checks.jsonl
```

Timer：

```text
systemctl enable --now bkyexam-healthcheck.timer
OnBootSec=2min
OnUnitActiveSec=5min
```

每次检查覆盖：

- `GET /api/health`
- `GET /api/health/readiness`
- `GET /api/health/metrics`
- readiness database dependency must be `ok=true`
- metrics must expose `http.totalRequests`

最近一次手工启动结果：

```json
{
  "ok": true,
  "baseUrl": "https://exam.acgbot.cc.cd",
  "health": { "httpCode": "200", "timeTotalSeconds": 0.121695, "ok": true },
  "readiness": { "httpCode": "200", "timeTotalSeconds": 0.137009, "ok": true, "database": { "ok": true, "status": "ok", "latencyMs": 11 } },
  "metrics": { "httpCode": "200", "timeTotalSeconds": 0.096769, "totalRequests": 33 },
  "errors": []
}
```

失败时：

- `bkyexam-healthcheck.service` 返回非 0。
- systemd 触发 `bkyexam-healthcheck-alert@.service`。
- alert unit 使用 `logger -p daemon.err -t bkyexam-healthcheck` 写入 journal。

当前没有外部 webhook，因此真正通知链路仍需后续提供接收端后接入。推荐接收端优先级：

1. Uptime Kuma / Better Stack / Healthchecks.io 任一外部 HTTPS monitor。
2. 告警发送到项目 owner 可收到的 IM 或邮箱。
3. 告警规则：readiness 2 次连续失败、HTTP 5xx、证书到期、响应超过 5 秒。

## 3. Systemd / Nginx / Env 复核

当前服务状态：

```text
bkyexam-practice-api.service = active
nginx = active
postgresql@15-main.service = active
bkyexam-healthcheck.timer = active/enabled
```

关键文件：

```text
/etc/systemd/system/bkyexam-practice-api.service
/etc/bkyexam-practice-api.env
/etc/nginx/conf.d/exam-acgbot.conf
```

运行参数已确认：

- `NODE_ENV=production`
- `USE_DATABASE=true`
- `COOKIE_SECURE=true`
- `STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED=false`
- `RATE_LIMIT_ENABLED=true`
- `CSRF_ORIGIN_CHECK_ENABLED=true`
- `ADMIN_IMPORT_ENABLE_WRITE=false`

敏感值：`DATABASE_URL`、`COOKIE_SECRET`、账号密码只存在服务器受限文件，不写入 Git。

## 4. Post-deploy Backup / Restore Drill

本次 B9.15 创建 post-deploy custom-format dump：

```text
/srv/bkyexam-backups/b9.15-20260715104214/bkyexam_practice.post-b915.dump
/srv/bkyexam-backups/b9.15-20260715104214/bkyexam_practice.post-b915.dump.sha256
```

恢复演练：

- 使用临时库：`bkyexam_restore_b915_20260715104505`
- 使用 `pg_restore --no-owner --no-privileges`
- 恢复后比较核心表计数
- 比较通过后删除临时库

结果：

```text
restore drill = PASS
mismatches = {}
```

比较表与源库计数：

| Table | Count |
| --- | ---: |
| `students` | 43 |
| `admin_users` | 1 |
| `classifications` | 2941 |
| `questions` | 89922 |
| `question_options` | 154899 |
| `bank_mappings` | 2662 |
| `practice_sessions` | 24 |
| `student_sessions` | 17 |
| `audit_logs` | 5 |
| `student_learning_goals` | 0 |
| `question_bookmarks` | 0 |

证据：

```text
/srv/bkyexam-backups/b9.15-20260715104214/restore-drill-report.json
```

## 5. Lightweight Load Baseline

新增仓库脚本：

```powershell
npm run ops:staging-load-baseline -- \
  --base-url=https://exam.acgbot.cc.cd \
  --credentials-csv=/root/bkyexam-credentials/LATEST \
  --iterations=3 \
  --require-thresholds \
  --output=/srv/bkyexam-backups/b9.15-20260715104214/load-baseline.json
```

脚本不打印、不写入密码；只记录登录名和脱敏响应摘要。

本次在服务器本地对 HTTPS 域名跑 3 轮，覆盖 27 个检查，0 failure：

| Check | Samples | Avg ms | P95 ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| health | 3 | 83.36 | 209.48 | 209.48 |
| readiness | 3 | 47.79 | 99.32 | 99.32 |
| metrics | 3 | 27.04 | 40.88 | 40.88 |
| banks | 3 | 801.99 | 902.13 | 902.13 |
| student_login | 3 | 86.99 | 94.36 | 94.36 |
| student_me | 3 | 22.93 | 23.66 | 23.66 |
| practice_create | 3 | 158.21 | 164.79 | 164.79 |
| admin_login | 3 | 93.46 | 110.45 | 110.45 |
| admin_me | 3 | 23.01 | 26.87 | 26.87 |

默认阈值见 `scripts/run-staging-load-baseline.mjs`。当前阈值用于 smoke/load baseline，不等同于最终 SLA。

证据：

```text
/srv/bkyexam-backups/b9.15-20260715104214/load-baseline.json
```

## 6. 资源快照

```text
RAM total ≈ 1.6 GiB
RAM available ≈ 567 MiB
Swap total = 4.0 GiB
Swap used = 0
Disk / = 40G total, 18G used, 20G available, 48%
```

## 7. 下一步保留项

- 接入真正外部 uptime provider 和 owner 可收到的告警渠道。
- 为 `/api/banks` 增加分页/缓存策略评估；当前全量 banks 响应仍是最慢公开接口。
- 增加数据库慢查询观察窗口，不急于改索引。
- 正式生产前再做一次带并发的 k6/autocannon 压测。
