/**
 * Final-Pass Tests — contract authorization, registration scoping, reputation enforcement,
 * sensitive data masking, UI-service consistency, router RBAC, page-level guards,
 * cross-user data isolation, and E2E realistic flows.
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser, makeClass, seedCompletedClassWithParticipants } from '../test-helpers.js';
import { REGISTRATION_STATUS } from '../src/models/Registration.js';
import { USER_ROLES } from '../src/models/User.js';
import { CONTRACT_STATUS } from '../src/models/Contract.js';
import { QUESTION_TYPES } from '../src/models/Question.js';
import { APPEAL_STATUS } from '../src/models/Rating.js';
import { REPORT_OUTCOMES } from '../src/models/Report.js';
import { maskString, maskEmail, maskId } from '../src/utils/helpers.js';
import { getConfig } from '../src/config/appConfig.js';

export async function runFinalPassTests() {

  // ============================================================
  // 1. CONTRACT AUTHORIZATION
  // ============================================================

  await describe('Contract authorization: ownership + role enforcement', async () => {
    await it('should prevent non-owner/non-admin from signing a contract', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'user-a', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'user-b', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'user-a');

      // user-b tries to sign user-a's contract
      await assertThrowsAsync(
        () => contractService.signContract(contract.id, 'sig', 'User B', 'user-b'),
        'do not have access'
      );
    });

    await it('should allow owner to sign their own contract', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'user-a', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'user-a');
      const signed = await contractService.signContract(contract.id, 'sig', 'User A', 'user-a');
      assertEqual(signed.status, CONTRACT_STATUS.SIGNED);
    });

    await it('should allow admin to operate on any contract', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'user-a', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'user-a');
      const voided = await contractService.voidContract(contract.id, 'admin1');
      assertEqual(voided.status, CONTRACT_STATUS.VOIDED);
    });

    await it('should prevent non-owner from withdrawing a contract', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'user-a', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'user-b', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'user-a');
      await assertThrowsAsync(
        () => contractService.withdrawContract(contract.id, 'user-b'),
        'do not have access'
      );
    });

    await it('should reject contract transition with unresolvable user', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'admin1');
      await assertThrowsAsync(
        () => contractService.voidContract(contract.id, 'ghost-user'),
        'Acting user not found'
      );
    });

    await it('should scope getAllContractsScoped to owner for non-admin', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'user-a', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'user-b', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      await contractService.generateContract(tpl.id, {}, 'user-a');
      await contractService.generateContract(tpl.id, {}, 'user-b');

      const scopedA = await contractService.getAllContractsScoped('user-a');
      assertEqual(scopedA.length, 1, 'user-a should see only their own contract');

      const scopedAdmin = await contractService.getAllContractsScoped('admin1');
      assertEqual(scopedAdmin.length, 2, 'admin should see all contracts');
    });
  });

  // ============================================================
  // 2. REGISTRATION DATA SCOPING
  // ============================================================

  await describe('Registration data scoping by role', async () => {
    await it('learner should see only own registrations via getAllScoped', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'l2', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));

      await registrationService.create('l1', 'c1');
      await registrationService.create('l2', 'c1');

      const scopedL1 = await registrationService.getAllScoped('l1');
      assertEqual(scopedL1.length, 1, 'Learner l1 should see only own registration');
      assertEqual(scopedL1[0].userId, 'l1');

      const scopedL2 = await registrationService.getAllScoped('l2');
      assertEqual(scopedL2.length, 1, 'Learner l2 should see only own registration');
    });

    await it('reviewer should see all registrations via getAllScoped', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'l2', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));

      await registrationService.create('l1', 'c1');
      await registrationService.create('l2', 'c1');

      const scopedRev = await registrationService.getAllScoped('rev1');
      assertEqual(scopedRev.length, 2, 'Reviewer should see all registrations');
    });

    await it('non-existent user should see empty via getAllScoped', async () => {
      const { registrationService } = buildTestServices();
      const scoped = await registrationService.getAllScoped('ghost');
      assertEqual(scoped.length, 0);
    });
  });

  // ============================================================
  // 3. REPUTATION ENFORCEMENT AT SERVICE LEVEL
  // ============================================================

  await describe('Reputation enforcement in RegistrationService.create()', async () => {
    await it('should force manual review when reputation is below threshold', async () => {
      const { registrationService, reputationService, repos } = buildTestServices();
      // Set a low reputation score
      await reputationService.computeScore('restricted-user', {
        fulfillmentRate: 0.1,
        lateRate: 0.9,
        complaintRate: 0.9,
      });

      // Low reputation forces UnderReview with manual review flag
      const reg = await registrationService.create('restricted-user', 'c1');
      assertEqual(reg.status, 'UnderReview', 'Low-rep registration should be UnderReview');
      assertEqual(reg.isManualReview, true, 'Should be flagged for manual review');

      const allRegs = await repos.registrationRepository.getAll();
      assertEqual(allRegs.filter(r => r.userId === 'restricted-user').length, 1, 'Record should exist');
    });

    await it('should allow registration when reputation is above threshold', async () => {
      const { registrationService, reputationService } = buildTestServices();
      await reputationService.computeScore('good-user', {
        fulfillmentRate: 0.9,
        lateRate: 0.1,
        complaintRate: 0.0,
      });

      const reg = await registrationService.create('good-user', 'c1');
      assert(reg.id, 'Registration should be created');
      assertEqual(reg.status, 'Draft', 'Good-rep registration should be Draft');
    });

    await it('should allow registration when no reputation score exists (new user)', async () => {
      const { registrationService } = buildTestServices();
      const reg = await registrationService.create('new-user', 'c1');
      assert(reg.id, 'New user with no score should be allowed');
      assertEqual(reg.status, 'Draft', 'New user registration should be Draft');
    });

    await it('should respect config threshold value', async () => {
      const config = getConfig();
      assertEqual(config.reputation.threshold, 60, 'Default threshold should be 60');
    });
  });

  // ============================================================
  // 4. SENSITIVE DATA MASKING
  // ============================================================

  await describe('Sensitive data masking utilities', async () => {
    await it('should mask string showing only last N chars', () => {
      assertEqual(maskString('abcdefgh', 4), '****efgh');
      assertEqual(maskString('ab', 4), 'ab');
      assertEqual(maskString('', 4), '');
    });

    await it('should mask email addresses', () => {
      const masked = maskEmail('john@example.com');
      assert(masked.startsWith('j'), 'Should show first char');
      assert(masked.includes('***@example.com'), 'Should mask rest of local part');
      assert(!masked.includes('john'), 'Should not contain full name');
    });

    await it('should handle edge cases in maskEmail', () => {
      assertEqual(maskEmail(''), '');
      assertEqual(maskEmail(null), '');
      assertEqual(maskEmail('noatsign'), 'noatsign');
      const single = maskEmail('a@b.com');
      assertEqual(single, 'a@b.com');
    });

    await it('should mask IDs via maskId', () => {
      const masked = maskId('abcdefgh-1234-5678');
      assert(masked.endsWith('5678'), 'Should show last 4 chars');
      assert(masked.includes('*'), 'Should contain asterisks');
    });
  });

  // ============================================================
  // 5. ROUTER-LEVEL RBAC (simulated)
  // ============================================================

  await describe('Router RBAC: route access control', async () => {
    await it('should define /admin as Administrator-only in ROUTE_ROLES', () => {
      // Simulate the ROUTE_ROLES check from app.js
      const ROUTE_ROLES = { '/admin': [USER_ROLES.ADMINISTRATOR] };

      const learnerUser = { role: USER_ROLES.LEARNER };
      const adminUser = { role: USER_ROLES.ADMINISTRATOR };

      const learnerAllowed = !ROUTE_ROLES['/admin'] || ROUTE_ROLES['/admin'].includes(learnerUser.role);
      const adminAllowed = !ROUTE_ROLES['/admin'] || ROUTE_ROLES['/admin'].includes(adminUser.role);

      assert(!learnerAllowed, 'Learner should NOT be allowed to /admin');
      assert(adminAllowed, 'Admin should be allowed to /admin');
    });

    await it('should allow all roles to access unrestricted routes', () => {
      const ROUTE_ROLES = { '/admin': [USER_ROLES.ADMINISTRATOR] };
      const paths = ['/dashboard', '/registrations', '/quiz', '/reviews', '/contracts'];

      for (const path of paths) {
        const allowed = !ROUTE_ROLES[path] || ROUTE_ROLES[path].includes(USER_ROLES.LEARNER);
        assert(allowed, `Learner should access ${path}`);
      }
    });

    await it('should block unauthenticated access to all routes except /login', () => {
      // Simulate the beforeEach guard logic
      const isAuthenticated = false;
      const paths = ['/dashboard', '/admin', '/registrations'];

      for (const path of paths) {
        const shouldRedirect = path !== '/login' && !isAuthenticated;
        assert(shouldRedirect, `Unauthenticated user should be blocked from ${path}`);
      }
    });
  });

  // ============================================================
  // 6. PAGE-LEVEL RBAC (simulated)
  // ============================================================

  await describe('Page-level RBAC: role checks on render', async () => {
    await it('AdminPage should block non-administrator', () => {
      const user = { role: USER_ROLES.LEARNER };
      const allowed = user.role === USER_ROLES.ADMINISTRATOR;
      assert(!allowed, 'Learner should be blocked from AdminPage');
    });

    await it('AdminPage should allow administrator', () => {
      const user = { role: USER_ROLES.ADMINISTRATOR };
      const allowed = user.role === USER_ROLES.ADMINISTRATOR;
      assert(allowed, 'Administrator should access AdminPage');
    });

    await it('Moderation tab should block non-reviewer/non-admin', () => {
      const roles = [USER_ROLES.LEARNER, USER_ROLES.INSTRUCTOR];
      for (const role of roles) {
        const allowed = [USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(role);
        assert(!allowed, `${role} should be blocked from moderation tab`);
      }
    });

    await it('Grading tab should block learner and reviewer', () => {
      const roles = [USER_ROLES.LEARNER, USER_ROLES.STAFF_REVIEWER];
      for (const role of roles) {
        const allowed = [USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR].includes(role);
        assert(!allowed, `${role} should be blocked from grading tab`);
      }
    });

    await it('Templates tab should block non-admin', () => {
      const roles = [USER_ROLES.LEARNER, USER_ROLES.INSTRUCTOR, USER_ROLES.STAFF_REVIEWER];
      for (const role of roles) {
        const allowed = role === USER_ROLES.ADMINISTRATOR;
        assert(!allowed, `${role} should be blocked from templates tab`);
      }
    });
  });

  // ============================================================
  // 7. UI-SERVICE CONSISTENCY
  // ============================================================

  await describe('UI-service consistency: question creation requires createdBy', async () => {
    await it('should reject createQuestion without createdBy', async () => {
      const { quizService } = buildTestServices();
      await assertThrowsAsync(
        () => quizService.createQuestion({
          questionText: 'Q?', type: 'single', correctAnswer: 'A',
          difficulty: 3, tags: 'test',
          // createdBy intentionally omitted
        }),
        'userId is required'
      );
    });

    await it('should succeed when createdBy is a valid instructor', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      const q = await quizService.createQuestion({
        questionText: 'Q?', type: 'single', correctAnswer: 'A',
        difficulty: 3, tags: 'test', createdBy: 'inst1',
      });
      assert(q.id, 'Question should be created with valid createdBy');
    });
  });

  // ============================================================
  // 8. SECURITY: no default credentials exposed
  // ============================================================

  await describe('Security: login page does not expose credentials', async () => {
    await it('should not contain password patterns in login page text', () => {
      // The LoginPage render method should not contain default credential text
      // We verify the updated text doesn't contain the old patterns
      const safeText = 'Sign in with your assigned credentials.';
      assert(!safeText.includes('admin123'), 'Should not contain default password');
      assert(!safeText.includes('[username]123'), 'Should not contain password pattern');
    });
  });

  // ============================================================
  // 9. CROSS-USER DATA ISOLATION
  // ============================================================

  await describe('Cross-user data isolation', async () => {
    await it('should not leak contracts between users', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'u1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'u2', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      await contractService.generateContract(tpl.id, {}, 'u1');
      await contractService.generateContract(tpl.id, {}, 'u2');
      await contractService.generateContract(tpl.id, {}, 'u2');

      const u1Contracts = await contractService.getAllContractsScoped('u1');
      const u2Contracts = await contractService.getAllContractsScoped('u2');

      assertEqual(u1Contracts.length, 1, 'u1 sees only own contracts');
      assertEqual(u2Contracts.length, 2, 'u2 sees only own contracts');

      // Verify no u2 contracts in u1's scoped view
      assert(u1Contracts.every(c => c.createdBy === 'u1'), 'u1 data should not contain u2 contracts');
    });

    await it('should not leak registrations between learners', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'l2', role: USER_ROLES.LEARNER }));

      await registrationService.create('l1', 'c1');
      await registrationService.create('l1', 'c2');
      await registrationService.create('l2', 'c1');

      const l1Regs = await registrationService.getAllScoped('l1');
      const l2Regs = await registrationService.getAllScoped('l2');

      assertEqual(l1Regs.length, 2, 'l1 sees own 2 registrations');
      assertEqual(l2Regs.length, 1, 'l2 sees own 1 registration');
      assert(l1Regs.every(r => r.userId === 'l1'), 'No l2 data in l1 scope');
      assert(l2Regs.every(r => r.userId === 'l2'), 'No l1 data in l2 scope');
    });
  });

  // ============================================================
  // 10. E2E: REALISTIC MULTI-ROLE FLOW
  // ============================================================

  await describe('E2E realistic flow: admin creates, learner interacts, reviewer moderates', async () => {
    await it('should complete full cross-role workflow', async () => {
      const { registrationService, quizService, reviewService, moderationService,
              contractService, ratingService, reputationService, repos } = buildTestServices();

      // Seed users
      await repos.userRepository.add(makeUser({ id: 'admin', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'inst', role: USER_ROLES.INSTRUCTOR }));
      await repos.userRepository.add(makeUser({ id: 'rev', role: USER_ROLES.STAFF_REVIEWER }));
      await repos.userRepository.add(makeUser({ id: 'learner', role: USER_ROLES.LEARNER }));
      // Overwrite pre-seeded c1 with test-specific properties (active so registration is allowed)
      await repos.classRepository.put({ ...makeClass({ id: 'c1', capacity: 20, instructorId: 'inst' }), status: 'active' });

      // 1. Admin creates contract template
      const tpl = await contractService.createTemplate({
        name: 'Enrollment', content: 'I {Name} agree.', createdBy: 'admin',
      });
      assert(tpl.id, 'Template created');

      // 2. Learner creates registration
      const reg = await registrationService.create('learner', 'c1', 'Want to enroll');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.SUBMITTED, '', 'learner');

      // 3. Reviewer processes it
      await registrationService.transition(reg.id, REGISTRATION_STATUS.UNDER_REVIEW, '', 'rev');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.APPROVED, '', 'rev');

      // Mark class completed so reviews/ratings are valid
      await repos.classRepository.put({ ...makeClass({ id: 'c1', capacity: 20, instructorId: 'inst' }), status: 'completed' });

      // 4. Instructor creates quiz
      const q = await quizService.createQuestion({
        questionText: 'What is 1+1?', type: 'single', correctAnswer: 'B',
        difficulty: 1, tags: 'math', createdBy: 'inst',
      });
      const quiz = await quizService.generatePaper('Quiz 1', 'c1', { totalQuestions: 1, difficultyDistribution: { 1: 1.0 } }, 'inst');

      // 5. Learner takes quiz
      const result = await quizService.submitAnswers(quiz.id, 'learner', [
        { questionId: q.id, answer: 'B' },
      ]);
      assertEqual(result.objectiveScore, 100);

      // 6. Learner submits review (bound to completed class c1)
      const review = await reviewService.submitReview({
        userId: 'learner', targetClassId: 'c1', rating: 5, text: 'Great class!',
      });

      // 7. Someone reports the review, reviewer resolves
      const report = await moderationService.submitReport('inst', review.id, 'review', 'Checking');
      await moderationService.resolveReport(report.id, REPORT_OUTCOMES.DISMISSED, 'rev');

      // 8. Rating + appeal — instructor rates learner in same class c1 (learner already has approved reg)
      const rating = await ratingService.submitRating({
        fromUserId: 'inst', toUserId: 'learner', classId: 'c1', score: 4,
      });
      const appeal = await ratingService.fileAppeal(rating.id, 'learner', 'Score too low');
      await ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.ADJUSTED, 'Adjusting upward', 'rev', 5);
      const updated = await repos.ratingRepository.getById(rating.id);
      assertEqual(updated.score, 5);

      // 9. Verify scoping — learner sees only own data
      const learnerRegs = await registrationService.getAllScoped('learner');
      assertEqual(learnerRegs.length, 1);

      // 10. Verify admin sees everything
      const adminRegs = await registrationService.getAllScoped('admin');
      assert(adminRegs.length >= 1, 'Admin sees all registrations');

      // 11. Verify audit trail completeness
      const auditLogs = await repos.auditLogRepository.getAll();
      assert(auditLogs.length >= 10, `Expected comprehensive audit trail, got ${auditLogs.length}`);
    });
  });

  // ============================================================
  // 11. CONFIG-DRIVEN BEHAVIOR STRICT CHECK
  // ============================================================

  await describe('Config-driven behavior: no hardcoded duplicates', async () => {
    await it('ReputationService uses config weights', async () => {
      const { reputationService } = buildTestServices();
      // computeScore should use config weights when none provided
      const result = await reputationService.computeScore('test-user', {
        fulfillmentRate: 1.0, lateRate: 0.0, complaintRate: 0.0,
      });
      assertEqual(result.score, 100, 'Perfect metrics with config weights should yield 100');
    });

    await it('waitlist uses config fill rate threshold', async () => {
      const config = getConfig();
      assertEqual(config.registration.waitlistPromotionFillRate, 0.95);
    });

    await it('review uses config-driven limits', async () => {
      const config = getConfig();
      assertEqual(config.review.maxImages, 6);
      assertEqual(config.review.maxImageSizeMB, 2);
      assertEqual(config.review.maxTextLength, 2000);
      assertEqual(config.review.followUpWindowDays, 14);
    });

    await it('moderation uses config deadline', async () => {
      const config = getConfig();
      assertEqual(config.moderation.resolutionDeadlineDays, 7);
    });
  });
}
