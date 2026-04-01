/**
 * ContractsPage — template management, contract generation, signing workflow, export.
 */

import contractService from '../services/ContractService.js';
import authService from '../services/AuthService.js';
import auditService from '../services/AuditService.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Drawer from '../components/Drawer.js';
import AuditTimeline from '../components/AuditTimeline.js';
import Toast from '../components/Toast.js';
import { CONTRACT_STATUS } from '../models/Contract.js';
import { USER_ROLES } from '../models/User.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';

export class ContractsPage {
  constructor(appShell) {
    this.appShell = appShell;
    this.activeTab = 'contracts';
  }

  async render() {
    this.appShell.setPageTitle('Contracts');
    const container = this.appShell.getContentContainer();
    const user = authService.getCurrentUser();
    const isAdmin = user && user.role === USER_ROLES.ADMINISTRATOR;

    container.innerHTML = `
      <div class="filters-bar">
        <button class="btn ${this.activeTab === 'contracts' ? 'btn-primary' : 'btn-secondary'} tab-btn" data-tab="contracts">Contracts</button>
        ${isAdmin ? `<button class="btn ${this.activeTab === 'templates' ? 'btn-primary' : 'btn-secondary'} tab-btn" data-tab="templates">Templates</button>` : ''}
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
    if (this.activeTab === 'templates') {
      await this._renderTemplates(tabContent);
    } else {
      await this._renderContracts(tabContent);
    }
  }

  // --- Contracts ---
  async _renderContracts(container) {
    const user = authService.getCurrentUser();
    const contracts = await contractService.getAllContractsScoped(user?.id);
    contracts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = `
      <div class="flex-between mb-4">
        <span>${contracts.length} contract(s)</span>
        <button class="btn btn-primary" id="btn-new-contract">+ Generate Contract</button>
      </div>
      <div id="contracts-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'id', label: 'ID', render: (c) => escapeHtml(maskId(c.id)) },
        { key: 'status', label: 'Status', render: (c) => `<span class="badge badge-${c.status === 'signed' ? 'approved' : c.status === 'voided' ? 'rejected' : 'submitted'}">${escapeHtml(c.status)}</span>` },
        { key: 'templateVersion', label: 'Template v', render: (c) => String(c.templateVersion || '-') },
        { key: 'signedAt', label: 'Signed', render: (c) => c.signedAt ? formatDate(c.signedAt) : '-' },
        { key: 'createdAt', label: 'Created', render: (c) => formatDate(c.createdAt) },
      ],
      data: contracts,
      onRowClick: (c) => this._viewContract(c),
    });
    table.render(container.querySelector('#contracts-table'));

    container.querySelector('#btn-new-contract').addEventListener('click', () => this._generateContract());
  }

  async _generateContract() {
    const templates = await contractService.getActiveTemplates();
    if (templates.length === 0) {
      Toast.warning('No active templates. Create one first in the Templates tab.');
      return;
    }

    const templateOptions = templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (v${t.version})</option>`).join('');

    Modal.custom('Generate Contract', `
      <form id="gen-form">
        <div class="form-group">
          <label for="g-template">Template</label>
          <select id="g-template" class="form-control">${templateOptions}</select>
        </div>
        <div id="g-vars" class="form-group">
          <label>Variables</label>
          <p style="color:var(--color-text-muted);font-size:0.85rem">Select a template to see placeholders.</p>
        </div>
        <div id="g-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Generate</button>
      </form>
    `, (modalEl, close) => {
      const templateSelect = modalEl.querySelector('#g-template');
      const varsContainer = modalEl.querySelector('#g-vars');

      const renderVars = () => {
        const tpl = templates.find(t => t.id === templateSelect.value);
        if (!tpl || !tpl.placeholders || tpl.placeholders.length === 0) {
          varsContainer.innerHTML = '<label>Variables</label><p style="color:var(--color-text-muted)">No placeholders.</p>';
          return;
        }
        varsContainer.innerHTML = '<label>Variables</label>' + tpl.placeholders.map(p => `
          <div class="form-group">
            <label for="var-${p}">${escapeHtml(p)}</label>
            <input id="var-${p}" class="form-control var-input" data-placeholder="${escapeHtml(p)}" type="text">
          </div>
        `).join('');
      };

      templateSelect.addEventListener('change', renderVars);
      renderVars();

      modalEl.querySelector('#gen-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        const variables = {};
        modalEl.querySelectorAll('.var-input').forEach(input => {
          const key = input.dataset.placeholder.replace(/^\{|\}$/g, '');
          variables[key] = input.value;
        });
        try {
          await contractService.generateContract(templateSelect.value, variables, user.id);
          Toast.success('Contract generated.');
          close();
          this.render();
        } catch (err) {
          modalEl.querySelector('#g-error').textContent = err.message;
        }
      });
    });
  }

  async _viewContract(contract) {
    const auditLogs = await auditService.getTimeline(contract.id);

    const actions = [];
    if (contract.status === CONTRACT_STATUS.INITIATED) {
      actions.push('<button class="btn btn-primary btn-sm" id="dc-sign">Sign</button>');
      actions.push('<button class="btn btn-secondary btn-sm" id="dc-withdraw">Withdraw</button>');
    }
    if (contract.status === CONTRACT_STATUS.SIGNED) {
      actions.push('<button class="btn btn-danger btn-sm" id="dc-void">Void</button>');
    }
    if (contract.status === CONTRACT_STATUS.SIGNED || contract.status === CONTRACT_STATUS.INITIATED) {
      actions.push('<button class="btn btn-secondary btn-sm" id="dc-export">Export / Print</button>');
    }

    Drawer.open('Contract Detail', `
      <div class="form-group"><label>ID</label><p>${escapeHtml(maskId(contract.id))}</p></div>
      <div class="form-group"><label>Status</label><p><span class="badge">${escapeHtml(contract.status)}</span></p></div>
      <div class="form-group"><label>Content Preview</label><p style="white-space:pre-wrap;font-size:0.85rem;max-height:200px;overflow-y:auto;border:1px solid var(--color-border);padding:8px;border-radius:var(--radius)">${escapeHtml(contract.content || '')}</p></div>
      ${contract.signatureHash ? `<div class="form-group"><label>Signature Hash</label><p style="font-size:0.75rem;word-break:break-all">${escapeHtml(contract.signatureHash)}</p></div>` : ''}
      <div class="btn-group mt-4">${actions.join('')}</div>
      <hr style="margin:16px 0;border:none;border-top:1px solid var(--color-border)">
      <h3 style="margin-bottom:12px">Audit Timeline</h3>
      <div id="contract-audit"></div>
    `, (drawerEl) => {
      AuditTimeline.render(drawerEl.querySelector('#contract-audit'), auditLogs);

      drawerEl.querySelector('#dc-sign')?.addEventListener('click', () => {
        Drawer.closeAll();
        this._signContract(contract);
      });
      drawerEl.querySelector('#dc-withdraw')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; if (btn.disabled) return; btn.disabled = true;
        const user = authService.getCurrentUser();
        try {
          await contractService.withdrawContract(contract.id, user.id);
          Toast.success('Contract withdrawn.');
          Drawer.closeAll();
          this.render();
        } catch (err) { Toast.error(err.message); btn.disabled = false; }
      });
      drawerEl.querySelector('#dc-void')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget; if (btn.disabled) return; btn.disabled = true;
        const user = authService.getCurrentUser();
        try {
          await contractService.voidContract(contract.id, user.id);
          Toast.success('Contract voided.');
          Drawer.closeAll();
          this.render();
        } catch (err) { Toast.error(err.message); btn.disabled = false; }
      });
      drawerEl.querySelector('#dc-export')?.addEventListener('click', () => {
        contractService.downloadContract(contract);
        Toast.success('Contract exported for print.');
      });
    });
  }

  _signContract(contract) {
    Modal.custom('Sign Contract', `
      <form id="sign-form">
        <div class="form-group">
          <label>Signature Method</label>
          <select id="sig-method" class="form-control">
            <option value="typed">Typed Name</option>
            <option value="drawn">Draw Signature</option>
          </select>
        </div>
        <div id="sig-typed" class="form-group">
          <label for="sig-name">Full Name</label>
          <input id="sig-name" class="form-control" type="text">
        </div>
        <div id="sig-drawn" class="form-group hidden">
          <label>Draw your signature</label>
          <canvas id="sig-canvas" width="400" height="150" style="border:1px solid var(--color-border);border-radius:var(--radius);cursor:crosshair;display:block"></canvas>
          <button type="button" class="btn btn-sm btn-secondary mt-4" id="sig-clear">Clear</button>
        </div>
        <div id="sig-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Sign</button>
      </form>
    `, (modalEl, close) => {
      const methodSelect = modalEl.querySelector('#sig-method');
      const typedDiv = modalEl.querySelector('#sig-typed');
      const drawnDiv = modalEl.querySelector('#sig-drawn');
      const canvas = modalEl.querySelector('#sig-canvas');
      const ctx = canvas.getContext('2d');
      let drawing = false;
      let _hasDrawn = false; // tracks whether the user has actually drawn anything

      methodSelect.addEventListener('change', () => {
        if (methodSelect.value === 'typed') {
          typedDiv.classList.remove('hidden');
          drawnDiv.classList.add('hidden');
        } else {
          typedDiv.classList.add('hidden');
          drawnDiv.classList.remove('hidden');
        }
      });

      // Canvas drawing — set _hasDrawn on first actual stroke
      canvas.addEventListener('mousedown', (e) => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); });
      canvas.addEventListener('mousemove', (e) => { if (drawing) { ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); _hasDrawn = true; } });
      canvas.addEventListener('mouseup', () => { drawing = false; });
      canvas.addEventListener('mouseleave', () => { drawing = false; });

      // Touch support
      canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing = true; const t = e.touches[0]; const r = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(t.clientX - r.left, t.clientY - r.top); });
      canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (drawing) { const t = e.touches[0]; const r = canvas.getBoundingClientRect(); ctx.lineTo(t.clientX - r.left, t.clientY - r.top); ctx.stroke(); _hasDrawn = true; } });
      canvas.addEventListener('touchend', () => { drawing = false; });

      modalEl.querySelector('#sig-clear')?.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        _hasDrawn = false; // reset drawing flag on clear
      });

      modalEl.querySelector('#sign-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        let signatureData, signerName;

        if (methodSelect.value === 'typed') {
          signerName = modalEl.querySelector('#sig-name').value.trim();
          if (!signerName) {
            modalEl.querySelector('#sig-error').textContent = 'Please enter your name.';
            return;
          }
          signatureData = signerName;
        } else {
          // UI-level blank canvas guard — checked before calling service
          if (!_hasDrawn) {
            modalEl.querySelector('#sig-error').textContent = 'Please draw your signature before signing.';
            return;
          }
          signerName = user.displayName || user.username;
          signatureData = canvas.toDataURL('image/png');
        }

        try {
          await contractService.signContract(contract.id, signatureData, signerName, user.id);
          Toast.success('Contract signed successfully.');
          close();
          this.render();
        } catch (err) {
          modalEl.querySelector('#sig-error').textContent = err.message;
        }
      });
    });
  }

  // --- Templates ---
  async _renderTemplates(container) {
    const user = authService.getCurrentUser();
    if (!user || user.role !== USER_ROLES.ADMINISTRATOR) {
      container.innerHTML = '<p>You do not have permission to access templates.</p>';
      return;
    }
    const templates = await contractService.getAllTemplates();
    templates.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = `
      <div class="flex-between mb-4">
        <span>${templates.length} template(s)</span>
        <button class="btn btn-primary" id="btn-new-template">+ New Template</button>
      </div>
      <div id="templates-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'name', label: 'Name', render: (t) => escapeHtml(t.name) },
        { key: 'version', label: 'Version', render: (t) => `v${t.version}` },
        { key: 'active', label: 'Active', render: (t) => t.active ? '<span class="badge badge-approved">Active</span>' : '<span class="badge badge-cancelled">Inactive</span>' },
        { key: 'placeholders', label: 'Placeholders', render: (t) => Array.isArray(t.placeholders) ? t.placeholders.length : 0 },
        { key: 'effectiveDate', label: 'Effective', render: (t) => formatDate(t.effectiveDate) },
      ],
      data: templates,
      onRowClick: (t) => this._editTemplate(t),
    });
    table.render(container.querySelector('#templates-table'));

    container.querySelector('#btn-new-template').addEventListener('click', () => this._createTemplate());
  }

  _editTemplate(template) {
    if (!template.active) {
      Modal.alert('Inactive Template', 'This template version is inactive. Only active templates can be versioned.');
      return;
    }

    Modal.custom('Update Template (New Version)', `
      <form id="tpl-edit-form">
        <p style="color:var(--color-text-muted);margin-bottom:12px">Editing creates a new version (v${template.version + 1}). The current version will be deactivated.</p>
        <div class="form-group">
          <label for="tple-name">Template Name</label>
          <input id="tple-name" class="form-control" required value="${escapeHtml(template.name)}">
        </div>
        <div class="form-group">
          <label for="tple-content">Content (use {PlaceholderName} for variables)</label>
          <textarea id="tple-content" class="form-control" rows="8" required>${escapeHtml(template.content)}</textarea>
        </div>
        <div class="form-group">
          <label for="tple-date">Effective Date</label>
          <input id="tple-date" class="form-control" type="date">
        </div>
        <div id="tple-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Create Version ${template.version + 1}</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#tpl-edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        try {
          await contractService.updateTemplate(template.id, {
            name: modalEl.querySelector('#tple-name').value,
            content: modalEl.querySelector('#tple-content').value,
            effectiveDate: modalEl.querySelector('#tple-date').value || undefined,
          }, user.id);
          Toast.success(`Template v${template.version + 1} created.`);
          close();
          this.render();
        } catch (err) {
          modalEl.querySelector('#tple-error').textContent = err.message;
        }
      });
    });
  }

  _createTemplate() {
    Modal.custom('Create Template', `
      <form id="tpl-form">
        <div class="form-group">
          <label for="tpl-name">Template Name</label>
          <input id="tpl-name" class="form-control" required>
        </div>
        <div class="form-group">
          <label for="tpl-content">Content (use {PlaceholderName} for variables)</label>
          <textarea id="tpl-content" class="form-control" rows="8" required placeholder="Dear {LearnerName},\n\nYour class {ClassName} begins on {ClassStartDate}..."></textarea>
        </div>
        <div class="form-group">
          <label for="tpl-date">Effective Date</label>
          <input id="tpl-date" class="form-control" type="date">
        </div>
        <div id="tpl-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Create</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#tpl-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        try {
          await contractService.createTemplate({
            name: modalEl.querySelector('#tpl-name').value,
            content: modalEl.querySelector('#tpl-content').value,
            effectiveDate: modalEl.querySelector('#tpl-date').value || undefined,
            createdBy: user.id,
          });
          Toast.success('Template created.');
          close();
          this.render();
        } catch (err) {
          modalEl.querySelector('#tpl-error').textContent = err.message;
        }
      });
    });
  }
}

export default ContractsPage;
