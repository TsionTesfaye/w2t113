/**
 * app.js — Application entry point.
 * Initializes database, seeds data, sets up routing, and boots the app shell.
 */

import { openDatabase } from './store/Database.js';
import { Router } from './router/Router.js';
import { AppShell } from './components/AppShell.js';
import authService from './services/AuthService.js';
import moderationService from './services/ModerationService.js';
import schedulerService from './services/SchedulerService.js';
import classRepository from './repositories/ClassRepository.js';
import templateRepository from './repositories/TemplateRepository.js';
import { createClass } from './models/Class.js';
import { createTemplate } from './models/Contract.js';
import { generateId, now } from './utils/helpers.js';
import { loadAppConfig } from './config/appConfig.js';
import { USER_ROLES } from './models/User.js';
import { DEMO_USERS } from './config/demoSeeds.js';

import { BootstrapPage } from './pages/BootstrapPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { RegistrationsPage } from './pages/RegistrationsPage.js';
import { QuizPage } from './pages/QuizPage.js';
import { ReviewsPage } from './pages/ReviewsPage.js';
import { ContractsPage } from './pages/ContractsPage.js';
import { AdminPage } from './pages/AdminPage.js';

const appEl = document.getElementById('app');

// Route-level RBAC configuration
const ROUTE_ROLES = {
  '/admin':         [USER_ROLES.ADMINISTRATOR],
  '/registrations': [USER_ROLES.LEARNER, USER_ROLES.INSTRUCTOR, USER_ROLES.STAFF_REVIEWER, USER_ROLES.ADMINISTRATOR],
  '/quiz':          [USER_ROLES.LEARNER, USER_ROLES.INSTRUCTOR, USER_ROLES.ADMINISTRATOR],
  '/reviews':       [USER_ROLES.LEARNER, USER_ROLES.INSTRUCTOR, USER_ROLES.STAFF_REVIEWER, USER_ROLES.ADMINISTRATOR],
  '/contracts':     [USER_ROLES.LEARNER, USER_ROLES.INSTRUCTOR, USER_ROLES.STAFF_REVIEWER, USER_ROLES.ADMINISTRATOR],
};

