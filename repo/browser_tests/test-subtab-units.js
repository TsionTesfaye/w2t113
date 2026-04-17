/**
 * Direct unit tests for all remaining quiz and reviews sub-tab modules.
 * Covers: QuizTakingTab, QuizResultsTab, QuizGradingTab, QuestionBankTab,
 *         WrongQuestionsTab, FavoriteQuestionsTab, ReviewsListTab,
 *         ReviewsModerationTab, ReviewsHistoryTab, ReviewsFavoritesTab,
 *         RatingsTab, QATab.
 *
 * All IndexedDB / service calls are neutralised by direct method overrides on
 * the imported service singletons before each test and restored after.
 */

import { installBrowserEnv, resetBrowserEnv } from './browser-env.js';
import { describe, it, assert, assertEqual } from '../test-helpers.js';

import { QuizTakingTab }       from '../src/pages/QuizTakingTab.js';
import { QuizResultsTab }      from '../src/pages/QuizResultsTab.js';
import { QuizGradingTab }      from '../src/pages/QuizGradingTab.js';
import { QuestionBankTab }     from '../src/pages/QuestionBankTab.js';
import { WrongQuestionsTab }   from '../src/pages/WrongQuestionsTab.js';
import { FavoriteQuestionsTab } from '../src/pages/FavoriteQuestionsTab.js';
import { ReviewsListTab }      from '../src/pages/ReviewsListTab.js';
import { ReviewsModerationTab } from '../src/pages/ReviewsModerationTab.js';
import { ReviewsHistoryTab }   from '../src/pages/ReviewsHistoryTab.js';
import { ReviewsFavoritesTab } from '../src/pages/ReviewsFavoritesTab.js';
import { RatingsTab }          from '../src/pages/RatingsTab.js';
import { QATab }               from '../src/pages/QATab.js';

import authService             from '../src/services/AuthService.js';
import quizService             from '../src/services/QuizService.js';
import qaService               from '../src/services/QAService.js';
import reviewService           from '../src/services/ReviewService.js';
import moderationService       from '../src/services/ModerationService.js';
import favoriteService         from '../src/services/FavoriteService.js';
import browsingHistoryService  from '../src/services/BrowsingHistoryService.js';
import ratingService           from '../src/services/RatingService.js';
import userRepository          from '../src/repositories/UserRepository.js';

