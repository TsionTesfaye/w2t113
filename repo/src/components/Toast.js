/**
 * Toast — notification toast messages.
 */

let containerEl = null;

function ensureContainer() {
  if (!containerEl) {
    containerEl = document.createElement('div');
    containerEl.className = 'toast-container';
    document.body.appendChild(containerEl);
  }
  return containerEl;
}

export class Toast {
  /**
   * Show a toast message.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number} durationMs
   */
  static show(message, type = 'info', durationMs = 3000) {
    const container = ensureContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 200ms';
      setTimeout(() => toast.remove(), 200);
    }, durationMs);
  }

  static success(message) { Toast.show(message, 'success'); }
  static error(message)   { Toast.show(message, 'error', 5000); }
  static warning(message) { Toast.show(message, 'warning', 4000); }
  static info(message)    { Toast.show(message, 'info'); }
}

export default Toast;
