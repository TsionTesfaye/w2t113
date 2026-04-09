/**
 * ReviewsHistoryTab — browsing history listing and clearing.
 * Extracted from ReviewsPage.
 */

import browsingHistoryService from '../services/BrowsingHistoryService.js';
import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';

export class ReviewsHistoryTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const user = authService.getCurrentUser();
    const history = await browsingHistoryService.getHistory(user.id);

    container.innerHTML = `
      <div class="flex-between mb-4">
        <span>${history.length} item(s)</span>
        ${history.length > 0 ? '<button class="btn btn-danger btn-sm" id="btn-clear-history">Clear History</button>' : ''}
      </div>
      <div id="history-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'itemType', label: 'Type', render: (h) => escapeHtml(h.itemType) },
        { key: 'title', label: 'Title', render: (h) => escapeHtml(h.title || maskId(h.itemId)) },
        { key: 'timestamp', label: 'Viewed', render: (h) => formatDate(h.timestamp) },
      ],
      data: history,
    });
    table.render(container.querySelector('#history-table'));

    container.querySelector('#btn-clear-history')?.addEventListener('click', async () => {
      const confirmed = await Modal.confirm('Clear History', 'Remove all browsing history?');
      if (!confirmed) return;
      await browsingHistoryService.clearHistory(user.id);
      Toast.success('History cleared.');
      this._page.render();
    });
  }
}

export default ReviewsHistoryTab;
