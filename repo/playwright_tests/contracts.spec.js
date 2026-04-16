/**
 * E2E: Contracts — generate, sign, export, templates management.
 */

import { test, expect } from '@playwright/test';
import { setupWithAdmin, createUserViaAdmin } from './helpers.js';

async function loginAs(page, username, password = 'UserPass1!') {
  await page.click('#btn-logout');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#login-form button[type="submit"]');
  await page.waitForSelector('#btn-logout');
}

test.describe('Contracts page — access and layout', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/contracts');
    await page.waitForSelector('.tab-btn');
  });

  test('admin sees Contracts tab', async ({ page }) => {
    await expect(page.locator('[data-tab="contracts"]')).toBeVisible();
  });

  test('admin sees Templates tab', async ({ page }) => {
    await expect(page.locator('[data-tab="templates"]')).toBeVisible();
  });

  test('page title is Contracts', async ({ page }) => {
    await expect(page.locator('#page-title')).toContainText('Contracts');
  });
});

test.describe('Contracts — generate contract', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/contracts');
    await page.waitForSelector('#btn-new-contract');
  });

  test('Generate Contract button is visible', async ({ page }) => {
    await expect(page.locator('#btn-new-contract')).toBeVisible();
  });

  test('clicking Generate Contract opens a modal', async ({ page }) => {
    await page.click('#btn-new-contract');
    await expect(page.locator('.modal')).toBeVisible({ timeout: 5000 });
  });

  test('can generate a contract from the standard template', async ({ page }) => {
    await page.click('#btn-new-contract');
    await page.waitForSelector('#g-template', { timeout: 5000 });

    // The standard template is already selected; fill placeholder inputs if any
    const inputs = page.locator('#g-vars input[type="text"]');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      await inputs.nth(i).fill(`TestValue${i + 1}`);
    }

    await page.click('#gen-form button[type="submit"]');
    // Modal should close after successful generation
    await page.waitForSelector('#g-template', { state: 'hidden', timeout: 8000 });

    // Contract count should now be at least 1
    await expect(page.locator('#page-content')).toContainText('contract');
  });
});

test.describe('Contracts — learner sees contracts but not templates', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await createUserViaAdmin(page, { username: 'learner_c', role: 'Learner' });
    await loginAs(page, 'learner_c');
    await page.goto('/#/contracts');
    await page.waitForSelector('[data-tab="contracts"]');
  });

  test('learner sees Contracts tab', async ({ page }) => {
    await expect(page.locator('[data-tab="contracts"]')).toBeVisible();
  });

  test('learner does NOT see Templates tab', async ({ page }) => {
    await expect(page.locator('[data-tab="templates"]')).not.toBeVisible();
  });
});

test.describe('Contracts — templates management (admin only)', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/contracts');
    await page.waitForSelector('[data-tab="templates"]');
    await page.click('[data-tab="templates"]');
    await page.waitForLoadState('networkidle');
  });

  test('shows seeded standard template', async ({ page }) => {
    await expect(page.locator('#tab-content')).toContainText('Standard Training Agreement');
  });

  test('New Template button is visible', async ({ page }) => {
    await expect(page.locator('#btn-new-template')).toBeVisible();
  });

  test('can add a new template', async ({ page }) => {
    await page.click('#btn-new-template');
    await page.waitForSelector('#tpl-name', { timeout: 5000 });
    await page.fill('#tpl-name', 'E2E Test Template');
    await page.fill('#tpl-content', 'This is a test template for {LearnerName}.');

    await page.click('#tpl-form button[type="submit"]');
    await page.waitForSelector('#tpl-name', { state: 'hidden', timeout: 5000 });
    await expect(page.locator('#tab-content')).toContainText('E2E Test Template');
  });
});
