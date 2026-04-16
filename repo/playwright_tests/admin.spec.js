/**
 * E2E: Admin panel — user management, classes, config, access control.
 */

import { test, expect } from '@playwright/test';
import { setupWithAdmin, resetApp, createBootstrapAdmin, login } from './helpers.js';

test.describe('Admin — access control', () => {
  test('non-admin role cannot reach admin content', async ({ page }) => {
    await setupWithAdmin(page);

    // Create a Learner user
    await page.goto('/#/admin');
    await page.waitForSelector('#btn-add-user');
    await page.click('#btn-add-user');
    await page.waitForSelector('#u-username');
    await page.fill('#u-username', 'learner1');
    await page.fill('#u-password', 'LearnerPass1!');
    await page.fill('#u-display', 'Test Learner');
    await page.selectOption('#u-role', 'Learner');
    await page.click('#user-form button[type="submit"]');
    await page.waitForSelector('#u-username', { state: 'hidden', timeout: 5000 });

    // Log out, log in as learner
    await page.click('#btn-logout');
    await page.fill('#username', 'learner1');
    await page.fill('#password', 'LearnerPass1!');
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#btn-logout');

    // Try to access /admin — router redirects non-admin away from the admin page
    await page.goto('/#/admin');
    // Either redirected to Dashboard or shows "Access Denied" in page content
    const title = await page.locator('#page-title').textContent();
    expect(['Dashboard', 'Access Denied']).toContain(title?.trim());

    // Admin-specific content (#btn-add-user) must NOT be visible
    await expect(page.locator('#btn-add-user')).not.toBeVisible();
  });
});

test.describe('Admin — Users tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/admin');
    await page.waitForSelector('#btn-add-user');
  });

  test('shows Users tab by default', async ({ page }) => {
    await expect(page.locator('#btn-add-user')).toBeVisible();
    // At least 1 user (admin)
    await expect(page.locator('#page-content')).toContainText('user');
  });

  test('can create a Learner user', async ({ page }) => {
    await page.click('#btn-add-user');
    await page.waitForSelector('#u-username');
    await page.fill('#u-username', 'learner_test');
    await page.fill('#u-password', 'LearnerPass1!');
    await page.fill('#u-display', 'Learner Test');
    await page.selectOption('#u-role', 'Learner');
    await page.click('#user-form button[type="submit"]');
    await page.waitForSelector('#u-username', { state: 'hidden', timeout: 5000 });
    await expect(page.locator('#page-content')).toContainText('learner_test');
  });

  test('can create a Staff Reviewer user', async ({ page }) => {
    await page.click('#btn-add-user');
    await page.waitForSelector('#u-username');
    await page.fill('#u-username', 'reviewer_test');
    await page.fill('#u-password', 'ReviewerPass1!');
    await page.fill('#u-display', 'Reviewer Test');
    await page.selectOption('#u-role', 'Staff Reviewer');
    await page.click('#user-form button[type="submit"]');
    await page.waitForSelector('#u-username', { state: 'hidden', timeout: 5000 });
    await expect(page.locator('#page-content')).toContainText('reviewer_test');
  });

  test('shows validation error for missing username', async ({ page }) => {
    await page.click('#btn-add-user');
    await page.waitForSelector('#u-password');
    await page.fill('#u-password', 'ValidPass1!');
    await page.click('#user-form button[type="submit"]');
    // Form should not close — required field validation
    await expect(page.locator('#u-username')).toBeVisible();
  });
});

test.describe('Admin — Classes tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/admin');
    await page.waitForSelector('[data-tab="classes"]');
    await page.click('[data-tab="classes"]');
    await page.waitForLoadState('networkidle');
  });

  test('shows seeded classes', async ({ page }) => {
    // 4 classes are seeded on first run
    await expect(page.locator('#page-content')).toContainText('Introduction to Web Development');
  });

  test('can add a new class', async ({ page }) => {
    await page.click('#btn-add-class');
    await page.waitForSelector('#c-title');
    await page.fill('#c-title', 'Test Class E2E');
    await page.fill('#c-desc', 'A test class created by E2E tests');
    await page.fill('#c-capacity', '15');
    await page.fill('#c-start', '2026-07-01');
    await page.fill('#c-end', '2026-09-01');
    await page.click('#class-form button[type="submit"]');
    await page.waitForSelector('#c-title', { state: 'hidden', timeout: 5000 });
    await expect(page.locator('#page-content')).toContainText('Test Class E2E');
  });
});

test.describe('Admin — System Config tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/admin');
    await page.waitForSelector('[data-tab="config"]');
    await page.click('[data-tab="config"]');
    await page.waitForLoadState('networkidle');
  });

  test('shows reputation config fields', async ({ page }) => {
    await expect(page.locator('#cfg-rep-threshold')).toBeVisible();
    await expect(page.locator('#cfg-w-fulfill')).toBeVisible();
    await expect(page.locator('#cfg-w-late')).toBeVisible();
    await expect(page.locator('#cfg-w-complaint')).toBeVisible();
  });

  test('saves valid configuration', async ({ page }) => {
    await page.fill('#cfg-rep-threshold', '65');
    await page.click('#btn-save-config');
    await expect(page.locator('#cfg-success')).toBeVisible();
  });

  test('shows error when weights do not sum to 1.0', async ({ page }) => {
    await page.fill('#cfg-w-fulfill', '0.5');
    await page.fill('#cfg-w-late', '0.5');
    await page.fill('#cfg-w-complaint', '0.5');
    await page.click('#btn-save-config');
    await expect(page.locator('#cfg-error')).toContainText('sum to 1.0');
  });

  test('shows error for out-of-range threshold', async ({ page }) => {
    await page.fill('#cfg-rep-threshold', '150');
    await page.click('#btn-save-config');
    await expect(page.locator('#cfg-error')).toContainText('between 0 and 100');
  });

  test('persists config after page reload', async ({ page }) => {
    await page.fill('#cfg-rep-threshold', '72');
    await page.click('#btn-save-config');
    await expect(page.locator('#cfg-success')).toBeVisible();

    // Reload and revisit config tab
    await page.reload();
    await page.waitForSelector('[data-tab="config"]');
    await page.click('[data-tab="config"]');
    await expect(page.locator('#cfg-rep-threshold')).toHaveValue('72');
  });
});
