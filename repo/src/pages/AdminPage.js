/**
 * AdminPage — thin orchestrator for user management, classes, reputation, config, import/export.
 */

import authService from '../services/AuthService.js';
import { USER_ROLES } from '../models/User.js';
import { UserManagementTab } from './UserManagementTab.js';
import { ClassesManagementTab } from './ClassesManagementTab.js';
import { ReputationTab } from './ReputationTab.js';
import { SystemConfigTab } from './SystemConfigTab.js';
import { ImportExportTab } from './ImportExportTab.js';

export class AdminPage {
  constructor(appShell) {
    this.appShell = appShell;
    this.activeTab = 'users';
    this._userTab = new UserManagementTab(this);
    this._classesTab = new ClassesManagementTab(this);
    this._reputationTab = new ReputationTab(this);
    this._configTab = new SystemConfigTab(this);
    this._dataTab = new ImportExportTab(this);
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
      case 'users':      await this._userTab.render(tabContent); break;
      case 'classes':    await this._classesTab.render(tabContent); break;
      case 'reputation': await this._reputationTab.render(tabContent); break;
      case 'config':     this._configTab.render(tabContent); break;
      case 'data':       this._dataTab.render(tabContent); break;
    }
  }
}

export default AdminPage;
