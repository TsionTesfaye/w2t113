/**
 * Frontend unit tests — real component classes tested via MinimalElement DOM simulation.
 * Covers: Toast, Modal, DataTable, AppShell, Drawer, AuditTimeline.
 */

import { installBrowserEnv, resetBrowserEnv } from './browser-env.js';
import { describe, it, assert, assertEqual } from '../test-helpers.js';
import { Toast } from '../src/components/Toast.js';
import { Modal } from '../src/components/Modal.js';
import { DataTable } from '../src/components/DataTable.js';
import { AppShell } from '../src/components/AppShell.js';
import { Drawer } from '../src/components/Drawer.js';
import { AuditTimeline } from '../src/components/AuditTimeline.js';
import authService from '../src/services/AuthService.js';

export async function runFrontendUnitTests() {

  // ================================================================
  // Toast
  // ================================================================

  await describe('Toast: show and container management', async () => {
    // All Toast tests share one browser env to avoid containerEl singleton issues
    installBrowserEnv();

    await it('appends toast-container to body on first call', () => {
      Toast.show('Hello', 'info', 60000);
      assert(document.body.children.length >= 1, 'container appended');
      const container = document.body.children.find(c => c.className === 'toast-container');
      assert(container !== undefined, 'toast-container exists');
    });

    await it('adds toast element with correct class for info type', () => {
      const container = document.body.children.find(c => c.className === 'toast-container');
      const before = container.children.length;
      Toast.show('Info message', 'info', 60000);
      const after = container.children.length;
      assert(after > before, 'toast appended');
      const toast = container.children[container.children.length - 1];
      assertEqual(toast.className, 'toast toast-info');
    });

    await it('adds toast with correct class for success type', () => {
      const container = document.body.children.find(c => c.className === 'toast-container');
      Toast.show('Done!', 'success', 60000);
      const toast = container.children[container.children.length - 1];
      assertEqual(toast.className, 'toast toast-success');
    });

    await it('adds toast with correct class for error type', () => {
      const container = document.body.children.find(c => c.className === 'toast-container');
      Toast.show('Error!', 'error', 60000);
      const toast = container.children[container.children.length - 1];
      assertEqual(toast.className, 'toast toast-error');
    });

    await it('adds toast with correct class for warning type', () => {
      const container = document.body.children.find(c => c.className === 'toast-container');
      Toast.show('Warning!', 'warning', 60000);
      const toast = container.children[container.children.length - 1];
      assertEqual(toast.className, 'toast toast-warning');
    });

    await it('sets toast textContent to message', () => {
      const container = document.body.children.find(c => c.className === 'toast-container');
      Toast.show('My message here', 'info', 60000);
      const toast = container.children[container.children.length - 1];
      assertEqual(toast.textContent, 'My message here');
    });

    await it('reuses existing container — no duplicate containers', () => {
      const containersBefore = document.body.children.filter(c => c.className === 'toast-container').length;
      Toast.show('Another', 'info', 60000);
      const containersAfter = document.body.children.filter(c => c.className === 'toast-container').length;
      assertEqual(containersAfter, containersBefore, 'no duplicate containers');
    });

    await it('Toast.success() shows a success toast', () => {
      const container = document.body.children.find(c => c.className === 'toast-container');
      const before = container.children.length;
      Toast.success('Great job!');
      assert(container.children.length > before, 'toast added');
      const toast = container.children[container.children.length - 1];
      assertEqual(toast.className, 'toast toast-success');
      assertEqual(toast.textContent, 'Great job!');
    });

    await it('Toast.error() shows an error toast', () => {
      const container = document.body.children.find(c => c.className === 'toast-container');
      Toast.error('Something went wrong');
      const toast = container.children[container.children.length - 1];
      assertEqual(toast.className, 'toast toast-error');
      assertEqual(toast.textContent, 'Something went wrong');
    });

    await it('Toast.warning() shows a warning toast', () => {
      const container = document.body.children.find(c => c.className === 'toast-container');
      Toast.warning('Be careful');
      const toast = container.children[container.children.length - 1];
      assertEqual(toast.className, 'toast toast-warning');
    });

    await it('Toast.info() shows an info toast', () => {
      const container = document.body.children.find(c => c.className === 'toast-container');
      Toast.info('FYI');
      const toast = container.children[container.children.length - 1];
      assertEqual(toast.className, 'toast toast-info');
    });

    resetBrowserEnv();
  });

  // ================================================================
  // Modal
  // ================================================================

  await describe('Modal: confirm', async () => {
    await it('appends modal-overlay to body', async () => {
      installBrowserEnv();
      const p = Modal.confirm('Delete?', 'Are you sure?');
      assert(document.body.children.length >= 1, 'overlay in body');
      const overlay = document.body.children[document.body.children.length - 1];
      assertEqual(overlay.className, 'modal-overlay');
      // clean up
      overlay.dispatchEvent({ type: 'click', target: overlay });
      await p;
      resetBrowserEnv();
    });

    await it('resolves true when confirm action clicked', async () => {
      installBrowserEnv();
      const p = Modal.confirm('Confirm?', 'Proceed?');
      const overlay = document.body.children[document.body.children.length - 1];
      overlay.dispatchEvent({ type: 'click', target: { dataset: { action: 'confirm' } } });
      const result = await p;
      assertEqual(result, true);
      resetBrowserEnv();
    });

    await it('resolves false when cancel action clicked', async () => {
      installBrowserEnv();
      const p = Modal.confirm('Confirm?', 'Proceed?');
      const overlay = document.body.children[document.body.children.length - 1];
      overlay.dispatchEvent({ type: 'click', target: { dataset: { action: 'cancel' } } });
      const result = await p;
      assertEqual(result, false);
      resetBrowserEnv();
    });

    await it('resolves false when overlay background clicked', async () => {
      installBrowserEnv();
      const p = Modal.confirm('Confirm?', 'Message');
      const overlay = document.body.children[document.body.children.length - 1];
      overlay.dispatchEvent({ type: 'click', target: overlay }); // e.target === overlay
      const result = await p;
      assertEqual(result, false);
      resetBrowserEnv();
    });

    await it('removes overlay from DOM after resolution', async () => {
      installBrowserEnv();
      const p = Modal.confirm('Title', 'Message');
      const overlay = document.body.children[document.body.children.length - 1];
      overlay.dispatchEvent({ type: 'click', target: { dataset: { action: 'confirm' } } });
      await p;
      assertEqual(overlay.parentNode, null, 'overlay removed');
      assertEqual(document.body.children.filter(c => c.className === 'modal-overlay').length, 0);
      resetBrowserEnv();
    });

    await it('escapes XSS characters in title', async () => {
      installBrowserEnv();
      const p = Modal.confirm('<script>xss</script>', 'safe');
      const overlay = document.body.children[document.body.children.length - 1];
      assert(!overlay._innerHTML.includes('<script>'), 'script tag escaped');
      assert(overlay._innerHTML.includes('&lt;script&gt;'), 'uses HTML entities');
      overlay.dispatchEvent({ type: 'click', target: overlay });
      await p;
      resetBrowserEnv();
    });

    await it('escapes XSS characters in message', async () => {
      installBrowserEnv();
      const p = Modal.confirm('Title', '<img src=x onerror=alert(1)>');
      const overlay = document.body.children[document.body.children.length - 1];
      assert(!overlay._innerHTML.includes('<img'), 'img tag escaped');
      overlay.dispatchEvent({ type: 'click', target: overlay });
      await p;
      resetBrowserEnv();
    });
  });

  await describe('Modal: alert', async () => {
    await it('appends modal-overlay to body', async () => {
      installBrowserEnv();
      const p = Modal.alert('Notice', 'Something happened');
      assert(document.body.children.length >= 1, 'overlay in body');
      const overlay = document.body.children[document.body.children.length - 1];
      assertEqual(overlay.className, 'modal-overlay');
      overlay.dispatchEvent({ type: 'click', target: overlay });
      await p;
      resetBrowserEnv();
    });

    await it('resolves when close action clicked', async () => {
      installBrowserEnv();
      const p = Modal.alert('Notice', 'Message');
      const overlay = document.body.children[document.body.children.length - 1];
      overlay.dispatchEvent({ type: 'click', target: { dataset: { action: 'close' } } });
      await p; // should resolve without hanging
      resetBrowserEnv();
    });

    await it('resolves when overlay background clicked', async () => {
      installBrowserEnv();
      const p = Modal.alert('Title', 'Msg');
      const overlay = document.body.children[document.body.children.length - 1];
      overlay.dispatchEvent({ type: 'click', target: overlay });
      await p;
      resetBrowserEnv();
    });

    await it('removes overlay after close', async () => {
      installBrowserEnv();
      const p = Modal.alert('Title', 'Msg');
      const overlay = document.body.children[document.body.children.length - 1];
      overlay.dispatchEvent({ type: 'click', target: overlay });
      await p;
      assertEqual(overlay.parentNode, null, 'overlay removed');
      resetBrowserEnv();
    });

    await it('escapes XSS in title and message', async () => {
      installBrowserEnv();
      const p = Modal.alert('<b>bold</b>', '<script>evil()</script>');
      const overlay = document.body.children[document.body.children.length - 1];
      assert(!overlay._innerHTML.includes('<script>'), 'script escaped');
      overlay.dispatchEvent({ type: 'click', target: overlay });
      await p;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // DataTable
  // ================================================================

  await describe('DataTable: render', async () => {
    await it('sets innerHTML on container', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const dt = new DataTable({
        columns: [{ key: 'name', label: 'Name' }, { key: 'score', label: 'Score' }],
        data: [],
      });
      dt.render(container);
      assert(container._innerHTML.includes('<table'), 'renders table tag');
      assert(container._innerHTML.includes('data-table'), 'has data-table class');
      resetBrowserEnv();
    });

    await it('renders column headers', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const dt = new DataTable({
        columns: [{ key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }],
        data: [],
      });
      dt.render(container);
      assert(container._innerHTML.includes('>Name<'), 'Name header rendered');
      assert(container._innerHTML.includes('>Email<'), 'Email header rendered');
      resetBrowserEnv();
    });

    await it('shows "No data" when data is empty', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const dt = new DataTable({ columns: [{ key: 'x', label: 'X' }], data: [] });
      dt.render(container);
      assert(container._innerHTML.includes('No data'), 'empty state shown');
      resetBrowserEnv();
    });

    await it('renders data rows', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const dt = new DataTable({
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ id: 'r1', name: 'Alice' }, { id: 'r2', name: 'Bob' }],
      });
      dt.render(container);
      assert(container._innerHTML.includes('Alice'), 'first row rendered');
      assert(container._innerHTML.includes('Bob'), 'second row rendered');
      assert(!container._innerHTML.includes('No data'), 'no empty state');
      resetBrowserEnv();
    });

    await it('escapes HTML in cell values', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const dt = new DataTable({
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ id: 'r1', name: '<script>xss</script>' }],
      });
      dt.render(container);
      assert(!container._innerHTML.includes('<script>xss</script>'), 'script tag escaped');
      resetBrowserEnv();
    });

    await it('renders custom cell via render function', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const dt = new DataTable({
        columns: [
          { key: 'status', label: 'Status', render: (row) => `<span class="badge">${row.status}</span>` },
        ],
        data: [{ id: 'r1', status: 'active' }],
      });
      dt.render(container);
      assert(container._innerHTML.includes('<span class="badge">active</span>'), 'custom render used');
      resetBrowserEnv();
    });

    await it('renders select-all checkbox when selectable', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const dt = new DataTable({
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ id: 'r1', name: 'Alice' }],
        selectable: true,
      });
      dt.render(container);
      assert(container._innerHTML.includes('id="dt-select-all"'), 'select-all checkbox present');
      resetBrowserEnv();
    });

    await it('does not show select-all when not selectable', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const dt = new DataTable({
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ id: 'r1', name: 'Alice' }],
        selectable: false,
      });
      dt.render(container);
      assert(!container._innerHTML.includes('dt-select-all'), 'no select-all');
      resetBrowserEnv();
    });
  });

  await describe('DataTable: setData', async () => {
    await it('updates data and re-renders', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const dt = new DataTable({ columns: [{ key: 'name', label: 'Name' }], data: [] });
      dt.render(container);
      assert(container._innerHTML.includes('No data'), 'initially empty');
      dt.setData([{ id: 'r1', name: 'Alice' }]);
      assert(!container._innerHTML.includes('No data'), 'no longer empty');
      assert(container._innerHTML.includes('Alice'), 'new data rendered');
      resetBrowserEnv();
    });

    await it('updates from data to empty', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      const dt = new DataTable({
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ id: 'r1', name: 'Alice' }],
      });
      dt.render(container);
      assert(container._innerHTML.includes('Alice'), 'data rendered');
      dt.setData([]);
      assert(container._innerHTML.includes('No data'), 'shows empty state');
      resetBrowserEnv();
    });
  });

  await describe('DataTable: getSelectedIds', async () => {
    await it('returns empty array initially', () => {
      installBrowserEnv();
      const dt = new DataTable({ columns: [{ key: 'x', label: 'X' }], data: [], selectable: true });
      const selected = dt.getSelectedIds();
      assertEqual(selected.length, 0);
      resetBrowserEnv();
    });
  });

  // ================================================================
  // AppShell
  // ================================================================

  await describe('AppShell: render', async () => {
    await it('renders sidebar and main layout', () => {
      const { appEl } = installBrowserEnv();
      document.body.appendChild(appEl);
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin User' };
      const shell = new AppShell({ getCurrentPath: () => '/dashboard', navigate: () => {} });
      shell.render(appEl);
      assert(appEl._innerHTML.includes('id="sidebar"'), 'sidebar rendered');
      assert(appEl._innerHTML.includes('id="page-content"'), 'page-content rendered');
      assert(appEl._innerHTML.includes('id="btn-logout"'), 'logout button rendered');
      assert(appEl._innerHTML.includes('id="page-title"'), 'page-title rendered');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('shows brand name in sidebar', () => {
      const { appEl } = installBrowserEnv();
      document.body.appendChild(appEl);
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Learner', displayName: 'Bob Learner' };
      const shell = new AppShell({ getCurrentPath: () => '/', navigate: () => {} });
      shell.render(appEl);
      assert(appEl._innerHTML.includes('TrainingOps'), 'brand name present');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders user display name and role', () => {
      const { appEl } = installBrowserEnv();
      document.body.appendChild(appEl);
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Instructor', displayName: 'Jane Instructor' };
      const shell = new AppShell({ getCurrentPath: () => '/dashboard', navigate: () => {} });
      shell.render(appEl);
      assert(appEl._innerHTML.includes('Jane Instructor'), 'display name in shell');
      assert(appEl._innerHTML.includes('Instructor'), 'role in shell');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('does not render when no user logged in', () => {
      const { appEl } = installBrowserEnv();
      document.body.appendChild(appEl);
      const saved = authService._currentUser;
      authService._currentUser = null;
      const shell = new AppShell({ getCurrentPath: () => '/dashboard', navigate: () => {} });
      shell.render(appEl);
      assertEqual(appEl._innerHTML, '', 'renders nothing when no user');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('renders admin nav item only for Administrator role', () => {
      const { appEl } = installBrowserEnv();
      document.body.appendChild(appEl);
      const saved = authService._currentUser;

      authService._currentUser = { role: 'Administrator', displayName: 'Admin' };
      const shell = new AppShell({ getCurrentPath: () => '/', navigate: () => {} });
      shell.render(appEl);
      assert(appEl._innerHTML.includes('/admin'), 'admin nav visible for Administrator');

      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('hides admin nav item for Learner role', () => {
      const { appEl } = installBrowserEnv();
      document.body.appendChild(appEl);
      const saved = authService._currentUser;

      authService._currentUser = { role: 'Learner', displayName: 'Learner' };
      const shell = new AppShell({ getCurrentPath: () => '/', navigate: () => {} });
      shell.render(appEl);
      assert(!appEl._innerHTML.includes('href="#/admin"'), 'admin nav hidden for Learner');

      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  await describe('AppShell: getContentContainer and setPageTitle', async () => {
    await it('getContentContainer returns page-content element', () => {
      const { appEl } = installBrowserEnv();
      document.body.appendChild(appEl);
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin' };
      const shell = new AppShell({ getCurrentPath: () => '/dashboard', navigate: () => {} });
      shell.render(appEl);
      const content = shell.getContentContainer();
      assert(content !== null, 'returns page-content element');
      assertEqual(content.id, 'page-content');
      authService._currentUser = saved;
      resetBrowserEnv();
    });

    await it('setPageTitle updates page title element textContent', () => {
      const { appEl } = installBrowserEnv();
      document.body.appendChild(appEl);
      const saved = authService._currentUser;
      authService._currentUser = { role: 'Administrator', displayName: 'Admin' };
      const shell = new AppShell({ getCurrentPath: () => '/dashboard', navigate: () => {} });
      shell.render(appEl);
      shell.setPageTitle('My Dashboard');
      const titleEl = document.getElementById('page-title');
      assert(titleEl !== null, 'page-title element found');
      assertEqual(titleEl.textContent, 'My Dashboard');
      authService._currentUser = saved;
      resetBrowserEnv();
    });
  });

  // ================================================================
  // Drawer
  // ================================================================

  await describe('Drawer: open', async () => {
    await it('appends overlay and drawer to body', () => {
      installBrowserEnv();
      Drawer.open('Details', '<p>Some content</p>');
      assertEqual(document.body.children.length, 2, 'overlay + drawer appended');
      assert(document.body.children.some(c => c.className === 'drawer-overlay'), 'overlay present');
      assert(document.body.children.some(c => c.className === 'drawer'), 'drawer present');
      resetBrowserEnv();
    });

    await it('drawer contains escaped title', () => {
      installBrowserEnv();
      Drawer.open('My Title', '<p>body</p>');
      const drawer = document.body.children.find(c => c.className === 'drawer');
      assert(drawer._innerHTML.includes('My Title'), 'title in drawer');
      resetBrowserEnv();
    });

    await it('escapes XSS in title', () => {
      installBrowserEnv();
      Drawer.open('<script>evil()</script>', '<p>body</p>');
      const drawer = document.body.children.find(c => c.className === 'drawer');
      assert(!drawer._innerHTML.includes('<script>evil'), 'script tag escaped');
      resetBrowserEnv();
    });

    await it('overlay has id=drawer-overlay', () => {
      installBrowserEnv();
      Drawer.open('Title', '<p>body</p>');
      const overlay = document.body.children.find(c => c.className === 'drawer-overlay');
      assertEqual(overlay.id, 'drawer-overlay');
      resetBrowserEnv();
    });

    await it('drawer has id=drawer', () => {
      installBrowserEnv();
      Drawer.open('Title', '<p>body</p>');
      const drawer = document.body.children.find(c => c.className === 'drawer');
      assertEqual(drawer.id, 'drawer');
      resetBrowserEnv();
    });

    await it('close handle removes overlay and drawer', () => {
      installBrowserEnv();
      const { close } = Drawer.open('Title', '<p>body</p>');
      assertEqual(document.body.children.length, 2, 'both present before close');
      close();
      assertEqual(document.body.children.length, 0, 'both removed after close');
      resetBrowserEnv();
    });

    await it('overlay click closes drawer', () => {
      installBrowserEnv();
      Drawer.open('Title', '<p>body</p>');
      const overlay = document.body.children.find(c => c.className === 'drawer-overlay');
      overlay.dispatchEvent({ type: 'click' });
      assertEqual(document.body.children.length, 0, 'drawer closed on overlay click');
      resetBrowserEnv();
    });

    await it('calls onInit callback with drawer element', () => {
      installBrowserEnv();
      let initCalled = false;
      let initEl = null;
      Drawer.open('Title', '<p>body</p>', (drawerEl) => {
        initCalled = true;
        initEl = drawerEl;
      });
      assert(initCalled, 'onInit called');
      assert(initEl !== null, 'drawer element passed to onInit');
      assertEqual(initEl.className, 'drawer');
      resetBrowserEnv();
    });

    await it('replaces existing drawer via closeAll on open', () => {
      installBrowserEnv();
      Drawer.open('First', '<p>first</p>');
      assertEqual(document.body.children.length, 2, 'first drawer present');
      Drawer.open('Second', '<p>second</p>');
      // After second open: closeAll removes old, then appends new overlay+drawer
      assertEqual(document.body.children.length, 2, 'still 2 elements after replace');
      const drawer = document.body.children.find(c => c.className === 'drawer');
      assert(drawer._innerHTML.includes('Second'), 'second drawer is now shown');
      resetBrowserEnv();
    });
  });

  await describe('Drawer: closeAll', async () => {
    await it('removes overlay and drawer from body', () => {
      installBrowserEnv();
      Drawer.open('Title', '<p>body</p>');
      assertEqual(document.body.children.length, 2, 'elements present');
      Drawer.closeAll();
      assertEqual(document.body.children.length, 0, 'all removed');
      resetBrowserEnv();
    });

    await it('is safe to call when no drawer is open', () => {
      installBrowserEnv();
      // Must not throw
      Drawer.closeAll();
      assertEqual(document.body.children.length, 0);
      resetBrowserEnv();
    });
  });

  // ================================================================
  // AuditTimeline
  // ================================================================

  await describe('AuditTimeline: render', async () => {
    await it('shows "No audit history" for empty entries', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      AuditTimeline.render(container, []);
      assert(container._innerHTML.includes('No audit history'), 'empty state shown');
      resetBrowserEnv();
    });

    await it('shows "No audit history" for null entries', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      AuditTimeline.render(container, null);
      assert(container._innerHTML.includes('No audit history'), 'null handled');
      resetBrowserEnv();
    });

    await it('renders audit entry action', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      AuditTimeline.render(container, [{
        timestamp: '2026-01-01T00:00:00.000Z',
        action: 'USER_REGISTERED',
        details: 'New user',
        userId: 'u1',
      }]);
      assert(container._innerHTML.includes('USER_REGISTERED'), 'action rendered');
      assert(container._innerHTML.includes('New user'), 'details rendered');
      resetBrowserEnv();
    });

    await it('renders multiple entries', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      AuditTimeline.render(container, [
        { timestamp: '2026-01-01T10:00:00.000Z', action: 'ACTION_A', details: '', userId: 'u1' },
        { timestamp: '2026-01-01T11:00:00.000Z', action: 'ACTION_B', details: '', userId: 'u1' },
      ]);
      assert(container._innerHTML.includes('ACTION_A'), 'first action');
      assert(container._innerHTML.includes('ACTION_B'), 'second action');
      resetBrowserEnv();
    });

    await it('sorts entries newest first', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      AuditTimeline.render(container, [
        { timestamp: '2026-01-01T08:00:00.000Z', action: 'OLDER', details: '', userId: 'u1' },
        { timestamp: '2026-01-02T08:00:00.000Z', action: 'NEWER', details: '', userId: 'u1' },
      ]);
      const olderPos = container._innerHTML.indexOf('OLDER');
      const newerPos = container._innerHTML.indexOf('NEWER');
      assert(newerPos < olderPos, 'newer entry appears first');
      resetBrowserEnv();
    });

    await it('wraps entries in audit-timeline div', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      AuditTimeline.render(container, [
        { timestamp: '2026-01-01T00:00:00.000Z', action: 'ACTION', details: '', userId: 'u1' },
      ]);
      assert(container._innerHTML.includes('audit-timeline'), 'wrapper div present');
      assert(container._innerHTML.includes('audit-entry'), 'entry div present');
      resetBrowserEnv();
    });

    await it('escapes XSS in action field', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      AuditTimeline.render(container, [
        { timestamp: '2026-01-01T00:00:00.000Z', action: '<script>evil()</script>', details: '', userId: 'u1' },
      ]);
      assert(!container._innerHTML.includes('<script>evil'), 'script escaped');
      resetBrowserEnv();
    });

    await it('renders entry without details gracefully', () => {
      installBrowserEnv();
      const container = document.createElement('div');
      AuditTimeline.render(container, [
        { timestamp: '2026-01-01T00:00:00.000Z', action: 'NO_DETAILS', userId: 'u1' },
      ]);
      assert(container._innerHTML.includes('NO_DETAILS'), 'action without details renders');
      resetBrowserEnv();
    });
  });
}
