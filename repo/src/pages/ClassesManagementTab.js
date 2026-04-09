/**
 * ClassesManagementTab — class listing, creation, and completion, extracted from AdminPage.
 */

import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { USER_ROLES } from '../models/User.js';
import { createClass } from '../models/Class.js';
import userRepository from '../repositories/UserRepository.js';
import classRepository from '../repositories/ClassRepository.js';
import { escapeHtml, formatDate, generateId } from '../utils/helpers.js';

export class ClassesManagementTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
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
          this.render(container);
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
          this._page.render();
        } catch (err) {
          modalEl.querySelector('#c-error').textContent = err.message;
        }
      });
    });
  }
}

export default ClassesManagementTab;
