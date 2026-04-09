/**
 * QATab — Q&A threads listing, creation, and viewing with answer submission.
 * Extracted from ReviewsPage.
 */

import qaService from '../services/QAService.js';
import browsingHistoryService from '../services/BrowsingHistoryService.js';
import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { escapeHtml, formatDate } from '../utils/helpers.js';

export class QATab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const threads = await qaService.getAllThreads();
    threads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = `
      <div class="flex-between mb-4">
        <span>${threads.length} thread(s)</span>
        <button class="btn btn-primary" id="btn-new-thread">+ Ask Question</button>
      </div>
      <div id="threads-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'title', label: 'Title', render: (t) => escapeHtml(t.title) },
        { key: 'content', label: 'Content', render: (t) => escapeHtml((t.content || '').substring(0, 60)) },
        { key: 'createdAt', label: 'Date', render: (t) => formatDate(t.createdAt) },
      ],
      data: threads,
      onRowClick: (t) => this._viewThread(t),
    });
    table.render(container.querySelector('#threads-table'));

    container.querySelector('#btn-new-thread').addEventListener('click', () => this._createThread());
  }

  _createThread() {
    Modal.custom('Ask a Question', `
      <form id="thread-form">
        <div class="form-group">
          <label for="t-title">Title</label>
          <input id="t-title" class="form-control" required>
        </div>
        <div class="form-group">
          <label for="t-content">Details</label>
          <textarea id="t-content" class="form-control" rows="4" required></textarea>
        </div>
        <div id="t-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Post</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#thread-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        try {
          await qaService.createThread(
            user.id,
            modalEl.querySelector('#t-title').value,
            modalEl.querySelector('#t-content').value
          );
          Toast.success('Question posted.');
          close();
          this._page.render();
        } catch (err) {
          modalEl.querySelector('#t-error').textContent = err.message;
        }
      });
    });
  }

  async _viewThread(thread) {
    const user = authService.getCurrentUser();
    await browsingHistoryService.record(user.id, 'thread', thread.id, thread.title);

    const answers = await qaService.getAnswersByThreadId(thread.id);

    Modal.custom(thread.title, `
      <div class="form-group"><p>${escapeHtml(thread.content)}</p></div>
      <hr style="margin:12px 0;border:none;border-top:1px solid var(--color-border)">
      <h4 style="margin-bottom:8px">Answers (${answers.length})</h4>
      ${answers.length === 0 ? '<p style="color:var(--color-text-muted)">No answers yet.</p>' :
        answers.map(a => `
          <div style="padding:8px;margin-bottom:8px;border:1px solid var(--color-border);border-radius:var(--radius)">
            <p>${escapeHtml(a.content)}</p>
            <small style="color:var(--color-text-muted)">${formatDate(a.createdAt)}</small>
          </div>
        `).join('')}
      <hr style="margin:12px 0;border:none;border-top:1px solid var(--color-border)">
      <form id="answer-form">
        <div class="form-group">
          <label for="a-content">Your Answer</label>
          <textarea id="a-content" class="form-control" rows="3" required></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Submit Answer</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#answer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await qaService.submitAnswer(thread.id, user.id, modalEl.querySelector('#a-content').value);
          Toast.success('Answer posted.');
          close();
          this._viewThread(thread);
        } catch (err) {
          Toast.error(err.message);
        }
      });
    });
  }
}

export default QATab;
