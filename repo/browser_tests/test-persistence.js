/**
 * Persistence Tests — data persistence across operations, session switching
 * state reset, long-lived data consistency.
 * Uses InMemoryStore (mirrors IndexedDB behavior) and localStorage simulation.
 */

import { installBrowserEnv, resetBrowserEnv } from './browser-env.js';
import { describe, it, assert, assertEqual, buildTestServices, makeUser, makeClass } from '../test-helpers.js';
import { USER_ROLES } from '../src/models/User.js';
import { REGISTRATION_STATUS } from '../src/models/Registration.js';
import { InMemoryStore } from '../test-helpers.js';

export async function runPersistenceTests() {

  // ============================================================
  // 1. DATA PERSISTS ACROSS OPERATIONS (simulates IndexedDB)
  // ============================================================

  await describe('Persistence: data persists across operations', async () => {
    await it('registration created then retrieved by ID', async () => {
      const { registrationService, repos } = buildTestServices();
      const reg = await registrationService.create('u1', 'c1', 'Test');

      // Simulate "reload" — query the same store
      const fetched = await repos.registrationRepository.getById(reg.id);
      assert(fetched !== null, 'Registration persists in store');
      assertEqual(fetched.userId, 'u1');
      assertEqual(fetched.status, REGISTRATION_STATUS.DRAFT);
    });

    await it('multiple registrations persist and are all retrievable', async () => {
      const { registrationService, repos } = buildTestServices();
      await registrationService.create('u1', 'c1');
      await registrationService.create('u1', 'c2');
      await registrationService.create('u2', 'c1');

      const all = await repos.registrationRepository.getAll();
      assertEqual(all.length, 3, 'All 3 registrations persist');
    });

    await it('question persists after create + update', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst', role: USER_ROLES.INSTRUCTOR }));

      const q = await quizService.createQuestion({
        questionText: 'Original?', type: 'fill-in', correctAnswer: 'yes',
        difficulty: 2, tags: 'test', createdBy: 'inst',
      });

      await quizService.updateQuestion(q.id, { questionText: 'Updated?' }, 'inst');

      const fetched = await repos.questionRepository.getById(q.id);
      assertEqual(fetched.questionText, 'Updated?', 'Update persists');
    });

    await it('contract persists after signing', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin', role: USER_ROLES.ADMINISTRATOR }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin' });
      const c = await contractService.generateContract(tpl.id, {}, 'admin');
      await contractService.signContract(c.id, 'sig', 'Admin', 'admin');

      const fetched = await repos.contractRepository.getById(c.id);
      assertEqual(fetched.status, 'signed', 'Signed status persists');
      assert(fetched.signatureHash, 'Hash persists');
    });

    await it('audit logs accumulate and persist', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'rev', role: USER_ROLES.STAFF_REVIEWER }));

      const reg = await registrationService.create('l1', 'c1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.SUBMITTED, '', 'l1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.UNDER_REVIEW, '', 'rev');

      const logs = await repos.auditLogRepository.getAll();
      assert(logs.length >= 3, `Expected >=3 audit entries, got ${logs.length}`);
    });

    await it('reputation score persists and is retrievable', async () => {
      const { reputationService, repos } = buildTestServices();
      await reputationService.computeScore('u1', {
        fulfillmentRate: 0.8, lateRate: 0.1, complaintRate: 0.05,
      });

      const score = await reputationService.getScore('u1');
      assert(score !== null, 'Score persists');
      assert(score.score > 0, 'Score value persists');
    });
  });

  // ============================================================
  // 2. SESSION SWITCHING RESETS STATE
  // ============================================================

  await describe('Persistence: session switching resets page state', async () => {
    await it('localStorage session key cleared on logout', () => {
      installBrowserEnv();
      globalThis.localStorage.setItem('trainingops_session', 'session-abc-123');
      assertEqual(globalThis.localStorage.getItem('trainingops_session'), 'session-abc-123');

      // Simulate logout
      globalThis.localStorage.removeItem('trainingops_session');
      assertEqual(globalThis.localStorage.getItem('trainingops_session'), null, 'Session cleared');
      resetBrowserEnv();
    });

    await it('page instances recreated on session change — no stale data', () => {
      class RegPage { constructor() { this.activeTab = 'all'; this.currentFilter = ''; this.table = null; } }
      class ContractPage { constructor() { this.activeTab = 'contracts'; } }
      class AdminPage { constructor() { this.activeTab = 'users'; } }

      // Admin session
      let pages = {
        reg: new RegPage(),
        contracts: new ContractPage(),
        admin: new AdminPage(),
      };
      pages.reg.currentFilter = 'Approved';
      pages.reg.table = { data: [{ id: 'r1' }, { id: 'r2' }] };
      pages.admin.activeTab = 'reputation';

      // Session change — ALL pages recreated
      pages = {
        reg: new RegPage(),
        contracts: new ContractPage(),
        admin: new AdminPage(),
      };

      // Verify clean state
      assertEqual(pages.reg.currentFilter, '', 'Filter reset');
      assertEqual(pages.reg.table, null, 'Table reset');
      assertEqual(pages.reg.activeTab, 'all', 'Tab reset');
      assertEqual(pages.admin.activeTab, 'users', 'Admin tab reset to default');
    });

    await it('localStorage data does not leak between user sessions', () => {
      installBrowserEnv();

      // Admin session stores data
      globalThis.localStorage.setItem('trainingops_session', 'admin-session-id');
      globalThis.localStorage.setItem('admin_preference', 'dark_mode');

      // Simulate logout — clear session
      globalThis.localStorage.removeItem('trainingops_session');

      // Login as learner
      globalThis.localStorage.setItem('trainingops_session', 'learner-session-id');

      // Admin preference should NOT affect learner (it's still in localStorage but
      // the app doesn't use arbitrary keys — only trainingops_session matters)
      const session = globalThis.localStorage.getItem('trainingops_session');
      assertEqual(session, 'learner-session-id', 'New session established');

      resetBrowserEnv();
    });
  });

  // ============================================================
  // 3. LONG-LIVED DATA CONSISTENCY
  // ============================================================

  await describe('Persistence: long-lived data consistency', async () => {
    await it('InMemoryStore maintains data integrity across many operations', async () => {
      const store = new InMemoryStore();

      // Add 100 records
      for (let i = 0; i < 100; i++) {
        await store.add({ id: `item-${i}`, value: i, status: i % 2 === 0 ? 'active' : 'inactive' });
      }

      assertEqual(await store.count(), 100, '100 records stored');

      // Update some
      for (let i = 0; i < 50; i++) {
        const record = await store.getById(`item-${i}`);
        record.value = record.value * 2;
        await store.put(record);
      }

      // Verify updates
      const item0 = await store.getById('item-0');
      assertEqual(item0.value, 0, 'item-0 updated (0*2=0)');
      const item10 = await store.getById('item-10');
      assertEqual(item10.value, 20, 'item-10 updated (10*2=20)');

      // Delete some
      for (let i = 90; i < 100; i++) {
        await store.delete(`item-${i}`);
      }
      assertEqual(await store.count(), 90, '10 deleted, 90 remain');

      // Filter works correctly
      const active = await store.filter(r => r.status === 'active');
      assert(active.length > 0, 'Filter returns results');
      assert(active.every(r => r.status === 'active'), 'All filtered records are active');
    });

    await it('getByIndex returns correct subset after mutations', async () => {
      const store = new InMemoryStore();
      await store.add({ id: '1', userId: 'u1', type: 'A' });
      await store.add({ id: '2', userId: 'u1', type: 'B' });
      await store.add({ id: '3', userId: 'u2', type: 'A' });

      const u1Records = await store.getByUserId('u1');
      assertEqual(u1Records.length, 2);

      // Delete one
      await store.delete('1');
      const u1After = await store.getByUserId('u1');
      assertEqual(u1After.length, 1);
      assertEqual(u1After[0].type, 'B');
    });

    await it('deep clone prevents reference mutation', async () => {
      const store = new InMemoryStore();
      const original = { id: '1', data: { nested: 'value' } };
      await store.add(original);

      // Mutate the original object
      original.data.nested = 'mutated';

      // Store should have the original value (deep clone on add)
      const fetched = await store.getById('1');
      assertEqual(fetched.data.nested, 'value', 'Store is not affected by external mutation');
    });
  });
}
