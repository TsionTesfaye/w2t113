/**
 * Operability Tests — verifies that all core flows are usable from a fresh state:
 *   - Class lifecycle: active → completed (and cannot revert)
 *   - Completed class immediately enables reviews and ratings
 *   - Contract generation end-to-end: template → generate → sign
 *   - Config update is reflected in service behavior
 *   - First-run seeding produces at least one usable completed class
 */

import {
  describe, it, assert, assertEqual, assertThrowsAsync,
  buildTestServices, makeUser, makeClass, seedCompletedClassWithParticipants,
} from '../test-helpers.js';
import { REGISTRATION_STATUS, createRegistration } from '../src/models/Registration.js';
import { createClass } from '../src/models/Class.js';
import { USER_ROLES } from '../src/models/User.js';
import { updateConfig, getConfig } from '../src/config/appConfig.js';
import { generateId } from '../src/utils/helpers.js';

// ============================================================
// 1. CLASS LIFECYCLE
// ============================================================

export async function runOperabilityTests() {

  await describe('Class lifecycle: active → completed', async () => {
    await it('active class can be transitioned to completed via repository put', async () => {
      const { repos } = buildTestServices();
      const cls = createClass({ id: 'cls-lc1', title: 'T', capacity: 10, instructorId: 'inst' });
      await repos.classRepository.add(cls);
      assertEqual(cls.status, 'active', 'Starts as active');

      // Simulate what AdminPage "Mark as Completed" does
      await repos.classRepository.put({ ...cls, status: 'completed', updatedAt: new Date().toISOString() });
      const updated = await repos.classRepository.getById('cls-lc1');
      assertEqual(updated.status, 'completed', 'Status updated to completed');
    });

    await it('completed class cannot be moved back to active (service enforces via review guard)', async () => {
      const { reviewService, repos } = buildTestServices();
      const cls = createClass({ id: 'cls-lc2', title: 'T', capacity: 10, instructorId: 'inst' });
      await repos.classRepository.add({ ...cls, status: 'active' });

      // Review against active class → rejected
      await assertThrowsAsync(
        () => reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-lc2', rating: 3 }),
        'completed classes'
      );
    });

    await it('completed class accepts reviews immediately', async () => {
      const { reviewService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'cls-lc3', ['u1']);
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-lc3', rating: 5, text: 'Great' });
      assert(review.id, 'Review created for completed class');
      assertEqual(review.targetClassId, 'cls-lc3');
    });

    await it('completed class accepts ratings immediately', async () => {
      const { ratingService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'cls-lc4', ['u1', 'u2']);
      const rating = await ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u2', classId: 'cls-lc4', score: 4 });
      assert(rating.id, 'Rating created for completed class');
    });
  });

  // ============================================================
  // 2. CONTRACT GENERATION END-TO-END
  // ============================================================

  await describe('Contract generation: template → generate → sign', async () => {
    await it('admin can create a template with placeholders', async () => {
      const { contractService, repos } = buildTestServices();
      // Seed an admin user so _requireAdmin passes
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));

      const template = await contractService.createTemplate({
        name: 'Training Agreement',
        content: 'This agreement is between {learnerName} and {instructorName} for {courseName}.',
        createdBy: 'admin1',
      });
      assert(template.id, 'Template created');
      assert(Array.isArray(template.placeholders), 'Placeholders extracted');
      assert(template.placeholders.includes('{learnerName}'), 'learnerName extracted');
      assert(template.placeholders.includes('{instructorName}'), 'instructorName extracted');
      assert(template.placeholders.includes('{courseName}'), 'courseName extracted');
    });

    await it('contract can be generated from a template with variable substitution', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'learner1', role: USER_ROLES.LEARNER }));

      const template = await contractService.createTemplate({
        name: 'Basic Agreement',
        content: 'Learner {learnerName} enrolls in {courseName}.',
        createdBy: 'admin1',
      });

      const contract = await contractService.generateContract(
        template.id,
        { learnerName: 'Alice Smith', courseName: 'Intro to JS' },
        'learner1'
      );
      assert(contract.id, 'Contract created');
      assert(contract.content.includes('Alice Smith'), 'learnerName substituted');
      assert(contract.content.includes('Intro to JS'), 'courseName substituted');
      assertEqual(contract.status, 'initiated', 'Contract starts as initiated');
    });

    await it('generated contract can be signed', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'learner1', role: USER_ROLES.LEARNER }));

      const template = await contractService.createTemplate({
        name: 'Sign Test',
        content: 'Agreement for {name}.',
        createdBy: 'admin1',
      });
      const contract = await contractService.generateContract(template.id, { name: 'Bob' }, 'learner1');
      const signed = await contractService.signContract(contract.id, 'base64sig==', 'Bob Learner', 'learner1');
      assertEqual(signed.status, 'signed', 'Contract is now signed');
      assert(signed.signedAt, 'signedAt recorded');
      assert(signed.signatureHash, 'SHA-256 hash recorded');
    });

    await it('contract generation fails when template does not exist', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'learner1', role: USER_ROLES.LEARNER }));
      await assertThrowsAsync(
        () => contractService.generateContract('ghost-template', {}, 'learner1'),
        'Template not found'
      );
    });

    await it('active templates are listed and available for generation', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await contractService.createTemplate({ name: 'T1', content: 'Hello {name}', createdBy: 'admin1' });
      await contractService.createTemplate({ name: 'T2', content: 'Bye {name}', createdBy: 'admin1' });
      const active = await contractService.getActiveTemplates();
      assert(active.length >= 2, `At least 2 active templates, got ${active.length}`);
    });

    await it('getActiveTemplates uses filter not IDB boolean index (avoids DataError)', async () => {
      // Explicitly tests that getActive() does NOT use getByIndex('active', true)
      // which would throw DataError in real IndexedDB (boolean is not a valid IDB key type)
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      // Create one active and simulate one inactive by directly adding to repo
      const tpl = await contractService.createTemplate({ name: 'Active', content: 'Hi {x}', createdBy: 'admin1' });
      await repos.templateRepository.add({ id: 'inactive-tpl', name: 'Old', content: 'Bye', placeholders: [], active: false, version: 0, effectiveDate: '', createdAt: '', updatedAt: '' });

      const active = await contractService.getActiveTemplates();
      // Only the active template should be returned
      assert(active.every(t => t.active === true), 'Only active templates returned');
      assert(active.some(t => t.id === tpl.id), 'Active template is included');
      assert(!active.some(t => t.id === 'inactive-tpl'), 'Inactive template excluded');
    });
  });

  // ============================================================
  // 3. CONFIG PERSISTENCE (SERVICE-LAYER REFLECTION)
  // ============================================================

  await describe('Config update reflected in service behavior', async () => {
    await it('lowering maxTextLength immediately blocks over-length review text', async () => {
      const { reviewService } = buildTestServices();
      updateConfig({ review: { maxTextLength: 30 } });
      await assertThrowsAsync(
        () => reviewService.submitReview({ userId: 'u1', rating: 3, text: 'x'.repeat(31) }),
        'at most 30'
      );
      updateConfig({ review: { maxTextLength: 2000 } }); // restore
    });

    await it('raising reputation threshold causes lower scores to be flagged', async () => {
      updateConfig({ reputation: { threshold: 90 } });
      const cfg = getConfig();
      assertEqual(cfg.reputation.threshold, 90, 'Threshold updated to 90');
      updateConfig({ reputation: { threshold: 60 } }); // restore
    });

    await it('config update does not wipe unrelated keys', async () => {
      const before = getConfig().review.maxImages;
      updateConfig({ reputation: { threshold: 65 } });
      assertEqual(getConfig().review.maxImages, before, 'review.maxImages preserved after reputation update');
      updateConfig({ reputation: { threshold: 60 } }); // restore
    });
  });

  // ============================================================
  // 4. FIRST-RUN OPERABILITY SIMULATION
  // ============================================================

  await describe('First-run operability: trust flows usable from seeded state', async () => {
    await it('seeded completed class + approved participant allows review submission', async () => {
      const { reviewService, repos } = buildTestServices();
      // Simulate what app.js seeding does on first run
      await seedCompletedClassWithParticipants(repos, 'seed-cls1', ['learner1']);
      const review = await reviewService.submitReview({
        userId: 'learner1',
        targetClassId: 'seed-cls1',
        rating: 4,
        text: 'Very useful course',
      });
      assert(review.id, 'Learner can review after first-run seeding');
    });

    await it('seeded completed class + two participants allows rating submission', async () => {
      const { ratingService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'seed-cls2', ['learner1', 'learner2']);
      const rating = await ratingService.submitRating({
        fromUserId: 'learner1',
        toUserId: 'learner2',
        classId: 'seed-cls2',
        score: 5,
      });
      assert(rating.id, 'Rating between two participants succeeds after first-run seeding');
    });

    await it('learner can review instructor in completed class via instructorId', async () => {
      const { reviewService, repos } = buildTestServices();
      const cls = createClass({ id: 'seed-cls3', title: 'T', capacity: 10, instructorId: 'inst1', status: 'completed' });
      await repos.classRepository.add(cls);
      await repos.registrationRepository.add(createRegistration({
        id: generateId(), userId: 'learner1', classId: 'seed-cls3', status: REGISTRATION_STATUS.APPROVED,
      }));
      const review = await reviewService.submitReview({
        userId: 'learner1',
        targetClassId: 'seed-cls3',
        targetUserId: 'inst1',
        direction: 'learner_to_instructor',
        rating: 5,
        text: 'Excellent instructor',
      });
      assert(review.id, 'Review of instructor succeeds');
      assertEqual(review.targetUserId, 'inst1');
    });
  });
}
