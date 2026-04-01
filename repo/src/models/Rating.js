/**
 * Rating and Appeal domain models — two-way ratings with appeal flow.
 * Ratings have explicit status: active, adjusted, voided.
 */

export const APPEAL_STATUS = {
  PENDING: 'pending',
  UPHELD: 'upheld',
  ADJUSTED: 'adjusted',
  VOIDED: 'voided',
};

export const RATING_STATUS = {
  ACTIVE: 'active',
  ADJUSTED: 'adjusted',
  VOIDED: 'voided',
};

export function createRating({ id, fromUserId, toUserId, classId, score, tags = [], comment = '', status, createdAt }) {
  return {
    id,
    fromUserId,
    toUserId,
    classId,
    score,            // 1–5
    tags,             // tag-based feedback strings
    comment,
    status: status || RATING_STATUS.ACTIVE,
    createdAt: createdAt || new Date().toISOString(),
  };
}

export function createAppeal({ id, ratingId, appealerId, reason, status, reviewerId = null, decision = null, rationale = '', adjustedScore = null, resolvedAt = null, createdAt }) {
  return {
    id,
    ratingId,
    appealerId,
    reason,
    status: status || APPEAL_STATUS.PENDING,
    reviewerId,
    decision,            // APPEAL_STATUS value (upheld/adjusted/voided)
    rationale,           // required written explanation
    adjustedScore,       // only for 'adjusted' decisions
    resolvedAt,
    createdAt: createdAt || new Date().toISOString(),
  };
}
