/**
 * ImportExportTab — data backup/restore, extracted from SystemConfigTab.
 */

import authService from '../services/AuthService.js';
import importExportService from '../services/ImportExportService.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { escapeHtml } from '../utils/helpers.js';

export class ImportExportTab {
  constructor(page) {
    this._page = page;
  }

  render(container) {
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

export default ImportExportTab;
