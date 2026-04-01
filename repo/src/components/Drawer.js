/**
 * Drawer — slide-out detail drawer component.
 */

import { escapeHtml } from '../utils/helpers.js';

export class Drawer {
  /**
   * Open a drawer with a title and body HTML.
   * @param {string} title
   * @param {string} bodyHtml
   * @param {Function} [onInit] — called with drawer element after rendering
   * @returns {{ close: Function }} handle to close the drawer
   */
  static open(title, bodyHtml, onInit = null) {
    // Remove any existing drawer
    Drawer.closeAll();

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    overlay.id = 'drawer-overlay';

    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    drawer.id = 'drawer';
    drawer.innerHTML = `
      <div class="drawer-header">
        <span>${escapeHtml(title)}</span>
        <button class="modal-close" id="drawer-close">&times;</button>
      </div>
      <div class="drawer-body">${bodyHtml}</div>
    `;

    const close = () => {
      overlay.remove();
      drawer.remove();
    };

    overlay.addEventListener('click', close);
    drawer.querySelector('#drawer-close').addEventListener('click', close);

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    if (onInit) onInit(drawer, close);

    return { close };
  }

  /**
   * Close all open drawers.
   */
  static closeAll() {
    const overlay = document.getElementById('drawer-overlay');
    const drawer = document.getElementById('drawer');
    if (overlay) overlay.remove();
    if (drawer) drawer.remove();
  }
}

export default Drawer;
