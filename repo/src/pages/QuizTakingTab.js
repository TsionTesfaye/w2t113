/**
 * QuizTakingTab — quiz listing and quiz-taking drawer.
 * Extracted from QuizPage.
 */

import quizService from '../services/QuizService.js';
import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import Drawer from '../components/Drawer.js';
import Toast from '../components/Toast.js';
import { QUESTION_TYPES } from '../models/Question.js';
import { USER_ROLES } from '../models/User.js';
import { escapeHtml, formatDate } from '../utils/helpers.js';

export class QuizTakingTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const quizzes = await quizService.getAllQuizzes();
    quizzes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const user = authService.getCurrentUser();
    const isLearner = user.role === USER_ROLES.LEARNER;

    container.innerHTML = `
      <div class="mb-4"><span>${quizzes.length} quiz(zes)</span></div>
      <div id="quizzes-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'title', label: 'Title', render: (q) => escapeHtml(q.title) },
        { key: 'questionIds', label: 'Questions', render: (q) => q.questionIds ? q.questionIds.length : 0 },
        { key: 'createdAt', label: 'Created', render: (q) => formatDate(q.createdAt) },
        { key: 'actions', label: '', render: (q) => isLearner ? `<button class="btn btn-sm btn-primary take-quiz-btn" data-id="${q.id}">Take Quiz</button>` : '' },
      ],
      data: quizzes,
    });
    table.render(container.querySelector('#quizzes-table'));

    // Wire take quiz buttons
    container.querySelectorAll('.take-quiz-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._takeQuiz(btn.dataset.id);
      });
    });
  }

  async _takeQuiz(quizId) {
    const quiz = await quizService.getQuizById(quizId);
    if (!quiz) { Toast.error('Quiz not found.'); return; }

    // Use learner-safe method — correctAnswer is NEVER loaded into the browser
    // closure during a quiz attempt, even for JavaScript inspection via DevTools.
    const questions = [];
    for (const qId of quiz.questionIds) {
      const q = await quizService.getQuestionByIdForLearner(qId);
      if (q) questions.push(q);
    }

    if (questions.length === 0) { Toast.error('This quiz has no questions.'); return; }

    // Build quiz form
    const questionsHTML = questions.map((q, idx) => {
      let inputHTML = '';
      if (q.type === QUESTION_TYPES.SINGLE) {
        inputHTML = (q.options || []).map(o =>
          `<label style="display:block;margin:4px 0"><input type="radio" name="ans-${q.id}" value="${escapeHtml(o.value)}"> ${escapeHtml(o.value)}: ${escapeHtml(o.label)}</label>`
        ).join('');
      } else if (q.type === QUESTION_TYPES.MULTIPLE) {
        inputHTML = (q.options || []).map(o =>
          `<label style="display:block;margin:4px 0"><input type="checkbox" name="ans-${q.id}" value="${escapeHtml(o.value)}"> ${escapeHtml(o.value)}: ${escapeHtml(o.label)}</label>`
        ).join('');
      } else if (q.type === QUESTION_TYPES.FILL_IN) {
        inputHTML = `<input type="text" class="form-control" id="ans-${q.id}" placeholder="Your answer">`;
      } else {
        inputHTML = `<textarea class="form-control" id="ans-${q.id}" rows="3" placeholder="Your answer (subjective)"></textarea>`;
      }
      return `
        <div style="margin-bottom:20px;padding:12px;border:1px solid var(--color-border);border-radius:var(--radius)">
          <p style="font-weight:600;margin-bottom:8px">${idx + 1}. ${escapeHtml(q.questionText)}</p>
          <small style="color:var(--color-text-muted)">Type: ${q.type} | Difficulty: ${q.difficulty}</small>
          <div style="margin-top:8px" data-qid="${q.id}" data-qtype="${q.type}">${inputHTML}</div>
        </div>
      `;
    }).join('');

    Drawer.open(`Take Quiz: ${quiz.title}`, `
      <form id="quiz-submit-form">
        ${questionsHTML}
        <div id="quiz-submit-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary" style="width:100%">Submit Answers</button>
      </form>
    `, (drawerEl) => {
      drawerEl.querySelector('#quiz-submit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        const answers = [];

        for (const q of questions) {
          let answer;
          if (q.type === QUESTION_TYPES.SINGLE) {
            const checked = drawerEl.querySelector(`input[name="ans-${q.id}"]:checked`);
            answer = checked ? checked.value : '';
          } else if (q.type === QUESTION_TYPES.MULTIPLE) {
            const checked = drawerEl.querySelectorAll(`input[name="ans-${q.id}"]:checked`);
            answer = Array.from(checked).map(c => c.value);
          } else {
            const el = drawerEl.querySelector(`#ans-${q.id}`);
            answer = el ? el.value : '';
          }
          answers.push({ questionId: q.id, answer });
        }

        try {
          const result = await quizService.submitAnswers(quiz.id, user.id, answers);
          Drawer.closeAll();
          Toast.success(`Quiz submitted! Objective score: ${result.objectiveScore !== null ? result.objectiveScore + '%' : 'N/A (subjective only)'}`);
          this._page.activeTab = 'my-results';
          this._page.render();
        } catch (err) {
          drawerEl.querySelector('#quiz-submit-error').textContent = err.message;
        }
      });
    });
  }
}

export default QuizTakingTab;
