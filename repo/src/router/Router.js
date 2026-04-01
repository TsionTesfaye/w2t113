/**
 * Router — Hash-based SPA router.
 */

export class Router {
  constructor() {
    this._routes = {};
    this._currentRoute = null;
    this._beforeEach = null;
    this._notFound = null;
    this._onNavigate = null;

    window.addEventListener('hashchange', () => this._resolve());
  }

  /**
   * Register a route.
   * @param {string} path — hash path, e.g. '/dashboard'
   * @param {Function} handler — called with { params, query } when route matches
   */
  route(path, handler) {
    this._routes[path] = { path, handler };
    return this;
  }

  /**
   * Set a guard that runs before each navigation.
   * @param {Function} guard — receives (to, from) → return false to block
   */
  beforeEach(guard) {
    this._beforeEach = guard;
    return this;
  }

  /**
   * Set a 404 handler.
   */
  notFound(handler) {
    this._notFound = handler;
    return this;
  }

  /**
   * Set a callback invoked on every successful navigation.
   */
  onNavigate(callback) {
    this._onNavigate = callback;
    return this;
  }

  /**
   * Navigate to a hash path.
   */
  navigate(path) {
    window.location.hash = '#' + path;
  }

  /**
   * Start the router — resolve the current hash.
   */
  start() {
    this._resolve();
  }

  /**
   * Get current path from hash.
   */
  getCurrentPath() {
    const hash = window.location.hash.slice(1) || '/login';
    const [path] = hash.split('?');
    return path;
  }

  /**
   * Parse query params from hash.
   */
  _parseQuery(hash) {
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return {};
    const qs = hash.slice(qIndex + 1);
    const params = {};
    for (const pair of qs.split('&')) {
      const [key, val] = pair.split('=');
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(val || '');
    }
    return params;
  }

  /**
   * Match a registered route pattern against a path.
   * Supports :param segments.
   * @returns {{ handler, params } | null}
   */
  _match(path) {
    for (const [pattern, routeDef] of Object.entries(this._routes)) {
      const patternParts = pattern.split('/');
      const pathParts = path.split('/');
      if (patternParts.length !== pathParts.length) continue;

      const params = {};
      let match = true;
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
          params[patternParts[i].slice(1)] = pathParts[i];
        } else if (patternParts[i] !== pathParts[i]) {
          match = false;
          break;
        }
      }

      if (match) return { handler: routeDef.handler, params };
    }
    return null;
  }

  /**
   * Internal: resolve the current hash to a route.
   */
  async _resolve() {
    const hash = window.location.hash.slice(1) || '/login';
    const [path] = hash.split('?');
    const query = this._parseQuery(hash);
    const from = this._currentRoute;

    const matched = this._match(path);

    if (this._beforeEach) {
      const allowed = await this._beforeEach({ path, query }, from);
      if (allowed === false) return;
    }

    this._currentRoute = { path, query };

    if (matched) {
      await matched.handler({ params: matched.params, query });
    } else if (this._notFound) {
      this._notFound({ path, query });
    }

    if (this._onNavigate) {
      this._onNavigate({ path, query });
    }
  }
}

export default Router;
