/**
 * Minimal browser environment simulation for Node.js.
 * Provides window, document, localStorage, location, and basic DOM.
 * No external dependencies — pure JavaScript.
 */

// ============================================================
// Minimal DOM Element
// ============================================================

class MinimalElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.classList = new MinimalClassList();
    this.textContent = '';
    this._innerHTML = '';
    this._listeners = {};
    this.parentNode = null;
    this.disabled = false;
    this.value = '';
    this.type = '';
    this.dataset = {};
    this.id = '';
    this.className = '';
    this.checked = false;
    this.files = [];
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) {
    this._innerHTML = val;
    this.children = [];
    // Parse id attributes for querySelector
    this._parsedIds = {};
    const idRegex = /id="([^"]+)"/g;
    let m;
    while ((m = idRegex.exec(val)) !== null) {
      this._parsedIds[m[1]] = new MinimalElement('div');
      this._parsedIds[m[1]].id = m[1];
      this._parsedIds[m[1]]._innerHTML = '';
      this._parsedIds[m[1]]._parentRef = this;
    }
  }

  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }

  addEventListener(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(h => h !== handler);
  }

  dispatchEvent(event) {
    const handlers = this._listeners[event.type || event] || [];
    for (const h of handlers) h(event);
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, currentTarget: this, stopPropagation: () => {}, preventDefault: () => {} });
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this._parsedIds && this._parsedIds[id]) return this._parsedIds[id];
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const child of this.children) {
        const found = child.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.contains(cls)) results.push(this);
    }
    for (const child of this.children) {
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter(c => c !== child);
    child.parentNode = null;
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  getContext() {
    return {
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
      clearRect: () => {},
    };
  }

  toDataURL() {
    // Return a base64 payload long enough to pass the service-level blank-canvas check (>500 chars)
    return 'data:image/png;base64,' + 'A'.repeat(600);
  }
}

class MinimalClassList {
  constructor() { this._classes = new Set(); }
  add(cls) { this._classes.add(cls); }
  remove(cls) { this._classes.delete(cls); }
  toggle(cls, force) {
    if (force === undefined) {
      this._classes.has(cls) ? this._classes.delete(cls) : this._classes.add(cls);
    } else {
      force ? this._classes.add(cls) : this._classes.delete(cls);
    }
  }
  contains(cls) { return this._classes.has(cls); }
}

// ============================================================
// Minimal Document
// ============================================================

class MinimalDocument {
  constructor() {
    this.body = new MinimalElement('body');
    this._elements = {};
  }

  createElement(tag) { return new MinimalElement(tag); }

  getElementById(id) {
    if (this._elements[id]) return this._elements[id];
    return this._deepFindById(this.body, id);
  }

  _deepFindById(el, id) {
    if (!el) return null;
    if (el.id === id) return el;
    for (const child of (el.children || [])) {
      const found = this._deepFindById(child, id);
      if (found) return found;
    }
    if (el._parsedIds) {
      for (const pid of Object.values(el._parsedIds)) {
        const found = this._deepFindById(pid, id);
        if (found) return found;
      }
    }
    return null;
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      return this.getElementById(selector.slice(1));
    }
    if (selector === '.app-shell') {
      return this._appShell || null;
    }
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  registerElement(id, el) {
    this._elements[id] = el;
    el.id = id;
  }
}

// ============================================================
// Minimal localStorage
// ============================================================

class MinimalStorage {
  constructor() { this._data = {}; }
  getItem(key) { return this._data[key] ?? null; }
  setItem(key, value) { this._data[key] = String(value); }
  removeItem(key) { delete this._data[key]; }
  clear() { this._data = {}; }
  get length() { return Object.keys(this._data).length; }
  key(index) { return Object.keys(this._data)[index] || null; }
}

// ============================================================
// Minimal Window + Location
// ============================================================

class MinimalLocation {
  constructor() { this._hash = ''; }
  get hash() { return this._hash; }
  set hash(val) {
    this._hash = val;
    // Trigger hashchange
    if (globalThis._hashChangeListeners) {
      for (const fn of globalThis._hashChangeListeners) {
        fn({ type: 'hashchange' });
      }
    }
  }
}

// ============================================================
// Install globals
// ============================================================

export function installBrowserEnv() {
  const doc = new MinimalDocument();
  const storage = new MinimalStorage();
  const location = new MinimalLocation();

  globalThis._hashChangeListeners = [];

  globalThis.document = doc;
  globalThis.localStorage = storage;
  globalThis.window = globalThis;
  globalThis.location = location;

  // Stub URL methods
  globalThis.URL = globalThis.URL || class { static createObjectURL() { return 'blob:mock'; } static revokeObjectURL() {} };
  globalThis.Blob = globalThis.Blob || class { constructor(parts, opts) { this.parts = parts; this.type = opts?.type; } };
  globalThis.FileReader = globalThis.FileReader || class {
    readAsText(file) { setTimeout(() => { this.result = file._text || ''; if (this.onload) this.onload(); }, 0); }
    readAsArrayBuffer(file) { setTimeout(() => { this.result = file._buffer || new ArrayBuffer(0); if (this.onload) this.onload(); }, 0); }
    readAsDataURL(file) { setTimeout(() => { this.result = 'data:mock'; if (this.onload) this.onload(); }, 0); }
  };

  // Stub addEventListener on window for hashchange
  const origAddEventListener = globalThis.addEventListener?.bind(globalThis);
  globalThis.addEventListener = (event, handler) => {
    if (event === 'hashchange') {
      globalThis._hashChangeListeners.push(handler);
    } else if (origAddEventListener) {
      origAddEventListener(event, handler);
    }
  };

  // Create app root element
  const appEl = new MinimalElement('div');
  appEl.id = 'app';
  doc.registerElement('app', appEl);

  return { document: doc, localStorage: storage, location, appEl };
}

export function resetBrowserEnv() {
  if (globalThis.localStorage) globalThis.localStorage.clear();
  if (globalThis.location) globalThis.location._hash = '';
  if (globalThis._hashChangeListeners) globalThis._hashChangeListeners = [];
}
