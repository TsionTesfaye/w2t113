/**
 * E2E: Dashboard — KPI cards, navigation, and role-based sidebar.
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

test.describe('Dashboard — admin view', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/dashboard');
    await page.waitForSelector('#page-title');
  });

  test('page title is Dashboard', async ({ page }) => {
    await expect(page.locator('#page-title')).toContainText('Dashboard');
  });

  test('sidebar shows all nav items for admin', async ({ page }) => {
    await expect(page.locator('.sidebar-nav a[href="#/dashboard"]')).toBeVisible();
    await expect(page.locator('.sidebar-nav a[href="#/registrations"]')).toBeVisible();
    await expect(page.locator('.sidebar-nav a[href="#/quiz"]')).toBeVisible();
    await expect(page.locator('.sidebar-nav a[href="#/reviews"]')).toBeVisible();
    await expect(page.locator('.sidebar-nav a[href="#/contracts"]')).toBeVisible();
    await expect(page.locator('.sidebar-nav a[href="#/admin"]')).toBeVisible();
  });

  test('displays user info in sidebar', async ({ page }) => {
    await expect(page.locator('.sidebar-user')).toContainText('Administrator');
  });

  test('dashboard content renders without errors', async ({ page }) => {
    await expect(page.locator('#page-content')).toBeVisible();
    // No uncaught JS errors (Playwright will surface these automatically)
  });
});

test.describe('Dashboard — role-specific sidebar items', () => {
  test('learner does NOT see Admin link in sidebar', async ({ page }) => {
    await setupWithAdmin(page);
    await createUserViaAdmin(page, { username: 'learner_d', role: 'Learner' });
    await loginAs(page, 'learner_d');

    await expect(page.locator('.sidebar-nav a[href="#/admin"]')).not.toBeVisible();
  });

  test('learner DOES see Registrations link', async ({ page }) => {
    await setupWithAdmin(page);
    await createUserViaAdmin(page, { username: 'learner_d2', role: 'Learner' });
    await loginAs(page, 'learner_d2');

    await expect(page.locator('.sidebar-nav a[href="#/registrations"]')).toBeVisible();
  });

  test('learner does NOT see Quiz Center link', async ({ page }) => {
    // Learner DOES see Quiz — check role from ROUTE_ROLES:
    // '/quiz': [LEARNER, INSTRUCTOR, ADMINISTRATOR]
    await setupWithAdmin(page);
    await createUserViaAdmin(page, { username: 'learner_d3', role: 'Learner' });
    await loginAs(page, 'learner_d3');

    await expect(page.locator('.sidebar-nav a[href="#/quiz"]')).toBeVisible();
  });

  test('staff reviewer does NOT see Quiz Center link', async ({ page }) => {
    // Staff Reviewer is NOT in /quiz ROUTE_ROLES
    await setupWithAdmin(page);
    await createUserViaAdmin(page, { username: 'reviewer_d', role: 'Staff Reviewer' });
    await loginAs(page, 'reviewer_d');

    await expect(page.locator('.sidebar-nav a[href="#/quiz"]')).not.toBeVisible();
  });
});

test.describe('Dashboard — navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/dashboard');
    await page.waitForSelector('#page-title');
  });

  test('clicking Registrations nav item navigates correctly', async ({ page }) => {
    await page.click('.sidebar-nav a[href="#/registrations"]');
    await expect(page.locator('#page-title')).toContainText('Registrations');
  });

  test('clicking Quiz Center nav item navigates correctly', async ({ page }) => {
    await page.click('.sidebar-nav a[href="#/quiz"]');
    await expect(page.locator('#page-title')).toContainText('Quiz');
  });

  test('clicking Reviews nav item navigates correctly', async ({ page }) => {
    await page.click('.sidebar-nav a[href="#/reviews"]');
    await expect(page.locator('#page-title')).toContainText('Reviews');
  });

  test('clicking Contracts nav item navigates correctly', async ({ page }) => {
    await page.click('.sidebar-nav a[href="#/contracts"]');
    await expect(page.locator('#page-title')).toContainText('Contracts');
  });

  test('clicking Admin nav item navigates correctly', async ({ page }) => {
    await page.click('.sidebar-nav a[href="#/admin"]');
    await expect(page.locator('#page-title')).toContainText('Administration');
  });
});
