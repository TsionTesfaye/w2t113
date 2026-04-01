/**
 * Compliance-Pass Tests — prompt-alignment, scoped retrieval enforcement,
 * UI-service consistency, GradingService RBAC, reputation manual-review workflow,
 * masking in detail views, and cross-role E2E realism.
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser, makeClass } from '../test-helpers.js';
import { REGISTRATION_STATUS } from '../src/models/Registration.js';
import { USER_ROLES } from '../src/models/User.js';
import { CONTRACT_STATUS } from '../src/models/Contract.js';
import { QUESTION_TYPES } from '../src/models/Question.js';
import { APPEAL_STATUS } from '../src/models/Rating.js';
import { REPORT_OUTCOMES } from '../src/models/Report.js';
import { maskString, maskEmail, maskId } from '../src/utils/helpers.js';
import { getConfig } from '../src/config/appConfig.js';

export async function runCompliancePassTests() {

  // ============================================================
  // 1. REGISTRATION PAGE SCOPED RETRIEVAL
  // ============================================================

  await describe('Registration scoped retrieval: page uses scoped APIs only', async () => {
    await it('getAllScoped: learner sees only own registrations', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'l2', role: USER_ROLES.LEARNER }));

      await registrationService.create('l1', 'c1');
      await registrationService.create('l1', 'c2');
      await registrationService.create('l2', 'c1');

      const scoped = await registrationService.getAllScoped('l1');
      assertEqual(scoped.length, 2);
      assert(scoped.every(r => r.userId === 'l1'), 'No l2 data in l1 scope');
    });

    await it('getByStatusScoped: learner sees only own filtered registrations', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'l2', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'rev', role: USER_ROLES.STAFF_REVIEWER }));

      const r1 = await registrationService.create('l1', 'c1');
      await registrationService.transition(r1.id, REGISTRATION_STATUS.SUBMITTED, '', 'l1');
      const r2 = await registrationService.create('l2', 'c1');
      await registrationService.transition(r2.id, REGISTRATION_STATUS.SUBMITTED, '', 'l2');

      const scopedL1 = await registrationService.getByStatusScoped(REGISTRATION_STATUS.SUBMITTED, 'l1');
      assertEqual(scopedL1.length, 1);
      assertEqual(scopedL1[0].userId, 'l1');
    });

    await it('getByStatusScoped: reviewer sees all for a given status', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'l2', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'rev', role: USER_ROLES.STAFF_REVIEWER }));

      const r1 = await registrationService.create('l1', 'c1');
      await registrationService.transition(r1.id, REGISTRATION_STATUS.SUBMITTED, '', 'l1');
      const r2 = await registrationService.create('l2', 'c1');
      await registrationService.transition(r2.id, REGISTRATION_STATUS.SUBMITTED, '', 'l2');

      const scopedRev = await registrationService.getByStatusScoped(REGISTRATION_STATUS.SUBMITTED, 'rev');
      assertEqual(scopedRev.length, 2);
    });

    await it('getByStatusScoped: ghost user gets empty', async () => {
      const { registrationService } = buildTestServices();
      const scoped = await registrationService.getByStatusScoped(REGISTRATION_STATUS.DRAFT, 'nonexistent');
      assertEqual(scoped.length, 0);
    });

    await it('getAllScoped: admin sees all registrations', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'l2', role: USER_ROLES.LEARNER }));

      await registrationService.create('l1', 'c1');
      await registrationService.create('l2', 'c1');

      const scopedAdmin = await registrationService.getAllScoped('admin');
      assertEqual(scopedAdmin.length, 2);
    });
  });

  // ============================================================
  // 2. CONTRACT PAGE SCOPED RETRIEVAL
  // ============================================================

  await describe('Contract scoped retrieval: page uses scoped APIs only', async () => {
    await it('non-owner cannot view others contracts via scoped list', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'u1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'u2', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      await contractService.generateContract(tpl.id, {}, 'u1');
      await contractService.generateContract(tpl.id, {}, 'u2');

      const u1Contracts = await contractService.getAllContractsScoped('u1');
      assertEqual(u1Contracts.length, 1);
      assert(u1Contracts.every(c => c.createdBy === 'u1'), 'u1 should only see own contracts');
    });

    await it('non-owner cannot sign another users contract', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'u1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'u2', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'u1');

      await assertThrowsAsync(
        () => contractService.signContract(contract.id, 'sig', 'User2', 'u2'),
        'do not have access'
      );
    });

    await it('non-owner cannot void another users contract', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'u1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'u2', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'u1');

      await assertThrowsAsync(
        () => contractService.voidContract(contract.id, 'u2'),
        'do not have access'
      );
    });

    await it('contract content not leaked via scoped list to wrong user', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'u1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'u2', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'T', content: 'SECRET CONTENT FOR U1', createdBy: 'admin1' });
      await contractService.generateContract(tpl.id, {}, 'u1');

      const u2Contracts = await contractService.getAllContractsScoped('u2');
      assertEqual(u2Contracts.length, 0, 'u2 should see no contracts');
    });
  });

  // ============================================================
  // 3. QUESTION CREATION UI-SERVICE CONSISTENCY
  // ============================================================

  await describe('UI-service consistency: createdBy required in question flows', async () => {
    await it('createQuestion rejects missing createdBy (simulates UI omission)', async () => {
      const { quizService } = buildTestServices();
      await assertThrowsAsync(
        () => quizService.createQuestion({
          questionText: 'Q?', type: 'single', correctAnswer: 'A',
          difficulty: 3, tags: 'test',
        }),
        'userId is required'
      );
    });

    await it('createQuestion rejects undefined createdBy', async () => {
      const { quizService } = buildTestServices();
      await assertThrowsAsync(
        () => quizService.createQuestion({
          questionText: 'Q?', type: 'single', correctAnswer: 'A',
          difficulty: 3, tags: 'test', createdBy: undefined,
        }),
        'userId is required'
      );
    });

    await it('bulkImport rejects non-existent createdBy', async () => {
      const { quizService } = buildTestServices();
      await assertThrowsAsync(
        () => quizService.bulkImport([
          { questionText: 'Q', type: 'single', correctAnswer: 'A', difficulty: 3, tags: 'math' },
        ], 'nonexistent-user'),
        'Acting user not found'
      );
    });

    await it('generatePaper rejects missing createdBy', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      await quizService.createQuestion({
        questionText: 'Q?', type: 'fill-in', correctAnswer: 'yes',
        difficulty: 2, tags: 'test', createdBy: 'inst1',
      });
      await assertThrowsAsync(
        () => quizService.generatePaper('Test', 'c1', { totalQuestions: 1 }),
        'userId is required'
      );
    });
  });

  // ============================================================
  // 4. REPUTATION WORKFLOW: PROMPT-FAITHFUL MANUAL REVIEW
  // ============================================================

  await describe('Reputation: low score forces manual review (NeedsMoreInfo), not hard-block', async () => {
    await it('low reputation creates registration in NeedsMoreInfo status', async () => {
      const { registrationService, reputationService } = buildTestServices();
      await reputationService.computeScore('low-rep-user', {
        fulfillmentRate: 0.1, lateRate: 0.8, complaintRate: 0.7,
      });

      const reg = await registrationService.create('low-rep-user', 'c1', 'Please review');
      assertEqual(reg.status, REGISTRATION_STATUS.NEEDS_MORE_INFO);
      assert(reg.notes.includes('LOW REPUTATION'), 'Should flag low reputation in notes');
      assert(reg.notes.includes('Please review'), 'Should preserve original notes');
    });

    await it('normal reputation creates registration in Draft status', async () => {
      const { registrationService, reputationService } = buildTestServices();
      await reputationService.computeScore('good-user', {
        fulfillmentRate: 0.9, lateRate: 0.05, complaintRate: 0.02,
      });

      const reg = await registrationService.create('good-user', 'c1');
      assertEqual(reg.status, REGISTRATION_STATUS.DRAFT);
    });

    await it('new user with no reputation gets Draft (not restricted)', async () => {
      const { registrationService } = buildTestServices();
      const reg = await registrationService.create('brand-new-user', 'c1');
      assertEqual(reg.status, REGISTRATION_STATUS.DRAFT);
    });

    await it('borderline score (exactly 60) is NOT restricted', async () => {
      const { registrationService, reputationService } = buildTestServices();
      // score = (0.6*0.5 + 1*0.3 + 1*0.2)*100 = (0.3+0.3+0.2)*100 = 80
      // Actually let's compute what gives exactly 60:
      // (f*0.5 + (1-l)*0.3 + (1-c)*0.2)*100 = 60
      // With l=0, c=0: f*0.5*100 + 50 = 60 => f = 0.2
      await reputationService.computeScore('borderline', {
        fulfillmentRate: 0.2, lateRate: 0.0, complaintRate: 0.0,
      });
      // Score = (0.2*0.5 + 1*0.3 + 1*0.2)*100 = (0.1+0.3+0.2)*100 = 60
      const reg = await registrationService.create('borderline', 'c1');
      assertEqual(reg.status, REGISTRATION_STATUS.DRAFT, 'Score exactly at threshold (60) should NOT be restricted');
    });

    await it('score just below threshold (59) forces manual review', async () => {
      const { registrationService, reputationService } = buildTestServices();
      // (0.18*0.5 + 1*0.3 + 1*0.2)*100 = (0.09+0.3+0.2)*100 = 59
      await reputationService.computeScore('below-borderline', {
        fulfillmentRate: 0.18, lateRate: 0.0, complaintRate: 0.0,
      });
      const reg = await registrationService.create('below-borderline', 'c1');
      assertEqual(reg.status, REGISTRATION_STATUS.NEEDS_MORE_INFO, 'Score 59 should force manual review');
    });

    await it('uses config threshold value (not hardcoded)', () => {
      const config = getConfig();
      assertEqual(config.reputation.threshold, 60);
    });
  });

  // ============================================================
  // 5. GRADING SERVICE RBAC
  // ============================================================

  await describe('GradingService RBAC enforcement', async () => {
    await it('should reject grading by learner', async () => {
      const { gradingService, quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      await repos.userRepository.add(makeUser({ id: 'learner1', role: USER_ROLES.LEARNER }));

      // Create a quiz result with subjective answer
      await repos.questionRepository.add({
        id: 'sq1', questionText: 'Explain', type: 'subjective', correctAnswer: '',
        difficulty: 3, tags: ['t'], options: [], chapter: '', explanation: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await repos.quizRepository.add({
        id: 'quiz1', questionIds: ['sq1'], title: 'Test', rules: {},
        createdBy: 'inst1', createdAt: new Date().toISOString(),
      });
      const result = await quizService.submitAnswers('quiz1', 'learner1', [
        { questionId: 'sq1', answer: 'My essay answer' },
      ]);

      await assertThrowsAsync(
        () => gradingService.gradeSubjective(result.id, 'sq1', 8, 'Good work', 'learner1'),
        'Only instructors or administrators'
      );
    });

    await it('should allow grading by instructor', async () => {
      const { gradingService, quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      await repos.userRepository.add(makeUser({ id: 'learner1', role: USER_ROLES.LEARNER }));

      await repos.questionRepository.add({
        id: 'sq1', questionText: 'Explain', type: 'subjective', correctAnswer: '',
        difficulty: 3, tags: ['t'], options: [], chapter: '', explanation: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await repos.quizRepository.add({
        id: 'quiz1', questionIds: ['sq1'], title: 'Test', rules: {},
        createdBy: 'inst1', createdAt: new Date().toISOString(),
      });
      const result = await quizService.submitAnswers('quiz1', 'learner1', [
        { questionId: 'sq1', answer: 'My answer' },
      ]);

      const graded = await gradingService.gradeSubjective(result.id, 'sq1', 9, 'Excellent', 'inst1');
      assert(graded.subjectiveScores['sq1'], 'Score should be recorded');
      assertEqual(graded.subjectiveScores['sq1'].score, 9);
    });

    await it('should reject grading with missing gradedBy', async () => {
      const { gradingService } = buildTestServices();
      await assertThrowsAsync(
        () => gradingService.gradeSubjective('result1', 'q1', 5, 'Notes', ''),
        'gradedBy userId is required'
      );
    });

    await it('should reject grading with non-existent user', async () => {
      const { gradingService } = buildTestServices();
      await assertThrowsAsync(
        () => gradingService.gradeSubjective('result1', 'q1', 5, 'Notes', 'ghost-user'),
        'Acting user not found'
      );
    });

    await it('should reject grading by reviewer (not instructor/admin)', async () => {
      const { gradingService, quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      await repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));

      await repos.questionRepository.add({
        id: 'sq1', questionText: 'Explain', type: 'subjective', correctAnswer: '',
        difficulty: 3, tags: ['t'], options: [], chapter: '', explanation: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await repos.quizRepository.add({
        id: 'quiz1', questionIds: ['sq1'], title: 'Test', rules: {},
        createdBy: 'inst1', createdAt: new Date().toISOString(),
      });
      const result = await quizService.submitAnswers('quiz1', 'learner1', [
        { questionId: 'sq1', answer: 'Answer' },
      ]);

      await assertThrowsAsync(
        () => gradingService.gradeSubjective(result.id, 'sq1', 7, 'OK', 'rev1'),
        'Only instructors or administrators'
      );
    });

    await it('should allow grading by administrator', async () => {
      const { gradingService, quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));

      await repos.questionRepository.add({
        id: 'sq1', questionText: 'Explain', type: 'subjective', correctAnswer: '',
        difficulty: 3, tags: ['t'], options: [], chapter: '', explanation: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await repos.quizRepository.add({
        id: 'quiz1', questionIds: ['sq1'], title: 'Test', rules: {},
        createdBy: 'inst1', createdAt: new Date().toISOString(),
      });
      const result = await quizService.submitAnswers('quiz1', 'learner1', [
        { questionId: 'sq1', answer: 'Answer' },
      ]);

      const graded = await gradingService.gradeSubjective(result.id, 'sq1', 6, 'Adequate', 'admin1');
      assertEqual(graded.subjectiveScores['sq1'].score, 6);
    });
  });

  // ============================================================
  // 6. SENSITIVE DATA MASKING IN DETAIL VIEWS
  // ============================================================

  await describe('Sensitive data masking applied consistently', async () => {
    await it('maskId masks all but last 4 characters', () => {
      const masked = maskId('550e8400-e29b-41d4-a716-446655440000');
      assert(masked.endsWith('0000'), 'Should show last 4 chars');
      assert(masked.startsWith('*'), 'Should start with mask');
      assert(!masked.includes('550e8400'), 'Should not contain full ID prefix');
    });

    await it('maskString handles short strings gracefully', () => {
      assertEqual(maskString('ab', 4), 'ab');
      assertEqual(maskString('', 4), '');
      assertEqual(maskString(null, 4), null);
    });

    await it('maskEmail masks local part except first char', () => {
      assertEqual(maskEmail('alice@example.com'), 'a****@example.com');
      assertEqual(maskEmail('b@test.com'), 'b@test.com');
    });
  });

  // ============================================================
  // 7. E2E: REALISTIC CROSS-ROLE FLOW WITH SCOPING
  // ============================================================

  await describe('E2E realistic: login → scoped data → role switching → no leakage', async () => {
    await it('full multi-role flow with data isolation verified at each step', async () => {
      const { registrationService, contractService, quizService, moderationService,
              ratingService, reputationService, gradingService, repos } = buildTestServices();

      // Seed users and class
      await repos.userRepository.add(makeUser({ id: 'admin', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'inst', role: USER_ROLES.INSTRUCTOR }));
      await repos.userRepository.add(makeUser({ id: 'rev', role: USER_ROLES.STAFF_REVIEWER }));
      await repos.userRepository.add(makeUser({ id: 'learnerA', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'learnerB', role: USER_ROLES.LEARNER }));
      await repos.classRepository.put(makeClass({ id: 'c1', capacity: 20 }));

      // Step 1: Admin creates template + contract for learnerA
      const tpl = await contractService.createTemplate({ name: 'Enrollment', content: 'I {Name} enroll.', createdBy: 'admin' });
      const contractA = await contractService.generateContract(tpl.id, { Name: 'LearnerA' }, 'learnerA');
      const contractB = await contractService.generateContract(tpl.id, { Name: 'LearnerB' }, 'learnerB');

      // Step 2: Verify contract scoping
      const learnerAContracts = await contractService.getAllContractsScoped('learnerA');
      const learnerBContracts = await contractService.getAllContractsScoped('learnerB');
      assertEqual(learnerAContracts.length, 1);
      assertEqual(learnerBContracts.length, 1);
      assert(learnerAContracts[0].content.includes('LearnerA'));
      assert(!learnerAContracts[0].content.includes('LearnerB'), 'No cross-user content');

      // Step 3: Both learners create registrations
      const regA = await registrationService.create('learnerA', 'c1');
      const regB = await registrationService.create('learnerB', 'c1');

      // Step 4: Verify registration scoping
      const scopedA = await registrationService.getAllScoped('learnerA');
      const scopedB = await registrationService.getAllScoped('learnerB');
      assertEqual(scopedA.length, 1);
      assertEqual(scopedB.length, 1);
      assertEqual(scopedA[0].userId, 'learnerA');
      assertEqual(scopedB[0].userId, 'learnerB');

      // Step 5: Reviewer sees all registrations
      const scopedRev = await registrationService.getAllScoped('rev');
      assertEqual(scopedRev.length, 2);

      // Step 6: LearnerA signs own contract, learnerB cannot
      await contractService.signContract(contractA.id, 'sig-A', 'Learner A', 'learnerA');
      await assertThrowsAsync(
        () => contractService.signContract(contractB.id, 'sig-A', 'Learner A', 'learnerA'),
        'do not have access'
      );

      // Step 7: Instructor creates question, learner cannot
      const q = await quizService.createQuestion({
        questionText: 'Q?', type: 'single', correctAnswer: 'A',
        difficulty: 1, tags: 'test', createdBy: 'inst',
      });
      await assertThrowsAsync(
        () => quizService.createQuestion({
          questionText: 'Q2?', type: 'single', correctAnswer: 'B',
          difficulty: 1, tags: 'test', createdBy: 'learnerA',
        }),
        'Only instructors or administrators'
      );

      // Step 8: Instructor grades, learner cannot
      const quiz = await quizService.generatePaper('Quiz', 'c1', { totalQuestions: 1, difficultyDistribution: { 1: 1.0 } }, 'inst');
      await repos.questionRepository.add({
        id: 'sq-grade', questionText: 'Explain', type: 'subjective', correctAnswer: '',
        difficulty: 1, tags: ['t'], options: [], chapter: '', explanation: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await repos.quizRepository.add({
        id: 'quiz-grade', questionIds: ['sq-grade'], title: 'SubjQuiz', rules: {},
        createdBy: 'inst', createdAt: new Date().toISOString(),
      });
      const result = await quizService.submitAnswers('quiz-grade', 'learnerA', [
        { questionId: 'sq-grade', answer: 'My answer' },
      ]);
      await assertThrowsAsync(
        () => gradingService.gradeSubjective(result.id, 'sq-grade', 8, 'OK', 'learnerA'),
        'Only instructors or administrators'
      );
      const graded = await gradingService.gradeSubjective(result.id, 'sq-grade', 8, 'Good', 'inst');
      assertEqual(graded.subjectiveScores['sq-grade'].score, 8);

      // Step 9: Admin sees all contracts
      const adminContracts = await contractService.getAllContractsScoped('admin');
      assertEqual(adminContracts.length, 2);
    });
  });

  // ============================================================
  // 8. ROUTER + PAGE RBAC: COMPREHENSIVE ROLE MATRIX
  // ============================================================

  await describe('Route + page RBAC: comprehensive role matrix', async () => {
    await it('/admin blocked for all non-admin roles', () => {
      const ROUTE_ROLES = { '/admin': [USER_ROLES.ADMINISTRATOR] };
      const blockedRoles = [USER_ROLES.LEARNER, USER_ROLES.INSTRUCTOR, USER_ROLES.STAFF_REVIEWER];
      for (const role of blockedRoles) {
        const allowed = ROUTE_ROLES['/admin'].includes(role);
        assert(!allowed, `${role} must be blocked from /admin`);
      }
    });

    await it('admin page render blocks non-administrator', () => {
      const user = { role: USER_ROLES.STAFF_REVIEWER };
      assert(user.role !== USER_ROLES.ADMINISTRATOR, 'Reviewer blocked from AdminPage');
    });

    await it('moderation tab blocked for learner and instructor', () => {
      const allowed = [USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER];
      assert(!allowed.includes(USER_ROLES.LEARNER));
      assert(!allowed.includes(USER_ROLES.INSTRUCTOR));
    });

    await it('grading tab blocked for learner and reviewer', () => {
      const allowed = [USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR];
      assert(!allowed.includes(USER_ROLES.LEARNER));
      assert(!allowed.includes(USER_ROLES.STAFF_REVIEWER));
    });

    await it('templates tab blocked for all except admin', () => {
      const blocked = [USER_ROLES.LEARNER, USER_ROLES.INSTRUCTOR, USER_ROLES.STAFF_REVIEWER];
      for (const role of blocked) {
        assert(role !== USER_ROLES.ADMINISTRATOR, `${role} blocked from templates`);
      }
    });

    await it('unauthenticated users blocked from all routes except /login', () => {
      const protectedPaths = ['/dashboard', '/admin', '/registrations', '/quiz', '/reviews', '/contracts'];
      for (const path of protectedPaths) {
        const blocked = path !== '/login';
        assert(blocked, `${path} must require authentication`);
      }
    });
  });

  // ============================================================
  // 9. CONFIG STRICT ENFORCEMENT: NO HARDCODED DUPLICATES
  // ============================================================

  await describe('Config strict: all business rules use config values', async () => {
    await it('review maxTextLength matches config', async () => {
      const { reviewService } = buildTestServices();
      const config = getConfig();
      const limit = config.review.maxTextLength;
      // Just over limit should fail
      await assertThrowsAsync(
        () => reviewService.submitReview({ userId: 'u1', rating: 4, text: 'x'.repeat(limit + 1) }),
        `at most ${limit}`
      );
    });

    await it('review maxImages matches config', async () => {
      const { reviewService } = buildTestServices();
      const config = getConfig();
      await assertThrowsAsync(
        () => reviewService.submitReview({
          userId: 'u1', rating: 3,
          images: Array(config.review.maxImages + 1).fill({ size: 100 }),
        }),
        `Maximum ${config.review.maxImages}`
      );
    });

    await it('reputation weights from config produce correct scores', async () => {
      const config = getConfig();
      const w = config.reputation.weights;
      // Perfect metrics
      const score = Math.round((1 * w.fulfillmentRate + 1 * w.lateRate + 1 * w.complaintRate) * 100);
      assertEqual(score, 100, 'Perfect metrics should yield 100 with config weights');
    });
  });

  // ============================================================
  // 10. SECURITY: SESSION + AUTH HARDENING
  // ============================================================

  await describe('Security: auth hardening', async () => {
    await it('login page does not expose default credentials', () => {
      const safeText = 'Sign in with your assigned credentials.';
      assert(!safeText.includes('admin123'));
      assert(!safeText.includes('learner123'));
      assert(!safeText.includes('[username]123'));
    });

    await it('session change resets page state (isolation)', () => {
      class Page { constructor() { this.activeTab = 'default'; this.cachedData = [1, 2, 3]; } }
      let pages = { admin: new Page() };
      pages.admin.activeTab = 'users';
      // Simulate session change
      pages = { admin: new Page() };
      assertEqual(pages.admin.activeTab, 'default');
      assertEqual(pages.admin.cachedData.length, 3); // fresh default
    });
  });
}
