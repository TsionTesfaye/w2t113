/**
 * ReputationScore domain model.
 * Computed from fulfillment rate, late rate, complaint rate over last 90 days.
 */

export function createReputationScore({ id, userId, score, fulfillmentRate, lateRate, complaintRate, computedAt }) {
  return {
    id,
    userId,
    score,               // 0–100
    fulfillmentRate,     // 0–1
    lateRate,            // 0–1
    complaintRate,       // 0–1
    computedAt: computedAt || new Date().toISOString(),
  };
}

export const REPUTATION_THRESHOLD = 60;
