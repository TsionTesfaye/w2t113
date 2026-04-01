/**
 * Favorite domain model.
 */

export function createFavorite({ id, userId, itemType, itemId, createdAt }) {
  return {
    id,
    userId,
    itemType,        // 'question', 'review', 'class', 'thread'
    itemId,
    createdAt: createdAt || new Date().toISOString(),
  };
}