export async function runSubTabUnitTests() {

  // ================================================================
  // QuizTakingTab
  // ================================================================

  await describe('QuizTakingTab: render', async () => {
    await it('renders quizzes-table div', async () => {
      installBrowserEnv();
      const savedGetAll = quizService.getAllQuizzes.bind(quizService);
      quizService.getAllQuizzes = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1', displayName: 'L' };
      const container = document.createElement('div');
      const tab = new QuizTakingTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="quizzes-table"'), 'quizzes-table div present');
      quizService.getAllQuizzes = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows quiz count in header', async () => {
      installBrowserEnv();
      const savedGetAll = quizService.getAllQuizzes.bind(quizService);
      quizService.getAllQuizzes = async () => [
        { id: 'q1', title: 'Quiz A', questionIds: ['x'], createdAt: new Date().toISOString() },
        { id: 'q2', title: 'Quiz B', questionIds: ['y', 'z'], createdAt: new Date().toISOString() },
      ];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Instructor', id: 'u1', displayName: 'I' };
      const container = document.createElement('div');
      const tab = new QuizTakingTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('2 quiz(zes)'), 'quiz count shown');
      quizService.getAllQuizzes = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows Take Quiz button for Learner role', async () => {
      installBrowserEnv();
      const savedGetAll = quizService.getAllQuizzes.bind(quizService);
      quizService.getAllQuizzes = async () => [
        { id: 'q1', title: 'Quiz A', questionIds: [], createdAt: new Date().toISOString() },
      ];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1', displayName: 'L' };
      const container = document.createElement('div');
      const tab = new QuizTakingTab({});
      await tab.render(container);
      // DataTable renders into the #quizzes-table child element's _innerHTML
      const tableEl = container.querySelector('#quizzes-table');
      assert(tableEl._innerHTML.includes('Take Quiz'), 'Take Quiz button present for Learner');
      quizService.getAllQuizzes = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('does not show Take Quiz button for Instructor', async () => {
      installBrowserEnv();
      const savedGetAll = quizService.getAllQuizzes.bind(quizService);
      quizService.getAllQuizzes = async () => [
        { id: 'q1', title: 'Quiz A', questionIds: [], createdAt: new Date().toISOString() },
      ];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Instructor', id: 'u1', displayName: 'I' };
      const container = document.createElement('div');
      const tab = new QuizTakingTab({});
      await tab.render(container);
      assert(!container._innerHTML.includes('Take Quiz'), 'no Take Quiz button for Instructor');
      quizService.getAllQuizzes = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // QuizResultsTab
  // ================================================================

  await describe('QuizResultsTab: render', async () => {
    await it('renders results-table div', async () => {
      installBrowserEnv();
      const savedGetResults = quizService.getResultsByUserId.bind(quizService);
      quizService.getResultsByUserId = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QuizResultsTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="results-table"'), 'results-table present');
      quizService.getResultsByUserId = savedGetResults;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows result count', async () => {
      installBrowserEnv();
      const savedGetResults = quizService.getResultsByUserId.bind(quizService);
      quizService.getResultsByUserId = async () => [
        { id: 'r1', quizId: 'q1', objectiveScore: 80, totalScore: 75, submittedAt: new Date().toISOString(), answers: [] },
      ];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QuizResultsTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('1 result(s)'), 'result count shown');
      quizService.getResultsByUserId = savedGetResults;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows 0 results when empty', async () => {
      installBrowserEnv();
      const savedGetResults = quizService.getResultsByUserId.bind(quizService);
      quizService.getResultsByUserId = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QuizResultsTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('0 result(s)'), 'zero results shown');
      quizService.getResultsByUserId = savedGetResults;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // QuizGradingTab
  // ================================================================

  await describe('QuizGradingTab: render', async () => {
    await it('shows permission-denied message for Learner', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QuizGradingTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('do not have permission'), 'Learner denied access');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders grading-table for Administrator', async () => {
      installBrowserEnv();
      const savedGetAll = quizService.getAllQuizResults.bind(quizService);
      quizService.getAllQuizResults = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', id: 'u0' };
      const container = document.createElement('div');
      const tab = new QuizGradingTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="grading-table"'), 'grading-table present for Admin');
      quizService.getAllQuizResults = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders grading-table for Instructor', async () => {
      installBrowserEnv();
      const savedGetAll = quizService.getAllQuizResults.bind(quizService);
      quizService.getAllQuizResults = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Instructor', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QuizGradingTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="grading-table"'), 'grading-table present for Instructor');
      quizService.getAllQuizResults = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // QuestionBankTab
  // ================================================================

  await describe('QuestionBankTab: render', async () => {
    await it('renders questions-table div for Learner', async () => {
      installBrowserEnv();
      const savedForLearner = quizService.getQuestionsForLearner.bind(quizService);
      quizService.getQuestionsForLearner = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QuestionBankTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="questions-table"'), 'questions-table present');
      quizService.getQuestionsForLearner = savedForLearner;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders manage buttons for Administrator', async () => {
      installBrowserEnv();
      const savedGetAll = quizService.getAllQuestions.bind(quizService);
      quizService.getAllQuestions = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', id: 'u0' };
      const container = document.createElement('div');
      const tab = new QuestionBankTab({ _importTab: { bulkImport: () => {} }, _builderTab: { generatePaper: () => {} } });
      await tab.render(container);
      assert(container._innerHTML.includes('id="btn-add-question"'), 'Add Question button present for Admin');
      assert(container._innerHTML.includes('id="btn-bulk-import"'), 'Bulk Import button present for Admin');
      assert(container._innerHTML.includes('id="btn-generate-paper"'), 'Generate Paper button present for Admin');
      quizService.getAllQuestions = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('does NOT render manage buttons for Learner', async () => {
      installBrowserEnv();
      const savedForLearner = quizService.getQuestionsForLearner.bind(quizService);
      quizService.getQuestionsForLearner = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QuestionBankTab({});
      await tab.render(container);
      assert(!container._innerHTML.includes('id="btn-add-question"'), 'no Add Question for Learner');
      quizService.getQuestionsForLearner = savedForLearner;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders manage buttons for Instructor', async () => {
      installBrowserEnv();
      const savedGetAll = quizService.getAllQuestions.bind(quizService);
      quizService.getAllQuestions = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Instructor', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QuestionBankTab({ _importTab: { bulkImport: () => {} }, _builderTab: { generatePaper: () => {} } });
      await tab.render(container);
      assert(container._innerHTML.includes('id="btn-add-question"'), 'Add Question button present for Instructor');
      quizService.getAllQuestions = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // WrongQuestionsTab
  // ================================================================

  await describe('WrongQuestionsTab: render', async () => {
    await it('renders wrong-table div', async () => {
      installBrowserEnv();
      const savedGetWrong = quizService.getWrongQuestions.bind(quizService);
      quizService.getWrongQuestions = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new WrongQuestionsTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="wrong-table"'), 'wrong-table present');
      quizService.getWrongQuestions = savedGetWrong;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows wrong question count', async () => {
      installBrowserEnv();
      const savedGetWrong = quizService.getWrongQuestions.bind(quizService);
      quizService.getWrongQuestions = async () => [
        { id: 'w1', questionId: 'q1', userAnswer: 'A', correctAnswer: 'B', createdAt: new Date().toISOString() },
        { id: 'w2', questionId: 'q2', userAnswer: 'C', correctAnswer: 'D', createdAt: new Date().toISOString() },
      ];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new WrongQuestionsTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('2 wrong question(s)'), 'count shown');
      quizService.getWrongQuestions = savedGetWrong;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows 0 wrong questions when empty', async () => {
      installBrowserEnv();
      const savedGetWrong = quizService.getWrongQuestions.bind(quizService);
      quizService.getWrongQuestions = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new WrongQuestionsTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('0 wrong question(s)'), 'zero count shown');
      quizService.getWrongQuestions = savedGetWrong;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // FavoriteQuestionsTab
  // ================================================================

  await describe('FavoriteQuestionsTab: render', async () => {
    await it('renders fav-table div', async () => {
      installBrowserEnv();
      const savedGetByUserAndType = favoriteService.getByUserAndType.bind(favoriteService);
      favoriteService.getByUserAndType = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new FavoriteQuestionsTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="fav-table"'), 'fav-table present');
      favoriteService.getByUserAndType = savedGetByUserAndType;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows 0 favorited questions when empty', async () => {
      installBrowserEnv();
      const savedGetByUserAndType = favoriteService.getByUserAndType.bind(favoriteService);
      favoriteService.getByUserAndType = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new FavoriteQuestionsTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('0 favorited question(s)'), 'zero count shown');
      favoriteService.getByUserAndType = savedGetByUserAndType;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows count matching favorited questions fetched', async () => {
      installBrowserEnv();
      const savedGetByUserAndType = favoriteService.getByUserAndType.bind(favoriteService);
      const savedGetForLearner = quizService.getQuestionByIdForLearner.bind(quizService);
      favoriteService.getByUserAndType = async () => [
        { id: 'f1', itemType: 'question', itemId: 'q1' },
        { id: 'f2', itemType: 'question', itemId: 'q2' },
      ];
      quizService.getQuestionByIdForLearner = async (id) => ({
        id, questionText: 'Sample question ' + id, type: 'single', difficulty: 3,
      });
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new FavoriteQuestionsTab({ _questionBankTab: { viewQuestion: () => {} } });
      await tab.render(container);
      assert(container._innerHTML.includes('2 favorited question(s)'), '2-question count shown');
      favoriteService.getByUserAndType = savedGetByUserAndType;
      quizService.getQuestionByIdForLearner = savedGetForLearner;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // ReviewsListTab
  // ================================================================

  await describe('ReviewsListTab: render', async () => {
    await it('renders reviews-table div', async () => {
      installBrowserEnv();
      const savedGetAll = reviewService.getAll.bind(reviewService);
      reviewService.getAll = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsListTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="reviews-table"'), 'reviews-table present');
      reviewService.getAll = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders btn-new-review button', async () => {
      installBrowserEnv();
      const savedGetAll = reviewService.getAll.bind(reviewService);
      reviewService.getAll = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsListTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="btn-new-review"'), 'btn-new-review present');
      reviewService.getAll = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows review count in header', async () => {
      installBrowserEnv();
      const savedGetAll = reviewService.getAll.bind(reviewService);
      reviewService.getAll = async () => [
        { id: 'rv1', rating: 4, text: 'Good', direction: 'learner-to-class', tags: [], createdAt: new Date().toISOString() },
        { id: 'rv2', rating: 3, text: 'Ok', direction: 'learner-to-class', tags: [], createdAt: new Date().toISOString() },
      ];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsListTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('2 review(s)'), 'review count shown');
      reviewService.getAll = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows 0 reviews when empty', async () => {
      installBrowserEnv();
      const savedGetAll = reviewService.getAll.bind(reviewService);
      reviewService.getAll = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsListTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('0 review(s)'), 'zero reviews shown');
      reviewService.getAll = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // ReviewsModerationTab
  // ================================================================

  await describe('ReviewsModerationTab: renderModeration', async () => {
    await it('shows permission-denied message for Learner', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsModerationTab({});
      await tab.renderModeration(container);
      assert(container._innerHTML.includes('do not have permission'), 'Learner denied');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders reports-table for Administrator', async () => {
      installBrowserEnv();
      const savedGetAll = moderationService.getAllReports.bind(moderationService);
      const savedGetOverdue = moderationService.getOverdueReports.bind(moderationService);
      moderationService.getAllReports = async () => [];
      moderationService.getOverdueReports = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', id: 'u0' };
      const container = document.createElement('div');
      const tab = new ReviewsModerationTab({});
      await tab.renderModeration(container);
      assert(container._innerHTML.includes('id="reports-table"'), 'reports-table present for Admin');
      moderationService.getAllReports = savedGetAll;
      moderationService.getOverdueReports = savedGetOverdue;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows report count for Staff Reviewer', async () => {
      installBrowserEnv();
      const savedGetAll = moderationService.getAllReports.bind(moderationService);
      const savedGetOverdue = moderationService.getOverdueReports.bind(moderationService);
      moderationService.getAllReports = async () => [
        { id: 'rp1', targetType: 'review', createdAt: new Date().toISOString() },
        { id: 'rp2', targetType: 'rating', createdAt: new Date().toISOString() },
      ];
      moderationService.getOverdueReports = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Staff Reviewer', id: 'u2' };
      const container = document.createElement('div');
      const tab = new ReviewsModerationTab({});
      await tab.renderModeration(container);
      assert(container._innerHTML.includes('2 report(s)'), 'report count shown');
      moderationService.getAllReports = savedGetAll;
      moderationService.getOverdueReports = savedGetOverdue;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows overdue count when reports are overdue', async () => {
      installBrowserEnv();
      const savedGetAll = moderationService.getAllReports.bind(moderationService);
      const savedGetOverdue = moderationService.getOverdueReports.bind(moderationService);
      moderationService.getAllReports = async () => [{ id: 'rp1', targetType: 'review', createdAt: new Date().toISOString() }];
      moderationService.getOverdueReports = async () => [{ id: 'rp1' }];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', id: 'u0' };
      const container = document.createElement('div');
      const tab = new ReviewsModerationTab({});
      await tab.renderModeration(container);
      assert(container._innerHTML.includes('1 overdue'), 'overdue count shown');
      moderationService.getAllReports = savedGetAll;
      moderationService.getOverdueReports = savedGetOverdue;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // ReviewsHistoryTab
  // ================================================================

  await describe('ReviewsHistoryTab: render', async () => {
    await it('renders history-table div', async () => {
      installBrowserEnv();
      const savedGetHistory = browsingHistoryService.getHistory.bind(browsingHistoryService);
      browsingHistoryService.getHistory = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsHistoryTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="history-table"'), 'history-table present');
      browsingHistoryService.getHistory = savedGetHistory;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows history item count', async () => {
      installBrowserEnv();
      const savedGetHistory = browsingHistoryService.getHistory.bind(browsingHistoryService);
      browsingHistoryService.getHistory = async () => [
        { id: 'h1', itemType: 'review', itemId: 'rv1', title: 'Review A', timestamp: new Date().toISOString() },
        { id: 'h2', itemType: 'review', itemId: 'rv2', title: 'Review B', timestamp: new Date().toISOString() },
        { id: 'h3', itemType: 'rating', itemId: 'rt1', title: 'Rating C', timestamp: new Date().toISOString() },
      ];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsHistoryTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('3 item(s)'), '3-item count shown');
      browsingHistoryService.getHistory = savedGetHistory;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows clear history button when history is non-empty', async () => {
      installBrowserEnv();
      const savedGetHistory = browsingHistoryService.getHistory.bind(browsingHistoryService);
      browsingHistoryService.getHistory = async () => [
        { id: 'h1', itemType: 'review', itemId: 'rv1', title: 'Review A', timestamp: new Date().toISOString() },
      ];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsHistoryTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="btn-clear-history"'), 'clear history button present when non-empty');
      browsingHistoryService.getHistory = savedGetHistory;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('does NOT show clear history button when empty', async () => {
      installBrowserEnv();
      const savedGetHistory = browsingHistoryService.getHistory.bind(browsingHistoryService);
      browsingHistoryService.getHistory = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsHistoryTab({});
      await tab.render(container);
      assert(!container._innerHTML.includes('id="btn-clear-history"'), 'no clear button when empty');
      browsingHistoryService.getHistory = savedGetHistory;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // ReviewsFavoritesTab
  // ================================================================

  await describe('ReviewsFavoritesTab: render', async () => {
    await it('renders fav-table div', async () => {
      installBrowserEnv();
      const savedGetByUserId = favoriteService.getByUserId.bind(favoriteService);
      favoriteService.getByUserId = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsFavoritesTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="fav-table"'), 'fav-table present');
      favoriteService.getByUserId = savedGetByUserId;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows favorites count', async () => {
      installBrowserEnv();
      const savedGetByUserId = favoriteService.getByUserId.bind(favoriteService);
      favoriteService.getByUserId = async () => [
        { id: 'fv1', itemType: 'review', itemId: 'rv1', createdAt: new Date().toISOString() },
      ];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsFavoritesTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('1 favorite(s)'), 'favorites count shown');
      favoriteService.getByUserId = savedGetByUserId;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows 0 favorites when empty', async () => {
      installBrowserEnv();
      const savedGetByUserId = favoriteService.getByUserId.bind(favoriteService);
      favoriteService.getByUserId = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new ReviewsFavoritesTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('0 favorite(s)'), 'zero favorites shown');
      favoriteService.getByUserId = savedGetByUserId;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // RatingsTab
  // ================================================================

  await describe('RatingsTab: render', async () => {
    await it('renders ratings-table div', async () => {
      installBrowserEnv();
      const savedGetActive = ratingService.getAllActiveRatings.bind(ratingService);
      const savedGetById = userRepository.getById.bind(userRepository);
      ratingService.getAllActiveRatings = async () => [];
      userRepository.getById = async () => null;
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new RatingsTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="ratings-table"'), 'ratings-table present');
      ratingService.getAllActiveRatings = savedGetActive;
      userRepository.getById = savedGetById;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders btn-new-rating button', async () => {
      installBrowserEnv();
      const savedGetActive = ratingService.getAllActiveRatings.bind(ratingService);
      const savedGetById = userRepository.getById.bind(userRepository);
      ratingService.getAllActiveRatings = async () => [];
      userRepository.getById = async () => null;
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new RatingsTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="btn-new-rating"'), 'btn-new-rating present');
      ratingService.getAllActiveRatings = savedGetActive;
      userRepository.getById = savedGetById;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows ratings count', async () => {
      installBrowserEnv();
      const savedGetActive = ratingService.getAllActiveRatings.bind(ratingService);
      const savedGetById = userRepository.getById.bind(userRepository);
      ratingService.getAllActiveRatings = async () => [
        { id: 'rt1', score: 4, fromUserId: 'u1', toUserId: 'u2', tags: [], createdAt: new Date().toISOString() },
        { id: 'rt2', score: 3, fromUserId: 'u2', toUserId: 'u1', tags: [], createdAt: new Date().toISOString() },
      ];
      userRepository.getById = async () => null;
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new RatingsTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('2 rating(s)'), 'ratings count shown');
      ratingService.getAllActiveRatings = savedGetActive;
      userRepository.getById = savedGetById;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // QATab
  // ================================================================

  await describe('QATab: render', async () => {
    await it('renders threads-table div', async () => {
      installBrowserEnv();
      const savedGetAll = qaService.getAllThreads.bind(qaService);
      qaService.getAllThreads = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QATab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="threads-table"'), 'threads-table present');
      qaService.getAllThreads = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders btn-new-thread button', async () => {
      installBrowserEnv();
      const savedGetAll = qaService.getAllThreads.bind(qaService);
      qaService.getAllThreads = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QATab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="btn-new-thread"'), 'btn-new-thread present');
      qaService.getAllThreads = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows thread count', async () => {
      installBrowserEnv();
      const savedGetAll = qaService.getAllThreads.bind(qaService);
      qaService.getAllThreads = async () => [
        { id: 't1', title: 'Question 1', content: 'Content', createdAt: new Date().toISOString() },
        { id: 't2', title: 'Question 2', content: 'Content', createdAt: new Date().toISOString() },
        { id: 't3', title: 'Question 3', content: 'Content', createdAt: new Date().toISOString() },
      ];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QATab({});
      await tab.render(container);
      assert(container._innerHTML.includes('3 thread(s)'), '3-thread count shown');
      qaService.getAllThreads = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows 0 threads when empty', async () => {
      installBrowserEnv();
      const savedGetAll = qaService.getAllThreads.bind(qaService);
      qaService.getAllThreads = async () => [];
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', id: 'u1' };
      const container = document.createElement('div');
      const tab = new QATab({});
      await tab.render(container);
      assert(container._innerHTML.includes('0 thread(s)'), 'zero threads shown');
      qaService.getAllThreads = savedGetAll;
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });
}