async function boot() {
  try {
    // 1. Open IndexedDB
    await openDatabase();

    // 2. Load config and sensitive-word dictionary
    await loadAppConfig();
    await moderationService.loadSensitiveWords();

    // 3. Check whether first-run bootstrap is needed (no users exist)
    let _bootstrapNeeded = await authService.isBootstrapNeeded();

    // Demo-seed mode: when the server injects window.__DEMO_SEED__ = true, skip the
    // bootstrap screen entirely and create all four demo accounts automatically.
    // Playwright tests and production runs start the server without DEMO_SEED so they
    // are completely unaffected — the flag is simply absent (falsy) in those environments.
    if (_bootstrapNeeded && globalThis.__DEMO_SEED__) {
      await authService.seedDemoUsers(DEMO_USERS);
      _bootstrapNeeded = false;
    }

    // 2b. Seed default classes if empty (no user dependency)
    const classCount = await classRepository.count();
    if (classCount === 0) {
      // Three active classes for immediate use after bootstrap
      const activeClasses = [
        { title: 'Introduction to Web Development', description: 'Learn HTML, CSS, and JavaScript basics.', capacity: 30, startDate: '2026-04-15', endDate: '2026-06-15' },
        { title: 'Advanced JavaScript', description: 'Deep dive into ES modules, async patterns, and frameworks.', capacity: 25, startDate: '2026-05-01', endDate: '2026-07-01' },
        { title: 'Database Fundamentals', description: 'SQL, NoSQL, and data modeling.', capacity: 20, startDate: '2026-04-20', endDate: '2026-06-20' },
      ];
      for (const c of activeClasses) {
        await classRepository.add(createClass({ id: generateId(), ...c }));
      }

      // One completed class so reviews and ratings are available once users are set up
      await classRepository.add(createClass({
        id: generateId(),
        title: 'Foundations of Training Operations (Completed)',
        description: 'A completed class available for reviews and ratings.',
        capacity: 20,
        startDate: '2026-01-10',
        endDate: '2026-03-10',
        status: 'completed',
      }));
    }

    // Seed a default contract template if none exist, so contracts are usable on first run
    const templateCount = await templateRepository.count();
    if (templateCount === 0) {
      await templateRepository.add(createTemplate({
        id: generateId(),
        name: 'Standard Training Agreement',
        content: `TRAINING ENROLLMENT AGREEMENT

This agreement is entered into between {LearnerName} ("Learner") and the training provider.

Course: {CourseName}
Start Date: {StartDate}
Completion Date: {CompletionDate}

The Learner agrees to attend all scheduled sessions, complete required assessments, and abide by the code of conduct.

Signed on {SignatureDate}.`,
        placeholders: ['{LearnerName}', '{CourseName}', '{StartDate}', '{CompletionDate}', '{SignatureDate}'],
        active: true,
        version: 1,
        effectiveDate: now(),
      }));
    }

    // 4. Check existing session
    await authService.init();

    // 5. Setup router
    const router = new Router();
    const appShell = new AppShell(router);

    // Page factory — creates fresh instances per session to ensure state isolation
    let pages = createPages(router, appShell);

    function createPages(router, appShell) {
      return {
        bootstrapPage: new BootstrapPage(router, () => { _bootstrapNeeded = false; }),
        loginPage: new LoginPage(router),
        dashboardPage: new DashboardPage(appShell),
        registrationsPage: new RegistrationsPage(appShell),
        quizPage: new QuizPage(appShell),
        reviewsPage: new ReviewsPage(appShell),
        contractsPage: new ContractsPage(appShell),
        adminPage: new AdminPage(appShell),
      };
    }

    // Reset all page instances on login/logout for state isolation
    authService.onSessionChange = () => {
      pages = createPages(router, appShell);
    };

    // Helper: ensure shell is rendered, then call page render
    const renderPage = async (page) => {
      if (!document.querySelector('.app-shell')) {
        appShell.render(appEl);
      }
      try {
        await page.render();
      } catch (err) {
        console.error('Page render error:', err);
        const container = appShell.getContentContainer();
        if (container) {
          container.innerHTML = `<div class="card"><div class="card-body">
            <p style="color:var(--color-danger)">An error occurred while loading this page.</p>
            <p style="font-size:0.85rem;color:var(--color-text-muted)">${err.message}</p>
          </div></div>`;
        }
      }
    };

    // Route guard: bootstrap mode → authentication → RBAC
    router.beforeEach((to) => {
      // Bootstrap mode: block all routes until an administrator is created
      if (_bootstrapNeeded) {
        if (to.path !== '/bootstrap') {
          router.navigate('/bootstrap');
          return false;
        }
        return true;
      }

      if (to.path !== '/login' && !authService.isAuthenticated()) {
        router.navigate('/login');
        return false;
      }
      if (to.path === '/login' && authService.isAuthenticated()) {
        router.navigate('/dashboard');
        return false;
      }

      // RBAC: check route-level role restrictions
      if (authService.isAuthenticated() && ROUTE_ROLES[to.path]) {
        const allowedRoles = ROUTE_ROLES[to.path];
        if (!authService.hasRole(...allowedRoles)) {
          router.navigate('/dashboard');
          return false;
        }
      }

      return true;
    });

    // Register routes
    router.route('/bootstrap', async () => {
      appEl.innerHTML = '';
      await pages.bootstrapPage.render(appEl);
    });

    router.route('/login', async () => {
      appEl.innerHTML = '';
      await pages.loginPage.render(appEl);
    });

    router.route('/dashboard', () => renderPage(pages.dashboardPage));
    router.route('/registrations', () => renderPage(pages.registrationsPage));
    router.route('/quiz', () => renderPage(pages.quizPage));
    router.route('/reviews', () => renderPage(pages.reviewsPage));
    router.route('/contracts', () => renderPage(pages.contractsPage));
    router.route('/admin', () => renderPage(pages.adminPage));

    router.notFound(() => {
      if (authService.isAuthenticated()) {
        router.navigate('/dashboard');
      } else {
        router.navigate('/login');
      }
    });

    // Highlight active nav link on navigation
    router.onNavigate(({ path }) => {
      document.querySelectorAll('.sidebar-nav a').forEach(a => {
        const href = a.getAttribute('href')?.replace('#', '');
        a.classList.toggle('active', href === path);
      });
    });

    // 6. Start scheduler
    schedulerService.start();

    // 7. Start router
    router.start();
  } catch (err) {
    console.error('Boot failed:', err);
    appEl.innerHTML = `<div class="loading-screen" style="color:var(--color-danger)">
      <div>
        <p>Failed to start application.</p>
        <p style="font-size:0.85rem;margin-top:8px">${err.message}</p>
      </div>
    </div>`;
  }
}

boot();
