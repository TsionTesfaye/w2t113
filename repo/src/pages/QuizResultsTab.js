/**
 * QuizResultsTab — my quiz results listing and result detail modal.
 * Extracted from QuizPage.
 */

import quizService from '../services/QuizService.js';
import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';

export class QuizResultsTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const user = authService.getCurrentUser();
    const results = await quizService.getResultsByUserId(user.id);
    results.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    container.innerHTML = `
      <div class="mb-4"><span>${results.length} result(s)</span></div>
      <div id="results-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'quizId', label: 'Quiz', render: (r) => escapeHtml(maskId(r.quizId)) },
        { key: 'objectiveScore', label: 'Objective', render: (r) => r.objectiveScore !== null ? r.objectiveScore + '%' : '-' },
        { key: 'totalScore', label: 'Total', render: (r) => r.totalScore !== null ? r.totalScore + '%' : 'Pending' },
        { key: 'submittedAt', label: 'Submitted', render: (r) => formatDate(r.submittedAt) },
      ],
      data: results,
      onRowClick: (r) => this._viewResult(r),
    });
    table.render(container.querySelector('#results-table'));
  }

  async _viewResult(result) {
    const answersHTML = result.answers.map(a => {
      let status = '';
      if (a.autoGraded) {
        status = a.isCorrect
          ? '<span style="color:var(--color-success)">Correct</span>'
          : '<span style="color:var(--color-danger)">Incorrect</span>';
      } else {
        const sub = result.subjectiveScores && result.subjectiveScores[a.questionId];
        status = sub ? `<span>Score: ${sub.score}/10</span>` : '<span style="color:var(--color-warning)">Pending grading</span>';
      }
      return `<div style="padding:4px 0;border-bottom:1px solid var(--color-border)">
        <small>Q: ${escapeHtml(maskId(a.questionId))}</small>
        <span style="margin-left:8px">Answer: ${escapeHtml(String(Array.isArray(a.answer) ? a.answer.join(', ') : a.answer || ''))}</span>
        <span style="margin-left:8px">${status}</span>
      </div>`;
    }).join('');

    Modal.custom('Quiz Result', `
      <div class="form-group"><label>Objective Score</label><p>${result.objectiveScore !== null ? result.objectiveScore + '%' : '-'}</p></div>
      <div class="form-group"><label>Total Score</label><p>${result.totalScore !== null ? result.totalScore + '%' : 'Pending grading'}</p></div>
      <div class="form-group"><label>Submitted</label><p>${formatDate(result.submittedAt)}</p></div>
      <hr style="margin:8px 0;border:none;border-top:1px solid var(--color-border)">
      <h4>Answers</h4>
      ${answersHTML}
    `);
  }
}

export default QuizResultsTab;
