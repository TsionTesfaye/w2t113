/**
 * Unit Tests — QuizService (REAL service, in-memory repos)
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser } from '../test-helpers.js';
import { validateQuestionRow } from '../src/utils/validators.js';
import { USER_ROLES } from '../src/models/User.js';

export async function runQuizTests() {
  await describe('QuizService.createQuestion() — Validation (real service)', async () => {
    await it('should create a valid single-choice question', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      const q = await quizService.createQuestion({ questionText: 'What is 2+2?', type: 'single', correctAnswer: 'B', difficulty: 3, tags: ['math'], createdBy: 'inst1' });
      assertEqual(q.type, 'single');
    });

    await it('should persist question', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      const q = await quizService.createQuestion({ questionText: 'Q', type: 'single', correctAnswer: 'A', difficulty: 1, tags: ['t'], createdBy: 'inst1' });
      const fetched = await repos.questionRepository.getById(q.id);
      assert(fetched !== null);
    });

    await it('should reject empty questionText', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      await assertThrowsAsync(() => quizService.createQuestion({ questionText: '', type: 'single', correctAnswer: 'A', difficulty: 3, createdBy: 'inst1' }), 'questionText is required');
    });

    await it('should reject invalid type', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      await assertThrowsAsync(() => quizService.createQuestion({ questionText: 'Q', type: 'essay', correctAnswer: 'A', difficulty: 3, createdBy: 'inst1' }), 'type must be one of');
    });

    await it('should reject missing correctAnswer for non-subjective', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      await assertThrowsAsync(() => quizService.createQuestion({ questionText: 'Q', type: 'single', correctAnswer: '', difficulty: 3, createdBy: 'inst1' }), 'correctAnswer is required');
    });

    await it('should allow missing correctAnswer for subjective', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      const q = await quizService.createQuestion({ questionText: 'Explain X', type: 'subjective', difficulty: 2, tags: ['t'], createdBy: 'inst1' });
      assertEqual(q.type, 'subjective');
    });

    await it('should reject difficulty outside 1-5', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      await assertThrowsAsync(() => quizService.createQuestion({ questionText: 'Q', type: 'single', correctAnswer: 'A', difficulty: 0, createdBy: 'inst1' }), 'difficulty must be');
      await assertThrowsAsync(() => quizService.createQuestion({ questionText: 'Q', type: 'single', correctAnswer: 'A', difficulty: 6, createdBy: 'inst1' }), 'difficulty must be');
    });
  });

  await describe('QuizService.bulkImport() — Validation (real service)', async () => {
    await it('should import valid rows', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      const rows = [
        { questionText: 'Q1', type: 'single', correctAnswer: 'A', difficulty: 3, tags: 'math' },
        { questionText: 'Q2', type: 'fill-in', correctAnswer: 'yes', difficulty: 2, tags: 'science' },
      ];
      const result = await quizService.bulkImport(rows, 'inst1');
      assert(result.success);
      assertEqual(result.count, 2);
    });

    await it('should reject empty array', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      const result = await quizService.bulkImport([], 'inst1');
      assert(!result.success);
    });

    await it('should reject batch if any row fails', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'inst1', role: USER_ROLES.INSTRUCTOR }));
      const rows = [
        { questionText: 'Q1', type: 'single', correctAnswer: 'A', difficulty: 3, tags: 'math' },
        { questionText: '', type: 'single', correctAnswer: 'A', difficulty: 3, tags: 'math' },
      ];
      const result = await quizService.bulkImport(rows, 'inst1');
      assert(!result.success);
      assert(result.errors.length > 0);
    });

    await it('should validate required columns via validateQuestionRow', async () => {
      const errors = validateQuestionRow({}, 1);
      assert(errors.length >= 4, `Expected >=4 errors for empty row, got ${errors.length}`);
    });
  });

  await describe('QuizService.submitAnswers() — Auto-grading (real service)', async () => {
    await it('should auto-grade single choice correctly', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.questionRepository.add({ id: 'q1', questionText: 'Q', type: 'single', correctAnswer: 'B', difficulty: 3, tags: ['t'], options: [], chapter: '', explanation: 'expl', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await repos.quizRepository.add({ id: 'quiz1', questionIds: ['q1'], title: 'Test', rules: {}, createdBy: 'x', createdAt: new Date().toISOString() });

      const result = await quizService.submitAnswers('quiz1', 'u1', [{ questionId: 'q1', answer: 'B' }]);
      assertEqual(result.objectiveScore, 100);
      assertEqual(result.answers[0].isCorrect, true);
    });

    await it('should track wrong answers in wrong-question notebook', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.questionRepository.add({ id: 'q1', questionText: 'Q', type: 'single', correctAnswer: 'B', difficulty: 3, tags: ['t'], options: [], chapter: '', explanation: 'ans is B', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await repos.quizRepository.add({ id: 'quiz1', questionIds: ['q1'], title: 'Test', rules: {}, createdBy: 'x', createdAt: new Date().toISOString() });

      await quizService.submitAnswers('quiz1', 'u1', [{ questionId: 'q1', answer: 'A' }]);
      const wrongQs = await repos.wrongQuestionRepository.getAll();
      assert(wrongQs.length > 0, 'Wrong question should be tracked');
    });

    await it('should auto-grade multiple choice correctly', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.questionRepository.add({ id: 'q1', questionText: 'Q', type: 'multiple', correctAnswer: ['A', 'C'], difficulty: 3, tags: ['t'], options: [], chapter: '', explanation: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await repos.quizRepository.add({ id: 'quiz1', questionIds: ['q1'], title: 'Test', rules: {}, createdBy: 'x', createdAt: new Date().toISOString() });

      const result = await quizService.submitAnswers('quiz1', 'u1', [{ questionId: 'q1', answer: ['A', 'C'] }]);
      assertEqual(result.answers[0].isCorrect, true);
    });

    await it('should not auto-grade subjective questions', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.questionRepository.add({ id: 'q1', questionText: 'Explain', type: 'subjective', correctAnswer: '', difficulty: 3, tags: ['t'], options: [], chapter: '', explanation: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await repos.quizRepository.add({ id: 'quiz1', questionIds: ['q1'], title: 'Test', rules: {}, createdBy: 'x', createdAt: new Date().toISOString() });

      const result = await quizService.submitAnswers('quiz1', 'u1', [{ questionId: 'q1', answer: 'My essay' }]);
      assertEqual(result.answers[0].autoGraded, false);
      assertEqual(result.answers[0].isCorrect, null);
      assertEqual(result.objectiveScore, null);
    });

    await it('should throw for missing quizId', async () => {
      const { quizService } = buildTestServices();
      await assertThrowsAsync(() => quizService.submitAnswers('', 'u1', []), 'quizId is required');
    });

    await it('should throw for quiz with no questions', async () => {
      const { quizService, repos } = buildTestServices();
      await repos.quizRepository.add({ id: 'empty-quiz', questionIds: [], title: 'Empty', rules: {}, createdBy: 'x', createdAt: new Date().toISOString() });
      await assertThrowsAsync(() => quizService.submitAnswers('empty-quiz', 'u1', []), 'Quiz has no questions');
    });
  });
}
