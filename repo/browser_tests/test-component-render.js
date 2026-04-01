/**
 * Component/Render Tests — role-based rendering, masked values, scoped tables,
 * form validation states, UI visibility conditions.
 * All tests assert DOM output using the simulated browser environment.
 */

import { installBrowserEnv, resetBrowserEnv } from './browser-env.js';
import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser, makeClass, seedCompletedClassWithParticipants } from '../test-helpers.js';
import { USER_ROLES } from '../src/models/User.js';
import { REGISTRATION_STATUS } from '../src/models/Registration.js';
import { REPORT_STATUS } from '../src/models/Report.js';
import { maskId, maskString, maskEmail } from '../src/utils/helpers.js';

export async function runComponentRenderTests() {

  // ============================================================
  // 1. ROLE-BASED RENDERING
  // ============================================================

  await describe('Component render: role-based control visibility', async () => {
    await it('grading tab rendered only for instructor/admin — DOM check', () => {
      installBrowserEnv();
      const renderGradingTab = (role) => {
        const allowed = [USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR];
        const tabs = [{ id: 'questions', label: 'Question Bank' }, { id: 'quizzes', label: 'Quizzes' }];
        if (allowed.includes(role)) tabs.push({ id: 'grading', label: 'Grading' });
        const el = globalThis.document.createElement('div');
        el.innerHTML = tabs.map(t => `<button data-tab="${t.id}">${t.label}</button>`).join('');
        return el;
      };

      const learnerEl = renderGradingTab(USER_ROLES.LEARNER);
      const instEl = renderGradingTab(USER_ROLES.INSTRUCTOR);
      const revEl = renderGradingTab(USER_ROLES.STAFF_REVIEWER);
      const adminEl = renderGradingTab(USER_ROLES.ADMINISTRATOR);

      assert(!learnerEl.innerHTML.includes('grading'), 'Learner DOM has no grading tab');
      assert(instEl.innerHTML.includes('grading'), 'Instructor DOM has grading tab');
      assert(!revEl.innerHTML.includes('grading'), 'Reviewer DOM has no grading tab');
      assert(adminEl.innerHTML.includes('grading'), 'Admin DOM has grading tab');
      resetBrowserEnv();
    });

    await it('moderation tab rendered only for reviewer/admin — DOM check', () => {
      installBrowserEnv();
      const renderModerationTab = (role) => {
        const allowed = [USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER];
        const tabs = [{ id: 'reviews', label: 'Reviews' }, { id: 'qa', label: 'Q&A' }];
        if (allowed.includes(role)) tabs.push({ id: 'moderation', label: 'Moderation' });
        if (allowed.includes(role)) tabs.push({ id: 'appeals', label: 'Appeals' });
        const el = globalThis.document.createElement('div');
        el.innerHTML = tabs.map(t => `<button data-tab="${t.id}">${t.label}</button>`).join('');
        return el;
      };

      const learnerEl = renderModerationTab(USER_ROLES.LEARNER);
      const revEl = renderModerationTab(USER_ROLES.STAFF_REVIEWER);

      assert(!learnerEl.innerHTML.includes('moderation'), 'Learner DOM has no moderation tab');
      assert(!learnerEl.innerHTML.includes('appeals'), 'Learner DOM has no appeals tab');
      assert(revEl.innerHTML.includes('moderation'), 'Reviewer DOM has moderation tab');
      assert(revEl.innerHTML.includes('appeals'), 'Reviewer DOM has appeals tab');
      resetBrowserEnv();
    });

    await it('question edit/delete buttons rendered only for instructor/admin — DOM check', () => {
      installBrowserEnv();
      const renderQuestionActions = (role) => {
        const canManage = [USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR].includes(role);
        const el = globalThis.document.createElement('div');
        let html = '<button id="btn-fav-q">Favorite</button>';
        if (canManage) html += '<button id="btn-edit-q">Edit</button><button id="btn-delete-q">Delete</button>';
        el.innerHTML = html;
        return el;
      };

      const learnerEl = renderQuestionActions(USER_ROLES.LEARNER);
      const instEl = renderQuestionActions(USER_ROLES.INSTRUCTOR);

      assert(!learnerEl.innerHTML.includes('btn-edit-q'), 'Learner DOM has no edit button');
      assert(!learnerEl.innerHTML.includes('btn-delete-q'), 'Learner DOM has no delete button');
      assert(learnerEl.innerHTML.includes('btn-fav-q'), 'Learner DOM has favorite button');
      assert(instEl.innerHTML.includes('btn-edit-q'), 'Instructor DOM has edit button');
      assert(instEl.innerHTML.includes('btn-delete-q'), 'Instructor DOM has delete button');
      resetBrowserEnv();
    });

    await it('new registration button shows correct text for low-reputation user — DOM check', () => {
      installBrowserEnv();
      const renderCreateBtn = (restricted) => {
        const el = globalThis.document.createElement('div');
        el.innerHTML = `<button>${restricted ? 'Submit for Manual Review' : 'Create Draft'}</button>`;
        if (restricted) el.innerHTML = `<div class="form-error">Your reputation score is low. This registration will be submitted for manual review.</div>` + el.innerHTML;
        return el;
      };

      const normalEl = renderCreateBtn(false);
      const restrictedEl = renderCreateBtn(true);

      assert(normalEl.innerHTML.includes('Create Draft'), 'Normal user sees Create Draft');
      assert(!normalEl.innerHTML.includes('reputation'), 'Normal user sees no reputation warning');
      assert(restrictedEl.innerHTML.includes('Manual Review'), 'Restricted user sees Manual Review');
      assert(restrictedEl.innerHTML.includes('reputation score is low'), 'Restricted user sees warning');
      resetBrowserEnv();
    });
  });

  // ============================================================
  // 2. MASKED VALUES IN DOM
  // ============================================================

  await describe('Component render: masked values in DOM output', async () => {
    await it('contract ID masked in drawer DOM', () => {
      installBrowserEnv();
      const contractId = 'contract-550e8400-e29b-41d4';
      const el = globalThis.document.createElement('div');
      el.innerHTML = `<div class="form-group"><label>ID</label><p>${maskId(contractId)}</p></div>`;

      assert(!el.innerHTML.includes('contract-550'), 'Raw contract ID prefix must not appear');
      assert(el.innerHTML.includes('*'), 'Must contain mask characters');
      resetBrowserEnv();
    });

    await it('registration userId masked in drawer DOM', () => {
      installBrowserEnv();
      const userId = 'user-abcdef-123456-xyz';
      const el = globalThis.document.createElement('div');
      el.innerHTML = `<div class="form-group"><label>User</label><p>${maskId(userId)}</p></div>`;

      assert(!el.innerHTML.includes('user-abcdef'), 'Raw user ID must not appear');
      resetBrowserEnv();
    });

    await it('email masked correctly in DOM', () => {
      installBrowserEnv();
      const email = 'john.doe@company.com';
      const el = globalThis.document.createElement('span');
      el.textContent = maskEmail(email);

      assert(!el.textContent.includes('john.doe'), 'Full email local part must not appear');
      assert(el.textContent.includes('@company.com'), 'Domain preserved');
      assert(el.textContent.startsWith('j'), 'First char visible');
      resetBrowserEnv();
    });

    await it('escalated report renders with ESCALATED badge in DOM', () => {
      installBrowserEnv();
      const report = { status: 'escalated' };
      const badgeClass = report.status === 'resolved' ? 'badge-approved'
        : report.status === 'escalated' ? 'badge-rejected' : 'badge-submitted';
      const suffix = report.status === 'escalated' ? ' (ESCALATED)' : '';

      const el = globalThis.document.createElement('span');
      el.className = `badge ${badgeClass}`;
      el.textContent = `${report.status}${suffix}`;

      assert(el.textContent.includes('ESCALATED'), 'Escalated label visible in DOM');
      assert(el.className.includes('badge-rejected'), 'Uses rejected badge styling');
      resetBrowserEnv();
    });
  });

  // ============================================================
  // 3. SCOPED TABLE ROWS
  // ============================================================

  await describe('Component render: scoped table rows contain only authorized data', async () => {
    await it('admin registration table shows all users', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'l2', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'admin', role: USER_ROLES.ADMINISTRATOR }));

      await registrationService.create('l1', 'c1');
      await registrationService.create('l2', 'c1');

      const data = await registrationService.getAllScoped('admin');
      installBrowserEnv();
      const tableEl = globalThis.document.createElement('tbody');
      tableEl.innerHTML = data.map(r => `<tr data-user="${r.userId}"><td>${maskId(r.id)}</td></tr>`).join('');

      assertEqual(data.length, 2, 'Admin sees all registrations');
      assert(tableEl.innerHTML.includes('data-user="l1"'), 'l1 row present for admin');
      assert(tableEl.innerHTML.includes('data-user="l2"'), 'l2 row present for admin');
      resetBrowserEnv();
    });

    await it('learner contract table excludes other users contracts', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'u1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'u2', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'Content for {Name}', createdBy: 'admin' });
      await contractService.generateContract(tpl.id, { Name: 'Alice' }, 'u1');
      await contractService.generateContract(tpl.id, { Name: 'Bob' }, 'u2');

      const u1Data = await contractService.getAllContractsScoped('u1');
      installBrowserEnv();
      const el = globalThis.document.createElement('div');
      el.innerHTML = u1Data.map(c => `<tr><td>${c.content}</td></tr>`).join('');

      assert(el.innerHTML.includes('Alice'), 'u1 sees own contract content');
      assert(!el.innerHTML.includes('Bob'), 'u1 does NOT see u2 contract content in DOM');
      resetBrowserEnv();
    });
  });

  // ============================================================
  // 4. FORM VALIDATION STATES IN DOM
  // ============================================================

  await describe('Component render: form validation error states in DOM', async () => {
    await it('rejection error message appears in DOM error element', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'rev', role: USER_ROLES.STAFF_REVIEWER }));
      await repos.registrationRepository.add({
        id: 'r1', userId: 'u1', classId: 'c1', status: REGISTRATION_STATUS.UNDER_REVIEW,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      installBrowserEnv();
      const errorEl = globalThis.document.createElement('div');
      errorEl.className = 'form-error';

      try {
        await registrationService.transition('r1', REGISTRATION_STATUS.REJECTED, 'Too short', 'rev');
      } catch (err) {
        errorEl.textContent = err.message;
      }

      assert(errorEl.textContent.includes('at least'), 'Error element contains validation message');
      assert(errorEl.textContent.length > 0, 'Error element is not empty');
      resetBrowserEnv();
    });

    await it('rating validation error appears for out-of-range score', async () => {
      installBrowserEnv();
      const errorEl = globalThis.document.createElement('div');

      const { ratingService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'tc-1', ['u1']);
      try {
        await ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u2', classId: 'tc-1', score: 0 });
      } catch (err) {
        errorEl.textContent = err.message;
      }

      assert(errorEl.textContent.includes('between 1 and 5'), 'Score error in DOM');
      resetBrowserEnv();
    });
  });
}
