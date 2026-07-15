import { expect, test, type Page } from '@playwright/test';

import { createMockAdminState, installMockAdminApi } from './mockAdminApi.js';

const adminBaseUrl = 'http://127.0.0.1:5174';

test('admin operational MVP covers login, system status, student accounts, and bank mappings', {
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

  expect(state.calls).toContain('POST /api/admin/auth/login');
  expect(state.calls).toContain('GET /api/admin/system/status');
  expect(state.calls).toContain('POST /api/admin/students');
  expect(state.calls).toContain('POST /api/admin/students/bulk-create');
  expect(state.calls).toContain('GET /api/admin/bank-mappings');
  expect(state.calls).toContain('PATCH /api/admin/bank-mappings/44444444-4444-4444-8444-444444444444');
  expect(state.calls).toContain('POST /api/admin/bank-mappings/bulk-status');
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
