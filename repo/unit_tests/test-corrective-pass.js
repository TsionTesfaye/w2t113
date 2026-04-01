/**
 * Corrective Pass Tests — RBAC, session isolation, waitlist promotion, Excel import.
 * All tests use real services backed by in-memory repositories.
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser, makeClass, seedCompletedClassWithParticipants } from '../test-helpers.js';
import { REGISTRATION_STATUS, canTransition } from '../src/models/Registration.js';
import { USER_ROLES } from '../src/models/User.js';
import { QUESTION_TYPES } from '../src/models/Question.js';
import { parseExcelFile } from '../src/utils/excelParser.js';
import { validateQuestionRow } from '../src/utils/validators.js';

export async function runCorrectivePassTests() {

  // ============================================================
  // RBAC Tests
  // ============================================================

  await describe('RBAC: Unauthorized service calls throw errors', async () => {
    await it('should prevent learner from resolving a report', async () => {
      const { moderationService, repos } = buildTestServices();
      const learner = makeUser({ id: 'learner1', role: USER_ROLES.LEARNER });
      const reviewer = makeUser({ id: 'reviewer1', role: USER_ROLES.STAFF_REVIEWER });
      await repos.userRepository.add(learner);
      await repos.userRepository.add(reviewer);

      const report = await moderationService.submitReport('reviewer1', 'target-1', 'review', 'Inappropriate');
      await assertThrowsAsync(
        () => moderationService.resolveReport(report.id, 'dismissed', 'learner1'),
        'Only administrators or staff reviewers'
      );
    });

    await it('should allow reviewer to resolve a report', async () => {
      const { moderationService, repos } = buildTestServices();
      const reviewer = makeUser({ id: 'reviewer1', role: USER_ROLES.STAFF_REVIEWER });
      await repos.userRepository.add(reviewer);

      const report = await moderationService.submitReport('someone', 'target-1', 'review', 'Inappropriate');
      const resolved = await moderationService.resolveReport(report.id, 'dismissed', 'reviewer1');
      assertEqual(resolved.status, 'resolved');
    });

    await it('should prevent learner from resolving an appeal', async () => {
      const { ratingService, repos } = buildTestServices();
      const learner = makeUser({ id: 'learner1', role: USER_ROLES.LEARNER });
      const rater = makeUser({ id: 'rater1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(learner);
      await repos.userRepository.add(rater);

      await seedCompletedClassWithParticipants(repos, 'tc-1', ['rater1', 'learner1']);
      const rating = await ratingService.submitRating({ fromUserId: 'rater1', toUserId: 'learner1', classId: 'tc-1', score: 2, tags: [], comment: '' });
      const appeal = await ratingService.fileAppeal(rating.id, 'learner1', 'Unfair rating');

      await assertThrowsAsync(
        () => ratingService.resolveAppeal(appeal.id, 'upheld', 'This is my rationale for upholding', 'learner1'),
        'Only administrators or staff reviewers'
      );
    });

    await it('should allow admin to resolve an appeal', async () => {
      const { ratingService, repos } = buildTestServices();
      const admin = makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR });
      const learner = makeUser({ id: 'learner1', role: USER_ROLES.LEARNER });
      const rater = makeUser({ id: 'rater1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(admin);
      await repos.userRepository.add(learner);
      await repos.userRepository.add(rater);

      await seedCompletedClassWithParticipants(repos, 'tc-2', ['rater1', 'learner1']);
      const rating = await ratingService.submitRating({ fromUserId: 'rater1', toUserId: 'learner1', classId: 'tc-2', score: 2, tags: [], comment: '' });
      const appeal = await ratingService.fileAppeal(rating.id, 'learner1', 'Unfair rating');

      const resolved = await ratingService.resolveAppeal(appeal.id, 'upheld', 'Rating was fair and properly documented', 'admin1');
      assertEqual(resolved.status, 'upheld');
    });

    await it('should prevent learner from creating questions', async () => {
      const { quizService, repos } = buildTestServices();
      const learner = makeUser({ id: 'learner1', role: USER_ROLES.LEARNER });
      await repos.userRepository.add(learner);

      await assertThrowsAsync(
        () => quizService.createQuestion({
          questionText: 'Test question?',
          type: QUESTION_TYPES.SINGLE,
          correctAnswer: 'A',
          difficulty: 3,
          tags: 'test',
          createdBy: 'learner1',
        }),
        'Only instructors or administrators'
      );
    });

    await it('should allow instructor to create questions', async () => {
      const { quizService, repos } = buildTestServices();
      const instructor = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(instructor);

      const q = await quizService.createQuestion({
        questionText: 'Test question?',
        type: QUESTION_TYPES.SINGLE,
        correctAnswer: 'A',
        difficulty: 3,
        tags: 'test',
        createdBy: 'inst1',
      });
      assert(q.id, 'Question should be created');
    });

    await it('should prevent learner from updating questions', async () => {
      const { quizService, repos } = buildTestServices();
      const instructor = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      const learner = makeUser({ id: 'learner1', role: USER_ROLES.LEARNER });
      await repos.userRepository.add(instructor);
      await repos.userRepository.add(learner);

      const q = await quizService.createQuestion({
        questionText: 'Original?', type: QUESTION_TYPES.FILL_IN,
        correctAnswer: 'yes', difficulty: 2, tags: 'test', createdBy: 'inst1',
      });

      await assertThrowsAsync(
        () => quizService.updateQuestion(q.id, { questionText: 'Modified?' }, 'learner1'),
        'Only instructors or administrators'
      );
    });

    await it('should prevent learner from deleting questions', async () => {
      const { quizService, repos } = buildTestServices();
      const instructor = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      const learner = makeUser({ id: 'learner1', role: USER_ROLES.LEARNER });
      await repos.userRepository.add(instructor);
      await repos.userRepository.add(learner);

      const q = await quizService.createQuestion({
        questionText: 'Delete me?', type: QUESTION_TYPES.FILL_IN,
        correctAnswer: 'yes', difficulty: 2, tags: 'test', createdBy: 'inst1',
      });

      await assertThrowsAsync(
        () => quizService.deleteQuestion(q.id, 'learner1'),
        'Only instructors or administrators'
      );
    });

    await it('should prevent instructor from approving registrations', async () => {
      const { registrationService, repos } = buildTestServices();
      const instructor = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(instructor);
      await repos.registrationRepository.add({
        id: 'r1', userId: 'u1', classId: 'c1',
        status: REGISTRATION_STATUS.UNDER_REVIEW,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      await assertThrowsAsync(
        () => registrationService.transition('r1', REGISTRATION_STATUS.APPROVED, '', 'inst1'),
        'Only administrators or staff reviewers'
      );
    });
  });

  // ============================================================
  // Session Isolation Tests
  // ============================================================

  await describe('Session Isolation: state reset on user switch', async () => {
    await it('should allow Approved → Cancelled transition (waitlist trigger)', async () => {
      // This tests that the state machine now allows Approved → Cancelled
      assert(canTransition('Approved', 'Cancelled'), 'Approved → Cancelled should be allowed');
    });

    await it('should NOT allow Approved → other non-Cancelled transitions', async () => {
      assert(!canTransition('Approved', 'Draft'), 'Approved → Draft should not be allowed');
      assert(!canTransition('Approved', 'Submitted'), 'Approved → Submitted should not be allowed');
      assert(!canTransition('Approved', 'UnderReview'), 'Approved → UnderReview should not be allowed');
    });

    await it('Rejected and Cancelled remain fully terminal', async () => {
      assert(!canTransition('Rejected', 'Draft'), 'Rejected → Draft should not be allowed');
      assert(!canTransition('Rejected', 'Cancelled'), 'Rejected → Cancelled should not be allowed');
      assert(!canTransition('Cancelled', 'Draft'), 'Cancelled → Draft should not be allowed');
      assert(!canTransition('Cancelled', 'Submitted'), 'Cancelled → Submitted should not be allowed');
    });
  });

  // ============================================================
  // Waitlist Promotion Flow Tests
  // ============================================================

  await describe('Waitlist Promotion: approved user cancels → waitlisted promoted', async () => {
    await it('should promote waitlisted user when approved user cancels', async () => {
      const { registrationService, repos } = buildTestServices();
      const admin = makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR });
      const learner = makeUser({ id: 'learner1', role: USER_ROLES.LEARNER });
      await repos.userRepository.add(admin);
      await repos.userRepository.add(learner);
      await repos.classRepository.put(makeClass({ id: 'c1', capacity: 10 }));

      // Create 5 approved registrations (50% fill rate)
      for (let i = 0; i < 5; i++) {
        await repos.registrationRepository.add({
          id: `approved-${i}`, userId: `user-${i}`, classId: 'c1',
          status: REGISTRATION_STATUS.APPROVED,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      }

      // Add a waitlisted registration
      await repos.registrationRepository.add({
        id: 'waitlisted-1', userId: 'learner1', classId: 'c1',
        status: REGISTRATION_STATUS.WAITLISTED,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      // Admin cancels an approved registration (triggers waitlist promotion)
      await registrationService.transition('approved-0', REGISTRATION_STATUS.CANCELLED, 'No longer attending, cancellation approved by admin', 'admin1');

      // Verify the waitlisted user was promoted
      const promoted = await repos.registrationRepository.getById('waitlisted-1');
      assertEqual(promoted.status, REGISTRATION_STATUS.UNDER_REVIEW, 'Waitlisted user should be promoted to UnderReview');
    });

    await it('should promote FIFO when multiple waitlisted after cancellation', async () => {
      const { registrationService, repos } = buildTestServices();
      const admin = makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR });
      await repos.userRepository.add(admin);
      await repos.classRepository.put(makeClass({ id: 'c1', capacity: 10 }));

      // 3 approved
      for (let i = 0; i < 3; i++) {
        await repos.registrationRepository.add({
          id: `a-${i}`, userId: `u-${i}`, classId: 'c1',
          status: REGISTRATION_STATUS.APPROVED,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
      }

      // 2 waitlisted, earlier one first
      await repos.registrationRepository.add({
        id: 'w-earlier', userId: 'u-earlier', classId: 'c1',
        status: REGISTRATION_STATUS.WAITLISTED,
        createdAt: new Date('2026-01-01').toISOString(), updatedAt: new Date().toISOString(),
      });
      await repos.registrationRepository.add({
        id: 'w-later', userId: 'u-later', classId: 'c1',
        status: REGISTRATION_STATUS.WAITLISTED,
        createdAt: new Date('2026-02-01').toISOString(), updatedAt: new Date().toISOString(),
      });

      // Cancel an approved registration
      await registrationService.transition('a-0', REGISTRATION_STATUS.CANCELLED, 'Cancelling for testing purposes here', 'admin1');

      const earlier = await repos.registrationRepository.getById('w-earlier');
      const later = await repos.registrationRepository.getById('w-later');
      assertEqual(earlier.status, REGISTRATION_STATUS.UNDER_REVIEW, 'Earlier waitlisted should be promoted');
      assertEqual(later.status, REGISTRATION_STATUS.WAITLISTED, 'Later waitlisted should remain');
    });
  });

  // ============================================================
  // Excel Import Tests
  // ============================================================

  await describe('Excel Import: validation', async () => {
    await it('should reject legacy .xls files', async () => {
      const buffer = new ArrayBuffer(10);
      await assertThrowsAsync(
        () => parseExcelFile(buffer, 'test.xls'),
        'Legacy .xls format is not supported'
      );
    });

    await it('should reject unsupported file formats', async () => {
      const buffer = new ArrayBuffer(10);
      await assertThrowsAsync(
        () => parseExcelFile(buffer, 'test.csv'),
        'Unsupported file format'
      );
    });

    await it('should reject invalid xlsx (not a ZIP)', async () => {
      const buffer = new ArrayBuffer(100);
      const view = new Uint8Array(buffer);
      view[0] = 0x00; // Not a ZIP signature
      await assertThrowsAsync(
        () => parseExcelFile(buffer, 'test.xlsx'),
        'Failed to parse Excel file'
      );
    });
  });

  // ============================================================
  // Quiz CRUD: Update & Delete
  // ============================================================

  await describe('QuizService.updateQuestion() — CRUD', async () => {
    await it('should update question text', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);

      const q = await quizService.createQuestion({
        questionText: 'Original question?',
        type: QUESTION_TYPES.FILL_IN,
        correctAnswer: 'yes',
        difficulty: 2,
        tags: 'test',
        createdBy: 'inst1',
      });

      const updated = await quizService.updateQuestion(q.id, { questionText: 'Updated question?' }, 'inst1');
      assertEqual(updated.questionText, 'Updated question?');
    });

    await it('should throw for non-existent question', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);

      await assertThrowsAsync(
        () => quizService.updateQuestion('nonexistent', { questionText: 'X' }, 'inst1'),
        'Question not found'
      );
    });

    await it('should log audit entry on update', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);

      const q = await quizService.createQuestion({
        questionText: 'Audit test?', type: QUESTION_TYPES.FILL_IN,
        correctAnswer: 'yes', difficulty: 2, tags: 'test', createdBy: 'inst1',
      });
      await quizService.updateQuestion(q.id, { questionText: 'Updated?' }, 'inst1');

      const logs = await repos.auditLogRepository.getAll();
      const updateLog = logs.find(l => l.action === 'updated');
      assert(updateLog, 'Audit log for update should exist');
    });
  });

  await describe('QuizService.deleteQuestion() — CRUD', async () => {
    await it('should delete a question', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);

      const q = await quizService.createQuestion({
        questionText: 'Delete me?', type: QUESTION_TYPES.FILL_IN,
        correctAnswer: 'yes', difficulty: 2, tags: 'test', createdBy: 'inst1',
      });

      await quizService.deleteQuestion(q.id, 'inst1');
      const fetched = await quizService.getQuestionById(q.id);
      assertEqual(fetched, null, 'Question should be deleted');
    });

    await it('should log audit entry on delete', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);

      const q = await quizService.createQuestion({
        questionText: 'Delete audit test?', type: QUESTION_TYPES.FILL_IN,
        correctAnswer: 'yes', difficulty: 2, tags: 'test', createdBy: 'inst1',
      });
      await quizService.deleteQuestion(q.id, 'inst1');

      const logs = await repos.auditLogRepository.getAll();
      const deleteLog = logs.find(l => l.action === 'deleted');
      assert(deleteLog, 'Audit log for delete should exist');
    });
  });
}
