/**
 * AuditTimeline — renders an immutable audit trail.
 */

import { escapeHtml, formatDate } from '../utils/helpers.js';

export class AuditTimeline {
  /**
   * Render audit entries into a container.
   * @param {HTMLElement} container
   * @param {Array<{timestamp, action, details, userId}>} entries
   */
  static render(container, entries) {
    if (!entries || entries.length === 0) {
      container.innerHTML = '<p style="color:var(--color-text-muted)">No audit history.</p>';
      return;
    }

    const sorted = [...entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    container.innerHTML = `
      <div class="audit-timeline">
        ${sorted.map(entry => `
          <div class="audit-entry">
            <div class="audit-time">${escapeHtml(formatDate(entry.timestamp))}</div>
            <div class="audit-desc">
              <strong>${escapeHtml(entry.action)}</strong>
              ${entry.details ? ` &mdash; ${escapeHtml(entry.details)}` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

export default AuditTimeline;
