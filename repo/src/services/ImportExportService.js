/**
 * ImportExportService — full dataset export/import.
 * Export modes:
 *   - With passphrase: AES-GCM encrypted (contains credential hashes safely)
 *   - Without passphrase: plaintext JSON (credential hashes stripped for safety)
 * RBAC: Administrator-only for all operations.
 */

import { getDatabase, openDatabase, STORES } from '../store/Database.js';
import cryptoService from './CryptoService.js';
import userRepository from '../repositories/UserRepository.js';
import { USER_ROLES } from '../models/User.js';
import { downloadBlob } from '../utils/helpers.js';

const ID_PATTERN = /^[a-zA-Z0-9_\-.:]+$/;

export class ImportExportService {
  constructor(deps = {}) {
    this._userRepo = deps.userRepository || userRepository;
  }

  async _requireAdmin(actingUserId) {
    if (!actingUserId) throw new Error('userId is required for import/export operations.');
    const user = await this._userRepo.getById(actingUserId);
    if (!user) throw new Error('Acting user not found. Cannot perform import/export.');
    if (user.role !== USER_ROLES.ADMINISTRATOR) {
      throw new Error('Only administrators can perform import/export operations.');
    }
  }

  /**
   * Export the entire dataset.
   * Mode 1 (encrypted): passphrase provided → AES-GCM encrypted, credentials included, full restore.
   * Mode 2 (plaintext): no passphrase → plaintext JSON, credentials stripped, users need password reset.
   */
  async exportAll(actingUserId, passphrase = null) {
    await this._requireAdmin(actingUserId);

    const db = getDatabase();
    if (!db) throw new Error('Database not initialized.');

    const data = {};
    for (const storeDef of STORES) {
      data[storeDef.name] = await this._readStore(db, storeDef.name);
    }

    // Allowlist of localStorage keys safe to export/restore.
    // Keys not in this list (e.g. session tokens, transient runtime state) are excluded.
    const EXPORT_LOCALSTORAGE_ALLOWLIST = [
      'trainingops_config_overrides',
    ];
    data._localStorage = {};
    for (const key of EXPORT_LOCALSTORAGE_ALLOWLIST) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        data._localStorage[key] = value;
      }
    }

    // Sessions are ephemeral — never export
    if (data.sessions) data.sessions = [];
    // Clear lockout state (security-transient)
    if (data.users) {
      data.users = data.users.map(u => ({ ...u, lockoutUntil: null }));
    }

    let payload;

    if (passphrase && String(passphrase).trim() !== '') {
      // Encrypted mode: credentials included safely inside AES-GCM
      const jsonStr = JSON.stringify(data, null, 2);
      const encrypted = await cryptoService.encrypt(jsonStr, passphrase);
      payload = JSON.stringify({ encrypted: true, ...encrypted });
    } else {
      // Plaintext mode: strip credential hashes, mark for password reset
      if (data.users) {
        data.users = data.users.map(u => {
          const { passwordHash, ...safe } = u;
          return { ...safe, _requiresPasswordReset: true };
        });
      }
      payload = JSON.stringify(data, null, 2);
    }

    const blob = new Blob([payload], { type: 'application/json' });
    const filename = `trainingops-backup-${new Date().toISOString().slice(0, 10)}.json`;
    downloadBlob(blob, filename);

    return { success: true, filename, encrypted: !!(passphrase && String(passphrase).trim() !== '') };
  }

  /**
   * Parse an import file.
   * All backups are encrypted — the passphrase used during export is required.
   */
  async parseImportFile(actingUserId, file, passphrase = null) {
    await this._requireAdmin(actingUserId);

    const text = await file.text();
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      return { success: false, error: 'Invalid JSON file.' };
    }

    if (parsed.encrypted) {
      if (!passphrase) {
        return { success: false, error: 'Backup is encrypted. The passphrase used during export is required.' };
      }
      try {
        const decrypted = await cryptoService.decrypt(parsed, passphrase);
        parsed = JSON.parse(decrypted);
      } catch {
        return { success: false, error: 'Decryption failed. Wrong passphrase.' };
      }
    }

    // Validate import data structure and IDs
    const validationErrors = this._validateImportData(parsed);
    if (validationErrors.length > 0) {
      return { success: false, error: `Import validation failed: ${validationErrors.join('; ')}` };
    }

    const preview = {};
    for (const storeDef of STORES) {
      if (parsed[storeDef.name]) {
        preview[storeDef.name] = parsed[storeDef.name].length;
      }
    }

    return { success: true, preview, data: parsed };
  }

  /**
   * Apply imported data (overwrites existing).
   */
  async applyImport(actingUserId, data) {
    await this._requireAdmin(actingUserId);

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid import data format.');
    }

    const db = getDatabase();
    if (!db) throw new Error('Database not initialized.');

    for (const storeDef of STORES) {
      if (!data[storeDef.name]) continue;

      await new Promise((resolve, reject) => {
        const tx = db.transaction(storeDef.name, 'readwrite');
        const store = tx.objectStore(storeDef.name);
        store.clear();
        for (const record of data[storeDef.name]) {
          store.put(record);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    const IMPORT_LOCALSTORAGE_ALLOWLIST = ['trainingops_config_overrides'];
    if (data._localStorage) {
      for (const [key, value] of Object.entries(data._localStorage)) {
        if (IMPORT_LOCALSTORAGE_ALLOWLIST.includes(key)) {
          localStorage.setItem(key, value);
        }
        // Unknown keys silently ignored
      }
    }

    return { success: true };
  }

  /**
   * Validate import data structure. Reject malicious/malformed IDs.
   */
  _validateImportData(data) {
    const errors = [];
    const VALID_STORES = STORES.map(s => s.name);

    for (const key of Object.keys(data)) {
      if (key === '_localStorage') continue;
      if (!VALID_STORES.includes(key)) continue;

      const records = data[key];
      if (!Array.isArray(records)) {
        errors.push(`Store "${key}" must be an array`);
        continue;
      }

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (typeof record !== 'object' || record === null) {
          errors.push(`Store "${key}" record ${i}: must be an object`);
          continue;
        }
        const id = record.id || record.key;
        if (id && typeof id === 'string' && !ID_PATTERN.test(id)) {
          errors.push(`Store "${key}" record ${i}: invalid ID format`);
        }
      }
    }
    return errors;
  }

  _readStore(db, storeName) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

export default new ImportExportService();
