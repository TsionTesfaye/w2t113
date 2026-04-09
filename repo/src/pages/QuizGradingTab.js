/**
 * QuizGradingTab — grading subjective answers, extracted from QuizPage.
 */

import quizService from '../services/QuizService.js';
import gradingService from '../services/GradingService.js';
import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import Drawer from '../components/Drawer.js';
import Toast from '../components/Toast.js';
import { USER_ROLES } from '../models/User.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';

export class QuizGradingTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const user = authService.getCurrentUser();
    if (!user || ![USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR].includes(user.role)) {
      container.innerHTML = '<p>You do not have permission to access grading.</p>';
      return;
    }
    const allResults = await quizService.getAllQuizResults();
    const pendingGrading = [];

    for (const result of allResults) {
      const subjectiveAnswers = result.answers.filter(a => !a.autoGraded);
      if (subjectiveAnswers.length === 0) continue;

      const ungradedCount = subjectiveAnswers.filter(a =>
        !result.subjectiveScores || !result.subjectiveScores[a.questionId]
      ).length;

      if (ungradedCount > 0) {
        result._ungradedCount = ungradedCount;
        result._totalSubjective = subjectiveAnswers.length;
        pendingGrading.push(result);
      }
    }

    container.innerHTML = `
      <div class="mb-4"><span>${pendingGrading.length} result(s) pending grading</span></div>
      <div id="grading-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'quizId', label: 'Quiz', render: (r) => escapeHtml(maskId(r.quizId)) },
        { key: 'userId', label: 'Student', render: (r) => escapeHtml(maskId(r.userId)) },
        { key: '_ungradedCount', label: 'Ungraded', render: (r) => `${r._ungradedCount} of ${r._totalSubjective}` },
        { key: 'submittedAt', label: 'Submitted', render: (r) => formatDate(r.submittedAt) },
      ],
      data: pendingGrading,
      onRowClick: (r) => this.gradeResult(r),
    });
    table.render(container.querySelector('#grading-table'));
  }

  async gradeResult(result) {
    const subjectiveAnswers = result.answers.filter(a => !a.autoGraded);
    const questionsHTML = [];

    for (const ans of subjectiveAnswers) {
      const question = await quizService.getQuestionById(ans.questionId);
      const existing = result.subjectiveScores && result.subjectiveScores[ans.questionId];
      questionsHTML.push(`
        <div style="margin-bottom:16px;padding:12px;border:1px solid var(--color-border);border-radius:var(--radius)">
          <p style="font-weight:600">${escapeHtml(question ? question.questionText : ans.questionId)}</p>
          <p style="margin:8px 0"><strong>Student Answer:</strong> ${escapeHtml(String(ans.answer || ''))}</p>
          <div class="flex gap-2" style="align-items:center">
            <label>Score (0–10):</label>
            <input type="number" class="form-control grade-score" data-qid="${ans.questionId}" min="0" max="10" step="1" value="${existing ? existing.score : ''}" style="width:80px" ${existing ? 'disabled' : ''}>
          </div>
          <div class="form-group" style="margin-top:4px">
            <label>Notes:</label>
            <input type="text" class="form-control grade-notes" data-qid="${ans.questionId}" value="${existing ? escapeHtml(existing.notes || '') : ''}" ${existing ? 'disabled' : ''}>
          </div>
          ${existing ? '<small style="color:var(--color-success)">Already graded</small>' : ''}
        </div>
      `);
    }

    Drawer.open('Grade Subjective Answers', `
      <div>${questionsHTML.join('')}</div>
      <div id="grade-error" class="form-error"></div>
      <button class="btn btn-primary" id="btn-save-grades" style="width:100%">Save Grades</button>
    `, (drawerEl) => {
      drawerEl.querySelector('#btn-save-grades').addEventListener('click', async () => {
        const user = authService.getCurrentUser();
        const scoreInputs = drawerEl.querySelectorAll('.grade-score:not(:disabled)');
        const errorEl = drawerEl.querySelector('#grade-error');
        errorEl.textContent = '';

        let graded = 0;
        for (const input of scoreInputs) {
          const qid = input.dataset.qid;
          const score = parseInt(input.value, 10);
          if (isNaN(score)) continue;

          const notesInput = drawerEl.querySelector(`.grade-notes[data-qid="${qid}"]`);
          const notes = notesInput ? notesInput.value : '';

          try {
            await gradingService.gradeSubjective(result.id, qid, score, notes, user.id);
            graded++;
          } catch (err) {
            errorEl.textContent = `Error grading ${qid}: ${err.message}`;
            return;
          }
        }

        if (graded > 0) {
          Toast.success(`Graded ${graded} answer(s).`);
        }
        Drawer.closeAll();
        this._page.render();
      });
    });
  }
}

export default QuizGradingTab;
