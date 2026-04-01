/**
 * LoginPage — user login form with validation.
 */

import authService from '../services/AuthService.js';
import Toast from '../components/Toast.js';

export class LoginPage {
  constructor(router) {
    this.router = router;
  }

  async render(container) {
    container.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <h1>TrainingOps Console</h1>
          <p class="subtitle">Sign in to your account</p>
          <form id="login-form">
            <div class="form-group">
              <label for="username">Username</label>
              <input type="text" id="username" class="form-control" required autocomplete="username">
            </div>
            <div class="form-group">
              <label for="password">Password</label>
              <input type="password" id="password" class="form-control" required autocomplete="current-password">
            </div>
            <div id="login-error" class="form-error" style="margin-bottom:12px"></div>
            <button type="submit" class="btn btn-primary" style="width:100%">Sign In</button>
          </form>
          <div style="margin-top:16px;font-size:0.8rem;color:var(--color-text-muted)">
            <p>Sign in with your assigned credentials.</p>
          </div>
        </div>
      </div>
    `;

    const form = container.querySelector('#login-form');
    const errorEl = container.querySelector('#login-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';

      const username = container.querySelector('#username').value.trim();
      const password = container.querySelector('#password').value;

      if (!username || !password) {
        errorEl.textContent = 'Please enter both username and password.';
        return;
      }

      const result = await authService.login(username, password);
      if (result.success) {
        Toast.success(`Welcome, ${result.user.displayName}!`);
        this.router.navigate('/dashboard');
      } else {
        errorEl.textContent = result.error;
      }
    });
  }
}

export default LoginPage;
