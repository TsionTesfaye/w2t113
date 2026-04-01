/**
 * AppShell — main layout with sidebar navigation and content area.
 */

import authService from '../services/AuthService.js';
import { USER_ROLES } from '../models/User.js';
import { escapeHtml } from '../utils/helpers.js';

const NAV_ITEMS = [
  { path: '/dashboard',     label: 'Dashboard',     icon: '&#9632;', roles: null }, // all roles
  { path: '/registrations', label: 'Registrations',  icon: '&#9998;', roles: null },
  { path: '/quiz',          label: 'Quiz Center',    icon: '&#9733;', roles: null },
  { path: '/reviews',       label: 'Reviews & Q&A',  icon: '&#9825;', roles: null },
  { path: '/contracts',     label: 'Contracts',       icon: '&#9997;', roles: null },
  { path: '/admin',         label: 'Admin',           icon: '&#9881;', roles: [USER_ROLES.ADMINISTRATOR] },
];

export class AppShell {
  constructor(router) {
    this.router = router;
  }

  render(container) {
    const user = authService.getCurrentUser();
    if (!user) return;

    const currentPath = this.router.getCurrentPath();
    const filteredNav = NAV_ITEMS.filter(item =>
      !item.roles || item.roles.includes(user.role)
    );

    container.innerHTML = `
      <div id="sidebar-overlay" class="sidebar-overlay"></div>
      <div class="app-shell">
        <nav class="sidebar" id="sidebar">
          <div class="sidebar-brand">TrainingOps</div>
          <ul class="sidebar-nav">
            ${filteredNav.map(item => `
              <li>
                <a href="#${item.path}" class="${currentPath === item.path ? 'active' : ''}">
                  <span>${item.icon}</span>
                  ${item.label}
                </a>
              </li>
            `).join('')}
          </ul>
          <div class="sidebar-user">
            <span>${escapeHtml(user.displayName)} (${escapeHtml(user.role)})</span>
            <button class="btn btn-sm btn-secondary" id="btn-logout">Logout</button>
          </div>
        </nav>
        <main class="main-content">
          <header class="main-header">
            <div style="display:flex;align-items:center;gap:12px">
              <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle navigation">&#9776;</button>
              <h1 id="page-title"></h1>
            </div>
            <div id="header-actions"></div>
          </header>
          <div class="page-content" id="page-content">
          </div>
        </main>
      </div>
    `;

    // Sidebar toggle (hamburger) — mobile only
    const sidebar = container.querySelector('#sidebar');
    const overlay = container.querySelector('#sidebar-overlay');
    const toggle = container.querySelector('#sidebar-toggle');

    const openSidebar = () => { sidebar.classList.add('open'); overlay.classList.add('visible'); };
    const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('visible'); };

    toggle.addEventListener('click', () => {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
    overlay.addEventListener('click', closeSidebar);
    // Close sidebar on nav link click (mobile)
    sidebar.querySelectorAll('.sidebar-nav a').forEach(a => {
      a.addEventListener('click', closeSidebar);
    });

    container.querySelector('#btn-logout').addEventListener('click', async () => {
      await authService.logout();
      this.router.navigate('/login');
    });
  }

  /**
   * Get the page content container (where pages render into).
   */
  getContentContainer() {
    return document.getElementById('page-content');
  }

  /**
   * Set the page title in the header.
   */
  setPageTitle(title) {
    const el = document.getElementById('page-title');
    if (el) el.textContent = title;
  }
}

export default AppShell;
