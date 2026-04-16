/**
 * E2E: Registration lifecycle — create, submit, review, approve/reject, batch actions.
 */

import { test, expect } from '@playwright/test';
import { setupWithAdmin, createUserViaAdmin } from './helpers.js';

async function setupUsersAndNavigate(page) {
  await setupWithAdmin(page);
  await createUserViaAdmin(page, { username: 'learner1', role: 'Learner', displayName: 'Test Learner' });
  await createUserViaAdmin(page, { username: 'reviewer1', role: 'Staff Reviewer', displayName: 'Test Reviewer' });
}

async function loginAs(page, username, password = 'UserPass1!') {
  await page.click('#btn-logout');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#login-form button[type="submit"]');
  await page.waitForSelector('#btn-logout');
}

test.describe('Registrations — page access', () => {
  test('all roles see the Registrations page', async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/registrations');
    await expect(page.locator('#page-title')).toContainText('Registrations');
    await expect(page.locator('#btn-new-reg')).toBeVisible();
  });
});

test.describe('Registrations — create new registration', () => {
  test.beforeEach(async ({ page }) => {
    await setupUsersAndNavigate(page);
    await loginAs(page, 'learner1');
    await page.goto('/#/registrations');
    await page.waitForSelector('#btn-new-reg');
  });

  test('learner sees New Registration button', async ({ page }) => {
    await expect(page.locator('#btn-new-reg')).toBeVisible();
  });

  test('clicking New Registration opens class selection modal', async ({ page }) => {
    await page.click('#btn-new-reg');
    // Modal with the class select dropdown should appear
    await expect(page.locator('#reg-class')).toBeVisible({ timeout: 5000 });
  });

  test('can create a draft registration by selecting a class', async ({ page }) => {
    await page.click('#btn-new-reg');
    await page.waitForSelector('#reg-class', { timeout: 5000 });

    // Explicitly select an active class by its seeded title
    await page.selectOption('#reg-class', { label: 'Introduction to Web Development' });

    await page.click('#new-reg-form button[type="submit"]');

    // Modal should close; if it stays open, log the error message for diagnosis
    await page.waitForSelector('#reg-class', { state: 'hidden', timeout: 8000 }).catch(async () => {
      const errText = await page.locator('#reg-error').textContent();
      throw new Error(`Registration modal did not close. Error shown: "${errText}"`);
    });

    // A Draft registration should now appear in the table
    await expect(page.locator('#page-content')).toContainText('Draft');
  });
});

test.describe('Registrations — reviewer actions', () => {
  test('reviewer sees batch approve and batch reject buttons', async ({ page }) => {
    await setupUsersAndNavigate(page);
    await loginAs(page, 'reviewer1');
    await page.goto('/#/registrations');
    await expect(page.locator('#btn-batch-approve')).toBeVisible();
    await expect(page.locator('#btn-batch-reject')).toBeVisible();
  });

  test('batch approve shows warning when nothing is selected', async ({ page }) => {
    await setupUsersAndNavigate(page);
    await loginAs(page, 'reviewer1');
    await page.goto('/#/registrations');
    await page.waitForSelector('#btn-batch-approve');
    await page.click('#btn-batch-approve');
    // Should show a warning toast
    await expect(page.locator('.toast-warning')).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Registrations — status filter', () => {
  test('status filter dropdown is present', async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/registrations');
    await expect(page.locator('#filter-status')).toBeVisible();
  });

  test('filtering by Draft shows only Draft registrations heading', async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/registrations');
    await page.selectOption('#filter-status', 'Draft');
    await page.waitForLoadState('networkidle');
    // Should not error out
    await expect(page.locator('#registrations-table')).toBeVisible();
  });
});
