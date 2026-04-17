/**
 * Direct unit tests for AdminPage and its five tab modules:
 * UserManagementTab, ClassesManagementTab, ReputationTab,
 * SystemConfigTab, ImportExportTab.
 *
 * All IndexedDB / service calls are neutralised with method overrides so
 * the tests run entirely in the MinimalElement DOM simulation with no
 * external dependencies.
 */

import { installBrowserEnv, resetBrowserEnv } from './browser-env.js';
import { describe, it, assert, assertEqual } from '../test-helpers.js';
import { AdminPage } from '../src/pages/AdminPage.js';
import { SystemConfigTab } from '../src/pages/SystemConfigTab.js';
import { UserManagementTab } from '../src/pages/UserManagementTab.js';
import { ClassesManagementTab } from '../src/pages/ClassesManagementTab.js';
import { ReputationTab } from '../src/pages/ReputationTab.js';
import { ImportExportTab } from '../src/pages/ImportExportTab.js';
import authService from '../src/services/AuthService.js';
import userRepository from '../src/repositories/UserRepository.js';
import classRepository from '../src/repositories/ClassRepository.js';
import reputationService from '../src/services/ReputationService.js';

// ----------------------------------------------------------------
// Shared helpers
// ----------------------------------------------------------------

function makeMockShell() {
  const container = document.createElement('div');
  let title = '';
  return {
    setPageTitle: (t) => { title = t; },
    getPageTitle: () => title,
    getContentContainer: () => container,
    _container: container,
  };
}

const noopTab = { render: async () => {} };

// ================================================================
// AdminPage
// ================================================================

