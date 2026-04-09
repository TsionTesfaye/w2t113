/**
 * QuizImportTab — bulk import and paper generation functionality extracted from QuizPage.
 */

import quizService from '../services/QuizService.js';
import authService from '../services/AuthService.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { QUESTION_TYPES } from '../models/Question.js';
import { escapeHtml, readFileAsText, readFileAsArrayBuffer } from '../utils/helpers.js';
import { parseExcelFile } from '../utils/excelParser.js';

export class QuizImportTab {
  constructor(page) {
    this._page = page;
  }

  bulkImport() {
    Modal.custom('Bulk Import Questions', `
      <p>Upload a JSON or Excel (.xlsx) file with required columns: <strong>questionText, type, correctAnswer, difficulty, tags</strong></p>
      <div class="form-group mt-4">
        <input type="file" id="import-file" accept=".json,.xlsx,.xls">
      </div>
      <div id="import-preview" style="max-height:150px;overflow-y:auto;font-size:0.8rem;margin-bottom:8px"></div>
      <div id="import-error" class="form-error" style="white-space:pre-wrap"></div>
      <button class="btn btn-primary mt-4" id="btn-do-import">Import</button>
    `, (modalEl, close) => {
      modalEl.querySelector('#import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const previewEl = modalEl.querySelector('#import-preview');
        const errorEl = modalEl.querySelector('#import-error');
        errorEl.textContent = '';
        try {
          const rows = await this._parseImportFile(file);
          previewEl.textContent = `Parsed ${rows.length} rows. Click Import to proceed.`;
        } catch (err) {
          errorEl.textContent = 'Cannot parse file: ' + err.message;
        }
      });

      modalEl.querySelector('#btn-do-import').addEventListener('click', async () => {
        const file = modalEl.querySelector('#import-file').files[0];
        if (!file) { modalEl.querySelector('#import-error').textContent = 'Select a file.'; return; }

        try {
          const rows = await this._parseImportFile(file);
          const user = authService.getCurrentUser();
          const result = await quizService.bulkImport(rows, user?.id);

          if (result.success) {
            Toast.success(`Imported ${result.count} questions.`);
            close();
            this._page.render();
          } else {
            modalEl.querySelector('#import-error').textContent = result.errors.join('\n');
          }
        } catch (err) {
          modalEl.querySelector('#import-error').textContent = err.message;
        }
      });
    });
  }

  async _parseImportFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const buffer = await readFileAsArrayBuffer(file);
      return parseExcelFile(buffer, file.name);
    }
    const text = await readFileAsText(file);
    return JSON.parse(text);
  }
}

export default QuizImportTab;
