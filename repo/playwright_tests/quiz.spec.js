/**
 * E2E: Quiz Center — question bank, quiz builder, quiz taking, grading.
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

test.describe('Quiz Center — access and tabs', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/quiz');
    await page.waitForSelector('.tab-btn');
  });

  test('admin sees Question Bank tab', async ({ page }) => {
    await expect(page.locator('[data-tab="questions"]')).toBeVisible();
  });

  test('admin sees Quizzes tab', async ({ page }) => {
    await expect(page.locator('[data-tab="quizzes"]')).toBeVisible();
  });

  test('admin sees Grading tab', async ({ page }) => {
    await expect(page.locator('[data-tab="grading"]')).toBeVisible();
  });

  test('Question Bank tab is active by default', async ({ page }) => {
    await expect(page.locator('[data-tab="questions"].btn-primary')).toBeVisible();
  });
});

test.describe('Quiz Center — Question Bank', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/quiz');
    await page.waitForSelector('[data-tab="questions"]');
  });

  test('shows Add Question button for admin', async ({ page }) => {
    await expect(page.locator('#btn-add-question')).toBeVisible();
  });

  test('can add a single-choice question', async ({ page }) => {
    await page.click('#btn-add-question');
    await page.waitForSelector('#q-text', { timeout: 5000 });

    await page.fill('#q-text', 'What is 2+2?');
    await page.selectOption('#q-type', 'single');
    // Options: one per line; prefix correct answer with *
    await page.fill('#q-options', '3\n*4\n5');
    await page.fill('#q-difficulty', '2');
    await page.fill('#q-tags', 'math');

    await page.click('#question-form button[type="submit"]');
    await page.waitForSelector('#q-text', { state: 'hidden', timeout: 5000 });

    await expect(page.locator('#page-content')).toContainText('What is 2+2?');
  });

  test('can add a fill-in question', async ({ page }) => {
    await page.click('#btn-add-question');
    await page.waitForSelector('#q-text');
    await page.fill('#q-text', 'The capital of France is ___.');
    await page.selectOption('#q-type', 'fill-in');
    await page.fill('#q-answer', 'Paris');
    await page.fill('#q-difficulty', '2');
    await page.fill('#q-tags', 'geography');
    await page.click('#question-form button[type="submit"]');
    await page.waitForSelector('#q-text', { state: 'hidden', timeout: 5000 });
    await expect(page.locator('#page-content')).toContainText('capital of France');
  });

  test('shows Bulk Import button', async ({ page }) => {
    await expect(page.locator('#btn-bulk-import')).toBeVisible();
  });

  test('bulk import opens a modal', async ({ page }) => {
    await page.click('#btn-bulk-import');
    await expect(page.locator('.modal')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Quiz Center — learner view', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await createUserViaAdmin(page, { username: 'learner2', role: 'Learner' });
    await loginAs(page, 'learner2');
    await page.goto('/#/quiz');
    await page.waitForSelector('.tab-btn');
  });

  test('learner sees My Results tab', async ({ page }) => {
    await expect(page.locator('[data-tab="my-results"]')).toBeVisible();
  });

  test('learner sees Wrong Questions tab', async ({ page }) => {
    await expect(page.locator('[data-tab="wrong-notebook"]')).toBeVisible();
  });

  test('learner sees Favorites tab', async ({ page }) => {
    await expect(page.locator('[data-tab="favorites"]')).toBeVisible();
  });

  test('learner does NOT see Grading tab', async ({ page }) => {
    await expect(page.locator('[data-tab="grading"]')).not.toBeVisible();
  });
});

test.describe('Quiz Center — instructor view', () => {
  test.beforeEach(async ({ page }) => {
    await setupWithAdmin(page);
    await createUserViaAdmin(page, { username: 'instructor1', role: 'Instructor' });
    await loginAs(page, 'instructor1');
    await page.goto('/#/quiz');
    await page.waitForSelector('.tab-btn');
  });

  test('instructor sees Grading tab', async ({ page }) => {
    await expect(page.locator('[data-tab="grading"]')).toBeVisible();
  });

  test('instructor sees Question Bank', async ({ page }) => {
    await expect(page.locator('[data-tab="questions"]')).toBeVisible();
  });
});
