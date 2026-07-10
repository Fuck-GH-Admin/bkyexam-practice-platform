# Testing Strategy

状态日期：**2026-07-10**

测试按失败定位和外部依赖分层。任何一层通过都不能替代其他层。

## Repository Quality Gate

安装依赖后执行：

```sh
npm run verify
```

该命令依次运行：

1. `npm run test`：shared、API、Web 的 Vitest 测试。
2. `npm run typecheck`：全部 workspace 与 Playwright spec 的 TypeScript 检查。
3. `npm run build`：全部 workspace 的生产构建。
4. `npm run test:e2e`：桌面与移动端 Playwright smoke。

需要缩短反馈时间时，可以分别执行：

```sh
npm run test
npm run typecheck
npm run build
npm run test:e2e:desktop
npm run test:e2e:mobile
```

## Browser Setup

Windows 本地开发默认使用系统已安装的 Chrome，不要求额外下载浏览器。

CI、Linux/macOS，或希望在 Windows 强制使用 Playwright bundled Chromium 时：

```sh
npm run test:e2e:install
```

Windows 强制 bundled Chromium：

```powershell
$env:PLAYWRIGHT_USE_BUNDLED_BROWSER="true"
npm run test:e2e
```

失败产物写入：

- `test-results/playwright/`：trace、截图和视频。
- `playwright-report/`：HTML 报告。

这些目录不会提交到 Git。

## Current Test Layers

### Unit And In-Process Route Tests

当前 255 个 Vitest 测试覆盖：

- shared schema 与类型约束。
- 题库解析、映射、导入辅助逻辑。
- identity、catalog、practice、wrongbook 的 repository 行为。
- Fastify route 的输入、输出和错误映射。
- Web 练习 model 与关键状态转换。

多数 API 测试使用 fake/in-memory dependency，因此反馈快，但不证明 SQL、migration 或真实 PostgreSQL 行为。

### Deterministic Browser Smoke

`tests/e2e/` 在浏览器层拦截 `/api/*`，使用带状态的 mock practice API。它验证：

- 服务端草稿语义在刷新后可恢复。
- 当前题号与存疑状态可恢复。
- 单选、多选、判断题和 `false` 答案不会因前端序列化丢失。
- 提交前未答/存疑统计正确。
- 整卷提交后只读结果数量和正确数正确。
- 错题列表及详情不泄漏原始 option UUID。
- 移动 viewport 的练习台与提交弹窗没有横向溢出。
- 关键流程没有未预期的 console error 或 page error。

这层不启动 Fastify，也不连接 PostgreSQL，适合成为每次提交都运行的稳定浏览器回归门。

### Real PostgreSQL Verification

真实数据验证目前包括：

- migration。
- 完整题库导入。
- `db:smoke`。
- PostgreSQL repository + Fastify API 全练习闭环。
- Vite + Fastify + PostgreSQL 的真实 Chrome smoke。

本轮真实闭环已经通过，但尚未固化为 CI 自动 job。下一项 P0 工作是增加可重复启动 PostgreSQL、装载最小 fixture 并执行 integration test 的仓库脚本；它将补足 mock browser smoke 无法发现的 SQL、事务、migration 和 API wiring 回归。

## Change Acceptance

涉及 practice、wrongbook、session 或 answer codec 的变更，至少应满足：

1. 对应 Vitest 回归用例已新增或更新。
2. `npm run typecheck` 通过。
3. `npm run build` 通过。
4. 关键学生流程变化已被 Playwright 覆盖。
5. 涉及 SQL、migration 或 repository wiring 时，必须运行真实 PostgreSQL integration profile。
