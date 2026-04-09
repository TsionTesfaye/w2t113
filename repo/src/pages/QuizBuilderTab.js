/**
 * QuizBuilderTab — paper generation with difficulty distribution and chapter constraints.
 * Extracted from QuizPage.
 */

import quizService from '../services/QuizService.js';
import authService from '../services/AuthService.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { escapeHtml } from '../utils/helpers.js';

export class QuizBuilderTab {
  constructor(page) {
    this._page = page;
  }

  generatePaper() {
    Modal.custom('Generate Paper', `
      <form id="paper-form">
        <div class="form-group">
          <label for="p-title">Paper Title</label>
          <input id="p-title" class="form-control" required>
        </div>
        <div class="form-group">
          <label for="p-total">Total Questions</label>
          <input id="p-total" class="form-control" type="number" value="30" min="1">
        </div>
        <div class="form-group">
          <label>Difficulty Distribution (%)</label>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">
            <div><small>D1</small><input id="p-d1" class="form-control" type="number" value="0" min="0" max="100" style="width:60px"></div>
            <div><small>D2</small><input id="p-d2" class="form-control" type="number" value="0" min="0" max="100" style="width:60px"></div>
            <div><small>D3</small><input id="p-d3" class="form-control" type="number" value="40" min="0" max="100" style="width:60px"></div>
            <div><small>D4</small><input id="p-d4" class="form-control" type="number" value="40" min="0" max="100" style="width:60px"></div>
            <div><small>D5</small><input id="p-d5" class="form-control" type="number" value="20" min="0" max="100" style="width:60px"></div>
          </div>
        </div>
        <div class="form-group">
          <label>Chapter Constraints (minimum questions per chapter)</label>
          <div id="p-chapters">
            <div class="flex gap-2 mb-2">
              <input class="form-control chapter-name" type="text" placeholder="Chapter name" style="flex:2">
              <input class="form-control chapter-min" type="number" min="0" value="1" style="flex:1;width:60px" placeholder="Min">
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" id="btn-add-chapter">+ Add Chapter</button>
          <small style="color:var(--color-text-muted);display:block;margin-top:4px">e.g. "Chapter 1" with min 2 ensures at least 2 questions from that chapter</small>
        </div>
        <div id="paper-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Generate</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#btn-add-chapter').addEventListener('click', () => {
        const container = modalEl.querySelector('#p-chapters');
        const row = document.createElement('div');
        row.className = 'flex gap-2 mb-2';
        row.innerHTML = '<input class="form-control chapter-name" type="text" placeholder="Chapter name" style="flex:2"><input class="form-control chapter-min" type="number" min="0" value="1" style="flex:1;width:60px" placeholder="Min">';
        container.appendChild(row);
      });

      modalEl.querySelector('#paper-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const dist = {};
        for (let i = 1; i <= 5; i++) {
          const val = Number(modalEl.querySelector(`#p-d${i}`).value);
          if (val > 0) dist[i] = val / 100;
        }

        const chapterConstraints = {};
        const names = modalEl.querySelectorAll('.chapter-name');
        const mins = modalEl.querySelectorAll('.chapter-min');
        for (let i = 0; i < names.length; i++) {
          const name = names[i].value.trim();
          const min = Number(mins[i].value) || 0;
          if (name && min > 0) chapterConstraints[name] = min;
        }

        try {
          const user = authService.getCurrentUser();
          const quiz = await quizService.generatePaper(
            modalEl.querySelector('#p-title').value,
            '',
            {
              totalQuestions: Number(modalEl.querySelector('#p-total').value),
              difficultyDistribution: dist,
              chapterConstraints,
            },
            user?.id
          );
          Toast.success(`Paper "${quiz.title}" generated with ${quiz.questionIds.length} questions.`);
          close();
          this._page.activeTab = 'quizzes';
          this._page.render();
        } catch (err) {
          modalEl.querySelector('#paper-error').textContent = err.message;
        }
      });
    });
  }
}

export default QuizBuilderTab;
