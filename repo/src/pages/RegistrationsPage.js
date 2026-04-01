/**
 * RegistrationsPage — registration queue with filters, batch actions, and detail drawer.
 * Full implementation: class selection, status transitions in drawer, reputation enforcement.
 */

import registrationService from '../services/RegistrationService.js';
import reputationService from '../services/ReputationService.js';
import authService from '../services/AuthService.js';
import auditService from '../services/AuditService.js';
import classRepository from '../repositories/ClassRepository.js';
import userRepository from '../repositories/UserRepository.js';
import DataTable from '../components/DataTable.js';
import Drawer from '../components/Drawer.js';
import AuditTimeline from '../components/AuditTimeline.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { REGISTRATION_STATUS, getTransitions, getTerminalStates } from '../models/Registration.js';
import { USER_ROLES } from '../models/User.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';

export class RegistrationsPage {
  constructor(appShell) {
    this.appShell = appShell;
    this.table = null;
    this.currentFilter = '';
    this._submitting = false;
  }

  async render() {
    this.appShell.setPageTitle('Registrations');
    const container = this.appShell.getContentContainer();
    const user = authService.getCurrentUser();
    const isReviewer = user && [USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(user.role);

    const statusOptions = Object.values(REGISTRATION_STATUS).map(s =>
      `<option value="${s}">${s}</option>`
    ).join('');

    container.innerHTML = `
      <div class="filters-bar">
        <select id="filter-status" class="form-control">
          <option value="">All Statuses</option>
          ${statusOptions}
        </select>
        <button class="btn btn-primary" id="btn-new-reg">+ New Registration</button>
        ${isReviewer ? `
          <button class="btn btn-secondary" id="btn-batch-approve">Batch Approve</button>
          <button class="btn btn-danger btn-sm" id="btn-batch-reject">Batch Reject</button>
        ` : ''}
      </div>
      <div id="registrations-table"></div>
    `;

    await this._loadTable(container);

    container.querySelector('#filter-status').addEventListener('change', async (e) => {
      this.currentFilter = e.target.value;
      await this._loadTable(container);
    });

    container.querySelector('#btn-new-reg').addEventListener('click', () => {
      this._createRegistration();
    });

    if (isReviewer) {
      container.querySelector('#btn-batch-approve').addEventListener('click', async () => {
        if (this._submitting) return;
        const ids = this.table.getSelectedIds();
        if (ids.length === 0) { Toast.warning('Select registrations first.'); return; }
        const confirmed = await Modal.confirm('Batch Approve', `Approve ${ids.length} registration(s)?`);
        if (!confirmed) return;
        this._submitting = true;
        try {
          const results = await registrationService.batchTransition(ids, REGISTRATION_STATUS.APPROVED, '', user.id);
          const succeeded = results.filter(r => r.success).length;
          Toast.success(`${succeeded} of ${ids.length} approved.`);
          await this._loadTable(container);
        } finally { this._submitting = false; }
      });

      container.querySelector('#btn-batch-reject').addEventListener('click', async () => {
        const ids = this.table.getSelectedIds();
        if (ids.length === 0) { Toast.warning('Select registrations first.'); return; }
        this._batchRejectModal(ids);
      });
    }
  }

  async _loadTable(container) {
    const user = authService.getCurrentUser();
    let data;
    if (this.currentFilter) {
      data = await registrationService.getByStatusScoped(this.currentFilter, user?.id);
    } else {
      data = await registrationService.getAllScoped(user?.id);
    }

    data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Resolve user display names
    const userCache = {};
    const resolveUser = async (userId) => {
      if (!userId) return 'N/A';
      if (userCache[userId]) return userCache[userId];
      const u = await userRepository.getById(userId);
      userCache[userId] = u ? (u.displayName || u.username) : maskId(userId);
      return userCache[userId];
    };
    for (const reg of data) {
      reg._userName = await resolveUser(reg.userId);
    }

    this.table = new DataTable({
      columns: [
        { key: 'id', label: 'ID', render: (r) => escapeHtml(maskId(r.id)) },
        { key: 'userId', label: 'User', render: (r) => escapeHtml(r._userName) },
        { key: 'classId', label: 'Class', render: (r) => r.classId ? escapeHtml(maskId(r.classId)) : '<em>None</em>' },
        { key: 'status', label: 'Status', render: (r) => `<span class="badge badge-${r.status.toLowerCase()}">${escapeHtml(r.status)}</span>` },
        { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) },
        { key: 'updatedAt', label: 'Updated', render: (r) => formatDate(r.updatedAt) },
      ],
      data,
      selectable: true,
      onRowClick: (row) => this._openDetail(row),
    });

    this.table.render(container.querySelector('#registrations-table'));
  }

