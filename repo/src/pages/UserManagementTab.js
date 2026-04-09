/**
 * UserManagementTab — user listing and creation, extracted from AdminPage.
 */

import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { USER_ROLES } from '../models/User.js';
import userRepository from '../repositories/UserRepository.js';
import { escapeHtml, formatDate, maskString } from '../utils/helpers.js';

export class UserManagementTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
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
            this._page.render();
          } else {
            modalEl.querySelector('#u-error').textContent = result.error;
          }
        } catch (err) {
          modalEl.querySelector('#u-error').textContent = err.message;
        }
      });
    });
  }
}

export default UserManagementTab;
