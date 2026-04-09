/**
 * FavoriteQuestionsTab — favorited questions listing.
 * Extracted from QuizPage.
 */

import quizService from '../services/QuizService.js';
import favoriteService from '../services/FavoriteService.js';
import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import { escapeHtml } from '../utils/helpers.js';

export class FavoriteQuestionsTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const user = authService.getCurrentUser();
    const favs = await favoriteService.getByUserAndType(user.id, 'question');

    const questions = [];
    for (const fav of favs) {
      // Learner favorites use stripped questions — correctAnswer never in closure
      const q = await quizService.getQuestionByIdForLearner(fav.itemId);
      if (q) questions.push(q);
    }

    container.innerHTML = `
      <div class="mb-4"><span>${questions.length} favorited question(s)</span></div>
      <div id="fav-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'questionText', label: 'Question', render: (q) => escapeHtml(q.questionText.substring(0, 60)) },
        { key: 'type', label: 'Type', render: (q) => escapeHtml(q.type) },
        { key: 'difficulty', label: 'Diff', render: (q) => String(q.difficulty) },
      ],
      data: questions,
      onRowClick: (q) => this._page._questionBankTab.viewQuestion(q),
    });
    table.render(container.querySelector('#fav-table'));
  }
}

export default FavoriteQuestionsTab;
