/**
 * DataTable — reusable table component with filtering support.
 */

import { escapeHtml } from '../utils/helpers.js';

export class DataTable {
  /**
   * @param {object} config
   * @param {Array<{key: string, label: string, render?: Function}>} config.columns
   * @param {Array<object>} config.data
   * @param {Function} [config.onRowClick] — called with (row)
   * @param {boolean} [config.selectable] — show checkboxes for batch actions
   */
  constructor(config) {
    this.columns = config.columns;
    this.data = config.data || [];
    this.onRowClick = config.onRowClick || null;
    this.selectable = config.selectable || false;
    this.selectedIds = new Set();
    this.container = null;
  }

  /**
   * Render the table into a container element.
   */
  render(container) {
    this.container = container;
    this._draw();
  }

  /**
   * Update data and re-render.
   */
  setData(data) {
    this.data = data;
    if (this.container) this._draw();
  }

  /**
   * Get selected row IDs.
   */
  getSelectedIds() {
    return [...this.selectedIds];
  }

  _draw() {
    const html = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              ${this.selectable ? '<th><input type="checkbox" id="dt-select-all"></th>' : ''}
              ${this.columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${this.data.length === 0
              ? `<tr><td colspan="${this.columns.length + (this.selectable ? 1 : 0)}" class="text-center" style="padding:20px;color:var(--color-text-muted)">No data</td></tr>`
              : this.data.map(row => `
                <tr data-id="${row.id || ''}" style="cursor:${this.onRowClick ? 'pointer' : 'default'}">
                  ${this.selectable ? `<td><input type="checkbox" class="dt-row-check" data-id="${row.id}"></td>` : ''}
                  ${this.columns.map(c => `<td>${c.render ? c.render(row) : escapeHtml(String(row[c.key] ?? ''))}</td>`).join('')}
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    `;
    this.container.innerHTML = html;

    // Row click
    if (this.onRowClick) {
      this.container.querySelectorAll('tbody tr').forEach(tr => {
        tr.addEventListener('click', (e) => {
          if (e.target.type === 'checkbox') return;
          const id = tr.dataset.id;
          const row = this.data.find(r => r.id === id);
          if (row) this.onRowClick(row);
        });
      });
    }

    // Select all
    if (this.selectable) {
      const selectAll = this.container.querySelector('#dt-select-all');
      selectAll?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        this.container.querySelectorAll('.dt-row-check').forEach(cb => {
          cb.checked = checked;
          if (checked) this.selectedIds.add(cb.dataset.id);
          else this.selectedIds.delete(cb.dataset.id);
        });
      });

      this.container.querySelectorAll('.dt-row-check').forEach(cb => {
        cb.addEventListener('change', (e) => {
          if (e.target.checked) this.selectedIds.add(cb.dataset.id);
          else this.selectedIds.delete(cb.dataset.id);
        });
      });
    }
  }
}

export default DataTable;
