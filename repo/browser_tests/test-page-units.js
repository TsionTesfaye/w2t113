/**
 * Page unit tests — real page classes tested via MinimalElement DOM simulation.
 * Covers: LoginPage, BootstrapPage form rendering and validation paths.
 *
 * Only validation paths (returning before any await authService call) are tested
 * here. Auth-service success/failure paths are covered in unit_tests/test-coverage-gaps.js.
 */

import { installBrowserEnv, resetBrowserEnv } from './browser-env.js';
import { describe, it, assert, assertEqual } from '../test-helpers.js';
import { LoginPage } from '../src/pages/LoginPage.js';
import { BootstrapPage } from '../src/pages/BootstrapPage.js';

export async function runPageUnitTests() {

  // ================================================================
  // LoginPage
  // ================================================================

  await describe('LoginPage: render', async () => {
    await it('renders login form with required elements', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new LoginPage({ navigate: () => {}, getCurrentPath: () => '/login' });
      await page.render(container);
      assert(container._innerHTML.includes('id="login-form"'), 'login-form rendered');
      assert(container._innerHTML.includes('id="username"'), 'username input rendered');
      assert(container._innerHTML.includes('id="password"'), 'password input rendered');
      assert(container._innerHTML.includes('id="login-error"'), 'error element rendered');
      resetBrowserEnv();
    });

    await it('renders Sign In button', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new LoginPage({ navigate: () => {} });
      await page.render(container);
      assert(container._innerHTML.includes('Sign In'), 'Sign In button present');
      resetBrowserEnv();
    });

    await it('renders page title', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new LoginPage({ navigate: () => {} });
      await page.render(container);
      assert(container._innerHTML.includes('TrainingOps Console'), 'page title present');
      resetBrowserEnv();
    });
  });

  await describe('LoginPage: form validation', async () => {
    await it('shows error when both username and password are empty', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new LoginPage({ navigate: () => {} });
      await page.render(container);

      const form = container.querySelector('#login-form');
      const errorEl = container.querySelector('#login-error');
      assertEqual(errorEl.textContent, '', 'no error initially');

      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assertEqual(errorEl.textContent, 'Please enter both username and password.', 'validation error shown');
      resetBrowserEnv();
    });

    await it('shows error when username is empty but password is set', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new LoginPage({ navigate: () => {} });
      await page.render(container);

      const form = container.querySelector('#login-form');
      const errorEl = container.querySelector('#login-error');
      const passwordEl = container.querySelector('#password');

      passwordEl.value = 'somepassword';
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assertEqual(errorEl.textContent, 'Please enter both username and password.');
      resetBrowserEnv();
    });

    await it('shows error when username is set but password is empty', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new LoginPage({ navigate: () => {} });
      await page.render(container);

      const form = container.querySelector('#login-form');
      const errorEl = container.querySelector('#login-error');
      const usernameEl = container.querySelector('#username');

      usernameEl.value = 'user1';
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assertEqual(errorEl.textContent, 'Please enter both username and password.');
      resetBrowserEnv();
    });

    await it('shows error when username is only whitespace', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new LoginPage({ navigate: () => {} });
      await page.render(container);

      const form = container.querySelector('#login-form');
      const errorEl = container.querySelector('#login-error');
      const usernameEl = container.querySelector('#username');
      const passwordEl = container.querySelector('#password');

      usernameEl.value = '   ';
      passwordEl.value = 'pass';
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assertEqual(errorEl.textContent, 'Please enter both username and password.', 'whitespace-only username rejected');
      resetBrowserEnv();
    });

    await it('clears previous error on new submit attempt', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new LoginPage({ navigate: () => {} });
      await page.render(container);

      const form = container.querySelector('#login-form');
      const errorEl = container.querySelector('#login-error');

      // First submit — triggers error
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assert(errorEl.textContent !== '', 'error set');

      // Second submit — error is cleared first (even if same validation fails)
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      // Error is re-set to the validation message, not stale
      assertEqual(errorEl.textContent, 'Please enter both username and password.');
      resetBrowserEnv();
    });

    await it('calls preventDefault on form submit', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new LoginPage({ navigate: () => {} });
      await page.render(container);

      const form = container.querySelector('#login-form');
      let defaultPrevented = false;
      form.dispatchEvent({ type: 'submit', preventDefault: () => { defaultPrevented = true; } });
      assert(defaultPrevented, 'preventDefault called');
      resetBrowserEnv();
    });
  });

  // ================================================================
  // BootstrapPage
  // ================================================================

  await describe('BootstrapPage: render', async () => {
    await it('renders bootstrap form with required elements', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);
      assert(container._innerHTML.includes('id="bootstrap-form"'), 'bootstrap-form rendered');
      assert(container._innerHTML.includes('id="bs-username"'), 'bs-username rendered');
      assert(container._innerHTML.includes('id="bs-password"'), 'bs-password rendered');
      assert(container._innerHTML.includes('id="bs-password2"'), 'bs-password2 rendered');
      assert(container._innerHTML.includes('id="bootstrap-error"'), 'error element rendered');
      resetBrowserEnv();
    });

    await it('renders page title', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);
      assert(container._innerHTML.includes('TrainingOps Console'), 'title present');
      assert(container._innerHTML.includes('Initial Setup'), 'subtitle present');
      resetBrowserEnv();
    });

    await it('renders Create Administrator Account button', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);
      assert(container._innerHTML.includes('Create Administrator Account'), 'submit button present');
      resetBrowserEnv();
    });
  });

  await describe('BootstrapPage: form validation', async () => {
    await it('shows error when username is empty', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);

      const form = container.querySelector('#bootstrap-form');
      const errorEl = container.querySelector('#bootstrap-error');

      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assertEqual(errorEl.textContent, 'Username is required.');
      resetBrowserEnv();
    });

    await it('shows error when password is too short', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);

      const form = container.querySelector('#bootstrap-form');
      const errorEl = container.querySelector('#bootstrap-error');
      const usernameEl = container.querySelector('#bs-username');
      const passwordEl = container.querySelector('#bs-password');

      usernameEl.value = 'adminuser';
      passwordEl.value = 'short'; // less than 8 chars
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assertEqual(errorEl.textContent, 'Password must be at least 8 characters.');
      resetBrowserEnv();
    });

    await it('shows error when password is empty', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);

      const form = container.querySelector('#bootstrap-form');
      const errorEl = container.querySelector('#bootstrap-error');
      const usernameEl = container.querySelector('#bs-username');

      usernameEl.value = 'adminuser';
      // password left empty
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assertEqual(errorEl.textContent, 'Password must be at least 8 characters.');
      resetBrowserEnv();
    });

    await it('shows error when passwords do not match', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);

      const form = container.querySelector('#bootstrap-form');
      const errorEl = container.querySelector('#bootstrap-error');
      const usernameEl = container.querySelector('#bs-username');
      const passwordEl = container.querySelector('#bs-password');
      const password2El = container.querySelector('#bs-password2');

      usernameEl.value = 'adminuser';
      passwordEl.value = 'longpassword1';
      password2El.value = 'longpassword2'; // mismatch
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assertEqual(errorEl.textContent, 'Passwords do not match.');
      resetBrowserEnv();
    });

    await it('shows no error before submit', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);
      const errorEl = container.querySelector('#bootstrap-error');
      assertEqual(errorEl.textContent, '', 'error is empty before any submit');
      resetBrowserEnv();
    });

    await it('clears error on each new submit', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);

      const form = container.querySelector('#bootstrap-form');
      const errorEl = container.querySelector('#bootstrap-error');

      // First: username empty → error
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assert(errorEl.textContent !== '', 'first error shown');

      // Second: still fails but error is fresh (was reset then set again)
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assertEqual(errorEl.textContent, 'Username is required.', 'error reset and re-set correctly');
      resetBrowserEnv();
    });

    await it('calls preventDefault on submit', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);

      const form = container.querySelector('#bootstrap-form');
      let prevented = false;
      form.dispatchEvent({ type: 'submit', preventDefault: () => { prevented = true; } });
      assert(prevented, 'preventDefault called');
      resetBrowserEnv();
    });

    await it('validates username exact whitespace trimming', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);

      const form = container.querySelector('#bootstrap-form');
      const errorEl = container.querySelector('#bootstrap-error');
      const usernameEl = container.querySelector('#bs-username');

      usernameEl.value = '   '; // whitespace only
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assertEqual(errorEl.textContent, 'Username is required.', 'whitespace-only username rejected');
      resetBrowserEnv();
    });

    await it('checks password minimum 8 characters exactly', async () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const page = new BootstrapPage({ navigate: () => {} }, null);
      await page.render(container);

      const form = container.querySelector('#bootstrap-form');
      const errorEl = container.querySelector('#bootstrap-error');
      const usernameEl = container.querySelector('#bs-username');
      const passwordEl = container.querySelector('#bs-password');

      usernameEl.value = 'adminuser';
      passwordEl.value = '1234567'; // exactly 7 chars — one short of minimum
      form.dispatchEvent({ type: 'submit', preventDefault: () => {} });
      assertEqual(errorEl.textContent, 'Password must be at least 8 characters.', '7 chars rejected');
      resetBrowserEnv();
    });
  });
}
