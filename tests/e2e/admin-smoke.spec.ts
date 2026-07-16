import { expect, test, type Page } from '@playwright/test';

import { createMockAdminState, installMockAdminApi } from './mockAdminApi.js';

const adminBaseUrl = 'http://127.0.0.1:5174';

test('admin operational MVP covers login, system status, student accounts, bank mappings, import jobs, question review, and audit logs', {
  tag: '@desktop',
}, async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  const state = createMockAdminState();
  await installMockAdminApi(page, state);

  await page.goto(`${adminBaseUrl}/admin/students`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '题库与账号运营入口' })).toBeVisible();
  await page.getByLabel('Login name').fill('admin');
  await page.getByLabel('Password').fill('admin-pass-123');
  await page.getByRole('button', { name: '登录管理后台' }).click();

  await expect(page.getByRole('heading', { name: 'Student Accounts' })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看 202502040201' })).toBeVisible();

  await page.getByRole('button', { name: 'System Status' }).click();
  await expect(page.getByRole('heading', { name: 'System Status' })).toBeVisible();
  await expect(page.getByText('bkyexam-practice-api / 0.1.0')).toBeVisible();
  await expect(page.getByText(/473 visible banks/)).toBeVisible();

  await page.getByRole('button', { name: 'Student Accounts' }).click();
  await page.getByRole('button', { name: '查看 202502040201' }).click();
  await expect(page.getByRole('heading', { name: '202502040201' })).toBeVisible();
  await page.getByLabel('displayName').fill('202502040201 张三');
  await page.getByRole('button', { name: '保存资料' }).click();
  await expect(page.getByText('学生资料已保存。')).toBeVisible();

  await page.getByLabel('New temporary password').fill('reset-pass-123');
  await page.getByRole('button', { name: '确认重置密码' }).click();
  await expect(page.getByText(/密码已重置；revokedSessions = 1/)).toBeVisible();
  await page.getByRole('button', { name: '撤销所有会话' }).click();
  await expect(page.getByText(/已撤销所有会话；revokedSessions = 1/)).toBeVisible();

  await page.getByRole('button', { name: '单个创建' }).click();
  await page.getByLabel('loginName *').fill('202502040249');
  await page.getByLabel('displayName').fill('202502040249');
  await page.getByLabel('initialPassword *').fill('temp-pass-249');
  await page.getByLabel('className').fill('2班');
  await page.getByRole('button', { name: '创建学生' }).click();
  await expect(page.getByRole('heading', { name: '202502040249' })).toBeVisible();

  await page.getByRole('button', { name: '批量创建' }).click();
  await page.getByLabel('Default initial password').fill('bulk-pass-123');
  await page.getByLabel('Input JSON / CSV paste').fill([
    'loginName,displayName,className,groupName',
    '202502040201,existing,2班,',
    '202502040250,202502040250,2班,',
  ].join('\n'));
  await page.getByRole('button', { name: 'Dry parse locally' }).click();
  await expect(page.getByText('共解析 2 行；提交前仍会由 shared v1 schema 与后端再次校验。')).toBeVisible();
  await page.getByRole('button', { name: '提交批量创建' }).click();
  await expect(page.getByRole('heading', { name: 'Bulk create result' })).toBeVisible();
  const bulkResult = page.locator('.bulk-result').filter({ has: page.getByRole('heading', { name: 'Bulk create result' }) });
  await expect(bulkResult).toContainText('202502040250');
  await expect(bulkResult).toContainText('202502040201: already_exists');

  await page.getByRole('button', { name: 'Bank Mappings' }).click();
  await expect(page.getByRole('heading', { name: 'Bank Mappings' })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看 高等数学' })).toBeVisible();
  await page.getByRole('button', { name: '查看 高等数学' }).click();
  await expect(page.getByRole('heading', { name: '高等数学' })).toBeVisible();
  const bankDetail = page.locator('.student-side-panel');
  await bankDetail.getByLabel('bankName').fill('高等数学（校内版）');
  await page.getByRole('button', { name: '保存题库 mapping' }).click();
  await expect(page.getByText('题库 mapping 已保存。')).toBeVisible();

  await page.getByLabel('选择 高等数学（校内版）').check();
  await page.getByLabel('Bulk status').selectOption('hidden');
  await page.getByLabel('Bulk visible').selectOption('false');
  await page.getByRole('button', { name: /批量更新状态/ }).click();
  await expect(page.getByRole('heading', { name: 'Bulk status result' })).toBeVisible();
  await expect(page.locator('.bulk-result').filter({ has: page.getByRole('heading', { name: 'Bulk status result' }) })).toContainText('updated');

  await page.getByRole('button', { name: 'Import Jobs' }).click();
  await expect(page.getByRole('heading', { name: 'Import Jobs' })).toBeVisible();
  await expect(page.getByText(/questions: 89922/).first()).toBeVisible();
  await page.getByRole('button', { name: '创建导入任务' }).click();
  await expect(page.getByRole('heading', { name: '创建导入任务' })).toBeVisible();
  await page.getByLabel('sourceDir').fill('C:\\Users\\Bot\\Bot\\BKYExam\\questionbank');
  await page.getByLabel('batchSize').fill('500');
  await page.getByRole('button', { name: '提交 dry_run' }).click();
  await expect(page.getByRole('heading', { name: 'full_corpus_import' })).toBeVisible();
  await expect(page.getByText(/questions: 89922/).first()).toBeVisible();
  await page.getByRole('button', { name: '查看 error report' }).click();
  await expect(page.getByRole('heading', { name: '没有错误摘要' })).toBeVisible();

  await page.getByRole('button', { name: 'Question Review' }).click();
  await expect(page.getByRole('heading', { name: 'Question Review' })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看题目质检' })).toBeVisible();
  await page.getByRole('button', { name: '查看题目质检' }).click();
  await expect(page.getByRole('heading', { name: 'single_choice' })).toBeVisible();
  await expect(page.getByText('答案疑似错误')).toBeVisible();
  const questionDetail = page.locator('.student-side-panel');
  await questionDetail.getByLabel('题干 content override').fill('1 + 1 的正确答案是什么？（已复核）');
  await questionDetail.getByLabel('answerRaw override').fill('B');
  await questionDetail.getByLabel('option 2').fill('2（正确）');
  await questionDetail.getByLabel('override note').fill('人工复核：修订题干和正确选项文案');
  await page.getByRole('button', { name: '保存修订草稿' }).click();
  await expect(page.getByText(/修订草稿已保存；draft version = 1/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Diff / approval' })).toBeVisible();
  await expect(questionDetail.locator('.diff-list').first()).toContainText('1 + 1 的正确答案是什么？（已复核）');
  await page.getByRole('button', { name: '提交审批' }).click();
  await expect(page.getByText('修订已提交审批。')).toBeVisible();
  await questionDetail.getByLabel('审批意见').fill('题干与选项已人工复核');
  await page.getByRole('button', { name: '批准并生效' }).click();
  await expect(page.getByText('修订已批准并生效。')).toBeVisible();
  await expect(questionDetail.getByText('1 + 1 的正确答案是什么？（已复核）').first()).toBeVisible();
  await questionDetail.getByLabel('回滚说明').fill('回滚链路 smoke');
  await page.getByRole('button', { name: '回滚到此版本' }).click();
  await expect(page.getByText(/已回滚到修订/)).toBeVisible();
  await page.getByRole('button', { name: '排除出练习' }).click();
  await expect(page.getByText('该题已排除出练习选题。')).toBeVisible();
  await questionDetail.getByLabel('Flag type').selectOption('needs_manual_review');
  await questionDetail.getByLabel('Severity').selectOption('high');
  await questionDetail.getByLabel('Note', { exact: true }).fill('需要人工复核题干和答案');
  await page.getByRole('button', { name: '添加质检 flag' }).click();
  await expect(page.getByText('质检 flag 已添加。')).toBeVisible();
  await page.getByRole('button', { name: 'resolve' }).first().click();
  await expect(page.getByText('质检 flag 已 resolve。')).toBeVisible();

  await page.getByRole('button', { name: 'Audit Logs' }).click();
  await expect(page.getByRole('heading', { name: 'Audit Logs' })).toBeVisible();
  await expect(page.getByText('bank_mapping.update')).toBeVisible();
  await page.getByRole('button', { name: '查看审计日志' }).first().click();
  await expect(page.getByRole('heading', { name: 'bank_mapping.update' })).toBeVisible();
  await expect(page.getByText('高等数学（校内版）')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Metadata' })).toBeVisible();

  await page.getByRole('button', { name: 'Admin Users' }).click();
  await expect(page.getByRole('heading', { name: 'Admin Users' })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看管理员 operator01' })).toBeVisible();
  await page.getByRole('button', { name: '查看管理员 operator01' }).click();
  await expect(page.getByRole('heading', { name: 'operator01' })).toBeVisible();
  await page.getByLabel('displayName').fill('运营管理员（已更新）');
  await page.getByRole('button', { name: '保存管理员资料' }).click();
  await expect(page.getByText('管理员资料已保存。')).toBeVisible();
  await page.getByLabel('New temporary password').fill('admin-pass-456');
  await page.getByRole('button', { name: '确认重置管理员密码' }).click();
  await expect(page.getByText('管理员密码已重置；临时密码不会被保存或回显。')).toBeVisible();

  await page.getByRole('button', { name: '创建管理员' }).click();
  await page.getByLabel('loginName *').fill('auditbot');
  await page.getByLabel('displayName').fill('审计机器人');
  await page.getByLabel('initial password *').fill('audit-pass-123');
  await page.locator('.student-side-panel').getByRole('button', { name: '创建管理员' }).click();
  await expect(page.getByRole('heading', { name: 'auditbot' })).toBeVisible();

  expect(state.calls).toContain('POST /api/admin/auth/login');
  expect(state.calls).toContain('GET /api/admin/system/status');
  expect(state.calls).toContain('POST /api/admin/students');
  expect(state.calls).toContain('POST /api/admin/students/bulk-create');
  expect(state.calls).toContain('GET /api/admin/bank-mappings');
  expect(state.calls).toContain('PATCH /api/admin/bank-mappings/44444444-4444-4444-8444-444444444444');
  expect(state.calls).toContain('POST /api/admin/bank-mappings/bulk-status');
  expect(state.calls).toContain('GET /api/admin/import-jobs');
  expect(state.calls).toContain('POST /api/admin/import-jobs');
  expect(state.calls.some((call) => call.endsWith('/errors'))).toBe(true);
  expect(state.calls).toContain('GET /api/admin/question-review');
  expect(state.calls).toContain('GET /api/admin/question-review/77777777-7777-4777-8777-777777777777');
  expect(state.calls).toContain('PATCH /api/admin/question-review/77777777-7777-4777-8777-777777777777/override');
  expect(state.calls).toContain('POST /api/admin/question-review/77777777-7777-4777-8777-777777777777/override/submit');
  expect(state.calls).toContain('POST /api/admin/question-review/77777777-7777-4777-8777-777777777777/override/approve');
  expect(state.calls).toContain('POST /api/admin/question-review/77777777-7777-4777-8777-777777777777/override/rollback');
  expect(state.calls).toContain('PATCH /api/admin/question-review/77777777-7777-4777-8777-777777777777');
  expect(state.calls).toContain('GET /api/admin/audit-logs');
  expect(state.calls).toContain('GET /api/admin/users');
  expect(state.calls).toContain('PATCH /api/admin/users/99999999-9999-4999-8999-000000000003');
  expect(state.calls).toContain('POST /api/admin/users');
  expect(runtimeErrors).toEqual([]);
});

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) {
      errors.push(`console: ${message.text()}`);
    }
  });
  return errors;
}
