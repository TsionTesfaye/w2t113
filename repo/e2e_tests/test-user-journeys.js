/**
 * E2E Tests — Complete user journeys using REAL services with in-memory repos.
 * No duplicated logic — all assertions exercise actual service code.
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser, makeClass, seedCompletedClassWithParticipants } from '../test-helpers.js';
import { REGISTRATION_STATUS } from '../src/models/Registration.js';
import { USER_ROLES } from '../src/models/User.js';
import { APPEAL_STATUS } from '../src/models/Rating.js';
import { REPORT_OUTCOMES } from '../src/models/Report.js';
import { validateQuestionRow } from '../src/utils/validators.js';

export async function runE2ETests() {
  await describe('E2E: Learner registration journey (real services)', async () => {
    await it('should complete: create → submit → review → approve with full audit', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'learner1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));
      await repos.classRepository.put(makeClass({ id: 'class1', capacity: 30 }));

      const reg = await registrationService.create('learner1', 'class1', 'Interested');
      assertEqual(reg.status, REGISTRATION_STATUS.DRAFT);

      await registrationService.transition(reg.id, REGISTRATION_STATUS.SUBMITTED, '', 'learner1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.UNDER_REVIEW, '', 'rev1');
      const approved = await registrationService.transition(reg.id, REGISTRATION_STATUS.APPROVED, '', 'rev1');
      assertEqual(approved.status, REGISTRATION_STATUS.APPROVED);

      // Verify full audit trail persisted
      const auditLogs = await repos.auditLogRepository.getAll();
      assert(auditLogs.length >= 4, `Expected >=4 audit entries, got ${auditLogs.length}`);
      const events = await registrationService.getEvents(reg.id);
      assert(events.length >= 4, `Expected >=4 transition events, got ${events.length}`);
    });
  });

  await describe('E2E: Quiz completion journey (real QuizService)', async () => {
    await it('should create questions → take quiz → get auto-graded results + wrong notebook', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));

      // Create questions using real service validation
      const q1 = await quizService.createQuestion({ questionText: 'What is 2+2?', type: 'single', correctAnswer: 'B', difficulty: 3, tags: ['math'], options: [{ label: '3', value: 'A' }, { label: '4', value: 'B' }], createdBy: 'inst1' });
      const q2 = await quizService.createQuestion({ questionText: 'Capital of France?', type: 'fill-in', correctAnswer: 'Paris', difficulty: 2, tags: ['geo'], createdBy: 'inst1' });
      const q3 = await quizService.createQuestion({ questionText: 'Explain gravity', type: 'subjective', difficulty: 4, tags: ['physics'], createdBy: 'inst1' });
      // Extra diff-4 question so distribution { 2:0.33, 3:0.34, 4:0.33 } can allocate 2 to diff-4
      await quizService.createQuestion({ questionText: 'Explain relativity', type: 'subjective', difficulty: 4, tags: ['physics'], createdBy: 'inst1' });

      // Generate paper
      const quiz = await quizService.generatePaper('Final Exam', 'class1', { totalQuestions: 3, difficultyDistribution: { 2: 0.33, 3: 0.34, 4: 0.33 } }, 'inst1');
      assert(quiz.questionIds.length > 0);

      // Take quiz
      const result = await quizService.submitAnswers(quiz.id, 'learner1', [
        { questionId: q1.id, answer: 'B' },
        { questionId: q2.id, answer: 'London' },  // wrong
        { questionId: q3.id, answer: 'Gravity is a force' },
      ]);

      assertEqual(result.objectiveScore, 50); // 1 of 2 objective correct
      assert(result.answers.find(a => a.questionId === q1.id).isCorrect === true);
      assert(result.answers.find(a => a.questionId === q2.id).isCorrect === false);
      assert(result.answers.find(a => a.questionId === q3.id).autoGraded === false);

      // Wrong question notebook populated
      const wrongQs = await quizService.getWrongQuestions('learner1');
      assert(wrongQs.length > 0, 'Wrong question notebook should have entries');

      // Result persisted
      const persisted = await repos.quizResultRepository.getById(result.id);
      assert(persisted !== null);
    });
  });

  await describe('E2E: Review + moderation journey (real services)', async () => {
    await it('should submit review → report → resolve', async () => {
      const { reviewService, moderationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'mod1', role: USER_ROLES.STAFF_REVIEWER }));

      await seedCompletedClassWithParticipants(repos, 'cls-e2e', ['u1']);
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-e2e', rating: 5, text: 'Excellent class!', tags: ['helpful'] });
      assert(review.id);

      const report = await moderationService.submitReport('u2', review.id, 'review', 'Suspicious review');
      const resolved = await moderationService.resolveReport(report.id, REPORT_OUTCOMES.DISMISSED, 'mod1');
      assertEqual(resolved.resolution, REPORT_OUTCOMES.DISMISSED);
    });
  });

  await describe('E2E: Two-way rating + appeal journey (real RatingService)', async () => {
    await it('should rate → appeal → adjust score', async () => {
      const { ratingService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));

      await seedCompletedClassWithParticipants(repos, 'tc-1', ['instructor1', 'learner1']);
      const rating = await ratingService.submitRating({ fromUserId: 'instructor1', toUserId: 'learner1', classId: 'tc-1', score: 2 });
      const appeal = await ratingService.fileAppeal(rating.id, 'learner1', 'Rating seems unfairly low');
      assertEqual(appeal.status, APPEAL_STATUS.PENDING);

      await ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.ADJUSTED, 'Evidence supports higher score', 'rev1', 4);

      const updatedRating = await repos.ratingRepository.getById(rating.id);
      assertEqual(updatedRating.score, 4);
    });
  });

  await describe('E2E: Sensitive word blocking (real ReviewService + ModerationService)', async () => {
    await it('should block spam in reviews at service level', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'u1', rating: 3, text: 'This is spam content' }), 'prohibited content');
    });

    await it('should block fraud in reviews at service level', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'u1', rating: 3, text: 'Fraud alert!' }), 'prohibited content');
    });
  });

  await describe('E2E: Rejection comment enforcement (real RegistrationService)', async () => {
    await it('should enforce 20-char comment and NOT mutate state on failure', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'r1', role: USER_ROLES.STAFF_REVIEWER }));

      const reg = await registrationService.create('l1', 'c1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.SUBMITTED, '', 'l1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.UNDER_REVIEW, '', 'r1');

      await assertThrowsAsync(
        () => registrationService.transition(reg.id, REGISTRATION_STATUS.REJECTED, 'Short', 'r1'),
        'at least 20 characters'
      );

      const current = await repos.registrationRepository.getById(reg.id);
      assertEqual(current.status, REGISTRATION_STATUS.UNDER_REVIEW);
    });
  });

  await describe('E2E: Unauthorized actions fail (real RegistrationService)', async () => {
    await it('should prevent learner from approving registration', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'l1', role: USER_ROLES.LEARNER }));
      await repos.registrationRepository.add({ id: 'r1', userId: 'l1', classId: 'c1', status: REGISTRATION_STATUS.UNDER_REVIEW, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await assertThrowsAsync(() => registrationService.transition('r1', REGISTRATION_STATUS.APPROVED, '', 'l1'), 'Only administrators or staff reviewers');
    });

    await it('should prevent self-rating', async () => {
      const { ratingService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'tc-2', ['u1']);
      await assertThrowsAsync(() => ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u1', classId: 'tc-2', score: 5 }), 'Cannot rate yourself');
    });
  });

  await describe('E2E: Image validation (real ReviewService)', async () => {
    await it('should reject 7 images', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(
        () => reviewService.submitReview({ userId: 'u1', rating: 3, images: Array(7).fill({ size: 100 }) }),
        'Maximum 6 images'
      );
    });

    await it('should reject oversized image', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(
        () => reviewService.submitReview({ userId: 'u1', rating: 3, images: [{ size: 3 * 1024 * 1024 }] }),
        'under 2MB'
      );
    });
  });

  await describe('E2E: Bulk import schema validation', async () => {
    await it('should validate all required columns', async () => {
      const errors = validateQuestionRow({ questionText: 'Q', type: 'single', correctAnswer: 'A', difficulty: 3, tags: 'math' }, 1);
      assertEqual(errors.length, 0);
    });

    await it('should catch missing questionText', async () => {
      const errors = validateQuestionRow({ type: 'single', correctAnswer: 'A', difficulty: 3, tags: 'x' }, 1);
      assert(errors.some(e => e.includes('questionText')));
    });

    await it('should catch invalid type', async () => {
      const errors = validateQuestionRow({ questionText: 'Q', type: 'essay', correctAnswer: 'A', difficulty: 3, tags: 'x' }, 1);
      assert(errors.some(e => e.includes('type')));
    });

    await it('should catch difficulty out of range', async () => {
      const errors = validateQuestionRow({ questionText: 'Q', type: 'single', correctAnswer: 'A', difficulty: 7, tags: 'x' }, 1);
      assert(errors.some(e => e.includes('difficulty')));
    });
  });

  await describe('E2E: Contract signing with SHA-256 (real ContractService)', async () => {
    await it('should generate real SHA-256 hash on signing', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      const tpl = await contractService.createTemplate({ name: 'Agreement', content: 'I {Name} agree.', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, { Name: 'Alice' }, 'admin1');
      const signed = await contractService.signContract(contract.id, 'typed:Alice Smith', 'Alice Smith', 'admin1');
      assert(signed.signatureHash.length > 20, 'SHA-256 hash should be substantial');
      assertEqual(signed.status, 'signed');
    });
  });

  await describe('E2E: Q&A thread flow (real QAService)', async () => {
    await it('should create thread and submit answer', async () => {
      const { qaService, repos } = buildTestServices();
      const thread = await qaService.createThread('u1', 'How to enroll?', 'I want to enroll in a class');
      const answer = await qaService.submitAnswer(thread.id, 'u2', 'Go to registrations page');
      const answers = await qaService.getAnswersByThreadId(thread.id);
      assertEqual(answers.length, 1);
      assertEqual(answers[0].content, 'Go to registrations page');
    });
  });
}
