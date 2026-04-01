/**
 * BootstrapPage — first-run administrator account creation.
 * Shown when no users exist (user count === 0).
 * Blocks all other application access until an administrator is created.
 */

import authService from '../services/AuthService.js';

export class BootstrapPage {
  /**
   * @param {Router} router
   * @param {Function} [onComplete] — called after successful admin creation so the
   *   app can clear the bootstrap gate before navigating to /login.
   */
  constructor(router, onComplete) {
    this.router = router;
    this.onComplete = onComplete;
  }

  async render(container) {
    container.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <h1>TrainingOps Console</h1>
          <p class="subtitle">Initial Setup — Create Administrator Account</p>
          <div style="background:var(--color-bg-subtle,#f8f9fa);border:1px solid var(--color-border,#dee2e6);border-radius:var(--radius,6px);padding:12px 16px;margin-bottom:20px;font-size:0.875rem;line-height:1.5;">
            <strong>No accounts exist yet.</strong><br>
            Create an administrator account to get started. This account will have full access
            to manage users, classes, templates, and system configuration.
          </div>
          <form id="bootstrap-form">
            <div class="form-group">
              <label for="bs-username">Username</label>
              <input type="text" id="bs-username" class="form-control" required autocomplete="username"
                     placeholder="Choose an admin username">
            </div>
            <div class="form-group">
              <label for="bs-password">Password</label>
              <input type="password" id="bs-password" class="form-control" required autocomplete="new-password"
                     placeholder="At least 8 characters">
            </div>
            <div class="form-group">
              <label for="bs-password2">Confirm Password</label>
              <input type="password" id="bs-password2" class="form-control" required autocomplete="new-password"
                     placeholder="Repeat password">
            </div>
            <div id="bootstrap-error" class="form-error" style="margin-bottom:12px"></div>
            <button type="submit" class="btn btn-primary" style="width:100%">
              Create Administrator Account
            </button>
          </form>
        </div>
      </div>
    `;

    const form = container.querySelector('#bootstrap-form');
    const errorEl = container.querySelector('#bootstrap-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';

      const username = container.querySelector('#bs-username').value.trim();
      const password = container.querySelector('#bs-password').value;
      const password2 = container.querySelector('#bs-password2').value;

      if (!username) {
        errorEl.textContent = 'Username is required.';
        return;
      }
      if (!password || password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        return;
      }
      if (password !== password2) {
        errorEl.textContent = 'Passwords do not match.';
        return;
      }

      try {
        const result = await authService.createBootstrapAdmin(username, password);
        if (!result.success) {
          errorEl.textContent = result.error;
          return;
        }
        // Notify app that bootstrap is complete, then redirect to login
        if (this.onComplete) this.onComplete();
        this.router.navigate('/login');
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  }
}

export default BootstrapPage;