export async function runAdminTabsTests() {

  await describe('AdminPage: access denied for non-admin', async () => {
    await it('sets page title to Access Denied for Learner', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', displayName: 'Learner', id: 'u1' };
      const shell = makeMockShell();
      const page = new AdminPage(shell);
      await page.render();
      assertEqual(shell.getPageTitle(), 'Access Denied', 'page title is Access Denied');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders permission-denied message for Learner', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', displayName: 'Learner', id: 'u1' };
      const shell = makeMockShell();
      const page = new AdminPage(shell);
      await page.render();
      assert(shell._container._innerHTML.includes('do not have permission'), 'denial message rendered');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders card wrapper in denial state', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Instructor', displayName: 'Instructor', id: 'u2' };
      const shell = makeMockShell();
      const page = new AdminPage(shell);
      await page.render();
      assert(shell._container._innerHTML.includes('card'), 'card wrapper present in denial');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('sets page title to Access Denied for null user', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = null;
      const shell = makeMockShell();
      const page = new AdminPage(shell);
      await page.render();
      assertEqual(shell.getPageTitle(), 'Access Denied', 'null user gets Access Denied');
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  await describe('AdminPage: admin access — tabs and structure', async () => {
    async function renderAsAdmin(shell) {
      const page = new AdminPage(shell);
      page._userTab = noopTab;
      page._classesTab = noopTab;
      page._reputationTab = noopTab;
      page._configTab = { render: () => {} };
      page._dataTab = { render: () => {} };
      await page.render();
      return page;
    }

    await it('sets page title to Administration for admin', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      await renderAsAdmin(shell);
      assertEqual(shell.getPageTitle(), 'Administration', 'page title is Administration');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders Users tab button', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      await renderAsAdmin(shell);
      assert(shell._container._innerHTML.includes('data-tab="users"'), 'Users tab button present');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders Classes tab button', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      await renderAsAdmin(shell);
      assert(shell._container._innerHTML.includes('data-tab="classes"'), 'Classes tab button present');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders Reputation tab button', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      await renderAsAdmin(shell);
      assert(shell._container._innerHTML.includes('data-tab="reputation"'), 'Reputation tab button present');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders Rules & Config tab button', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      await renderAsAdmin(shell);
      assert(shell._container._innerHTML.includes('data-tab="config"'), 'Config tab button present');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders Import / Export tab button', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      await renderAsAdmin(shell);
      assert(shell._container._innerHTML.includes('data-tab="data"'), 'Import/Export tab button present');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders tab-content div', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      await renderAsAdmin(shell);
      assert(shell._container._innerHTML.includes('id="tab-content"'), 'tab-content div present');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders Users tab label text', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      await renderAsAdmin(shell);
      assert(shell._container._innerHTML.includes('>Users<'), 'Users label text present');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('delegates to _userTab.render on default (users) tab', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      const page = new AdminPage(shell);
      let userTabCalled = false;
      page._userTab = { render: async () => { userTabCalled = true; } };
      page._classesTab = noopTab;
      page._reputationTab = noopTab;
      page._configTab = { render: () => {} };
      page._dataTab = { render: () => {} };
      await page.render();
      assert(userTabCalled, '_userTab.render called for default users tab');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('delegates to _configTab.render when activeTab is config', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      const page = new AdminPage(shell);
      page.activeTab = 'config';
      let configTabCalled = false;
      page._userTab = noopTab;
      page._classesTab = noopTab;
      page._reputationTab = noopTab;
      page._configTab = { render: () => { configTabCalled = true; } };
      page._dataTab = { render: () => {} };
      await page.render();
      assert(configTabCalled, '_configTab.render called for config tab');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('delegates to _dataTab.render when activeTab is data', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      const page = new AdminPage(shell);
      page.activeTab = 'data';
      let dataTabCalled = false;
      page._userTab = noopTab;
      page._classesTab = noopTab;
      page._reputationTab = noopTab;
      page._configTab = { render: () => {} };
      page._dataTab = { render: () => { dataTabCalled = true; } };
      await page.render();
      assert(dataTabCalled, '_dataTab.render called for data tab');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('delegates to _classesTab.render when activeTab is classes', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      const page = new AdminPage(shell);
      page.activeTab = 'classes';
      let classesTabCalled = false;
      page._userTab = noopTab;
      page._classesTab = { render: async () => { classesTabCalled = true; } };
      page._reputationTab = noopTab;
      page._configTab = { render: () => {} };
      page._dataTab = { render: () => {} };
      await page.render();
      assert(classesTabCalled, '_classesTab.render called for classes tab');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('delegates to _reputationTab.render when activeTab is reputation', async () => {
      installBrowserEnv();
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin', id: 'u0' };
      const shell = makeMockShell();
      const page = new AdminPage(shell);
      page.activeTab = 'reputation';
      let repTabCalled = false;
      page._userTab = noopTab;
      page._classesTab = noopTab;
      page._reputationTab = { render: async () => { repTabCalled = true; } };
      page._configTab = { render: () => {} };
      page._dataTab = { render: () => {} };
      await page.render();
      assert(repTabCalled, '_reputationTab.render called for reputation tab');
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // SystemConfigTab
  // ================================================================

  await describe('SystemConfigTab: render', async () => {
    await it('renders btn-save-config button', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="btn-save-config"'), 'save button present');
      resetBrowserEnv();
    });

    await it('renders cfg-rep-threshold input', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="cfg-rep-threshold"'), 'threshold input present');
      resetBrowserEnv();
    });

    await it('renders cfg-w-fulfill input', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="cfg-w-fulfill"'), 'fulfillment weight input present');
      resetBrowserEnv();
    });

    await it('renders cfg-w-late input', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="cfg-w-late"'), 'late rate input present');
      resetBrowserEnv();
    });

    await it('renders cfg-w-complaint input', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="cfg-w-complaint"'), 'complaint rate input present');
      resetBrowserEnv();
    });

    await it('renders cfg-rep-window input', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="cfg-rep-window"'), 'rolling window input present');
      resetBrowserEnv();
    });

    await it('renders cfg-sla input', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="cfg-sla"'), 'SLA input present');
      resetBrowserEnv();
    });

    await it('renders cfg-error element', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="cfg-error"'), 'error element present');
      resetBrowserEnv();
    });

    await it('renders cfg-success element', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="cfg-success"'), 'success element present');
      resetBrowserEnv();
    });

    await it('includes "Reputation Thresholds" section header', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('Reputation Thresholds'), 'section header present');
      resetBrowserEnv();
    });

    await it('includes "Moderation SLA" section header', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('Moderation SLA'), 'SLA section header present');
      resetBrowserEnv();
    });

    await it('includes "Review Limits" section header', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);
      assert(container._innerHTML.includes('Review Limits'), 'Review Limits section header present');
      resetBrowserEnv();
    });
  });

  await describe('SystemConfigTab: save validation', async () => {
    await it('shows error when weights do not sum to 1.0', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);

      // Set weights that sum to 0.5 (not 1.0)
      const fulfill = container.querySelector('#cfg-w-fulfill');
      const late = container.querySelector('#cfg-w-late');
      const complaint = container.querySelector('#cfg-w-complaint');
      fulfill.value = '0.2';
      late.value = '0.2';
      complaint.value = '0.1';

      const saveBtn = container.querySelector('#btn-save-config');
      saveBtn.click();

      const errorEl = container.querySelector('#cfg-error');
      assert(errorEl.textContent.includes('Scoring weights must sum to 1.0'), 'weight error shown');
      resetBrowserEnv();
    });

    await it('shows error when threshold is below 0', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);

      // Valid weights (sum to 1.0)
      container.querySelector('#cfg-w-fulfill').value = '0.5';
      container.querySelector('#cfg-w-late').value = '0.3';
      container.querySelector('#cfg-w-complaint').value = '0.2';
      // Invalid threshold
      container.querySelector('#cfg-rep-threshold').value = '-5';

      container.querySelector('#btn-save-config').click();

      const errorEl = container.querySelector('#cfg-error');
      assert(errorEl.textContent.includes('between 0 and 100'), 'threshold out-of-range error shown');
      resetBrowserEnv();
    });

    await it('shows error when threshold is above 100', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);

      container.querySelector('#cfg-w-fulfill').value = '0.5';
      container.querySelector('#cfg-w-late').value = '0.3';
      container.querySelector('#cfg-w-complaint').value = '0.2';
      container.querySelector('#cfg-rep-threshold').value = '150';

      container.querySelector('#btn-save-config').click();

      const errorEl = container.querySelector('#cfg-error');
      assert(errorEl.textContent.includes('between 0 and 100'), 'threshold above 100 rejected');
      resetBrowserEnv();
    });

    await it('clears error element before validating on each click', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new SystemConfigTab({});
      tab.render(container);

      // First click → weight error
      container.querySelector('#cfg-w-fulfill').value = '0.1';
      container.querySelector('#cfg-w-late').value = '0.1';
      container.querySelector('#cfg-w-complaint').value = '0.1';
      container.querySelector('#btn-save-config').click();
      const errorEl = container.querySelector('#cfg-error');
      assert(errorEl.textContent !== '', 'error set on first click');

      // Now fix weights so validation passes past that check
      container.querySelector('#cfg-w-fulfill').value = '0.5';
      container.querySelector('#cfg-w-late').value = '0.3';
      container.querySelector('#cfg-w-complaint').value = '0.2';
      container.querySelector('#cfg-rep-threshold').value = '-1'; // triggers next error
      container.querySelector('#btn-save-config').click();
      // Error element is reset at start of handler then re-set by threshold check
      assert(errorEl.textContent.includes('between 0 and 100'), 'error replaced with threshold error');
      resetBrowserEnv();
    });

    await it('shows success element when valid config is saved', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      // Install browser env before using Toast (Toast accesses document.body)
      const tab = new SystemConfigTab({});
      tab.render(container);

      // Valid values
      container.querySelector('#cfg-rep-threshold').value = '60';
      container.querySelector('#cfg-w-fulfill').value = '0.5';
      container.querySelector('#cfg-w-late').value = '0.3';
      container.querySelector('#cfg-w-complaint').value = '0.2';
      container.querySelector('#cfg-rep-window').value = '90';
      container.querySelector('#cfg-sla').value = '7';
      container.querySelector('#cfg-rev-maxtext').value = '2000';
      container.querySelector('#cfg-rev-maximg').value = '6';
      container.querySelector('#cfg-rev-imgsize').value = '2';
      container.querySelector('#cfg-rev-followup').value = '14';

      container.querySelector('#btn-save-config').click();

      const successEl = container.querySelector('#cfg-success');
      assertEqual(successEl.style.display, 'block', 'success element visible after valid save');
      resetBrowserEnv();
    });
  });

  // ================================================================
  // UserManagementTab
  // ================================================================

  await describe('UserManagementTab: render', async () => {
    await it('renders btn-add-user button', async () => {
      installBrowserEnv();
      const savedGetAll = userRepository.getAll.bind(userRepository);
      userRepository.getAll = async () => [];
      const container = document.createElement('div');
      const tab = new UserManagementTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="btn-add-user"'), 'btn-add-user present');
      userRepository.getAll = savedGetAll;
      resetBrowserEnv();
    });

    await it('renders users-table div', async () => {
      installBrowserEnv();
      const savedGetAll = userRepository.getAll.bind(userRepository);
      userRepository.getAll = async () => [];
      const container = document.createElement('div');
      const tab = new UserManagementTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('id="users-table"'), 'users-table div present');
      userRepository.getAll = savedGetAll;
      resetBrowserEnv();
    });

    await it('shows user count in header', async () => {
      installBrowserEnv();
      const savedGetAll = userRepository.getAll.bind(userRepository);
      userRepository.getAll = async () => [
        { id: 'u1', username: 'alice', role: 'Learner', displayName: 'Alice', createdAt: new Date().toISOString() },
        { id: 'u2', username: 'bob', role: 'Instructor', displayName: 'Bob', createdAt: new Date().toISOString() },
      ];
      const container = document.createElement('div');
      const tab = new UserManagementTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('2 user(s)'), 'user count shown');
      userRepository.getAll = savedGetAll;
      resetBrowserEnv();
    });

    await it('shows 0 user count when no users', async () => {
      installBrowserEnv();
      const savedGetAll = userRepository.getAll.bind(userRepository);
      userRepository.getAll = async () => [];
      const container = document.createElement('div');
      const tab = new UserManagementTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('0 user(s)'), 'zero users shown');
      userRepository.getAll = savedGetAll;
      resetBrowserEnv();
    });

    await it('renders + Add User button label', async () => {
      installBrowserEnv();
      const savedGetAll = userRepository.getAll.bind(userRepository);
      userRepository.getAll = async () => [];
      const container = document.createElement('div');
      const tab = new UserManagementTab({});
      await tab.render(container);
      assert(container._innerHTML.includes('+ Add User'), '+ Add User label present');
      userRepository.getAll = savedGetAll;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // ClassesManagementTab
  // ================================================================

  await describe('ClassesManagementTab: render', async () => {
    async function renderClassesTab(classes = [], instructors = []) {
      const savedGetAll = classRepository.getAll.bind(classRepository);
      const savedGetByRole = userRepository.getByRole.bind(userRepository);
      classRepository.getAll = async () => classes;
      userRepository.getByRole = async () => instructors;
      const container = document.createElement('div');
      const tab = new ClassesManagementTab({});
      await tab.render(container);
      classRepository.getAll = savedGetAll;
      userRepository.getByRole = savedGetByRole;
      return container;
    }

    await it('renders btn-add-class button', async () => {
      installBrowserEnv();
      const container = await renderClassesTab();
      assert(container._innerHTML.includes('id="btn-add-class"'), 'btn-add-class present');
      resetBrowserEnv();
    });

    await it('renders classes-table div', async () => {
      installBrowserEnv();
      const container = await renderClassesTab();
      assert(container._innerHTML.includes('id="classes-table"'), 'classes-table div present');
      resetBrowserEnv();
    });

    await it('shows class count in header', async () => {
      installBrowserEnv();
      const classes = [
        { id: 'c1', title: 'Math 101', status: 'active', capacity: 20, instructorId: null, startDate: '', endDate: '' },
        { id: 'c2', title: 'Science 201', status: 'active', capacity: 15, instructorId: null, startDate: '', endDate: '' },
      ];
      const container = await renderClassesTab(classes);
      assert(container._innerHTML.includes('2 class(es)'), 'class count shown');
      resetBrowserEnv();
    });

    await it('shows 0 class count when empty', async () => {
      installBrowserEnv();
      const container = await renderClassesTab();
      assert(container._innerHTML.includes('0 class(es)'), 'zero classes shown');
      resetBrowserEnv();
    });

    await it('renders + Add Class label', async () => {
      installBrowserEnv();
      const container = await renderClassesTab();
      assert(container._innerHTML.includes('+ Add Class'), '+ Add Class label present');
      resetBrowserEnv();
    });
  });

  // ================================================================
  // ReputationTab
  // ================================================================

  await describe('ReputationTab: render', async () => {
    async function renderReputationTab(scores = [], users = []) {
      const savedGetAllScores = reputationService.getAllScores.bind(reputationService);
      const savedGetAll = userRepository.getAll.bind(userRepository);
      reputationService.getAllScores = async () => scores;
      userRepository.getAll = async () => users;
      const container = document.createElement('div');
      const tab = new ReputationTab({});
      await tab.render(container);
      reputationService.getAllScores = savedGetAllScores;
      userRepository.getAll = savedGetAll;
      return container;
    }

    await it('renders btn-compute-rep button', async () => {
      installBrowserEnv();
      const container = await renderReputationTab();
      assert(container._innerHTML.includes('id="btn-compute-rep"'), 'btn-compute-rep present');
      resetBrowserEnv();
    });

    await it('renders rep-table div', async () => {
      installBrowserEnv();
      const container = await renderReputationTab();
      assert(container._innerHTML.includes('id="rep-table"'), 'rep-table div present');
      resetBrowserEnv();
    });

    await it('renders recompute button label', async () => {
      installBrowserEnv();
      const container = await renderReputationTab();
      assert(container._innerHTML.includes('Recompute All Scores'), 'Recompute label present');
      resetBrowserEnv();
    });

    await it('mentions REPUTATION_THRESHOLD in description', async () => {
      installBrowserEnv();
      const container = await renderReputationTab();
      // REPUTATION_THRESHOLD is imported from ReputationScore model — just check threshold phrase
      assert(container._innerHTML.includes('reputation score below'), 'threshold description present');
      resetBrowserEnv();
    });
  });

  // ================================================================
  // ImportExportTab
  // ================================================================

  await describe('ImportExportTab: render', async () => {
    await it('renders btn-export button', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new ImportExportTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="btn-export"'), 'btn-export present');
      resetBrowserEnv();
    });

    await it('renders export-pass passphrase input', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new ImportExportTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="export-pass"'), 'export-pass input present');
      resetBrowserEnv();
    });

    await it('renders btn-preview button', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new ImportExportTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="btn-preview"'), 'btn-preview present');
      resetBrowserEnv();
    });

    await it('renders btn-import button', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new ImportExportTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="btn-import"'), 'btn-import present');
      resetBrowserEnv();
    });

    await it('renders import-file input', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new ImportExportTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="import-file"'), 'import-file input present');
      resetBrowserEnv();
    });

    await it('renders import-pass input', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new ImportExportTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="import-pass"'), 'import-pass input present');
      resetBrowserEnv();
    });

    await it('renders import-error element', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new ImportExportTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="import-error"'), 'import-error element present');
      resetBrowserEnv();
    });

    await it('renders import-preview element', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new ImportExportTab({});
      tab.render(container);
      assert(container._innerHTML.includes('id="import-preview"'), 'import-preview element present');
      resetBrowserEnv();
    });

    await it('renders Export Data section header', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new ImportExportTab({});
      tab.render(container);
      assert(container._innerHTML.includes('Export Data'), 'Export Data header present');
      resetBrowserEnv();
    });

    await it('renders Import Data section header', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const tab = new ImportExportTab({});
      tab.render(container);
      assert(container._innerHTML.includes('Import Data'), 'Import Data header present');
      resetBrowserEnv();
    });
  });
}
