/**
 * ReviewsModerationTab — moderation reports and appeals management.
 * Extracted from ReviewsPage.
 */

import moderationService from '../services/ModerationService.js';
import ratingService from '../services/RatingService.js';
import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { REPORT_OUTCOMES } from '../models/Report.js';
import { APPEAL_STATUS } from '../models/Rating.js';
import { USER_ROLES } from '../models/User.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';

export class ReviewsModerationTab {
  constructor(page) {
    this._page = page;
  }

  async renderModeration(container) {
    const user = authService.getCurrentUser();
    if (!user || ![USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(user.role)) {
      container.innerHTML = '<p>You do not have permission to access this section.</p>';
      return;
    }
    const reports = await moderationService.getAllReports();
    const overdue = await moderationService.getOverdueReports();
    const overdueIds = new Set(overdue.map(r => r.id));
    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = `
      <div class="mb-4"><span>${reports.length} report(s), <strong>${overdue.length} overdue</strong></span></div>
      <div id="reports-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'targetType', label: 'Type', render: (r) => escapeHtml(r.targetType) },
        { key: 'reason', label: 'Reason', render: (r) => escapeHtml((r.reason || '').substring(0, 50)) },
        { key: 'status', label: 'Status', render: (r) => {
          const isOverdue = overdueIds.has(r.id);
          const badgeClass = r.status === 'resolved' ? 'badge-approved' : r.status === 'escalated' ? 'badge-rejected' : isOverdue ? 'badge-rejected' : 'badge-submitted';
          const suffix = r.status === 'escalated' ? ' (ESCALATED)' : isOverdue ? ' (OVERDUE)' : '';
          return `<span class="badge ${badgeClass}">${escapeHtml(r.status)}${suffix}</span>`;
        }},
        { key: 'resolution', label: 'Outcome', render: (r) => escapeHtml(r.resolution || '-') },
        { key: 'createdAt', label: 'Filed', render: (r) => formatDate(r.createdAt) },
      ],
      data: reports,
      onRowClick: (r) => this._resolveReport(r),
    });
    table.render(container.querySelector('#reports-table'));
  }

  _resolveReport(report) {
    if (report.status === 'resolved') {
      Modal.alert('Report Resolved', `Outcome: ${report.resolution}\nResolved: ${formatDate(report.resolvedAt)}`);
      return;
    }

    const outcomeOptions = Object.values(REPORT_OUTCOMES).map(o => `<option value="${o}">${o}</option>`).join('');

    Modal.custom('Resolve Report', `
      <div class="form-group"><label>Target</label><p>${escapeHtml(report.targetType)}: ${escapeHtml(maskId(report.targetId))}</p></div>
      <div class="form-group"><label>Reason</label><p>${escapeHtml(report.reason || '')}</p></div>
      <div class="form-group"><label>Filed</label><p>${formatDate(report.createdAt)}</p></div>
      <form id="resolve-form">
        <div class="form-group">
          <label for="rr-outcome">Outcome</label>
          <select id="rr-outcome" class="form-control" required>${outcomeOptions}</select>
        </div>
        <div id="rr-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Resolve</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#resolve-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        try {
          await moderationService.resolveReport(report.id, modalEl.querySelector('#rr-outcome').value, user.id);
          Toast.success('Report resolved.');
          close();
          this._page.render();
        } catch (err) {
          modalEl.querySelector('#rr-error').textContent = err.message;
        }
      });
    });
  }

  async renderAppeals(container) {
    const user = authService.getCurrentUser();
    if (!user || ![USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(user.role)) {
      container.innerHTML = '<p>You do not have permission to access this section.</p>';
      return;
    }
    const appeals = await ratingService.getAllAppeals();
    appeals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = `
      <div class="mb-4"><span>${appeals.length} appeal(s)</span></div>
      <div id="appeals-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'ratingId', label: 'Rating', render: (a) => escapeHtml(maskId(a.ratingId)) },
        { key: 'reason', label: 'Reason', render: (a) => escapeHtml((a.reason || '').substring(0, 50)) },
        { key: 'status', label: 'Status', render: (a) => `<span class="badge ${a.status === 'pending' ? 'badge-submitted' : 'badge-approved'}">${escapeHtml(a.status)}</span>` },
        { key: 'decision', label: 'Decision', render: (a) => escapeHtml(a.decision || '-') },
        { key: 'createdAt', label: 'Filed', render: (a) => formatDate(a.createdAt) },
      ],
      data: appeals,
      onRowClick: (a) => this._resolveAppeal(a),
    });
    table.render(container.querySelector('#appeals-table'));
  }

  _resolveAppeal(appeal) {
    if (appeal.status !== APPEAL_STATUS.PENDING) {
      Modal.alert('Appeal Resolved', `Decision: ${appeal.decision}\nRationale: ${appeal.rationale}`);
      return;
    }

    Modal.custom('Resolve Appeal', `
      <div class="form-group"><label>Reason</label><p>${escapeHtml(appeal.reason || '')}</p></div>
      <form id="appeal-resolve-form">
        <div class="form-group">
          <label for="ar-decision">Decision</label>
          <select id="ar-decision" class="form-control" required>
            <option value="${APPEAL_STATUS.UPHELD}">Uphold</option>
            <option value="${APPEAL_STATUS.ADJUSTED}">Adjust</option>
            <option value="${APPEAL_STATUS.VOIDED}">Void</option>
          </select>
        </div>
        <div class="form-group">
          <label for="ar-score">Adjusted Score (if adjusting, 1–5)</label>
          <input id="ar-score" class="form-control" type="number" min="1" max="5">
        </div>
        <div class="form-group">
          <label for="ar-rationale">Rationale (required)</label>
          <textarea id="ar-rationale" class="form-control" rows="3" required></textarea>
        </div>
        <div id="ar-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Resolve</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#appeal-resolve-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        const decision = modalEl.querySelector('#ar-decision').value;
        const scoreVal = modalEl.querySelector('#ar-score').value;
        try {
          await ratingService.resolveAppeal(
            appeal.id,
            decision,
            modalEl.querySelector('#ar-rationale').value,
            user.id,
            decision === APPEAL_STATUS.ADJUSTED ? Number(scoreVal) : null
          );
          Toast.success('Appeal resolved.');
          close();
          this._page.render();
        } catch (err) {
          modalEl.querySelector('#ar-error').textContent = err.message;
        }
      });
    });
  }
}

export default ReviewsModerationTab;
