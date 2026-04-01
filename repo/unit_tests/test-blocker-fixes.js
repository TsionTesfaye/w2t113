/**
 * Blocker Fix Regression Tests
 *
 * 1. Learner answer exposure — correctAnswer must NEVER reach learners
 * 2. JSON-driven config — runtime config values match defaults.json
 * 3. Contract export XSS — HTML output escapes all user-controlled fields
 */

import { describe, it, assert, assertEqual, buildTestServices, makeUser, makeClass,
         seedCompletedClassWithParticipants } from '../test-helpers.js';

export async function runBlockerFixTests() {

  // ============================================================
  // 1. ANSWER EXPOSURE — learners must never receive correctAnswer
  // ============================================================

  await describe('Blocker: learner cannot access correct answers', async () => {
    await it('getQuestionsForLearner strips correctAnswer from all questions', async () => {
      const { quizService, repos } = buildTestServices();
      const instructor = makeUser({ id: 'blk-inst', role: 'Instructor' });
      await repos.userRepository.add(instructor);

      await quizService.createQuestion({
        questionText: 'What is 2+2?',
        type: 'single',
        options: [{ label: 'Four', value: 'A' }],
        correctAnswer: 'A',
        difficulty: 1,
        tags: 'math',
        chapter: 'basics',
        createdBy: 'blk-inst',
      });

      const learnerQuestions = await quizService.getQuestionsForLearner();
      assert(learnerQuestions.length > 0, 'Questions exist');
      for (const q of learnerQuestions) {
        assert(!('correctAnswer' in q), `Question ${q.id} must NOT contain correctAnswer for learner`);
      }
    });

    await it('getQuestionByIdForLearner strips correctAnswer', async () => {
      const { quizService, repos } = buildTestServices();
      const instructor = makeUser({ id: 'blk-inst2', role: 'Instructor' });
      await repos.userRepository.add(instructor);

      await quizService.createQuestion({
        questionText: 'Capital of France?',
        type: 'fill-in',
        options: [],
        correctAnswer: 'Paris',
        difficulty: 2,
        tags: 'geography',
        chapter: 'europe',
        createdBy: 'blk-inst2',
      });

      const allQ = await quizService.getAllQuestions();
      const qId = allQ[0].id;

      const learnerView = await quizService.getQuestionByIdForLearner(qId);
      assert(!('correctAnswer' in learnerView), 'correctAnswer must not be present in learner view');
      assert(learnerView.questionText, 'questionText is present');
      assert(learnerView.type, 'type is present');
    });

    await it('getAllQuestions (instructor/admin path) retains correctAnswer', async () => {
      const { quizService, repos } = buildTestServices();
      const instructor = makeUser({ id: 'blk-inst3', role: 'Instructor' });
      await repos.userRepository.add(instructor);

      await quizService.createQuestion({
        questionText: 'Speed of light?',
        type: 'fill-in',
        options: [],
        correctAnswer: '299792458',
        difficulty: 3,
        tags: 'physics',
        chapter: 'optics',
        createdBy: 'blk-inst3',
      });

      const instructorQuestions = await quizService.getAllQuestions();
      assert(instructorQuestions.length > 0, 'Questions exist');
      assert('correctAnswer' in instructorQuestions[0], 'correctAnswer IS present for instructor/admin path');
      assertEqual(instructorQuestions[0].correctAnswer, '299792458', 'Correct answer value preserved');
    });

    await it('submitAnswers result does not expose correctAnswer to caller', async () => {
      const { quizService, repos } = buildTestServices();
      const instructor = makeUser({ id: 'blk-inst4', role: 'Instructor' });
      const learner    = makeUser({ id: 'blk-learner4', role: 'Learner' });
      await repos.userRepository.add(instructor);
      await repos.userRepository.add(learner);

      await quizService.createQuestion({
        questionText: 'True or false: Earth is flat?',
        type: 'fill-in',
        options: [],
        correctAnswer: 'false',
        difficulty: 1,
        tags: 'science',
        chapter: 'earth',
        createdBy: 'blk-inst4',
      });

      const allQ = await quizService.getAllQuestions();
      const quiz = await quizService.generatePaper('Test Quiz', 'cls-1', { totalQuestions: 1, difficultyDistribution: { 1: 1.0 } }, 'blk-inst4');
      const result = await quizService.submitAnswers(quiz.id, 'blk-learner4', [
        { questionId: allQ[0].id, answer: 'false' },
      ]);

      // The result contains gradedAnswers with isCorrect but NOT correctAnswer
      assert(Array.isArray(result.answers), 'Result has answers array');
      for (const a of result.answers) {
        assert(!('correctAnswer' in a), 'gradedAnswer must NOT expose correctAnswer');
      }
    });

    await it('wrong question notebook does not expose correctAnswer in the graded answer', async () => {
      // Wrong questions store correctAnswer internally for tracking purposes,
      // but the gradedAnswer records returned to callers must not expose it.
      const { quizService, repos } = buildTestServices();
      const instructor = makeUser({ id: 'blk-inst5', role: 'Instructor' });
      const learner    = makeUser({ id: 'blk-learner5', role: 'Learner' });
      await repos.userRepository.add(instructor);
      await repos.userRepository.add(learner);

      await quizService.createQuestion({
        questionText: '1 + 1 = ?',
        type: 'fill-in',
        options: [],
        correctAnswer: '2',
        difficulty: 1,
        tags: 'math',
        chapter: 'arithmetic',
        createdBy: 'blk-inst5',
      });

      const allQ = await quizService.getAllQuestions();
      const quiz = await quizService.generatePaper('Wrong Test', 'cls-2', { totalQuestions: 1, difficultyDistribution: { 1: 1.0 } }, 'blk-inst5');
      const result = await quizService.submitAnswers(quiz.id, 'blk-learner5', [
        { questionId: allQ[0].id, answer: 'wrong-answer' },
      ]);

      // Result answers must not carry correctAnswer back to the caller
      for (const a of result.answers) {
        assert(!('correctAnswer' in a), 'Submitted answer result must not expose correctAnswer');
      }
    });

    await it('getQuestionByIdForLearner is the safe path for quiz-taking (no correctAnswer in closure)', async () => {
      // This test regression-guards the _takeQuiz() UI path.
      // The browser quiz-taking code must use getQuestionByIdForLearner(), not getQuestionById().
      // This verifies the service method guarantees no correctAnswer even when called by ID.
      const { quizService, repos } = buildTestServices();
      const instructor = makeUser({ id: 'blk-inst6', role: 'Instructor' });
      await repos.userRepository.add(instructor);

      await quizService.createQuestion({
        questionText: 'Quiz-taking closure test?',
        type: 'fill-in',
        options: [],
        correctAnswer: 'secret-answer',
        difficulty: 1,
        tags: 'security',
        chapter: 'auth',
        createdBy: 'blk-inst6',
      });

      const allQ = await quizService.getAllQuestions();
      const qId = allQ[0].id;

      // Simulate what _takeQuiz() must do: fetch each question by ID for the learner
      const learnerView = await quizService.getQuestionByIdForLearner(qId);
      assert(!('correctAnswer' in learnerView),
        'getQuestionByIdForLearner must strip correctAnswer — this is the service the quiz-taking UI MUST use');
      assert(learnerView.questionText, 'Question text is present for quiz display');
      assert(learnerView.type, 'Question type is present (needed to render input controls)');

      // The instructor path (getQuestionById) must retain it — verifying the contrast
      const instructorView = await quizService.getQuestionById(qId);
      assert('correctAnswer' in instructorView, 'getQuestionById retains correctAnswer for instructors');
    });
  });

  // ============================================================
  // 2. JSON-DRIVEN CONFIG — values match defaults.json
  // ============================================================

  await describe('Blocker: runtime config values match defaults.json', async () => {
    await it('loadAppConfig returns values consistent with defaults.json content', async () => {
      const { loadAppConfig } = await import('../src/config/appConfig.js');
      const cfg = await loadAppConfig();

      // These values are defined in defaults.json.
      // If they diverge from the JSON file, a developer must update both.
      assertEqual(cfg.reputation.threshold, 60, 'Reputation threshold matches defaults.json');
      assertEqual(cfg.reputation.weights.fulfillmentRate, 0.5, 'Fulfillment weight matches');
      assertEqual(cfg.reputation.weights.lateRate, 0.3, 'Late rate weight matches');
      assertEqual(cfg.reputation.weights.complaintRate, 0.2, 'Complaint rate weight matches');
      assertEqual(cfg.moderation.resolutionDeadlineDays, 7, 'Moderation SLA matches defaults.json');
      assertEqual(cfg.registration.rejectionCommentMinLength, 20, 'Rejection comment length matches');
      assertEqual(cfg.review.maxImages, 6, 'Max images matches');
      assertEqual(cfg.review.maxTextLength, 2000, 'Max text length matches');
      assert(Array.isArray(cfg.contract.transitions.initiated), 'Contract transitions are arrays');
      assert(cfg.contract.transitions.initiated.includes('signed'), 'initiated → signed transition present');
    });

    await it('ModerationService detects words from sensitiveWords.json', async () => {
      const { ModerationService } = await import('../src/services/ModerationService.js');
      const svc = new ModerationService({ sensitiveWords: [] });
      await svc.loadSensitiveWords();

      // These words are in sensitiveWords.json
      const testWords = ['spam', 'scam', 'fake', 'fraud', 'abuse',
                         'harassment', 'threat', 'exploit', 'illegal', 'offensive'];
      for (const word of testWords) {
        const result = svc.checkContent(`This review contains ${word} content.`);
        assert(result.flagged, `"${word}" (from sensitiveWords.json) must be detected`);
      }
    });

    await it('clean text is not flagged after loading from JSON', async () => {
      const { ModerationService } = await import('../src/services/ModerationService.js');
      const svc = new ModerationService({ sensitiveWords: [] });
      await svc.loadSensitiveWords();
      const result = svc.checkContent('An excellent and informative training session.');
      assert(!result.flagged, 'Clean text must not be flagged');
    });
  });

  // ============================================================
  // 3. CONTRACT EXPORT XSS — all fields must be escaped
  // ============================================================

  await describe('Blocker: contract HTML export escapes user-controlled fields', async () => {
    await it('script tags in contract content are escaped, not executed', async () => {
      const { ContractService } = await import('../src/services/ContractService.js');
      const svc = new ContractService({
        contractRepository: { getById: async () => null, add: async () => {}, put: async () => {} },
        templateRepository: { getById: async () => null, add: async () => {}, getActive: async () => [], getAll: async () => [] },
        userRepository: { getById: async () => null },
        auditService: { log: async () => {} },
        cryptoService: { generateSignatureHash: async () => 'hash123' },
      });

      const maliciousContract = {
        id: 'test-xss',
        content: '<script>alert("xss")</script>This is the agreement.',
        signedBy: '<img src=x onerror=alert(1)>',
        signedAt: '2026-01-01T00:00:00.000Z',
        signatureHash: '<b>not-a-hash</b>',
      };

      const blob = svc.exportToPrintableHTML(maliciousContract);
      const text = await blob.text();

      // Script tag must be escaped
      assert(!text.includes('<script>'), 'Raw <script> tag must not appear in output');
      assert(text.includes('&lt;script&gt;'), 'Script tag must be HTML-escaped');

      // The <img> tag must be HTML-escaped so the onerror handler cannot execute
      assert(!text.includes('<img '), 'Raw <img> tag must not appear — it must be escaped');
      assert(text.includes('&lt;img'), '<img must appear as &lt;img (escaped, non-executable)');

      // Bold tag in hash must be escaped
      assert(!text.includes('<b>'), 'Raw <b> in hash must not appear in output');
      assert(text.includes('&lt;b&gt;'), 'Bold tag must be HTML-escaped in hash field');
    });

    await it('clean contract content passes through correctly escaped', async () => {
      const { ContractService } = await import('../src/services/ContractService.js');
      const svc = new ContractService({
        contractRepository: { getById: async () => null, add: async () => {}, put: async () => {} },
        templateRepository: { getById: async () => null, add: async () => {}, getActive: async () => [], getAll: async () => [] },
        userRepository: { getById: async () => null },
        auditService: { log: async () => {} },
        cryptoService: { generateSignatureHash: async () => 'hash123' },
      });

      const contract = {
        id: 'clean-id',
        content: 'I, Alex Smith, agree to the terms.\nSigned on 2026-01-01.',
        signedBy: 'user-id-123',
        signedAt: '2026-01-01T00:00:00.000Z',
        signatureHash: 'abc123def456',
      };

      const blob = svc.exportToPrintableHTML(contract);
      const text = await blob.text();

      assert(text.includes('Alex Smith'), 'Clean content appears in output');
      assert(text.includes('<br>'), 'Newlines converted to <br> tags');
      assert(text.includes('abc123def456'), 'Hash appears in output');
    });

    await it('contract id in title is escaped', async () => {
      const { ContractService } = await import('../src/services/ContractService.js');
      const svc = new ContractService({
        contractRepository: { getById: async () => null, add: async () => {}, put: async () => {} },
        templateRepository: { getById: async () => null, add: async () => {}, getActive: async () => [], getAll: async () => {} },
        userRepository: { getById: async () => null },
        auditService: { log: async () => {} },
        cryptoService: { generateSignatureHash: async () => 'hash' },
      });

      const contract = {
        id: '"><script>alert(1)</script>',
        content: 'Normal content.',
        signedBy: null,
        signedAt: null,
        signatureHash: null,
      };

      const blob = svc.exportToPrintableHTML(contract);
      const text = await blob.text();
      assert(!text.includes('<script>alert(1)</script>'), 'Injected script in ID must be escaped in title');
    });
  });
}