  async _openDetail(registration) {
    // Refresh from DB
    registration = await registrationService.getById(registration.id) || registration;
    const auditLogs = await auditService.getTimeline(registration.id);
    const user = authService.getCurrentUser();
    const isTerminal = getTerminalStates().includes(registration.status);
    const isReviewer = user && [USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(user.role);

    // Build allowed transitions for current status
    const allowedTransitions = getTransitions()[registration.status] || [];

    // Build transition buttons
    let transitionHTML = '';
    if (!isTerminal && allowedTransitions.length > 0) {
      const isOwner = registration.userId === user?.id;
      // Learners can only cancel or submit
      const learnerAllowed = [REGISTRATION_STATUS.SUBMITTED, REGISTRATION_STATUS.CANCELLED];

      transitionHTML = `
        <hr style="margin:16px 0;border:none;border-top:1px solid var(--color-border)">
        <h3 style="margin-bottom:12px">Actions</h3>
        <div class="form-group">
          <label for="transition-comment">Comment</label>
          <textarea id="transition-comment" class="form-control" rows="2" placeholder="Comment (required for rejection, 20+ chars)"></textarea>
        </div>
        <div class="btn-group" style="flex-wrap:wrap">
          ${allowedTransitions.map(status => {
            if (!isReviewer && !learnerAllowed.includes(status)) return '';
            const btnClass = status === REGISTRATION_STATUS.APPROVED ? 'btn-primary' :
                             status === REGISTRATION_STATUS.REJECTED ? 'btn-danger' :
                             status === REGISTRATION_STATUS.CANCELLED ? 'btn-danger' : 'btn-secondary';
            return `<button class="btn btn-sm ${btnClass} transition-btn" data-status="${status}">${escapeHtml(status)}</button>`;
          }).join('')}
        </div>
        <div id="transition-error" class="form-error mt-4"></div>
      `;
    }

    Drawer.open('Registration Detail', `
      <div class="form-group">
        <label>ID</label>
        <p>${escapeHtml(maskId(registration.id))}</p>
      </div>
      <div class="form-group">
        <label>Status</label>
        <p><span class="badge badge-${registration.status.toLowerCase()}">${escapeHtml(registration.status)}</span></p>
      </div>
      <div class="form-group">
        <label>User</label>
        <p>${escapeHtml(maskId(registration.userId))}</p>
      </div>
      <div class="form-group">
        <label>Class</label>
        <p>${registration.classId ? escapeHtml(maskId(registration.classId)) : '<em>Not assigned</em>'}</p>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <p>${escapeHtml(registration.notes || 'None')}</p>
      </div>
      <div class="form-group">
        <label>Created</label>
        <p>${formatDate(registration.createdAt)}</p>
      </div>
      ${transitionHTML}
      <hr style="margin:16px 0;border:none;border-top:1px solid var(--color-border)">
      <h3 style="margin-bottom:12px">Audit Timeline</h3>
      <div id="drawer-audit-timeline"></div>
    `, (drawerEl) => {
      AuditTimeline.render(drawerEl.querySelector('#drawer-audit-timeline'), auditLogs);

      // Wire transition buttons
      drawerEl.querySelectorAll('.transition-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (btn.disabled) return;
          const newStatus = btn.dataset.status;
          const comment = drawerEl.querySelector('#transition-comment')?.value || '';
          const errorEl = drawerEl.querySelector('#transition-error');
          errorEl.textContent = '';
          btn.disabled = true;

          try {
            await registrationService.transition(registration.id, newStatus, comment, user.id);
            Toast.success(`Status changed to ${newStatus}.`);
            Drawer.closeAll();
            const container = this.appShell.getContentContainer();
            await this._loadTable(container);
          } catch (err) {
            errorEl.textContent = err.message;
            btn.disabled = false;
          }
        });
      });
    });
  }

  async _createRegistration() {
    const user = authService.getCurrentUser();
    if (!user) return;

    // Check reputation — inform user but allow creation (service enforces manual review)
    const restricted = await reputationService.isRestricted(user.id);

    // Load classes for selection
    const classes = await classRepository.getAll();

    const classOptions = classes.length > 0
      ? classes.map(c => `<option value="${c.id}">${escapeHtml(c.title || c.id)}</option>`).join('')
      : '<option value="">No classes available</option>';

    Modal.custom('New Registration', `
      <form id="new-reg-form">
        ${restricted ? '<div class="form-error" style="margin-bottom:12px">Your reputation score is low. This registration will be submitted for manual review.</div>' : ''}
        <div class="form-group">
          <label for="reg-class">Class <span style="color:var(--color-danger)">*</span></label>
          <select id="reg-class" class="form-control" required>
            <option value="">-- Select a Class --</option>
            ${classOptions}
          </select>
        </div>
        <div class="form-group">
          <label for="reg-notes">Notes</label>
          <textarea id="reg-notes" class="form-control" rows="3" placeholder="Optional notes..."></textarea>
        </div>
        <div id="reg-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">${restricted ? 'Submit for Manual Review' : 'Create Draft'}</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#new-reg-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const classId = modalEl.querySelector('#reg-class').value;
          const notes = modalEl.querySelector('#reg-notes').value;
          if (!classId) {
            modalEl.querySelector('#reg-error').textContent = 'Please select a class.';
            return;
          }
          const created = await registrationService.create(user.id, classId, notes);
          Toast.success(created.status === REGISTRATION_STATUS.NEEDS_MORE_INFO
            ? 'Registration submitted for manual review due to low reputation.'
            : 'Draft registration created.');
          close();
          const container = this.appShell.getContentContainer();
          await this._loadTable(container);
        } catch (err) {
          modalEl.querySelector('#reg-error').textContent = err.message;
        }
      });
    });
  }

  _batchRejectModal(ids) {
    Modal.custom('Batch Reject', `
      <form id="batch-reject-form">
        <p>Rejecting ${ids.length} registration(s). A comment of at least 20 characters is required.</p>
        <div class="form-group mt-4">
          <label for="br-comment">Rejection Comment</label>
          <textarea id="br-comment" class="form-control" rows="3" required minlength="20"></textarea>
          <small id="br-charcount" style="color:var(--color-text-muted)">0 / 20 min</small>
        </div>
        <div id="br-error" class="form-error"></div>
        <button type="submit" class="btn btn-danger mt-4">Reject All</button>
      </form>
    `, (modalEl, close) => {
      const textarea = modalEl.querySelector('#br-comment');
      const charcount = modalEl.querySelector('#br-charcount');
      textarea.addEventListener('input', () => {
        charcount.textContent = `${textarea.value.length} / 20 min`;
      });

      modalEl.querySelector('#batch-reject-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const comment = textarea.value;
        if (comment.trim().length < 20) {
          modalEl.querySelector('#br-error').textContent = 'Comment must be at least 20 characters.';
          return;
        }
        const user = authService.getCurrentUser();
        const results = await registrationService.batchTransition(ids, REGISTRATION_STATUS.REJECTED, comment, user.id);
        const succeeded = results.filter(r => r.success).length;
        Toast.success(`${succeeded} of ${ids.length} rejected.`);
        close();
        const container = this.appShell.getContentContainer();
        await this._loadTable(container);
      });
    });
  }
}

export default RegistrationsPage;
