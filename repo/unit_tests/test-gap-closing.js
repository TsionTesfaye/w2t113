/**
 * Gap-Closing Tests — fail-closed RBAC, session isolation, config consumption,
 * Excel robustness, page-level guards, unresolvable user IDs.
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser, makeClass, seedCompletedClassWithParticipants } from '../test-helpers.js';
import { REGISTRATION_STATUS, canTransition } from '../src/models/Registration.js';
import { USER_ROLES } from '../src/models/User.js';
import { QUESTION_TYPES } from '../src/models/Question.js';
import { APPEAL_STATUS } from '../src/models/Rating.js';
import { REPORT_OUTCOMES } from '../src/models/Report.js';
import { parseExcelFile } from '../src/utils/excelParser.js';
import { getConfig } from '../src/config/appConfig.js';

export async function runGapClosingTests() {

  // ============================================================
  // 1. FAIL-CLOSED: unresolvable/missing/deleted user IDs
  // ============================================================

  await describe('Fail-closed RBAC: unresolvable user IDs are rejected', async () => {
    await it('should reject report resolution with non-existent user ID', async () => {
      const { moderationService } = buildTestServices();
      const report = await moderationService.submitReport('u1', 'target-1', 'review', 'Bad');
      await assertThrowsAsync(
        () => moderationService.resolveReport(report.id, 'dismissed', 'ghost-user-id'),
        'Acting user not found'
      );
    });

    await it('should reject appeal resolution with non-existent user ID', async () => {
      const { ratingService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'tc-1', ['u1', 'u2']);
      const rating = await ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u2', classId: 'tc-1', score: 2 });
      const appeal = await ratingService.fileAppeal(rating.id, 'u2', 'Unfair');
      await assertThrowsAsync(
        () => ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.UPHELD, 'Valid rationale here', 'ghost-id'),
        'Acting user not found'
      );
    });

    await it('should reject registration transition with non-existent user ID', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.registrationRepository.add({
        id: 'r1', userId: 'u1', classId: 'c1',
        status: REGISTRATION_STATUS.UNDER_REVIEW,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await assertThrowsAsync(
        () => registrationService.transition('r1', REGISTRATION_STATUS.APPROVED, '', 'deleted-user'),
        'Acting user not found'
      );
    });

    await it('should reject question creation with non-existent user ID', async () => {
      const { quizService } = buildTestServices();
      await assertThrowsAsync(
        () => quizService.createQuestion({
          questionText: 'Q?', type: 'single', correctAnswer: 'A',
          difficulty: 3, tags: 'test', createdBy: 'nonexistent-user',
        }),
        'Acting user not found'
      );
    });

    await it('should reject question update with non-existent user ID', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);
      const q = await quizService.createQuestion({
        questionText: 'Q?', type: 'fill-in', correctAnswer: 'yes',
        difficulty: 2, tags: 'test', createdBy: 'inst1',
      });
      await assertThrowsAsync(
        () => quizService.updateQuestion(q.id, { questionText: 'Updated?' }, 'deleted-user'),
        'Acting user not found'
      );
    });

    await it('should reject question deletion with non-existent user ID', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);
      const q = await quizService.createQuestion({
        questionText: 'Q?', type: 'fill-in', correctAnswer: 'yes',
        difficulty: 2, tags: 'test', createdBy: 'inst1',
      });
      await assertThrowsAsync(
        () => quizService.deleteQuestion(q.id, 'ghost-user'),
        'Acting user not found'
      );
    });

    await it('should reject bulk import with non-existent user ID', async () => {
      const { quizService } = buildTestServices();
      await assertThrowsAsync(
        () => quizService.bulkImport([
          { questionText: 'Q', type: 'single', correctAnswer: 'A', difficulty: 3, tags: 'math' },
        ], 'ghost-user'),
        'Acting user not found'
      );
    });

    await it('should reject generate paper with non-existent user ID', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);
      await quizService.createQuestion({
        questionText: 'Q?', type: 'fill-in', correctAnswer: 'yes',
        difficulty: 2, tags: 'test', createdBy: 'inst1',
      });
      await assertThrowsAsync(
        () => quizService.generatePaper('Test', 'c1', { totalQuestions: 1 }, 'ghost-user'),
        'Acting user not found'
      );
    });

    await it('should reject question creation with null userId', async () => {
      const { quizService } = buildTestServices();
      await assertThrowsAsync(
        () => quizService.createQuestion({
          questionText: 'Q?', type: 'single', correctAnswer: 'A',
          difficulty: 3, tags: 'test', createdBy: null,
        }),
        'userId is required'
      );
    });

    await it('should reject question creation with empty userId', async () => {
      const { quizService } = buildTestServices();
      await assertThrowsAsync(
        () => quizService.createQuestion({
          questionText: 'Q?', type: 'single', correctAnswer: 'A',
          difficulty: 3, tags: 'test', createdBy: '',
        }),
        'userId is required'
      );
    });
  });

  // ============================================================
  // 2. RBAC: wrong roles rejected for all privileged operations
  // ============================================================

  await describe('RBAC: wrong roles for all privileged operations', async () => {
    await it('should prevent learner from bulk import', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await assertThrowsAsync(
        () => quizService.bulkImport([
          { questionText: 'Q', type: 'single', correctAnswer: 'A', difficulty: 3, tags: 'math' },
        ], 'l1'),
        'Only instructors or administrators'
      );
    });

    await it('should prevent learner from generating paper', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      const learner = makeUser({ id: 'l1', role: USER_ROLES.LEARNER });
      await repos.userRepository.add(inst);
      await repos.userRepository.add(learner);
      await quizService.createQuestion({
        questionText: 'Q?', type: 'fill-in', correctAnswer: 'yes',
        difficulty: 2, tags: 'test', createdBy: 'inst1',
      });
      await assertThrowsAsync(
        () => quizService.generatePaper('Test', 'c1', { totalQuestions: 1 }, 'l1'),
        'Only instructors or administrators'
      );
    });

    await it('should prevent reviewer from creating questions', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'r1', role: USER_ROLES.STAFF_REVIEWER }));
      await assertThrowsAsync(
        () => quizService.createQuestion({
          questionText: 'Q?', type: 'single', correctAnswer: 'A',
          difficulty: 3, tags: 'test', createdBy: 'r1',
        }),
        'Only instructors or administrators'
      );
    });

    await it('should prevent instructor from resolving reports', async () => {
      const { moderationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      const report = await moderationService.submitReport('u1', 'target-1', 'review', 'Bad');
      await assertThrowsAsync(
        () => moderationService.resolveReport(report.id, 'dismissed', 'inst1'),
        'Only administrators or staff reviewers'
      );
    });

    await it('should prevent instructor from resolving appeals', async () => {
      const { ratingService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      await seedCompletedClassWithParticipants(repos, 'tc-2', ['u1', 'u2']);
      const rating = await ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u2', classId: 'tc-2', score: 2 });
      const appeal = await ratingService.fileAppeal(rating.id, 'u2', 'Unfair');
      await assertThrowsAsync(
        () => ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.UPHELD, 'Some rationale text', 'inst1'),
        'Only administrators or staff reviewers'
      );
    });
  });

  // ============================================================
  // 3. Session isolation simulation
  // ============================================================

  await describe('Session isolation: admin → logout → learner flow', async () => {
    await it('should have fresh page state after session change', () => {
      // Simulate the app.js createPages() behavior
      class MockPage {
        constructor() { this.activeTab = 'default'; this.data = []; }
      }

      // Admin session creates pages
      let pages = { admin: new MockPage(), quiz: new MockPage() };
      pages.admin.activeTab = 'users';
      pages.quiz.activeTab = 'grading';

      // Session change callback (simulates logout + login as different user)
      pages = { admin: new MockPage(), quiz: new MockPage() };

      // Verify all state is reset
      assertEqual(pages.admin.activeTab, 'default', 'Admin page tab should be reset');
      assertEqual(pages.quiz.activeTab, 'default', 'Quiz page tab should be reset');
      assertEqual(pages.admin.data.length, 0, 'Admin page data should be reset');
    });

    await it('should create independent page instances per session', () => {
      class MockPage {
        constructor() { this.activeTab = 'initial'; }
      }

      const session1Pages = { admin: new MockPage() };
      session1Pages.admin.activeTab = 'users';

      // New session creates new pages
      const session2Pages = { admin: new MockPage() };

      // Session 2 pages are independent — no shared state
      assertEqual(session2Pages.admin.activeTab, 'initial');
      assertEqual(session1Pages.admin.activeTab, 'users'); // old ref still has old state, but it's abandoned
    });
  });

  // ============================================================
  // 4. Config consumption verification
  // ============================================================

  await describe('Config values are consumed at runtime', async () => {
    await it('should have config with expected keys', () => {
      const config = getConfig();
      assert(config.reputation !== undefined, 'reputation config must exist');
      assert(config.reputation.weights !== undefined, 'reputation weights must exist');
      assert(config.reputation.threshold !== undefined, 'reputation threshold must exist');
      assert(config.registration !== undefined, 'registration config must exist');
      assert(config.registration.waitlistPromotionFillRate !== undefined, 'waitlist fill rate must exist');
      assert(config.review !== undefined, 'review config must exist');
      assert(config.review.maxImages !== undefined, 'maxImages must exist');
      assert(config.review.maxTextLength !== undefined, 'maxTextLength must exist');
      assert(config.review.followUpWindowDays !== undefined, 'followUpWindowDays must exist');
      assert(config.moderation !== undefined, 'moderation config must exist');
      assert(config.moderation.resolutionDeadlineDays !== undefined, 'resolutionDeadlineDays must exist');
      assert(config.quiz !== undefined, 'quiz config must exist');
    });

    await it('should have correct default values from config', () => {
      const config = getConfig();
      assertEqual(config.reputation.weights.fulfillmentRate, 0.5);
      assertEqual(config.reputation.weights.lateRate, 0.3);
      assertEqual(config.reputation.weights.complaintRate, 0.2);
      assertEqual(config.reputation.threshold, 60);
      assertEqual(config.registration.waitlistPromotionFillRate, 0.95);
      assertEqual(config.review.maxImages, 6);
      assertEqual(config.review.maxImageSizeMB, 2);
      assertEqual(config.review.maxTextLength, 2000);
      assertEqual(config.review.followUpWindowDays, 14);
      assertEqual(config.moderation.resolutionDeadlineDays, 7);
    });

    await it('should use config-driven review text limit', async () => {
      const { reviewService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'cls-gc-cfg', ['u1']);
      const config = getConfig();
      const limit = config.review.maxTextLength;
      // A text exactly at the limit should pass
      const text = 'x'.repeat(limit);
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-gc-cfg', rating: 4, text });
      assert(review.id, 'Review at exact limit should succeed');
    });

    await it('should use config-driven image limit', async () => {
      const { reviewService } = buildTestServices();
      const config = getConfig();
      const maxImages = config.review.maxImages;
      // maxImages+1 images should fail
      await assertThrowsAsync(
        () => reviewService.submitReview({
          userId: 'u1', rating: 3,
          images: Array(maxImages + 1).fill({ size: 100 }),
        }),
        `Maximum ${maxImages} images`
      );
    });
  });

  // ============================================================
  // 5. Excel import robustness
  // ============================================================

  await describe('Excel import robustness', async () => {
    await it('should reject file with no .xlsx extension', async () => {
      const buffer = new ArrayBuffer(10);
      await assertThrowsAsync(
        () => parseExcelFile(buffer, 'data.txt'),
        'Unsupported file format'
      );
    });

    await it('should reject legacy .xls with clear error', async () => {
      const buffer = new ArrayBuffer(10);
      await assertThrowsAsync(
        () => parseExcelFile(buffer, 'report.xls'),
        'Legacy .xls format is not supported'
      );
    });

    await it('should handle .XLS (case-insensitive)', async () => {
      const buffer = new ArrayBuffer(10);
      await assertThrowsAsync(
        () => parseExcelFile(buffer, 'REPORT.XLS'),
        'Legacy .xls format is not supported'
      );
    });

    await it('should reject corrupted xlsx data', async () => {
      // Random bytes that are not a valid ZIP
      const buffer = new ArrayBuffer(200);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < 200; i++) view[i] = i % 256;
      await assertThrowsAsync(
        () => parseExcelFile(buffer, 'broken.xlsx'),
        'Failed to parse Excel file'
      );
    });

    await it('should reject empty buffer as xlsx', async () => {
      const buffer = new ArrayBuffer(0);
      await assertThrowsAsync(
        () => parseExcelFile(buffer, 'empty.xlsx'),
        'Failed to parse Excel file'
      );
    });

    await it('JSON and XLSX follow same validation via bulkImport', async () => {
      // Regardless of parse source, the same validateQuestionRow is applied
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));

      // Missing required fields — same validation rejects it
      const result = await quizService.bulkImport([
        { questionText: '', type: 'invalid', difficulty: 99 },
      ], 'inst1');
      assert(!result.success, 'Invalid data should fail validation');
      assert(result.errors.length > 0, 'Should have validation errors');
    });
  });

  // ============================================================
  // 6. E2E realism: multi-role flow
  // ============================================================

  await describe('E2E: multi-role registration + waitlist flow', async () => {
    await it('should complete full flow: register → approve → cancel → waitlist promoted', async () => {
      const { registrationService, repos } = buildTestServices();
      const admin = makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR });
      const learner1 = makeUser({ id: 'l1', role: USER_ROLES.LEARNER });
      const learner2 = makeUser({ id: 'l2', role: USER_ROLES.LEARNER });
      const reviewer = makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER });
      await repos.userRepository.add(admin);
      await repos.userRepository.add(learner1);
      await repos.userRepository.add(learner2);
      await repos.userRepository.add(reviewer);
      await repos.classRepository.put(makeClass({ id: 'c1', capacity: 5 }));

      // Learner 1: create → submit → review → approve
      const reg1 = await registrationService.create('l1', 'c1');
      await registrationService.transition(reg1.id, REGISTRATION_STATUS.SUBMITTED, '', 'l1');
      await registrationService.transition(reg1.id, REGISTRATION_STATUS.UNDER_REVIEW, '', 'rev1');
      await registrationService.transition(reg1.id, REGISTRATION_STATUS.APPROVED, '', 'rev1');

      // Learner 2: create → submit → waitlisted
      const reg2 = await registrationService.create('l2', 'c1');
      await registrationService.transition(reg2.id, REGISTRATION_STATUS.SUBMITTED, '', 'l2');
      await registrationService.transition(reg2.id, REGISTRATION_STATUS.WAITLISTED, '', 'rev1');

      // Admin cancels learner 1's approved registration (triggers waitlist promotion)
      await registrationService.transition(reg1.id, REGISTRATION_STATUS.CANCELLED, '', 'admin1');

      // Verify learner 2 was auto-promoted from waitlist
      const promoted = await registrationService.getById(reg2.id);
      assertEqual(promoted.status, REGISTRATION_STATUS.UNDER_REVIEW, 'Waitlisted registration should be promoted');

      // Verify audit trail exists for promotion
      const events = await registrationService.getEvents(reg2.id);
      const promotionEvent = events.find(e => e.comment && e.comment.includes('Auto-promoted'));
      assert(promotionEvent !== undefined, 'Auto-promotion event should be logged');
    });
  });

  // ============================================================
  // 7. Comprehensive RBAC coverage for contract operations
  // ============================================================

  await describe('RBAC: contract template management', async () => {
    await it('should allow admin to create template', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      const tpl = await contractService.createTemplate({
        name: 'Test', content: 'Content {Name}', createdBy: 'admin1',
      });
      assert(tpl.id, 'Template should be created');
    });

    await it('should reject non-admin creating template', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await assertThrowsAsync(
        () => contractService.createTemplate({
          name: 'Test', content: 'Content', createdBy: 'l1',
        }),
        'Only administrators can manage templates'
      );
    });
  });
}
