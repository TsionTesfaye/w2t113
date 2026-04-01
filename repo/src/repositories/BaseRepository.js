/**
 * BaseRepository — generic IndexedDB CRUD abstraction.
 * All domain repositories extend this class.
 */

import { getDatabase } from '../store/Database.js';

export class BaseRepository {
  /**
   * @param {string} storeName — name of the IndexedDB object store
   */
  constructor(storeName) {
    this.storeName = storeName;
  }

  _getStore(mode = 'readonly') {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');
    const tx = db.transaction(this.storeName, mode);
    return tx.objectStore(this.storeName);
  }

  _request(idbRequest) {
    return new Promise((resolve, reject) => {
      idbRequest.onsuccess = () => resolve(idbRequest.result);
      idbRequest.onerror = () => reject(idbRequest.error);
    });
  }

  /**
   * Get a record by primary key.
   */
  async getById(id) {
    const store = this._getStore('readonly');
    return this._request(store.get(id));
  }

  /**
   * Get all records in the store.
   */
  async getAll() {
    const store = this._getStore('readonly');
    return this._request(store.getAll());
  }

  /**
   * Get records by index value.
   * Guards against invalid IDB keys (undefined, null, boolean) which cause DataError.
   * If the key is not a valid IDB key type, falls back to getAll() + filter.
   */
  async getByIndex(indexName, value) {
    // Guard invalid keys
    if (value === undefined || value === null || typeof value === 'boolean') {
      return [];
    }
  
    try {
      const store = this._getStore('readonly');
  
      // 🔥 CRITICAL FIX: check index existence BEFORE using it
      if (!store.indexNames.contains(indexName)) {
        const all = await this.getAll();
        return all.filter(r => r[indexName] === value);
      }
  
      const index = store.index(indexName);
  
      return await this._request(index.getAll(value));
  
    } catch (err) {
      console.warn('getByIndex fallback triggered:', indexName, value, err);
  
      const all = await this.getAll();
      return all.filter(r => r[indexName] === value);
    }
  }

  /**
   * Add a new record.
   */
  async add(record) {
    const store = this._getStore('readwrite');
    return this._request(store.add(record));
  }

  /**
   * Put (upsert) a record.
   */
  async put(record) {
    const store = this._getStore('readwrite');
    return this._request(store.put(record));
  }

  /**
   * Delete a record by primary key.
   */
  async delete(id) {
    const store = this._getStore('readwrite');
    return this._request(store.delete(id));
  }

  /**
   * Clear all records in the store.
   */
  async clear() {
    const store = this._getStore('readwrite');
    return this._request(store.clear());
  }

  /**
   * Count records in the store.
   */
  async count() {
    const store = this._getStore('readonly');
    return this._request(store.count());
  }

  /**
   * Get all records matching a filter function.
   */
  async filter(predicate) {
    const all = await this.getAll();
    return all.filter(predicate);
  }

  /**
   * Bulk add records.
   */
  async bulkAdd(records) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      for (const record of records) {
        store.add(record);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Bulk put (upsert) records.
   */
  async bulkPut(records) {
    const db = getDatabase();
    if (!db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      for (const record of records) {
        store.put(record);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export default BaseRepository;
