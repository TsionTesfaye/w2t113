/**
 * E2E: Reviews & Q&A — review submission, ratings, Q&A, moderation tabs.
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

test.describe('Reviews page — tabs visible by role', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/reviews');
    await page.waitForSelector('.tab-btn');
  });

  test('admin sees Reviews tab', async ({ page }) => {
    await expect(page.locator('[data-tab="reviews"]')).toBeVisible();
  });

  test('admin sees Q&A tab', async ({ page }) => {
    await expect(page.locator('[data-tab="qa"]')).toBeVisible();
  });

  test('admin sees Ratings tab', async ({ page }) => {
    await expect(page.locator('[data-tab="ratings"]')).toBeVisible();
  });

  test('admin sees Favorites tab', async ({ page }) => {
    await expect(page.locator('[data-tab="favorites"]')).toBeVisible();
  });

  test('admin sees History tab', async ({ page }) => {
    await expect(page.locator('[data-tab="history"]')).toBeVisible();
  });

  test('admin sees Moderation tab', async ({ page }) => {
    await expect(page.locator('[data-tab="moderation"]')).toBeVisible();
  });

  test('admin sees Appeals tab', async ({ page }) => {
    await expect(page.locator('[data-tab="appeals"]')).toBeVisible();
  });
});

test.describe('Reviews — learner view', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await createUserViaAdmin(page, { username: 'learner3', role: 'Learner' });
    await loginAs(page, 'learner3');
    await page.goto('/#/reviews');
    await page.waitForSelector('.tab-btn');
  });

  test('learner sees Reviews tab', async ({ page }) => {
    await expect(page.locator('[data-tab="reviews"]')).toBeVisible();
  });

  test('learner does NOT see Moderation tab', async ({ page }) => {
    await expect(page.locator('[data-tab="moderation"]')).not.toBeVisible();
  });

  test('learner does NOT see Appeals tab', async ({ page }) => {
    await expect(page.locator('[data-tab="appeals"]')).not.toBeVisible();
  });
});

test.describe('Reviews — moderation visible to staff reviewer', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await createUserViaAdmin(page, { username: 'reviewer2', role: 'Staff Reviewer' });
    await loginAs(page, 'reviewer2');
    await page.goto('/#/reviews');
    await page.waitForSelector('.tab-btn');
  });

  test('staff reviewer sees Moderation tab', async ({ page }) => {
    await expect(page.locator('[data-tab="moderation"]')).toBeVisible();
  });

  test('staff reviewer sees Appeals tab', async ({ page }) => {
    await expect(page.locator('[data-tab="appeals"]')).toBeVisible();
  });
});

test.describe('Reviews — tab navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/reviews');
    await page.waitForSelector('.tab-btn');
  });

  test('clicking Q&A tab switches content', async ({ page }) => {
    await page.click('[data-tab="qa"]');
    await expect(page.locator('[data-tab="qa"].btn-primary')).toBeVisible();
    await expect(page.locator('#tab-content')).toBeVisible();
  });

  test('clicking Ratings tab switches content', async ({ page }) => {
    await page.click('[data-tab="ratings"]');
    await expect(page.locator('[data-tab="ratings"].btn-primary')).toBeVisible();
  });

  test('clicking Moderation tab renders moderation content', async ({ page }) => {
    await page.click('[data-tab="moderation"]');
    await expect(page.locator('[data-tab="moderation"].btn-primary')).toBeVisible();
    await expect(page.locator('#tab-content')).toBeVisible();
  });
});

test.describe('Reviews — new review form', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/reviews');
    await page.waitForSelector('[data-tab="reviews"]');
  });

  test('New Review button is visible', async ({ page }) => {
    await expect(page.locator('#btn-new-review')).toBeVisible();
  });

  test('clicking New Review opens a modal', async ({ page }) => {
    await page.click('#btn-new-review');
    await expect(page.locator('.modal')).toBeVisible({ timeout: 5000 });
  });
});
