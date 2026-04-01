/**
 * Modal — reusable modal dialog component.
 */

import { escapeHtml } from '../utils/helpers.js';

export class Modal {
  /**
   * Show a confirmation modal.
   * @returns {Promise<boolean>} true if confirmed, false if cancelled
   */
  static confirm(title, message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <span>${escapeHtml(title)}</span>
            <button class="modal-close" data-action="cancel">&times;</button>
          </div>
          <div class="modal-body">
            <p>${escapeHtml(message)}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-action="cancel">Cancel</button>
            <button class="btn btn-primary" data-action="confirm">Confirm</button>
          </div>
        </div>
      `;

      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      overlay.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (action === 'confirm') cleanup(true);
        else if (action === 'cancel') cleanup(false);
        else if (e.target === overlay) cleanup(false);
      });

      document.body.appendChild(overlay);
    });
  }

  /**
   * Show an alert modal.
   */
  static alert(title, message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <span>${escapeHtml(title)}</span>
            <button class="modal-close" data-action="close">&times;</button>
          </div>
          <div class="modal-body">
            <p>${escapeHtml(message)}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" data-action="close">OK</button>
          </div>
        </div>
      `;

      const cleanup = () => { overlay.remove(); resolve(); };

      overlay.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'close' || e.target === overlay) cleanup();
      });

      document.body.appendChild(overlay);
    });
  }

  /**
   * Show a custom content modal.
   * @param {string} title
   * @param {string} bodyHtml — raw HTML for the modal body
   * @param {Function} [onInit] — called with the modal element after rendering
   * @returns {Promise} resolves when modal is closed
   */
  static custom(title, bodyHtml, onInit = null) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <span>${escapeHtml(title)}</span>
            <button class="modal-close" data-action="close">&times;</button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
        </div>
      `;

      const close = () => { overlay.remove(); resolve(); };

      overlay.querySelector('.modal-close').addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      document.body.appendChild(overlay);

      if (onInit) onInit(overlay.querySelector('.modal'), close);
    });
  }
}

export default Modal;
