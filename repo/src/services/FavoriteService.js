/**
 * FavoriteService — manage user favorites across content types.
 */

import favoriteRepository from '../repositories/FavoriteRepository.js';
import { createFavorite } from '../models/Favorite.js';
import { generateId } from '../utils/helpers.js';

export class FavoriteService {
  /**
   * Toggle a favorite — add if not exists, remove if exists.
   */
  async toggle(userId, itemType, itemId) {
    const existing = await this.find(userId, itemType, itemId);
    if (existing) {
      await favoriteRepository.delete(existing.id);
      return { action: 'removed' };
    }

    const fav = createFavorite({
      id: generateId(),
      userId,
      itemType,
      itemId,
    });
    await favoriteRepository.add(fav);
    return { action: 'added', favorite: fav };
  }

  /**
   * Check if an item is favorited by a user.
   */
  async isFavorited(userId, itemType, itemId) {
    const existing = await this.find(userId, itemType, itemId);
    return !!existing;
  }

  /**
   * Find a specific favorite.
   */
  async find(userId, itemType, itemId) {
    const all = await favoriteRepository.getByUserId(userId);
    return all.find(f => f.itemType === itemType && f.itemId === itemId) || null;
  }

  /**
   * Get all favorites for a user.
   */
  async getByUserId(userId) {
    return favoriteRepository.getByUserId(userId);
  }

  /**
   * Get favorites by type for a user.
   */
  async getByUserAndType(userId, itemType) {
    return favoriteRepository.getByUserAndType(userId, itemType);
  }
}

export default new FavoriteService();
