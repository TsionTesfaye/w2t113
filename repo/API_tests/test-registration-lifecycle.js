/**
 * Integration Test — Full Registration Lifecycle using REAL RegistrationService
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser, makeClass } from '../test-helpers.js';
import { REGISTRATION_STATUS } from '../src/models/Registration.js';
import { USER_ROLES } from '../src/models/User.js';

export async function runRegistrationLifecycleTests() {
  await describe('Integration: Happy Path — Learner submits, Reviewer approves', async () => {
    await it('should complete full approval flow with audit trail', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'learner1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));
      await repos.classRepository.put(makeClass({ id: 'class1' }));

      const reg = await registrationService.create('learner1', 'class1', 'Interested');
      assertEqual(reg.status, REGISTRATION_STATUS.DRAFT);

      await registrationService.transition(reg.id, REGISTRATION_STATUS.SUBMITTED, '', 'learner1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.UNDER_REVIEW, '', 'rev1');
      const approved = await registrationService.transition(reg.id, REGISTRATION_STATUS.APPROVED, '', 'rev1');
      assertEqual(approved.status, REGISTRATION_STATUS.APPROVED);

      const events = await registrationService.getEvents(reg.id);
      assert(events.length >= 4, `Expected >= 4 events, got ${events.length}`);
      const auditLogs = await repos.auditLogRepository.getAll();
      assert(auditLogs.length >= 4, `Expected >= 4 audit entries`);
    });
  });

  await describe('Integration: Rejection Flow', async () => {
    await it('should complete rejection with required comment', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'r1', role: USER_ROLES.STAFF_REVIEWER }));

      const reg = await registrationService.create('l1', 'c1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.SUBMITTED, '', 'l1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.UNDER_REVIEW, '', 'r1');
      const rejected = await registrationService.transition(reg.id, REGISTRATION_STATUS.REJECTED, 'Missing documentation and proof of identity required by policy.', 'r1');
      assertEqual(rejected.status, REGISTRATION_STATUS.REJECTED);
    });
  });

  await describe('Integration: Needs More Info → Resubmit', async () => {
    await it('should allow resubmission after info request', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'r1', role: USER_ROLES.STAFF_REVIEWER }));

      const reg = await registrationService.create('l1', 'c1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.SUBMITTED, '', 'l1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.UNDER_REVIEW, '', 'r1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.NEEDS_MORE_INFO, 'Need ID scan', 'r1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.SUBMITTED, '', 'l1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.UNDER_REVIEW, '', 'r1');
      const approved = await registrationService.transition(reg.id, REGISTRATION_STATUS.APPROVED, '', 'r1');
      assertEqual(approved.status, REGISTRATION_STATUS.APPROVED);
    });
  });

  await describe('Integration: Cancellation', async () => {
    await it('should allow learner to cancel own Draft', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      const reg = await registrationService.create('l1', 'c1');
      const c = await registrationService.transition(reg.id, REGISTRATION_STATUS.CANCELLED, 'Changed mind', 'l1');
      assertEqual(c.status, REGISTRATION_STATUS.CANCELLED);
    });

    await it('should allow learner to cancel own Submitted', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      const reg = await registrationService.create('l1', 'c1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.SUBMITTED, '', 'l1');
      const c = await registrationService.transition(reg.id, REGISTRATION_STATUS.CANCELLED, '', 'l1');
      assertEqual(c.status, REGISTRATION_STATUS.CANCELLED);
    });
  });

  await describe('Integration: Role-based access', async () => {
    await it('should prevent learner from approving', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.registrationRepository.add({ id: 'r1', userId: 'l1', classId: 'c1', status: REGISTRATION_STATUS.UNDER_REVIEW, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await assertThrowsAsync(() => registrationService.transition('r1', REGISTRATION_STATUS.APPROVED, '', 'l1'), 'Only administrators or staff reviewers');
    });

    await it('should prevent instructor from rejecting', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'i1', role: USER_ROLES.INSTRUCTOR }));
      await repos.registrationRepository.add({ id: 'r1', userId: 'x', classId: 'c1', status: REGISTRATION_STATUS.UNDER_REVIEW, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await assertThrowsAsync(
        () => registrationService.transition('r1', REGISTRATION_STATUS.REJECTED, 'A very long rejection comment for testing purposes here.', 'i1'),
        'Only administrators or staff reviewers'
      );
    });
  });
}
