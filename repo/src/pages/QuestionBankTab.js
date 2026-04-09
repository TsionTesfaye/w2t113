/**
 * QuestionBankTab — question bank browsing, add, view, edit, delete.
 * Extracted from QuizPage.
 */

import quizService from '../services/QuizService.js';
import favoriteService from '../services/FavoriteService.js';
import authService from '../services/AuthService.js';
import browsingHistoryService from '../services/BrowsingHistoryService.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { QUESTION_TYPES } from '../models/Question.js';
import { USER_ROLES } from '../models/User.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';

export class QuestionBankTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const user = authService.getCurrentUser();
    const canManage = user && [USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR].includes(user.role);

    container.innerHTML = `
      <div class="flex-between mb-4">
        ${canManage ? `
          <div class="btn-group">
            <button class="btn btn-primary" id="btn-add-question">+ Add Question</button>
            <button class="btn btn-secondary" id="btn-bulk-import">Bulk Import</button>
            <button class="btn btn-secondary" id="btn-generate-paper">Generate Paper</button>
          </div>
        ` : '<div></div>'}
        <div></div>
      </div>
      <div id="questions-table"></div>
    `;

    // Learners receive answer-stripped questions. Instructors/admins get full records.
    const questions = canManage
      ? await quizService.getAllQuestions()
      : await quizService.getQuestionsForLearner();

    const table = new DataTable({
      columns: [
        { key: 'questionText', label: 'Question', render: (q) => escapeHtml(q.questionText.substring(0, 60)) + (q.questionText.length > 60 ? '...' : '') },
        { key: 'type', label: 'Type', render: (q) => escapeHtml(q.type) },
        { key: 'difficulty', label: 'Diff', render: (q) => String(q.difficulty) },
        { key: 'tags', label: 'Tags', render: (q) => escapeHtml(Array.isArray(q.tags) ? q.tags.join(', ') : String(q.tags || '')) },
        { key: 'chapter', label: 'Chapter', render: (q) => escapeHtml(q.chapter || '-') },
      ],
      data: questions,
      onRowClick: (q) => this.viewQuestion(q),
    });
    table.render(container.querySelector('#questions-table'));

    if (canManage) {
      container.querySelector('#btn-add-question')?.addEventListener('click', () => this._addQuestion());
      container.querySelector('#btn-bulk-import')?.addEventListener('click', () => this._page._importTab.bulkImport());
      container.querySelector('#btn-generate-paper')?.addEventListener('click', () => this._page._builderTab.generatePaper());
    }
  }

  _addQuestion() {
    const typeOptions = Object.values(QUESTION_TYPES).map(t => `<option value="${t}">${t}</option>`).join('');

    Modal.custom('Add Question', `
      <form id="question-form">
        <div class="form-group">
          <label for="q-text">Question Text</label>
          <textarea id="q-text" class="form-control" rows="3" required></textarea>
        </div>
        <div class="form-group">
          <label for="q-type">Type</label>
          <select id="q-type" class="form-control">${typeOptions}</select>
        </div>
        <div class="form-group" id="q-options-group">
          <label for="q-options">Options (one per line, prefix correct with *)</label>
          <textarea id="q-options" class="form-control" rows="4" placeholder="*Option A (correct)&#10;Option B&#10;Option C&#10;Option D"></textarea>
          <small style="color:var(--color-text-muted)">For single/multiple choice. Prefix correct answers with *</small>
        </div>
        <div class="form-group">
          <label for="q-answer">Correct Answer (for fill-in type)</label>
          <input id="q-answer" class="form-control" type="text">
        </div>
        <div class="form-group">
          <label for="q-difficulty">Difficulty (1–5)</label>
          <input id="q-difficulty" class="form-control" type="number" min="1" max="5" required>
        </div>
        <div class="form-group">
          <label for="q-tags">Tags (comma-separated)</label>
          <input id="q-tags" class="form-control" type="text" required>
        </div>
        <div class="form-group">
          <label for="q-chapter">Chapter</label>
          <input id="q-chapter" class="form-control" type="text">
        </div>
        <div class="form-group">
          <label for="q-explanation">Explanation</label>
          <textarea id="q-explanation" class="form-control" rows="2"></textarea>
        </div>
        <div id="q-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Save</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#question-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = modalEl.querySelector('#q-type').value;
        const optionsRaw = modalEl.querySelector('#q-options').value.trim();
        let options = [];
        let correctAnswer = modalEl.querySelector('#q-answer').value;

        if (type === QUESTION_TYPES.SINGLE || type === QUESTION_TYPES.MULTIPLE) {
          const lines = optionsRaw.split('\n').filter(l => l.trim());
          const correctAnswers = [];
          options = lines.map((line, i) => {
            const isCorrect = line.trim().startsWith('*');
            const label = isCorrect ? line.trim().substring(1).trim() : line.trim();
            const value = String.fromCharCode(65 + i); // A, B, C, D...
            if (isCorrect) correctAnswers.push(value);
            return { label, value };
          });
          correctAnswer = type === QUESTION_TYPES.MULTIPLE ? correctAnswers : (correctAnswers[0] || '');
        }

        try {
          const user = authService.getCurrentUser();
          await quizService.createQuestion({
            questionText: modalEl.querySelector('#q-text').value,
            type,
            options,
            correctAnswer,
            difficulty: Number(modalEl.querySelector('#q-difficulty').value),
            tags: modalEl.querySelector('#q-tags').value,
            chapter: modalEl.querySelector('#q-chapter').value,
            explanation: modalEl.querySelector('#q-explanation').value,
            createdBy: user?.id,
          });
          Toast.success('Question created.');
          close();
          this._page.render();
        } catch (err) {
          modalEl.querySelector('#q-error').textContent = err.message;
        }
      });
    });
  }

  async viewQuestion(question) {
    const user = authService.getCurrentUser();
    const canManage = user && [USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR].includes(user.role);
    await browsingHistoryService.record(user.id, 'question', question.id, question.questionText.substring(0, 50));

    const isFav = await favoriteService.isFavorited(user.id, 'question', question.id);
    const optionsDisplay = question.options && question.options.length > 0
      ? question.options.map(o => `<li>${escapeHtml(o.value)}: ${escapeHtml(o.label)}</li>`).join('')
      : 'N/A';

    Modal.custom('Question Details', `
      <div class="form-group"><label>Text</label><p>${escapeHtml(question.questionText)}</p></div>
      <div class="form-group"><label>Type</label><p>${escapeHtml(question.type)}</p></div>
      <div class="form-group"><label>Options</label><ul>${optionsDisplay}</ul></div>
      ${canManage ? `<div class="form-group"><label>Correct Answer</label><p>${escapeHtml(String(question.correctAnswer || 'N/A (subjective)'))}</p></div>` : ''}
      <div class="form-group"><label>Difficulty</label><p>${question.difficulty}</p></div>
      <div class="form-group"><label>Tags</label><p>${escapeHtml(Array.isArray(question.tags) ? question.tags.join(', ') : '')}</p></div>
      <div class="form-group"><label>Chapter</label><p>${escapeHtml(question.chapter || '-')}</p></div>
      <div class="form-group"><label>Explanation</label><p>${escapeHtml(question.explanation || 'None')}</p></div>
      <div class="btn-group mt-4" style="flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" id="btn-fav-q">${isFav ? 'Unfavorite' : 'Favorite'}</button>
        ${canManage ? '<button class="btn btn-secondary btn-sm" id="btn-edit-q">Edit</button>' : ''}
        ${canManage ? '<button class="btn btn-danger btn-sm" id="btn-delete-q">Delete</button>' : ''}
      </div>
    `, (modalEl, close) => {
      modalEl.querySelector('#btn-fav-q').addEventListener('click', async () => {
        const result = await favoriteService.toggle(user.id, 'question', question.id);
        Toast.success(result.action === 'added' ? 'Added to favorites' : 'Removed from favorites');
        close();
      });

      modalEl.querySelector('#btn-edit-q')?.addEventListener('click', () => {
        close();
        this._editQuestion(question);
      });

      modalEl.querySelector('#btn-delete-q')?.addEventListener('click', async () => {
        close();
        const confirmed = await Modal.confirm('Delete Question', 'Are you sure you want to delete this question? This action cannot be undone.');
        if (!confirmed) return;
        try {
          await quizService.deleteQuestion(question.id, user.id);
          Toast.success('Question deleted.');
          this._page.render();
        } catch (err) {
          Toast.error(err.message);
        }
      });
    });
  }

  _editQuestion(question) {
    const typeOptions = Object.values(QUESTION_TYPES).map(t => `<option value="${t}" ${question.type === t ? 'selected' : ''}>${t}</option>`).join('');
    const optionsText = (question.options || []).map(o => {
      const isCorrect = question.type === QUESTION_TYPES.MULTIPLE
        ? (Array.isArray(question.correctAnswer) && question.correctAnswer.includes(o.value))
        : question.correctAnswer === o.value;
      return (isCorrect ? '*' : '') + o.label;
    }).join('\n');

    Modal.custom('Edit Question', `
      <form id="edit-question-form">
        <div class="form-group">
          <label for="eq-text">Question Text</label>
          <textarea id="eq-text" class="form-control" rows="3" required>${escapeHtml(question.questionText)}</textarea>
        </div>
        <div class="form-group">
          <label for="eq-type">Type</label>
          <select id="eq-type" class="form-control">${typeOptions}</select>
        </div>
        <div class="form-group" id="eq-options-group">
          <label for="eq-options">Options (one per line, prefix correct with *)</label>
          <textarea id="eq-options" class="form-control" rows="4">${escapeHtml(optionsText)}</textarea>
        </div>
        <div class="form-group">
          <label for="eq-answer">Correct Answer (for fill-in type)</label>
          <input id="eq-answer" class="form-control" type="text" value="${escapeHtml(String(question.type === QUESTION_TYPES.FILL_IN ? (question.correctAnswer || '') : ''))}">
        </div>
        <div class="form-group">
          <label for="eq-difficulty">Difficulty (1-5)</label>
          <input id="eq-difficulty" class="form-control" type="number" min="1" max="5" value="${question.difficulty}" required>
        </div>
        <div class="form-group">
          <label for="eq-tags">Tags (comma-separated)</label>
          <input id="eq-tags" class="form-control" type="text" value="${escapeHtml(Array.isArray(question.tags) ? question.tags.join(', ') : String(question.tags || ''))}" required>
        </div>
        <div class="form-group">
          <label for="eq-chapter">Chapter</label>
          <input id="eq-chapter" class="form-control" type="text" value="${escapeHtml(question.chapter || '')}">
        </div>
        <div class="form-group">
          <label for="eq-explanation">Explanation</label>
          <textarea id="eq-explanation" class="form-control" rows="2">${escapeHtml(question.explanation || '')}</textarea>
        </div>
        <div id="eq-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Save Changes</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#edit-question-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        const type = modalEl.querySelector('#eq-type').value;
        const optionsRaw = modalEl.querySelector('#eq-options').value.trim();
        let options = [];
        let correctAnswer = modalEl.querySelector('#eq-answer').value;

        if (type === QUESTION_TYPES.SINGLE || type === QUESTION_TYPES.MULTIPLE) {
          const lines = optionsRaw.split('\n').filter(l => l.trim());
          const correctAnswers = [];
          options = lines.map((line, i) => {
            const isCorrect = line.trim().startsWith('*');
            const label = isCorrect ? line.trim().substring(1).trim() : line.trim();
            const value = String.fromCharCode(65 + i);
            if (isCorrect) correctAnswers.push(value);
            return { label, value };
          });
          correctAnswer = type === QUESTION_TYPES.MULTIPLE ? correctAnswers : (correctAnswers[0] || '');
        }

        const diff = Number(modalEl.querySelector('#eq-difficulty').value);
        if (!Number.isInteger(diff) || diff < 1 || diff > 5) {
          modalEl.querySelector('#eq-error').textContent = 'Difficulty must be between 1 and 5.';
          return;
        }

        const questionText = modalEl.querySelector('#eq-text').value.trim();
        if (!questionText) {
          modalEl.querySelector('#eq-error').textContent = 'Question text is required.';
          return;
        }

        try {
          await quizService.updateQuestion(question.id, {
            questionText,
            type,
            options,
            correctAnswer,
            difficulty: diff,
            tags: modalEl.querySelector('#eq-tags').value,
            chapter: modalEl.querySelector('#eq-chapter').value,
            explanation: modalEl.querySelector('#eq-explanation').value,
          }, user.id);
          Toast.success('Question updated.');
          close();
          this._page.render();
        } catch (err) {
          modalEl.querySelector('#eq-error').textContent = err.message;
        }
      });
    });
  }
}

export default QuestionBankTab;
