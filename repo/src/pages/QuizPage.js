/**
 * QuizPage — question bank, bulk import, paper generation, quiz-taking, grading, wrong-question notebook, favorites.
 */

import quizService from '../services/QuizService.js';
import gradingService from '../services/GradingService.js';
import favoriteService from '../services/FavoriteService.js';
import authService from '../services/AuthService.js';
import browsingHistoryService from '../services/BrowsingHistoryService.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Drawer from '../components/Drawer.js';
import Toast from '../components/Toast.js';
import { QUESTION_TYPES } from '../models/Question.js';
import { USER_ROLES } from '../models/User.js';
import { escapeHtml, formatDate, readFileAsText, readFileAsArrayBuffer, maskId } from '../utils/helpers.js';
import { parseExcelFile } from '../utils/excelParser.js';

export class QuizPage {
  constructor(appShell) {
    this.appShell = appShell;
    this.activeTab = 'questions';
  }

  async render() {
    this.appShell.setPageTitle('Quiz Center');
    const container = this.appShell.getContentContainer();
    const user = authService.getCurrentUser();
    const isInstructorOrAdmin = user && [USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR].includes(user.role);
    const isLearner = user && user.role === USER_ROLES.LEARNER;

    const tabs = [
      { id: 'questions', label: 'Question Bank' },
      { id: 'quizzes', label: 'Quizzes' },
    ];
    if (isLearner) {
      tabs.push({ id: 'my-results', label: 'My Results' });
      tabs.push({ id: 'wrong-notebook', label: 'Wrong Questions' });
      tabs.push({ id: 'favorites', label: 'Favorites' });
    }
    if (isInstructorOrAdmin) {
      tabs.push({ id: 'grading', label: 'Grading' });
    }

    container.innerHTML = `
      <div class="filters-bar">
        ${tabs.map(t => `<button class="btn ${this.activeTab === t.id ? 'btn-primary' : 'btn-secondary'} tab-btn" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      <div id="tab-content"></div>
    `;

    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.render();
      });
    });

    const tabContent = container.querySelector('#tab-content');
    switch (this.activeTab) {
      case 'questions':      await this._renderQuestions(tabContent); break;
      case 'quizzes':        await this._renderQuizzes(tabContent); break;
      case 'my-results':     await this._renderMyResults(tabContent); break;
      case 'wrong-notebook': await this._renderWrongNotebook(tabContent); break;
      case 'favorites':      await this._renderFavorites(tabContent); break;
      case 'grading':        await this._renderGrading(tabContent); break;
    }
  }

  // ===================== QUESTION BANK TAB =====================
  async _renderQuestions(container) {
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
      onRowClick: (q) => this._viewQuestion(q),
    });
    table.render(container.querySelector('#questions-table'));

    if (canManage) {
      container.querySelector('#btn-add-question')?.addEventListener('click', () => this._addQuestion());
      container.querySelector('#btn-bulk-import')?.addEventListener('click', () => this._bulkImport());
      container.querySelector('#btn-generate-paper')?.addEventListener('click', () => this._generatePaper());
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
          this.render();
        } catch (err) {
          modalEl.querySelector('#q-error').textContent = err.message;
        }
      });
    });
  }

  async _viewQuestion(question) {
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
          this.render();
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
          this.render();
        } catch (err) {
          modalEl.querySelector('#eq-error').textContent = err.message;
        }
      });
    });
  }

  _bulkImport() {
    Modal.custom('Bulk Import Questions', `
      <p>Upload a JSON or Excel (.xlsx) file with required columns: <strong>questionText, type, correctAnswer, difficulty, tags</strong></p>
      <div class="form-group mt-4">
        <input type="file" id="import-file" accept=".json,.xlsx,.xls">
      </div>
      <div id="import-preview" style="max-height:150px;overflow-y:auto;font-size:0.8rem;margin-bottom:8px"></div>
      <div id="import-error" class="form-error" style="white-space:pre-wrap"></div>
      <button class="btn btn-primary mt-4" id="btn-do-import">Import</button>
    `, (modalEl, close) => {
      modalEl.querySelector('#import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const previewEl = modalEl.querySelector('#import-preview');
        const errorEl = modalEl.querySelector('#import-error');
        errorEl.textContent = '';
        try {
          const rows = await this._parseImportFile(file);
          previewEl.textContent = `Parsed ${rows.length} rows. Click Import to proceed.`;
        } catch (err) {
          errorEl.textContent = 'Cannot parse file: ' + err.message;
        }
      });

      modalEl.querySelector('#btn-do-import').addEventListener('click', async () => {
        const file = modalEl.querySelector('#import-file').files[0];
        if (!file) { modalEl.querySelector('#import-error').textContent = 'Select a file.'; return; }

        try {
          const rows = await this._parseImportFile(file);
          const user = authService.getCurrentUser();
          const result = await quizService.bulkImport(rows, user?.id);

          if (result.success) {
            Toast.success(`Imported ${result.count} questions.`);
            close();
            this.render();
          } else {
            modalEl.querySelector('#import-error').textContent = result.errors.join('\n');
          }
        } catch (err) {
          modalEl.querySelector('#import-error').textContent = err.message;
        }
      });
    });
  }

  /**
   * Parse an import file (JSON or Excel) into row objects.
   */
  async _parseImportFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const buffer = await readFileAsArrayBuffer(file);
      return parseExcelFile(buffer, file.name);
    }
    // Default: JSON
    const text = await readFileAsText(file);
    return JSON.parse(text);
  }

  _generatePaper() {
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

        // Collect chapter constraints
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
          this.activeTab = 'quizzes';
          this.render();
        } catch (err) {
          modalEl.querySelector('#paper-error').textContent = err.message;
        }
      });
    });
  }

  // ===================== QUIZZES TAB =====================
  async _renderQuizzes(container) {
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
          this.activeTab = 'my-results';
          this.render();
        } catch (err) {
          drawerEl.querySelector('#quiz-submit-error').textContent = err.message;
        }
      });
    });
  }

  // ===================== MY RESULTS TAB =====================
  async _renderMyResults(container) {
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

  // ===================== WRONG NOTEBOOK TAB =====================
  async _renderWrongNotebook(container) {
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

  // ===================== FAVORITES TAB =====================
  async _renderFavorites(container) {
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
      onRowClick: (q) => this._viewQuestion(q),
    });
    table.render(container.querySelector('#fav-table'));
  }

  // ===================== GRADING TAB =====================
  async _renderGrading(container) {
    const user = authService.getCurrentUser();
    if (!user || ![USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR].includes(user.role)) {
      container.innerHTML = '<p>You do not have permission to access grading.</p>';
      return;
    }
    // Get all quiz results that have ungraded subjective answers
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
      onRowClick: (r) => this._gradeResult(r),
    });
    table.render(container.querySelector('#grading-table'));
  }

  async _gradeResult(result) {
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
        this.render();
      });
    });
  }
}

export default QuizPage;
