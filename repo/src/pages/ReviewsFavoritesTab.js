/**
 * ReviewsFavoritesTab — favorites listing and removal.
 * Extracted from ReviewsPage.
 */

import favoriteService from '../services/FavoriteService.js';
import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import Toast from '../components/Toast.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';

export class ReviewsFavoritesTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const user = authService.getCurrentUser();
    const allFavs = await favoriteService.getByUserId(user.id);

    container.innerHTML = `
      <div class="mb-4"><span>${allFavs.length} favorite(s)</span></div>
      <div id="fav-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'itemType', label: 'Type', render: (f) => escapeHtml(f.itemType) },
        { key: 'itemId', label: 'Item', render: (f) => escapeHtml(maskId(f.itemId)) },
        { key: 'createdAt', label: 'Added', render: (f) => formatDate(f.createdAt) },
        { key: 'actions', label: '', render: (f) => `<button class="btn btn-sm btn-danger unfav-btn" data-id="${f.id}" data-type="${f.itemType}" data-item="${f.itemId}">Remove</button>` },
      ],
      data: allFavs,
    });
    table.render(container.querySelector('#fav-table'));

    container.querySelectorAll('.unfav-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await favoriteService.toggle(user.id, btn.dataset.type, btn.dataset.item);
        Toast.success('Removed from favorites.');
        this._page.render();
      });
    });
  }
}

export default ReviewsFavoritesTab;
