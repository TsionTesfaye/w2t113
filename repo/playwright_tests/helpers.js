/**
 * Shared helpers for Playwright E2E tests.
 */

/**
 * Clear all browser storage (IndexedDB + localStorage + sessionStorage).
 * Call this while a page is already loaded on the app origin so IndexedDB
 * is accessible.
 */
export async function clearAppStorage(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('trainingops');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
}

/**
 * Navigate to the app root and wipe all storage, then reload so the app
 * starts completely fresh (bootstrap mode).
 */
export async function resetApp(page) {
  await page.goto('/');
  await clearAppStorage(page);
  await page.reload();
  // Wait for the app to finish initialising
  await page.waitForSelector('#bootstrap-form, #login-form', { timeout: 10000 });
}

/**
 * Complete the first-run bootstrap to create the admin account.
 * Assumes the page is already showing the bootstrap form.
 */
export async function createBootstrapAdmin(page, { username = 'admin', password = 'AdminPass1!' } = {}) {
  await page.waitForSelector('#bootstrap-form', { timeout: 8000 });
  await page.fill('#bs-username', username);
  await page.fill('#bs-password', password);
  await page.fill('#bs-password2', password);
  await page.click('#bootstrap-form button[type="submit"]');
  await page.waitForSelector('#login-form', { timeout: 8000 });
}

/**
 * Submit the login form with the given credentials.
 * Waits until the sidebar (authenticated shell) is visible.
 */
export async function login(page, { username = 'admin', password = 'AdminPass1!' } = {}) {
  await page.waitForSelector('#login-form', { timeout: 8000 });
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#login-form button[type="submit"]');
  await page.waitForSelector('#btn-logout', { timeout: 8000 });
}

/**
 * Full setup: reset storage, bootstrap admin, and log in as admin.
 * Returns the credentials used.
 */
export async function setupWithAdmin(page, creds = {}) {
  const c = { username: 'admin', password: 'AdminPass1!', ...creds };
  await resetApp(page);
  await createBootstrapAdmin(page, c);
  await login(page, c);
  return c;
}

/**
 * Create a user via the Admin → Users tab UI.
 * Assumes the user is already logged in as an administrator.
 */
export async function createUserViaAdmin(page, { username, password = 'UserPass1!', role, displayName = '' }) {
  await page.goto('/#/admin');
  await page.waitForSelector('#btn-add-user', { timeout: 8000 });
  await page.click('#btn-add-user');

  await page.waitForSelector('#u-username', { timeout: 5000 });
  await page.fill('#u-username', username);
  await page.fill('#u-password', password);
  await page.fill('#u-display', displayName || username);

  // Select the role in the dropdown
  await page.selectOption('#u-role', role);
  await page.click('#user-form button[type="submit"]');

  // Wait for modal to close (toast appears)
  await page.waitForSelector('#u-username', { state: 'hidden', timeout: 5000 });
}

/**
 * Navigate via sidebar link by href fragment.
 */
export async function navigateTo(page, path) {
  await page.click(`.sidebar-nav a[href="#${path}"]`);
  await page.waitForLoadState('networkidle');
}
