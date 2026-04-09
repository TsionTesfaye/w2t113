/**
 * Reputation Flow Tests — verifies that low-reputation users can still create
 * registrations but are forced into manual review (UnderReview + isManualReview).
 * Normal users follow the standard Draft flow. No auto-approval for manual review.
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser } from '../test-helpers.js';
import { REGISTRATION_STATUS } from '../src/models/Registration.js';
import { USER_ROLES } from '../src/models/User.js';

export async function runReputationFlowTests() {
  // ============================================================
  // A. LOW REPUTATION USER — FORCED MANUAL REVIEW
  // ============================================================

  await describe('Reputation flow: low-rep user creates registration in UnderReview', async () => {
    await it('low-rep user can create registration — status is UnderReview', async () => {
      const { registrationService, reputationService } = buildTestServices();
      await reputationService.computeScore('low-user', {
        fulfillmentRate: 0.1, lateRate: 0.9, complaintRate: 0.9,
      });

      const reg = await registrationService.create('low-user', 'c1', 'Please process');
      assert(reg.id, 'Registration should be created');
      assertEqual(reg.status, REGISTRATION_STATUS.UNDER_REVIEW, 'Status should be UnderReview');
    });

    await it('low-rep registration has isManualReview = true', async () => {
      const { registrationService, reputationService } = buildTestServices();
      await reputationService.computeScore('low-user', {
        fulfillmentRate: 0.05, lateRate: 0.95, complaintRate: 0.95,
      });

      const reg = await registrationService.create('low-user', 'c1');
      assertEqual(reg.isManualReview, true, 'isManualReview should be true');
    });

    await it('low-rep registration is persisted in repository', async () => {
      const { registrationService, reputationService, repos } = buildTestServices();
      await reputationService.computeScore('low-user', {
        fulfillmentRate: 0.1, lateRate: 0.9, complaintRate: 0.9,
      });

      const reg = await registrationService.create('low-user', 'c1');
      const persisted = await repos.registrationRepository.getById(reg.id);
      assert(persisted !== null, 'Registration should be persisted');
      assertEqual(persisted.status, REGISTRATION_STATUS.UNDER_REVIEW);
      assertEqual(persisted.isManualReview, true);
    });

    await it('audit log records manual review reason', async () => {
      const { registrationService, reputationService, repos } = buildTestServices();
      await reputationService.computeScore('low-user', {
        fulfillmentRate: 0.1, lateRate: 0.9, complaintRate: 0.9,
      });

      await registrationService.create('low-user', 'c1');
      const logs = await repos.auditLogRepository.getAll();
      const creationLog = logs.find(l => l.action === 'created');
      assert(creationLog, 'Audit log should exist');
      assert(creationLog.details.includes('manual review'), 'Audit log should mention manual review');
    });
  });

  // ============================================================
  // B. NORMAL USER — FOLLOWS STANDARD DRAFT FLOW
  // ============================================================

  await describe('Reputation flow: normal user follows standard Draft flow', async () => {
    await it('normal-rep user creates registration in Draft status', async () => {
      const { registrationService, reputationService } = buildTestServices();
      await reputationService.computeScore('good-user', {
        fulfillmentRate: 0.9, lateRate: 0.05, complaintRate: 0.02,
      });

      const reg = await registrationService.create('good-user', 'c1');
      assertEqual(reg.status, REGISTRATION_STATUS.DRAFT, 'Normal user should get Draft');
      assert(!reg.isManualReview, 'Normal user should not have isManualReview flag');
    });

    await it('new user with no score creates registration in Draft', async () => {
      const { registrationService } = buildTestServices();
      const reg = await registrationService.create('brand-new-user', 'c1');
      assertEqual(reg.status, REGISTRATION_STATUS.DRAFT);
      assert(!reg.isManualReview, 'New user should not have isManualReview flag');
    });

    await it('user at exactly threshold (60) creates in Draft', async () => {
      const { registrationService, reputationService } = buildTestServices();
      // Score = (0.2*0.5 + 1*0.3 + 1*0.2)*100 = 60
      await reputationService.computeScore('border-user', {
        fulfillmentRate: 0.2, lateRate: 0.0, complaintRate: 0.0,
      });

      const reg = await registrationService.create('border-user', 'c1');
      assertEqual(reg.status, REGISTRATION_STATUS.DRAFT, 'Exactly-at-threshold should get Draft');
    });
  });

  // ============================================================
  // C. NO AUTO-APPROVAL FOR LOW-REP USERS
  // ============================================================

  await describe('Reputation flow: no auto-approval for manual review registrations', async () => {
    await it('reviewer can approve manual-review registration', async () => {
      const { registrationService, reputationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'reviewer1', role: USER_ROLES.STAFF_REVIEWER }));
      await reputationService.computeScore('low-user', {
        fulfillmentRate: 0.1, lateRate: 0.9, complaintRate: 0.9,
      });

      const reg = await registrationService.create('low-user', 'c1');
      assertEqual(reg.status, REGISTRATION_STATUS.UNDER_REVIEW);

      // Reviewer approves
      const approved = await registrationService.transition(reg.id, REGISTRATION_STATUS.APPROVED, 'Reviewed and cleared', 'reviewer1');
      assertEqual(approved.status, REGISTRATION_STATUS.APPROVED);
    });

    await it('reviewer can reject manual-review registration', async () => {
      const { registrationService, reputationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'reviewer1', role: USER_ROLES.STAFF_REVIEWER }));
      await reputationService.computeScore('low-user', {
        fulfillmentRate: 0.1, lateRate: 0.9, complaintRate: 0.9,
      });

      const reg = await registrationService.create('low-user', 'c1');

      const rejected = await registrationService.transition(reg.id, REGISTRATION_STATUS.REJECTED, 'Insufficient standing for this class', 'reviewer1');
      assertEqual(rejected.status, REGISTRATION_STATUS.REJECTED);
    });

    await it('learner cannot self-approve manual-review registration', async () => {
      const { registrationService, reputationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'low-user', role: USER_ROLES.LEARNER }));
      await reputationService.computeScore('low-user', {
        fulfillmentRate: 0.1, lateRate: 0.9, complaintRate: 0.9,
      });

      const reg = await registrationService.create('low-user', 'c1');
      assertEqual(reg.status, REGISTRATION_STATUS.UNDER_REVIEW);

      // Learner tries to approve — should fail
      await assertThrowsAsync(
        () => registrationService.transition(reg.id, REGISTRATION_STATUS.APPROVED, '', 'low-user'),
        'Only administrators or staff reviewers'
      );
    });

    await it('manual-review registration cannot skip to Submitted by learner', async () => {
      const { registrationService, reputationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'low-user', role: USER_ROLES.LEARNER }));
      await reputationService.computeScore('low-user', {
        fulfillmentRate: 0.1, lateRate: 0.9, complaintRate: 0.9,
      });

      const reg = await registrationService.create('low-user', 'c1');
      // UnderReview -> Submitted is not a valid transition
      await assertThrowsAsync(
        () => registrationService.transition(reg.id, REGISTRATION_STATUS.SUBMITTED, '', 'low-user'),
        'Cannot transition'
      );
    });
  });
}
