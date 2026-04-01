/**
 * EventBus — Simple pub/sub event system for decoupled communication.
 */

class EventBus {
  constructor() {
    this._listeners = {};
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event.
   */
  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter((cb) => cb !== callback);
  }

  /**
   * Emit an event with optional data.
   */
  emit(event, data) {
    if (!this._listeners[event]) return;
    for (const cb of this._listeners[event]) {
      try {
        cb(data);
      } catch (err) {
        console.error(`EventBus error in "${event}" handler:`, err);
      }
    }
  }

  /**
   * Subscribe to an event once.
   */
  once(event, callback) {
    const unsub = this.on(event, (data) => {
      unsub();
      callback(data);
    });
    return unsub;
  }
}

export const eventBus = new EventBus();
export default eventBus;
