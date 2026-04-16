/**
 * BrowsingHistoryService — track viewed items, retrieval and filtering.
 */

import browsingHistoryRepository from '../repositories/BrowsingHistoryRepository.js';
import { createBrowsingHistoryEntry } from '../models/BrowsingHistory.js';
import { generateId } from '../utils/helpers.js';

export class BrowsingHistoryService {
  constructor(deps = {}) {
    this._repo = deps.browsingHistoryRepository || browsingHistoryRepository;
  }

  /**
   * Record a browsing event.
   */
  async record(userId, itemType, itemId, title = '') {
    const entry = createBrowsingHistoryEntry({
      id: generateId(),
      userId,
      itemType,
      itemId,
      title,
    });
    await this._repo.add(entry);
    return entry;
  }

  /**
   * Get browsing history for a user (newest first).
   */
  async getHistory(userId) {
    return this._repo.getByUserId(userId);
  }

  /**
   * Get history filtered by item type.
   */
  async getHistoryByType(userId, itemType) {
    const all = await this.getHistory(userId);
    return all.filter(e => e.itemType === itemType);
  }

  /**
   * Clear history for a user.
   */
  async clearHistory(userId) {
    const entries = await this.getHistory(userId);
    for (const entry of entries) {
      await this._repo.delete(entry.id);
    }
  }
}

export default new BrowsingHistoryService();
