/**
 * BrowsingHistory domain model.
 */

export function createBrowsingHistoryEntry({ id, userId, itemType, itemId, title = '', timestamp }) {
  return {
    id,
    userId,
    itemType,        // 'class', 'question', 'review', 'thread'
    itemId,
    title,
    timestamp: timestamp || new Date().toISOString(),
  };
}
