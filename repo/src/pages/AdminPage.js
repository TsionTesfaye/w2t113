/**
 * AdminPage — user management, class management, system config, import/export, reputation management.
 */

import authService from '../services/AuthService.js';
import importExportService from '../services/ImportExportService.js';
import reputationService from '../services/ReputationService.js';
import { getConfig, updateConfig } from '../config/appConfig.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { USER_ROLES } from '../models/User.js';
import { REPUTATION_THRESHOLD } from '../models/ReputationScore.js';
import { createClass } from '../models/Class.js';
import userRepository from '../repositories/UserRepository.js';
import classRepository from '../repositories/ClassRepository.js';
import { escapeHtml, formatDate, maskString, generateId } from '../utils/helpers.js';

export class AdminPage {
  constructor(appShell) {
    this.appShell = appShell;
    this.activeTab = 'users';
  }

  async render() {
    const user = authService.getCurrentUser();
    if (!user || user.role !== USER_ROLES.ADMINISTRATOR) {
      this.appShell.setPageTitle('Access Denied');
      const container = this.appShell.getContentContainer();
      container.innerHTML = '<div class="card"><div class="card-body"><p>You do not have permission to access this page.</p></div></div>';
      return;
    }
    this.appShell.setPageTitle('Administration');
    const container = this.appShell.getContentContainer();

    const tabs = [
      { id: 'users', label: 'Users' },
      { id: 'classes', label: 'Classes' },
      { id: 'reputation', label: 'Reputation' },
      { id: 'config', label: 'Rules & Config' },
      { id: 'data', label: 'Import / Export' },
    ];

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
      case 'users':      await this._renderUsers(tabContent); break;
      case 'classes':    await this._renderClasses(tabContent); break;
      case 'reputation':  await this._renderReputation(tabContent); break;
      case 'config':     this._renderConfig(tabContent); break;
      case 'data':        this._renderData(tabContent); break;
    }
  }

  // --- Users Tab ---
  async _renderUsers(container) {
    const users = await userRepository.getAll();

    container.innerHTML = `
      <div class="flex-between mb-4">
        <span>${users.length} user(s)</span>
        <button class="btn btn-primary" id="btn-add-user">+ Add User</button>
      </div>
      <div id="users-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'username', label: 'Username', render: (u) => escapeHtml(u.username) },
        { key: 'displayName', label: 'Display Name', render: (u) => escapeHtml(u.displayName || '') },
        { key: 'role', label: 'Role', render: (u) => escapeHtml(u.role) },
        { key: 'id', label: 'ID', render: (u) => escapeHtml(maskString(u.id)) },
        { key: 'createdAt', label: 'Created', render: (u) => formatDate(u.createdAt) },
      ],
      data: users,
    });
    table.render(container.querySelector('#users-table'));

    container.querySelector('#btn-add-user').addEventListener('click', () => this._addUser());
  }

  _addUser() {
    const roleOptions = Object.values(USER_ROLES).map(r => `<option value="${r}">${r}</option>`).join('');

    Modal.custom('Add User', `
      <form id="user-form">
        <div class="form-group">
          <label for="u-username">Username</label>
          <input id="u-username" class="form-control" required>
        </div>
        <div class="form-group">
          <label for="u-password">Password</label>
          <input id="u-password" class="form-control" type="password" required>
        </div>
        <div class="form-group">
          <label for="u-display">Display Name</label>
          <input id="u-display" class="form-control">
        </div>
        <div class="form-group">
          <label for="u-role">Role</label>
          <select id="u-role" class="form-control">${roleOptions}</select>
        </div>
        <div id="u-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Create</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const result = await authService.registerUser(
            modalEl.querySelector('#u-username').value,
            modalEl.querySelector('#u-password').value,
            modalEl.querySelector('#u-role').value,
            modalEl.querySelector('#u-display').value
          );
          if (result.success) {
            Toast.success(`User "${result.user.username}" created.`);
            close();
            this.render();
          } else {
            modalEl.querySelector('#u-error').textContent = result.error;
          }
        } catch (err) {
          modalEl.querySelector('#u-error').textContent = err.message;
        }
      });
    });
  }

  // --- Classes Tab ---
  async _renderClasses(container) {
    const classes = await classRepository.getAll();
    const instructors = await userRepository.getByRole(USER_ROLES.INSTRUCTOR);

    container.innerHTML = `
      <div class="flex-between mb-4">
        <span>${classes.length} class(es)</span>
        <button class="btn btn-primary" id="btn-add-class">+ Add Class</button>
      </div>
      <div id="classes-table"></div>
    `;

    // Resolve instructor names
    const instructorMap = {};
    for (const inst of instructors) {
      instructorMap[inst.id] = inst.displayName || inst.username;
    }

    const statusBadgeClass = (s) => s === 'active' ? 'approved' : s === 'completed' ? 'submitted' : 'cancelled';

    const table = new DataTable({
      columns: [
        { key: 'title', label: 'Title', render: (c) => escapeHtml(c.title) },
        { key: 'instructorId', label: 'Instructor', render: (c) => escapeHtml(instructorMap[c.instructorId] || c.instructorId || 'Unassigned') },
        { key: 'capacity', label: 'Capacity', render: (c) => String(c.capacity || 0) },
        { key: 'startDate', label: 'Start', render: (c) => c.startDate || '-' },
        { key: 'endDate', label: 'End', render: (c) => c.endDate || '-' },
        { key: 'status', label: 'Status', render: (c) => `<span class="badge badge-${statusBadgeClass(c.status)}">${escapeHtml(c.status)}</span>` },
        {
          key: '_actions', label: 'Actions', render: (c) =>
            c.status !== 'completed'
              ? `<button class="btn btn-sm btn-secondary btn-complete-class" data-id="${escapeHtml(c.id)}">Mark Completed</button>`
              : '<span style="color:var(--color-text-muted);font-size:0.8rem">Completed</span>',
        },
      ],
      data: classes,
    });
    table.render(container.querySelector('#classes-table'));

    // Wire "Mark as Completed" buttons
    container.querySelectorAll('.btn-complete-class').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const classId = btn.dataset.id;
        const cls = classes.find(c => c.id === classId);
        if (!cls) return;
        if (cls.status === 'completed') return;
        try {
          await classRepository.put({ ...cls, status: 'completed', updatedAt: new Date().toISOString() });
          Toast.success(`"${cls.title}" marked as completed.`);
          this._renderClasses(container);
        } catch (err) {
          Toast.error(err.message);
        }
      });
    });

    container.querySelector('#btn-add-class').addEventListener('click', () => this._addClass(instructors));
  }

  _addClass(instructors) {
    const instrOptions = instructors.map(i =>
      `<option value="${i.id}">${escapeHtml(i.displayName || i.username)}</option>`
    ).join('');

    Modal.custom('Add Class', `
      <form id="class-form">
        <div class="form-group">
          <label for="c-title">Title</label>
          <input id="c-title" class="form-control" required>
        </div>
        <div class="form-group">
          <label for="c-desc">Description</label>
          <textarea id="c-desc" class="form-control" rows="2"></textarea>
        </div>
        <div class="form-group">
          <label for="c-instructor">Instructor</label>
          <select id="c-instructor" class="form-control">
            <option value="">-- Select --</option>
            ${instrOptions}
          </select>
        </div>
        <div class="form-group">
          <label for="c-capacity">Capacity (max seats)</label>
          <input id="c-capacity" class="form-control" type="number" min="1" required>
        </div>
        <div class="form-group">
          <label for="c-start">Start Date</label>
          <input id="c-start" class="form-control" type="date">
        </div>
        <div class="form-group">
          <label for="c-end">End Date</label>
          <input id="c-end" class="form-control" type="date">
        </div>
        <div id="c-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Create Class</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#class-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const cls = createClass({
            id: generateId(),
            title: modalEl.querySelector('#c-title').value,
            description: modalEl.querySelector('#c-desc').value,
            instructorId: modalEl.querySelector('#c-instructor').value,
            capacity: Number(modalEl.querySelector('#c-capacity').value),
            startDate: modalEl.querySelector('#c-start').value,
            endDate: modalEl.querySelector('#c-end').value,
          });
          await classRepository.add(cls);
          Toast.success(`Class "${cls.title}" created.`);
          close();
          this.render();
        } catch (err) {
          modalEl.querySelector('#c-error').textContent = err.message;
        }
      });
    });
  }

  // --- Reputation Tab ---
  async _renderReputation(container) {
    const scores = await reputationService.getAllScores();
    const users = await userRepository.getAll();
    const userMap = {};
    for (const u of users) { userMap[u.id] = u.displayName || u.username; }

    container.innerHTML = `
      <div class="mb-4">
        <p>Users with a reputation score below <strong>${REPUTATION_THRESHOLD}</strong> are restricted from creating new registrations.</p>
        <button class="btn btn-secondary btn-sm mt-4" id="btn-compute-rep">Recompute All Scores</button>
      </div>
      <div id="rep-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'userId', label: 'User', render: (s) => escapeHtml(userMap[s.userId] || maskString(s.userId, 4)) },
        { key: 'score', label: 'Score', render: (s) => {
          const color = s.score < REPUTATION_THRESHOLD ? 'var(--color-danger)' : 'var(--color-success)';
          return `<strong style="color:${color}">${s.score}</strong>`;
        }},
        { key: 'fulfillmentRate', label: 'Fulfillment', render: (s) => `${Math.round((s.fulfillmentRate || 0) * 100)}%` },
        { key: 'lateRate', label: 'Late Rate', render: (s) => `${Math.round((s.lateRate || 0) * 100)}%` },
        { key: 'complaintRate', label: 'Complaints', render: (s) => `${Math.round((s.complaintRate || 0) * 100)}%` },
        { key: 'computedAt', label: 'Computed', render: (s) => formatDate(s.computedAt) },
      ],
      data: scores,
    });
    table.render(container.querySelector('#rep-table'));

    container.querySelector('#btn-compute-rep').addEventListener('click', async () => {
      // Compute reputation for all users from actual registration history (90-day window)
      const allUsers = await userRepository.getAll();

      let computed = 0;
      for (const u of allUsers) {
        const result = await reputationService.computeScoreFromHistory(u.id);
        if (result) computed++;
      }

      Toast.success(`Computed reputation for ${computed} user(s).`);
      this.render();
    });
  }

  // --- Rules & Config Tab ---
  _renderConfig(container) {
    const cfg = getConfig();

    container.innerHTML = `
      <div class="card mb-4">
        <div class="card-header">Reputation Thresholds</div>
        <div class="card-body">
          <div class="form-group">
            <label for="cfg-rep-threshold">Minimum Reputation Score (0–100)</label>
            <input id="cfg-rep-threshold" class="form-control" type="number" min="0" max="100" value="${cfg.reputation.threshold}">
            <small style="color:var(--color-text-muted)">Users below this score are flagged for manual review.</small>
          </div>
          <div class="form-group">
            <label>Scoring Weights (must sum to 1.0)</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px">
              <div>
                <label for="cfg-w-fulfill" style="font-size:0.85em">Fulfillment</label>
                <input id="cfg-w-fulfill" class="form-control" type="number" step="0.05" min="0" max="1" value="${cfg.reputation.weights.fulfillmentRate}">
              </div>
              <div>
                <label for="cfg-w-late" style="font-size:0.85em">Late Rate</label>
                <input id="cfg-w-late" class="form-control" type="number" step="0.05" min="0" max="1" value="${cfg.reputation.weights.lateRate}">
              </div>
              <div>
                <label for="cfg-w-complaint" style="font-size:0.85em">Complaint Rate</label>
                <input id="cfg-w-complaint" class="form-control" type="number" step="0.05" min="0" max="1" value="${cfg.reputation.weights.complaintRate}">
              </div>
            </div>
          </div>
          <div class="form-group">
            <label for="cfg-rep-window">Rolling Window (days)</label>
            <input id="cfg-rep-window" class="form-control" type="number" min="1" value="${cfg.reputation.windowDays}">
          </div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header">Moderation SLA</div>
        <div class="card-body">
          <div class="form-group">
            <label for="cfg-sla">Resolution Deadline (days)</label>
            <input id="cfg-sla" class="form-control" type="number" min="1" value="${cfg.moderation.resolutionDeadlineDays}">
            <small style="color:var(--color-text-muted)">Reports not resolved within this period are auto-escalated.</small>
          </div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header">Review Limits</div>
        <div class="card-body">
          <div class="form-group">
            <label for="cfg-rev-maxtext">Max Review Text Length (chars)</label>
            <input id="cfg-rev-maxtext" class="form-control" type="number" min="100" value="${cfg.review.maxTextLength}">
          </div>
          <div class="form-group">
            <label for="cfg-rev-maximg">Max Images per Review</label>
            <input id="cfg-rev-maximg" class="form-control" type="number" min="0" max="20" value="${cfg.review.maxImages}">
          </div>
          <div class="form-group">
            <label for="cfg-rev-imgsize">Max Image Size (MB)</label>
            <input id="cfg-rev-imgsize" class="form-control" type="number" min="1" value="${cfg.review.maxImageSizeMB}">
          </div>
          <div class="form-group">
            <label for="cfg-rev-followup">Follow-up Window (days)</label>
            <input id="cfg-rev-followup" class="form-control" type="number" min="1" value="${cfg.review.followUpWindowDays}">
          </div>
        </div>
      </div>

      <div id="cfg-error" class="form-error mb-4"></div>
      <div id="cfg-success" class="mb-4" style="color:var(--color-success);display:none">Configuration saved. All services will use updated values immediately.</div>
      <button class="btn btn-primary" id="btn-save-config">Save Configuration</button>
    `;

    container.querySelector('#btn-save-config').addEventListener('click', () => {
      const errorEl = container.querySelector('#cfg-error');
      const successEl = container.querySelector('#cfg-success');
      errorEl.textContent = '';
      successEl.style.display = 'none';

      const threshold = Number(container.querySelector('#cfg-rep-threshold').value);
      const fulfillment = Number(container.querySelector('#cfg-w-fulfill').value);
      const late = Number(container.querySelector('#cfg-w-late').value);
      const complaint = Number(container.querySelector('#cfg-w-complaint').value);
      const windowDays = Number(container.querySelector('#cfg-rep-window').value);
      const sla = Number(container.querySelector('#cfg-sla').value);
      const maxText = Number(container.querySelector('#cfg-rev-maxtext').value);
      const maxImages = Number(container.querySelector('#cfg-rev-maximg').value);
      const maxImgSize = Number(container.querySelector('#cfg-rev-imgsize').value);
      const followUpDays = Number(container.querySelector('#cfg-rev-followup').value);

      const weightSum = Math.round((fulfillment + late + complaint) * 100) / 100;
      if (Math.abs(weightSum - 1.0) > 0.01) {
        errorEl.textContent = `Scoring weights must sum to 1.0 (current: ${weightSum}).`;
        return;
      }
      if (threshold < 0 || threshold > 100) {
        errorEl.textContent = 'Reputation threshold must be between 0 and 100.';
        return;
      }

      updateConfig({
        reputation: {
          threshold,
          windowDays,
          weights: { fulfillmentRate: fulfillment, lateRate: late, complaintRate: complaint },
        },
        moderation: { resolutionDeadlineDays: sla },
        review: { maxTextLength: maxText, maxImages, maxImageSizeMB: maxImgSize, followUpWindowDays: followUpDays },
      });

      successEl.style.display = 'block';
      Toast.success('Configuration updated. Changes take effect immediately.');
    });
  }

  // --- Data Tab ---
  _renderData(container) {
    container.innerHTML = `
      <div class="card mb-4">
        <div class="card-header">Export Data</div>
        <div class="card-body">
          <p style="margin-bottom:12px">Download a backup of all application data.</p>
          <div class="form-group">
            <label for="export-pass">Passphrase (optional)</label>
            <input id="export-pass" class="form-control" type="password" placeholder="Enter passphrase for encrypted backup">
          </div>
          <small style="color:var(--color-text-muted);display:block;margin-bottom:12px"><strong>With passphrase:</strong> encrypted (AES-GCM), credentials preserved, full restore. <strong>Without:</strong> plaintext, credentials stripped, users must reset passwords after import.</small>
          <button class="btn btn-primary" id="btn-export">Export Backup</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header">Import Data</div>
        <div class="card-body">
          <p style="margin-bottom:12px">Restore data from a backup file. This will overwrite existing data.</p>
          <div class="form-group">
            <label for="import-file">Backup File</label>
            <input id="import-file" type="file" accept=".json">
          </div>
          <div class="form-group">
            <label for="import-pass">Passphrase (if encrypted)</label>
            <input id="import-pass" class="form-control" type="password" placeholder="Leave empty if not encrypted">
          </div>
          <div id="import-preview" style="margin-bottom:12px"></div>
          <div class="btn-group">
            <button class="btn btn-secondary" id="btn-preview">Preview</button>
            <button class="btn btn-primary" id="btn-import" disabled>Apply Import</button>
          </div>
          <div id="import-error" class="form-error mt-4"></div>
        </div>
      </div>
    `;

    let parsedData = null;

    container.querySelector('#btn-export').addEventListener('click', async () => {
      try {
        const user = authService.getCurrentUser();
        const passphrase = container.querySelector('#export-pass').value || null;
        const result = await importExportService.exportAll(user.id, passphrase);
        Toast.success(`Exported: ${result.filename}`);
      } catch (err) {
        Toast.error(`Export failed: ${err.message}`);
      }
    });

    container.querySelector('#btn-preview').addEventListener('click', async () => {
      const file = container.querySelector('#import-file').files[0];
      if (!file) { container.querySelector('#import-error').textContent = 'Select a file.'; return; }

      const user = authService.getCurrentUser();
      const passphrase = container.querySelector('#import-pass').value || null;
      const result = await importExportService.parseImportFile(user.id, file, passphrase);

      if (!result.success) {
        container.querySelector('#import-error').textContent = result.error;
        return;
      }

      parsedData = result.data;
      const previewEl = container.querySelector('#import-preview');
      previewEl.innerHTML = '<strong>Preview:</strong><ul>' +
        Object.entries(result.preview).map(([store, count]) => `<li>${escapeHtml(store)}: ${count} records</li>`).join('') +
        '</ul>';

      container.querySelector('#btn-import').disabled = false;
      container.querySelector('#import-error').textContent = '';
    });

    container.querySelector('#btn-import').addEventListener('click', async () => {
      if (!parsedData) return;
      const confirmed = await Modal.confirm('Confirm Import', 'This will overwrite ALL existing data. Are you sure?');
      if (!confirmed) return;

      try {
        const user = authService.getCurrentUser();
        await importExportService.applyImport(user.id, parsedData);
        Toast.success('Data imported successfully. Reloading...');
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        container.querySelector('#import-error').textContent = err.message;
      }
    });
  }
}

export default AdminPage;
