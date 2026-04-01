/**
 * Review domain model — supports two-way reviews and follow-ups.
 */

export const REVIEW_DIRECTIONS = {
  LEARNER_TO_INSTRUCTOR: 'learner_to_instructor',
  INSTRUCTOR_TO_LEARNER: 'instructor_to_learner',
  LEARNER_TO_CLASS: 'learner_to_class',
};

export function createReview({ id, userId, targetUserId = null, targetClassId = null, direction, rating, text = '', images = [], tags = [], followUpOf = null, createdAt }) {
  return {
    id,
    userId,
    targetUserId,
    targetClassId,
    direction,
    rating,             // 1–5
    text,               // max 2000 chars
    images,             // array of { dataUrl, filename, size } — max 6, each ≤2MB
    tags,               // tag-based feedback
    followUpOf,         // id of original review (null if original)
    createdAt: createdAt || new Date().toISOString(),
  };
}
