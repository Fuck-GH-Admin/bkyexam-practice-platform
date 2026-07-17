import { expect, test, type Page } from '@playwright/test';

import {
  createMockPracticeState,
  installMockPracticeApi,
  type MockPracticeState,
} from './mockPracticeApi.js';

test('desktop practice survives reload, submits accurately, and opens readable wrongbook details', {
  tag: '@desktop',
}, async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  const state = createMockPracticeState();

  await openPractice(page, state);
  await expect(page.locator('.practice-question-card > h2')).toHaveText('下列哪一种数据结构遵循先进先出原则？');
  await expect(page.getByRole('button', { name: '取消存疑' })).toBeVisible();

  await page.locator('.practice-question-card .answer-grid button').nth(1).click();
  await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一题' }).click();
  await page.locator('.practice-question-card .answer-grid button').nth(1).click();
  await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible();
  await expect.poll(() => state.session.currentSort).toBe(3);

  const resumedHeading = await page.locator('.practice-question-card > h2').textContent();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page).toHaveURL(new RegExp(`/practice/${state.session.id}$`));
  await expect(page.locator('.practice-question-card')).toBeVisible();
  await expect(page.locator('.practice-question-card > h2')).toHaveText(resumedHeading ?? '');
  await expect(page.locator('.practice-question-card .answer-grid button').nth(1)).toHaveClass(/selected/);

  await page.getByRole('button', { name: /^第 1 题，/ }).click();
  await page.getByRole('button', { name: '标记存疑' }).click();
  await expect.poll(() => state.questions[0].markedForReview).toBe(true);

  await page.getByRole('button', { name: '提交前检查', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('2 道未答', { exact: true })).toBeVisible();
  await expect(dialog.getByText('2 道存疑', { exact: true })).toBeVisible();
  await expect(dialog.locator('.check-item.unanswered')).toHaveCount(2);
  await expect(dialog.locator('.check-item.flagged')).toHaveCount(2);

  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await expect(page.getByText('本次练习：3/7', { exact: true })).toBeVisible();
  await expect(page.getByText('已生成 5 道题的判分结果，可通过右侧题号逐题回看。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '本次练习已完成' })).toBeDisabled();

  await page.getByRole('button', { name: '历史', exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('heading', { name: '练习历史' })).toBeVisible();
  await expect(page.locator('.history-list .session-card')).toHaveCount(1);
  await page.getByRole('button', { name: '查看结果：信息技术综合练习' }).click();
  await expect(page).toHaveURL(new RegExp(`/practice/${state.session.id}$`));
  await expect(page.getByRole('button', { name: '本次练习已完成' })).toBeDisabled();

  await page.getByRole('button', { name: /^错题 2$/ }).click();
  await expect(page.getByRole('heading', { name: '错题本' })).toBeVisible();
  await expect(page.locator('.wrong-row')).toHaveCount(2);
  await expect(page.locator('.wrong-list')).toContainText('已选择 2 项');
  await expect(page.locator('.wrong-detail')).toContainText('事务');
  await expect(page.locator('.wrong-detail')).not.toContainText('44444444-4444-4444-8444-444444444431');

  expect(state.session).toMatchObject({
    completedCount: 5,
    correctCount: 3,
    status: 'completed',
  });
  expect(state.calls).toContain(`POST /api/practice/sessions/${state.session.id}/submit`);
  expect(runtimeErrors).toEqual([]);
});

test('student home exposes multiple sessions and browser history restores the selected practice URL', {
  tag: '@desktop',
}, async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  const state = createMockPracticeState();

  await installMockPracticeApi(page, state);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: '学生首页' })).toBeVisible();
  await expect(page.locator('.session-list .session-card')).toHaveCount(2);

  await continuePractice(page);
  await expect(page).toHaveURL(new RegExp(`/practice/${state.session.id}$`));

  await page.goBack({ waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '学生首页' })).toBeVisible();
  await expect(page.locator('.session-list .session-card')).toHaveCount(2);

  await page.goForward({ waitUntil: 'networkidle' });
  await expect(page).toHaveURL(new RegExp(`/practice/${state.session.id}$`));
  await expect(page.locator('.practice-question-card')).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test('student with temporary password must activate account before opening practice', {
  tag: '@desktop',
}, async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  const state = createMockPracticeState();
  state.passwordResetRequired = true;

  await installMockPracticeApi(page, state);
  await page.goto(`/practice/${state.session.id}`, { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/account\/password$/);
  await expect(page.getByRole('heading', { name: '首次登录需要修改临时密码' })).toBeVisible();
  await expect(page.getByText('账号：qa_student')).toBeVisible();

  await page.getByLabel('当前密码', { exact: true }).fill('temp-pass-123');
  await page.getByLabel('新密码', { exact: true }).fill('new-pass-123');
  await page.getByLabel('再次输入新密码', { exact: true }).fill('new-pass-123');
  await page.getByRole('button', { name: '完成首次改密' }).click();

  await expect(page).toHaveURL(new RegExp(`/practice/${state.session.id}$`));
  await expect(page.locator('.practice-question-card')).toBeVisible();
  expect(state.passwordResetRequired).toBe(false);
  expect(state.calls).toContain('POST /api/auth/password/change');
  expect(runtimeErrors).toEqual([]);
});

test('mobile practice and submit inspector have no horizontal overflow', {
  tag: '@mobile',
}, async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  const state = createMockPracticeState();

  await openPractice(page, state);
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: '提交前检查', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole('button', { name: '返回继续作答' })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

async function openPractice(page: Page, state: MockPracticeState) {
  await installMockPracticeApi(page, state);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: '学生练习台' })).toBeVisible();
  await expect(page.locator('.session-list .session-card')).toHaveCount(2);
  await continuePractice(page);
}

async function continuePractice(page: Page) {
  const continueButton = page.getByRole('button', { name: '继续练习：信息技术综合练习' });
  await expect(continueButton).toBeVisible();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page.locator('.practice-question-card')).toBeVisible();
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
  )).toBe(true);
}
