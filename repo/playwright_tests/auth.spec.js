/**
 * E2E: Authentication flows — bootstrap, login, logout, route protection.
 */

import { test, expect } from '@playwright/test';
import { resetApp, createBootstrapAdmin, login, setupWithAdmin } from './helpers.js';

test.describe('Bootstrap — first-run admin creation', () => {
  test('shows bootstrap form when no users exist', async ({ page }) => {
    await resetApp(page);
    await expect(page.locator('#bootstrap-form')).toBeVisible();
    await expect(page.locator('h1')).toContainText('TrainingOps Console');
  });

  test('validates blank username (whitespace only)', async ({ page }) => {
    await resetApp(page);
    // Fill whitespace-only username — JS trims it and rejects it
    await page.fill('#bs-username', '   ');
    await page.fill('#bs-password', 'Password1!');
    await page.fill('#bs-password2', 'Password1!');
    await page.click('#bootstrap-form button[type="submit"]');
    await expect(page.locator('#bootstrap-error')).toContainText('Username is required');
  });

  test('validates password too short', async ({ page }) => {
    await resetApp(page);
    await page.fill('#bs-username', 'admin');
    await page.fill('#bs-password', 'short');
    await page.fill('#bs-password2', 'short');
    await page.click('#bootstrap-form button[type="submit"]');
    await expect(page.locator('#bootstrap-error')).toContainText('at least 8 characters');
  });

  test('validates passwords do not match', async ({ page }) => {
    await resetApp(page);
    await page.fill('#bs-username', 'admin');
    await page.fill('#bs-password', 'Password1!');
    await page.fill('#bs-password2', 'Different1!');
    await page.click('#bootstrap-form button[type="submit"]');
    await expect(page.locator('#bootstrap-error')).toContainText('do not match');
  });

  test('creates admin and redirects to login', async ({ page }) => {
    await resetApp(page);
    await createBootstrapAdmin(page);
    await expect(page.locator('#login-form')).toBeVisible();
  });

  test('bootstrap screen never reappears after admin is created', async ({ page }) => {
    await resetApp(page);
    await createBootstrapAdmin(page);
    await page.goto('/');
    // Should go to login, not bootstrap
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#bootstrap-form')).not.toBeVisible();
  });
});

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await createBootstrapAdmin(page);
  });

  test('shows login form after bootstrap', async ({ page }) => {
    await expect(page.locator('#login-form')).toBeVisible();
  });

  test('shows error for wrong password', async ({ page }) => {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'wrongpassword');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-error')).not.toBeEmpty();
  });

  test('shows error for unknown username', async ({ page }) => {
    await page.fill('#username', 'nobody');
    await page.fill('#password', 'AdminPass1!');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#login-error')).toBeVisible();
  });

  test('shows error when username is whitespace only', async ({ page }) => {
    // Whitespace-only username passes HTML required, but JS rejects it
    await page.fill('#username', '   ');
    await page.fill('#password', 'anything');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#login-error')).toContainText('username and password');
  });

  test('successful login shows authenticated shell', async ({ page }) => {
    await login(page);
    await expect(page.locator('#btn-logout')).toBeVisible();
    await expect(page.locator('.sidebar-nav')).toBeVisible();
  });

  test('successful login lands on dashboard', async ({ page }) => {
    await login(page);
    await expect(page.locator('#page-title')).toContainText('Dashboard');
  });
});

test.describe('Logout', () => {
  test('logout redirects to login page', async ({ page }) => {
    await setupWithAdmin(page);
    await page.click('#btn-logout');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#btn-logout')).not.toBeVisible();
  });
});

test.describe('Route protection', () => {
  test('unauthenticated access to /registrations redirects to login', async ({ page }) => {
    await resetApp(page);
    await createBootstrapAdmin(page);
    // Force navigate to a protected route without logging in
    await page.goto('/#/registrations');
    await expect(page.locator('#login-form')).toBeVisible();
  });

  test('unauthenticated access to /admin redirects to login', async ({ page }) => {
    await resetApp(page);
    await createBootstrapAdmin(page);
    await page.goto('/#/admin');
    await expect(page.locator('#login-form')).toBeVisible();
  });

  test('unauthenticated access to /quiz redirects to login', async ({ page }) => {
    await resetApp(page);
    await createBootstrapAdmin(page);
    await page.goto('/#/quiz');
    await expect(page.locator('#login-form')).toBeVisible();
  });

  test('admin can access /admin route', async ({ page }) => {
    await setupWithAdmin(page);
    await page.goto('/#/admin');
    await expect(page.locator('#page-title')).toContainText('Administration');
  });
});
