/**
 * Secondary Hardening Tests
 *
 * 1. Strict quiz generation — throws when constraints can't be satisfied
 * 2. classId required in registrations at service level
 * 3. Duplicate submission protection — in-flight guard on submitAnswers
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser } from '../test-helpers.js';
import { USER_ROLES } from '../src/models/User.js';

export async function runSecondaryHardeningTests() {

  // ============================================================
  // 1. STRICT QUIZ GENERATION
  // ============================================================

  await describe('QuizService: strict quiz generation — throws on unsatisfiable constraints', async () => {
    await it('generatePaper throws when no questions available', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst-q1', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);

      await assertThrowsAsync(
        () => quizService.generatePaper('Test Quiz', 'cls-1', { totalQuestions: 5 }, 'inst-q1'),
        'No questions available'
      );
    });

    await it('generatePaper throws when fewer questions exist than required', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst-q2', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);

      // Add only 2 questions but request 5
      await quizService.createQuestion({ questionText: 'Q1?', type: 'fill-in', options: [], correctAnswer: 'a', difficulty: 1, tags: 't', chapter: 'c', createdBy: 'inst-q2' });
      await quizService.createQuestion({ questionText: 'Q2?', type: 'fill-in', options: [], correctAnswer: 'b', difficulty: 2, tags: 't', chapter: 'c', createdBy: 'inst-q2' });

      await assertThrowsAsync(
        () => quizService.generatePaper('Short Bank', 'cls-1', { totalQuestions: 5, difficultyDistribution: { 1: 0.5, 2: 0.5 } }, 'inst-q2'),
        'insufficient questions'
      );
    });

    await it('generatePaper throws when difficulty distribution cannot be met', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst-q3', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);

      // Add 5 difficulty-1 questions but request difficulty-5
      for (let i = 0; i < 5; i++) {
        await quizService.createQuestion({ questionText: `Q${i}?`, type: 'fill-in', options: [], correctAnswer: 'x', difficulty: 1, tags: 't', chapter: 'c', createdBy: 'inst-q3' });
      }

      await assertThrowsAsync(
        () => quizService.generatePaper('Hard Quiz', 'cls-1', { totalQuestions: 3, difficultyDistribution: { 5: 1.0 } }, 'inst-q3'),
        'insufficient questions'
      );
    });

    await it('generatePaper succeeds when exactly enough questions exist', async () => {
      const { quizService, repos } = buildTestServices();
      const inst = makeUser({ id: 'inst-q4', role: USER_ROLES.INSTRUCTOR });
      await repos.userRepository.add(inst);

      for (let i = 0; i < 3; i++) {
        await quizService.createQuestion({ questionText: `Q${i}?`, type: 'fill-in', options: [], correctAnswer: 'x', difficulty: 2, tags: 't', chapter: 'c', createdBy: 'inst-q4' });
      }

      const quiz = await quizService.generatePaper('Exact Match', 'cls-1', { totalQuestions: 3, difficultyDistribution: { 2: 1.0 } }, 'inst-q4');
      assert(quiz.id, 'Quiz created successfully');
      assertEqual(quiz.questionIds.length, 3, 'Quiz has exactly 3 questions');
    });
  });

  // ============================================================
  // 2. CLASSID REQUIRED IN REGISTRATION
  // ============================================================

  await describe('RegistrationService: classId required at service level', async () => {
    await it('create throws when classId is omitted', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'learner-c1', role: USER_ROLES.LEARNER }));

      await assertThrowsAsync(
        () => registrationService.create('learner-c1', undefined),
        'classId is required'
      );
    });

    await it('create throws when classId is empty string', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'learner-c2', role: USER_ROLES.LEARNER }));

      await assertThrowsAsync(
        () => registrationService.create('learner-c2', ''),
        'classId is required'
      );
    });

    await it('create throws when classId is null', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'learner-c3', role: USER_ROLES.LEARNER }));

      await assertThrowsAsync(
        () => registrationService.create('learner-c3', null),
        'classId is required'
      );
    });

    await it('create succeeds with a valid classId', async () => {
      const { registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'learner-c4', role: USER_ROLES.LEARNER }));

      const reg = await registrationService.create('learner-c4', 'class-abc');
      assert(reg.id, 'Registration created');
      assertEqual(reg.classId, 'class-abc', 'classId stored correctly');
    });

    await it('userId still required alongside classId', async () => {
      const { registrationService } = buildTestServices();

      await assertThrowsAsync(
        () => registrationService.create('', 'class-abc'),
        'userId is required'
      );
    });
  });

  // ============================================================
  // 3. DUPLICATE SUBMISSION PROTECTION (in-flight guard)
  // ============================================================

  await describe('QuizService.submitAnswers: duplicate submission protection', async () => {
    await it('concurrent duplicate submissions throw on the second call', async () => {
      const { quizService, repos } = buildTestServices();

      // Seed a question and quiz directly
      await repos.questionRepository.add({
        id: 'q-if1', questionText: 'Q?', type: 'fill-in', correctAnswer: 'yes',
        difficulty: 1, tags: ['t'], options: [], chapter: 'c', explanation: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await repos.quizRepository.add({
        id: 'quiz-if1', questionIds: ['q-if1'], title: 'T', classId: 'c1',
        rules: {}, createdBy: 'inst', createdAt: new Date().toISOString(),
      });

      // Kick off first submission (do not await)
      const first = quizService.submitAnswers('quiz-if1', 'learner-if1', [{ questionId: 'q-if1', answer: 'yes' }]);

      // Immediately try to submit again before the first resolves
      await assertThrowsAsync(
        () => quizService.submitAnswers('quiz-if1', 'learner-if1', [{ questionId: 'q-if1', answer: 'yes' }]),
        'already in progress'
      );

      // First submission should still complete normally
      const result = await first;
      assert(result.id, 'First submission completes successfully');
    });

    await it('after completion the guard resets — re-submission is allowed', async () => {
      const { quizService, repos } = buildTestServices();

      await repos.questionRepository.add({
        id: 'q-if2', questionText: 'Q?', type: 'fill-in', correctAnswer: 'ok',
        difficulty: 1, tags: ['t'], options: [], chapter: 'c', explanation: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await repos.quizRepository.add({
        id: 'quiz-if2', questionIds: ['q-if2'], title: 'T2', classId: 'c2',
        rules: {}, createdBy: 'inst', createdAt: new Date().toISOString(),
      });

      const r1 = await quizService.submitAnswers('quiz-if2', 'learner-if2', [{ questionId: 'q-if2', answer: 'ok' }]);
      assert(r1.id, 'First submission succeeds');

      // After first completes, the guard should be cleared — second call would succeed
      // (In real usage a second submit would mean they're retaking; this tests guard cleanup)
      const r2 = await quizService.submitAnswers('quiz-if2', 'learner-if2', [{ questionId: 'q-if2', answer: 'wrong' }]);
      assert(r2.id, 'Second sequential submission succeeds after guard cleared');
    });

    await it('different users can submit the same quiz concurrently', async () => {
      const { quizService, repos } = buildTestServices();

      await repos.questionRepository.add({
        id: 'q-if3', questionText: 'Q?', type: 'fill-in', correctAnswer: 'a',
        difficulty: 1, tags: ['t'], options: [], chapter: 'c', explanation: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await repos.quizRepository.add({
        id: 'quiz-if3', questionIds: ['q-if3'], title: 'T3', classId: 'c3',
        rules: {}, createdBy: 'inst', createdAt: new Date().toISOString(),
      });

      // Different users submit at the same time — should not block each other
      const [r1, r2] = await Promise.all([
        quizService.submitAnswers('quiz-if3', 'user-a', [{ questionId: 'q-if3', answer: 'a' }]),
        quizService.submitAnswers('quiz-if3', 'user-b', [{ questionId: 'q-if3', answer: 'a' }]),
      ]);
      assert(r1.id, 'User A submitted');
      assert(r2.id, 'User B submitted');
    });
  });
}
