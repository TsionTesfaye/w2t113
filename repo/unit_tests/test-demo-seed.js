/**
 * Demo-seed integration tests.
 *
 * Proves the full seed → login cycle works:
 *   1. seedDemoUsers() creates all four accounts using real PBKDF2 hashing.
 *   2. authService.login() can verify each password through the same crypto path.
 *   3. Each seeded user carries the correct role.
 *   4. Wrong credentials are rejected after seeding.
 *   5. The method is idempotent — a second call adds no users.
 *
 * Uses real CryptoService (same PBKDF2 the browser uses) and InMemoryStore
 * so no IndexedDB is needed.  This is the same setup as all other auth unit tests.
 */

import { InMemoryStore, describe, it, assert, assertEqual } from '../test-helpers.js';
import { AuthService } from '../src/services/AuthService.js';
import cryptoService from '../src/services/CryptoService.js';
import { DEMO_USERS } from '../src/config/demoSeeds.js';

function makeAuthService() {
  return new AuthService({
    userRepository:    new InMemoryStore(),
    sessionRepository: new InMemoryStore(),
    cryptoService,
    auditService: { log: async () => {} },
  });
}

export async function runDemoSeedTests() {

  // ----------------------------------------------------------------
  // Seeding behaviour
  // ----------------------------------------------------------------

  await describe('seedDemoUsers: user creation', async () => {
    await it('creates exactly 4 users', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      const count = await auth._userRepo.count();
      assertEqual(count, 4, '4 users in store after seed');
    });

    await it('is idempotent — second call adds no extra users', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      await auth.seedDemoUsers(DEMO_USERS);
      const count = await auth._userRepo.count();
      assertEqual(count, 4, 'still 4 users after duplicate call');
    });

    await it('does nothing when users already exist (bootstrap guard)', async () => {
      const auth = makeAuthService();
      // Simulate existing user by seeding once, then calling again with a different list
      await auth.seedDemoUsers(DEMO_USERS);
      await auth.seedDemoUsers([{ username: 'extra', password: 'Extra1234!', role: 'Learner' }]);
      const count = await auth._userRepo.count();
      assertEqual(count, 4, 'extra user not added when store is non-empty');
    });

    await it('assigns correct roles to each user', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      for (const demo of DEMO_USERS) {
        const user = await auth._userRepo.getByUsername(demo.username);
        assert(user !== null, `${demo.username} exists in store`);
        assertEqual(user.role, demo.role, `${demo.username} has role ${demo.role}`);
      }
    });

    await it('stores passwords as hashed strings, not plaintext', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      for (const demo of DEMO_USERS) {
        const user = await auth._userRepo.getByUsername(demo.username);
        assert(!user.passwordHash.includes(demo.password), `${demo.username} password not stored in plaintext`);
        assert(user.passwordHash.includes(':'), `${demo.username} passwordHash has hash:salt format`);
      }
    });
  });

  // ----------------------------------------------------------------
  // Login — all four accounts
  // ----------------------------------------------------------------

  await describe('seedDemoUsers: login succeeds for each demo account', async () => {
    await it('admin (Administrator) can log in', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      const result = await auth.login('admin', 'Admin1234!');
      assert(result.success, 'admin login succeeded');
      assertEqual(result.user.role, 'Administrator', 'admin role correct');
    });

    await it('reviewer (Staff Reviewer) can log in', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      const result = await auth.login('reviewer', 'Review123!');
      assert(result.success, 'reviewer login succeeded');
      assertEqual(result.user.role, 'Staff Reviewer', 'reviewer role correct');
    });

    await it('instructor (Instructor) can log in', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      const result = await auth.login('instructor', 'Teach1234!');
      assert(result.success, 'instructor login succeeded');
      assertEqual(result.user.role, 'Instructor', 'instructor role correct');
    });

    await it('learner (Learner) can log in', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      const result = await auth.login('learner', 'Learn1234!');
      assert(result.success, 'learner login succeeded');
      assertEqual(result.user.role, 'Learner', 'learner role correct');
    });
  });

  // ----------------------------------------------------------------
  // Login — wrong credentials rejected
  // ----------------------------------------------------------------

  await describe('seedDemoUsers: wrong credentials rejected', async () => {
    await it('rejects correct username with wrong password', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      const result = await auth.login('admin', 'WrongPass1!');
      assert(!result.success, 'wrong password rejected');
      assert(result.error, 'error message provided');
    });

    await it('rejects unknown username', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      const result = await auth.login('nobody', 'Admin1234!');
      assert(!result.success, 'unknown username rejected');
    });

    await it('rejects empty password', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      const result = await auth.login('admin', '');
      assert(!result.success, 'empty password rejected');
    });

    await it('rejects password of a different seeded user (no cross-login)', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      // learner password used against admin account
      const result = await auth.login('admin', 'Learn1234!');
      assert(!result.success, "learner's password does not unlock admin account");
    });
  });

  // ----------------------------------------------------------------
  // Session — login returns a usable session
  // ----------------------------------------------------------------

  await describe('seedDemoUsers: post-login session state', async () => {
    await it('getCurrentUser() returns the user after login', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      await auth.login('learner', 'Learn1234!');
      const current = auth.getCurrentUser();
      assert(current !== null, 'current user is set');
      assertEqual(current.username, 'learner', 'correct user in session');
    });

    await it('isAuthenticated() is true after successful login', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      await auth.login('instructor', 'Teach1234!');
      assert(auth.isAuthenticated(), 'authenticated after login');
    });

    await it('isAuthenticated() is false before login', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      assert(!auth.isAuthenticated(), 'not authenticated before login');
    });

    await it('logout clears the session', async () => {
      const auth = makeAuthService();
      await auth.seedDemoUsers(DEMO_USERS);
      await auth.login('admin', 'Admin1234!');
      assert(auth.isAuthenticated(), 'authenticated');
      await auth.logout();
      assert(!auth.isAuthenticated(), 'logged out');
    });
  });
}
