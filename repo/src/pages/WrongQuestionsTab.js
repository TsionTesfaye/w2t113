/**
 * WrongQuestionsTab — wrong-question notebook listing and detail modal.
 * Extracted from QuizPage.
 */

import quizService from '../services/QuizService.js';
import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';

export class WrongQuestionsTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const user = authService.getCurrentUser();
    const wrongQs = await quizService.getWrongQuestions(user.id);

    container.innerHTML = `
      <div class="mb-4"><span>${wrongQs.length} wrong question(s) in notebook</span></div>
      <div id="wrong-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'questionId', label: 'Question', render: (w) => escapeHtml(maskId(w.questionId)) },
        { key: 'userAnswer', label: 'Your Answer', render: (w) => escapeHtml(String(w.userAnswer || '').substring(0, 30)) },
        { key: 'correctAnswer', label: 'Correct', render: (w) => escapeHtml(String(w.correctAnswer || '').substring(0, 30)) },
        { key: 'createdAt', label: 'Date', render: (w) => formatDate(w.createdAt) },
      ],
      data: wrongQs,
      onRowClick: (w) => this._viewWrongQuestion(w),
    });
    table.render(container.querySelector('#wrong-table'));
  }

  async _viewWrongQuestion(wrongQ) {
    // Only questionText and explanation are needed — use learner-safe method
    const question = await quizService.getQuestionByIdForLearner(wrongQ.questionId);
    Modal.custom('Wrong Question Detail', `
      <div class="form-group"><label>Question</label><p>${escapeHtml(question ? question.questionText : wrongQ.questionId)}</p></div>
      <div class="form-group"><label>Your Answer</label><p style="color:var(--color-danger)">${escapeHtml(wrongQ.userAnswer)}</p></div>
      <div class="form-group"><label>Correct Answer</label><p style="color:var(--color-success)">${escapeHtml(wrongQ.correctAnswer)}</p></div>
      <div class="form-group"><label>Explanation</label><p>${escapeHtml(wrongQ.explanation || 'No explanation available.')}</p></div>
    `);
  }
}

export default WrongQuestionsTab;
