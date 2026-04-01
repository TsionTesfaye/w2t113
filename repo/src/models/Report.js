/**
 * Report (abuse report) domain model.
 * States: open → under_review → resolved (terminal).
 * SLA: system auto-resolves after 7 days if not manually resolved.
 */

export const REPORT_STATUS = {
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  ESCALATED: 'escalated',
  RESOLVED: 'resolved',
};

export const REPORT_OUTCOMES = {
  DISMISSED: 'dismissed',
  REMOVED: 'removed',
  WARNED: 'warned',
};

export function createReport({ id, reporterId, targetId, targetType, reason = '', status, resolution = null, resolvedBy = null, resolvedAt = null, riskFlag = false, escalatedAt = null, createdAt }) {
  return {
    id,
    reporterId,
    targetId,
    targetType,
    reason,
    status: status || REPORT_STATUS.OPEN,
    resolution,
    resolvedBy,
    resolvedAt,
    riskFlag,
    escalatedAt,
    createdAt: createdAt || new Date().toISOString(),
  };
}
