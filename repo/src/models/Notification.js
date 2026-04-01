/**
 * Notification domain model.
 */

export function createNotification({ id, userId, title, message, type = 'info', read = false, link = '', createdAt }) {
  return {
    id,
    userId,
    title,
    message,
    type,        // 'info', 'warning', 'success', 'error'
    read,
    link,        // optional hash route to navigate to
    createdAt: createdAt || new Date().toISOString(),
  };
}
