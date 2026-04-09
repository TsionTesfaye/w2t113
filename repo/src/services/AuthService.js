/**
 * AuthService — user authentication, session management, lockout logic.
 */

import defaultUserRepository from '../repositories/UserRepository.js';
import defaultSessionRepository from '../repositories/SessionRepository.js';
import defaultCryptoService from './CryptoService.js';
import defaultAuditService from './AuditService.js';
import { createUser, USER_ROLES } from '../models/User.js';
import { generateId, now } from '../utils/helpers.js';

const SESSION_KEY = 'trainingops_session';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export class AuthService {
  constructor(deps = {}) {
    this._userRepo = deps.userRepository || defaultUserRepository;
    this._sessionRepo = deps.sessionRepository || defaultSessionRepository;
    this._cryptoService = deps.cryptoService || defaultCryptoService;
    this._auditService = deps.auditService || defaultAuditService;
    this._currentUser = null;
    this._loginAttempts = {};  // username → count
    this.onSessionChange = null; // callback for state isolation
  }

  /** Safe localStorage accessor — returns null in non-browser environments. */
  _lsGet(key) {
    try { return (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null; } catch (_) { return null; }
  }
  _lsSet(key, value) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); } catch (_) {}
  }
  _lsRemove(key) {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); } catch (_) {}
  }

  /**
   * Initialize auth — check for existing session.
   */
  async init() {
    const sessionId = this._lsGet(SESSION_KEY);
    if (!sessionId) return null;

    const session = await this._sessionRepo.getById(sessionId);
    if (!session) {
      this._lsRemove(SESSION_KEY);
      return null;
    }

    const user = await this._userRepo.getById(session.userId);
    if (!user) {
      this._lsRemove(SESSION_KEY);
      return null;
    }

    this._currentUser = user;
    return user;
  }

  /**
   * Login with username and password.
   */
  async login(username, password) {
    if (!username || String(username).trim() === '') {
      return { success: false, error: 'Username is required.' };
    }
    if (!password) {
      return { success: false, error: 'Password is required.' };
    }

    const user = await this._userRepo.getByUsername(username);
    if (!user) {
      return { success: false, error: 'Invalid username or password.' };
    }

    // Check lockout
    if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
      const remaining = Math.ceil((new Date(user.lockoutUntil) - new Date()) / 60000);
      return { success: false, error: `Account locked. Try again in ${remaining} minutes.` };
    }

    // Enforce password reset BEFORE checking hash format.
    // Plaintext-imported users have passwordHash=null AND _requiresPasswordReset=true —
    // their login must return the reset prompt, not a generic config error.
    if (user._requiresPasswordReset) {
      return { success: false, requiresPasswordReset: true, userId: user.id,
        error: 'Password reset required. Please set a new password to access your account.' };
    }

    if (!user.passwordHash || !user.passwordHash.includes(':')) {
      return { success: false, error: 'Account configuration error. Contact administrator.' };
    }

    const [hash, salt] = user.passwordHash.split(':');
    const valid = await this._cryptoService.verifyPassword(password, hash, salt);

    if (!valid) {
      this._loginAttempts[username] = (this._loginAttempts[username] || 0) + 1;
      if (this._loginAttempts[username] >= MAX_LOGIN_ATTEMPTS) {
        user.lockoutUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
        await this._userRepo.put(user);
        this._loginAttempts[username] = 0;
        return { success: false, error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.` };
      }
      return { success: false, error: 'Invalid username or password.' };
    }

    // Clear lockout and attempts on success
    this._loginAttempts[username] = 0;
    if (user.lockoutUntil) {
      user.lockoutUntil = null;
      await this._userRepo.put(user);
    }

    // Create session
    const session = { id: generateId(), userId: user.id, createdAt: now() };
    await this._sessionRepo.add(session);
    this._lsSet(SESSION_KEY, session.id);

    this._currentUser = user;

    // Notify listeners for state isolation (reset page instances)
    if (this.onSessionChange) this.onSessionChange();

    await this._auditService.log('user', user.id, 'login', 'User logged in', user.id);

    return { success: true, user };
  }

  /**
   * Logout current user.
   */
  async logout() {
    const sessionId = this._lsGet(SESSION_KEY);
    if (sessionId) {
      try { await this._sessionRepo.delete(sessionId); } catch (_) { /* ignore */ }
    }
    this._lsRemove(SESSION_KEY);

    if (this._currentUser) {
      await this._auditService.log('user', this._currentUser.id, 'logout', 'User logged out', this._currentUser.id);
    }

    this._currentUser = null;

    // Notify listeners for state isolation (reset page instances)
    if (this.onSessionChange) this.onSessionChange();
  }

  /**
   * Get the currently logged-in user.
   */
  getCurrentUser() {
    return this._currentUser;
  }

  /**
   * Check if user is authenticated.
   */
  isAuthenticated() {
    return this._currentUser !== null;
  }

  /**
   * Check if current user has one of the given roles.
   */
  hasRole(...roles) {
    return this._currentUser && roles.includes(this._currentUser.role);
  }

  /**
   * Returns true if no users exist — bootstrap (first-run) setup is required.
   */
  async isBootstrapNeeded() {
    const count = await this._userRepo.count();
    return count === 0;
  }

  /**
   * Create the first administrator account during bootstrap (first-run).
   * Only succeeds when NO users exist. Cannot be called to create additional admins.
   */
  async createBootstrapAdmin(username, password) {
    const count = await this._userRepo.count();
    if (count > 0) {
      throw new Error('Bootstrap setup has already been completed. An administrator account exists.');
    }
    if (!username || String(username).trim() === '') {
      return { success: false, error: 'Username is required.' };
    }
    if (!password || password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters.' };
    }

    const { hash, salt } = await this._cryptoService.hashPassword(password);
    const user = createUser({
      id: generateId(),
      username: String(username).trim(),
      passwordHash: `${hash}:${salt}`,
      role: USER_ROLES.ADMINISTRATOR,
      displayName: String(username).trim(),
    });

    await this._userRepo.add(user);
    await this._auditService.log('user', user.id, 'bootstrap', 'Bootstrap administrator account created', 'system');

    return { success: true, user };
  }

  /**
   * Reset a user's password.
   * RBAC enforced inside this method — callers need not check permissions.
   * Allowed:
   *   1. Admin resets any account
   *   2. Authenticated user resets own password
   *   3. No session, but target user has _requiresPasswordReset (recovery mode)
   * All other cases are rejected.
   */
  async resetPassword(userId, newPassword) {
    if (!userId) return { success: false, error: 'User ID is required.' };
    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters.' };
    }

    const caller = this._currentUser;
    const user = await this._userRepo.getById(userId);
    if (!user) return { success: false, error: 'User not found.' };

    // RBAC gate
    const isAdmin = caller && caller.role === USER_ROLES.ADMINISTRATOR;
    const isSelf = caller && caller.id === userId;
    const isRecovery = !caller && user._requiresPasswordReset === true;

    if (!isAdmin && !isSelf && !isRecovery) {
      const actorId = caller ? caller.id : 'anonymous';
      await this._auditService.log('user', userId, 'password_reset_denied', `Unauthorized reset attempt by ${actorId}`, actorId);
      return { success: false, error: 'Unauthorized: you can only reset your own password.' };
    }

    const { hash, salt } = await this._cryptoService.hashPassword(newPassword);
    user.passwordHash = `${hash}:${salt}`;
    user._requiresPasswordReset = false;
    user.updatedAt = now();

    await this._userRepo.put(user);
    await this._auditService.log('user', userId, 'password_reset', 'Password reset completed', caller ? caller.id : userId);

    return { success: true };
  }

  /**
   * Register a new user (admin action).
   * Only Administrators can register new users.
   */
  async registerUser(username, password, role, displayName = '') {
    if (!this._currentUser || this._currentUser.role !== USER_ROLES.ADMINISTRATOR) {
      throw new Error('Only administrators can create users.');
    }
    if (!username || String(username).trim() === '') {
      return { success: false, error: 'Username is required.' };
    }
    if (!password || password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters.' };
    }

    const existing = await this._userRepo.getByUsername(username);
    if (existing) {
      return { success: false, error: 'Username already exists.' };
    }

    const validRoles = Object.values(USER_ROLES);
    if (!validRoles.includes(role)) {
      return { success: false, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` };
    }

    const { hash, salt } = await this._cryptoService.hashPassword(password);
    const user = createUser({
      id: generateId(),
      username,
      passwordHash: `${hash}:${salt}`,
      role,
      displayName: displayName || username,
    });

    await this._userRepo.add(user);
    await this._auditService.log('user', user.id, 'created', `User ${username} created with role ${role}`, this._currentUser?.id || 'system');

    return { success: true, user };
  }

}

export default new AuthService();
