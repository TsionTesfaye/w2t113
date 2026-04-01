/**
 * Route-Level Enforcement Tests — verifies protected routes are blocked
 * BEFORE any rendering occurs, using the real Router class.
 * No protected content should ever appear in DOM, even briefly.
 */

import { installBrowserEnv, resetBrowserEnv } from './browser-env.js';
import { describe, it, assert, assertEqual } from '../test-helpers.js';
import { USER_ROLES } from '../src/models/User.js';
import { Router } from '../src/router/Router.js';

export async function runRouteEnforcementTests() {

  // ============================================================
  // 1. NO FLASH OF PROTECTED CONTENT
  // ============================================================

  await describe('Route enforcement: no flash of protected content', async () => {
    await it('blocked route handler never writes to DOM container', async () => {
      installBrowserEnv();
      const router = new Router();
      const appEl = globalThis.document.getElementById('app');

      router.beforeEach((to) => {
        if (to.path === '/admin') return false;
        return true;
      });

      router.route('/admin', () => {
        appEl.innerHTML = '<h1>ADMIN SECRETS</h1><table><tr><td>All Users</td></tr></table>';
      });

      globalThis.location.hash = '#/admin';
      await new Promise(r => setTimeout(r, 10));

      assert(!appEl.innerHTML.includes('ADMIN SECRETS'), 'No admin content in DOM');
      assert(!appEl.innerHTML.includes('All Users'), 'No user table in DOM');
      resetBrowserEnv();
    });

    await it('blocked route does not trigger onNavigate callback', async () => {
      installBrowserEnv();
      const router = new Router();
      const navigatedPaths = [];

      router.beforeEach((to) => {
        if (to.path === '/admin') return false;
        return true;
      });

      router.route('/admin', () => {});
      router.onNavigate(({ path }) => { navigatedPaths.push(path); });

      globalThis.location.hash = '#/admin';
      await new Promise(r => setTimeout(r, 10));

      assert(!navigatedPaths.includes('/admin'), 'onNavigate must not fire for blocked routes');
      resetBrowserEnv();
    });
  });

  // ============================================================
  // 2. EVERY ROLE × ROUTE PERMUTATION
  // ============================================================

  await describe('Route enforcement: role × route permutation matrix', async () => {
    const ROUTE_ROLES = { '/admin': [USER_ROLES.ADMINISTRATOR] };
    const ALL_ROUTES = ['/dashboard', '/registrations', '/quiz', '/reviews', '/contracts', '/admin'];
    const ALL_ROLES = [USER_ROLES.LEARNER, USER_ROLES.INSTRUCTOR, USER_ROLES.STAFF_REVIEWER, USER_ROLES.ADMINISTRATOR];

    for (const role of ALL_ROLES) {
      await it(`role ${role}: /admin ${role === USER_ROLES.ADMINISTRATOR ? 'allowed' : 'blocked'}`, async () => {
        installBrowserEnv();
        const router = new Router();
        let rendered = null;

        router.beforeEach((to) => {
          if (ROUTE_ROLES[to.path] && !ROUTE_ROLES[to.path].includes(role)) {
            router.navigate('/dashboard');
            return false;
          }
          return true;
        });

        router.route('/admin', () => { rendered = '/admin'; });
        router.route('/dashboard', () => { rendered = '/dashboard'; });

        globalThis.location.hash = '#/admin';
        await new Promise(r => setTimeout(r, 10));

        if (role === USER_ROLES.ADMINISTRATOR) {
          assertEqual(rendered, '/admin', `${role} should reach /admin`);
        } else {
          assert(rendered !== '/admin', `${role} must NOT reach /admin`);
        }
        resetBrowserEnv();
      });
    }

    await it('all non-admin routes accessible to all authenticated roles', async () => {
      for (const role of ALL_ROLES) {
        for (const route of ALL_ROUTES.filter(r => r !== '/admin')) {
          installBrowserEnv();
          const router = new Router();
          let rendered = null;

          router.beforeEach((to) => {
            if (ROUTE_ROLES[to.path] && !ROUTE_ROLES[to.path].includes(role)) {
              return false;
            }
            return true;
          });

          router.route(route, () => { rendered = route; });

          globalThis.location.hash = '#' + route;
          await new Promise(r => setTimeout(r, 5));

          assertEqual(rendered, route, `${role} should access ${route}`);
          resetBrowserEnv();
        }
      }
    });
  });

  // ============================================================
  // 3. UNAUTHENTICATED USER — ALL ROUTES BLOCKED
  // ============================================================

  await describe('Route enforcement: unauthenticated → all routes redirect to /login', async () => {
    await it('every protected route redirects without executing handler', async () => {
      const routes = ['/dashboard', '/registrations', '/quiz', '/reviews', '/contracts', '/admin'];

      for (const route of routes) {
        installBrowserEnv();
        const router = new Router();
        let handlerExecuted = false;
        let redirectedToLogin = false;

        router.beforeEach((to) => {
          if (to.path !== '/login') {
            router.navigate('/login');
            return false;
          }
          return true;
        });

        router.route(route, () => { handlerExecuted = true; });
        router.route('/login', () => { redirectedToLogin = true; });

        globalThis.location.hash = '#' + route;
        await new Promise(r => setTimeout(r, 10));

        assert(!handlerExecuted, `${route} handler must not execute without auth`);
        // Login handler fires from redirect
        resetBrowserEnv();
      }
    });
  });

  // ============================================================
  // 3b. FULL ROUTE_ROLES POLICY — matches src/app.js ROUTE_ROLES exactly
  // ============================================================

  await describe('Route enforcement: full declared ROUTE_ROLES policy', async () => {
    // Mirrors ROUTE_ROLES from src/app.js. Any mismatch here indicates a policy drift.
    const FULL_ROUTE_ROLES = {
      '/admin':         ['Administrator'],
      '/registrations': ['Learner', 'Instructor', 'Staff Reviewer', 'Administrator'],
      '/quiz':          ['Learner', 'Instructor', 'Administrator'],   // StaffReviewer excluded
      '/reviews':       ['Learner', 'Instructor', 'Staff Reviewer', 'Administrator'],
      '/contracts':     ['Learner', 'Instructor', 'Staff Reviewer', 'Administrator'],
    };

    await it('StaffReviewer is blocked from /quiz (policy-specific restriction)', async () => {
      installBrowserEnv();
      const router = new Router();
      let rendered = null;

      router.beforeEach((to) => {
        const allowed = FULL_ROUTE_ROLES[to.path];
        if (allowed && !allowed.includes('Staff Reviewer')) {
          router.navigate('/dashboard');
          return false;
        }
        return true;
      });

      router.route('/quiz', () => { rendered = '/quiz'; });
      router.route('/dashboard', () => { rendered = '/dashboard'; });

      globalThis.location.hash = '#/quiz';
      await new Promise(r => setTimeout(r, 10));

      assert(rendered !== '/quiz', 'StaffReviewer must not reach /quiz');
      resetBrowserEnv();
    });

    await it('StaffReviewer can access /reviews and /contracts and /registrations', async () => {
      for (const route of ['/reviews', '/contracts', '/registrations']) {
        installBrowserEnv();
        const router = new Router();
        let rendered = null;

        router.beforeEach((to) => {
          const allowed = FULL_ROUTE_ROLES[to.path];
          if (allowed && !allowed.includes('Staff Reviewer')) {
            router.navigate('/dashboard');
            return false;
          }
          return true;
        });

        router.route(route, () => { rendered = route; });
        router.route('/dashboard', () => { rendered = '/dashboard'; });

        globalThis.location.hash = '#' + route;
        await new Promise(r => setTimeout(r, 10));

        assertEqual(rendered, route, `StaffReviewer must reach ${route}`);
        resetBrowserEnv();
      }
    });

    await it('Instructor can access /quiz but not /admin', async () => {
      installBrowserEnv();
      const router = new Router();
      let quizRendered = null;

      router.beforeEach((to) => {
        const allowed = FULL_ROUTE_ROLES[to.path];
        if (allowed && !allowed.includes('Instructor')) {
          router.navigate('/dashboard');
          return false;
        }
        return true;
      });

      router.route('/quiz', () => { quizRendered = '/quiz'; });
      router.route('/dashboard', () => { quizRendered = '/dashboard'; });

      globalThis.location.hash = '#/quiz';
      await new Promise(r => setTimeout(r, 10));

      assertEqual(quizRendered, '/quiz', 'Instructor can reach /quiz');
      resetBrowserEnv();
    });
  });

  // ============================================================
  // 4. HASH-BASED ROUTING CORRECTNESS
  // ============================================================

  await describe('Route enforcement: hash-based routing works correctly', async () => {
    await it('router resolves the correct handler for matching paths', async () => {
      installBrowserEnv();
      const router = new Router();
      const executed = [];

      router.beforeEach(() => true);
      router.route('/dashboard', () => { executed.push('/dashboard'); });
      router.route('/quiz', () => { executed.push('/quiz'); });

      globalThis.location.hash = '#/dashboard';
      await new Promise(r => setTimeout(r, 10));
      globalThis.location.hash = '#/quiz';
      await new Promise(r => setTimeout(r, 10));

      assert(executed.includes('/dashboard'), 'Dashboard handler executed');
      assert(executed.includes('/quiz'), 'Quiz handler executed');
      resetBrowserEnv();
    });

    await it('notFound handler fires for unknown routes', async () => {
      installBrowserEnv();
      const router = new Router();
      let notFoundCalled = false;

      router.beforeEach(() => true);
      router.route('/dashboard', () => {});
      router.notFound(() => { notFoundCalled = true; });

      globalThis.location.hash = '#/unknown-path';
      await new Promise(r => setTimeout(r, 10));

      assert(notFoundCalled, 'notFound handler should fire for unknown route');
      resetBrowserEnv();
    });
  });
}
