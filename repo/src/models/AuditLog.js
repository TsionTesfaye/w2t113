/**
 * AuditLog domain model — append-only, immutable entries.
 */

export function createAuditLog({ id, entityType, entityId, action, details = '', userId, timestamp }) {
  return Object.freeze({
    id,
    entityType,      // 'registration', 'contract', 'review', 'report', 'rating', etc.
    entityId,
    action,          // e.g. 'status_change', 'created', 'graded', 'signed', 'appeal_resolved'
    details,         // free-text or JSON stringified context
    userId,
    timestamp: timestamp || new Date().toISOString(),
  });
}
