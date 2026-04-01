/**
 * Unit Tests — ReviewService (REAL service, in-memory repos)
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, seedCompletedClassWithParticipants } from '../test-helpers.js';

/** Seed a default completed class and return the classId for use in review tests. */
async function seedReviewClass(repos, userId, classId = 'cls-review') {
  await seedCompletedClassWithParticipants(repos, classId, [userId]);
  return classId;
}

export async function runReviewTests() {
  await describe('ReviewService.submitReview() — Validation', async () => {
    await it('should create a valid review', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: classId, rating: 4, text: 'Great class', direction: 'learner_to_class' });
      assertEqual(review.rating, 4);
      assert(review.id);
    });

    await it('should persist review in repository', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: classId, rating: 3 });
      const fetched = await repos.reviewRepository.getById(review.id);
      assert(fetched !== null);
    });

    await it('should reject rating < 1', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'u1', rating: 0 }), 'Rating must be between 1 and 5');
    });

    await it('should reject rating > 5', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'u1', rating: 6 }), 'Rating must be between 1 and 5');
    });

    await it('should reject non-integer rating', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'u1', rating: 3.5 }), 'Rating must be between 1 and 5');
    });

    await it('should reject text > 2000 characters', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'u1', rating: 3, text: 'a'.repeat(2001) }), 'at most 2000');
    });

    await it('should accept text exactly 2000 characters', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: classId, rating: 3, text: 'a'.repeat(2000) });
      assertEqual(review.text.length, 2000);
    });

    await it('should reject missing targetClassId', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'u1', rating: 3, text: 'Good' }), 'targetClassId is required');
    });

    await it('should reject non-existent class', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'u1', targetClassId: 'ghost', rating: 3 }), 'Class not found');
    });

    await it('should reject non-completed class', async () => {
      const { reviewService, repos } = buildTestServices();
      await repos.classRepository.add({ id: 'cls-active', status: 'active', title: 'T', instructorId: '', capacity: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-active', rating: 3 }), 'completed classes');
    });

    await it('should reject reviewer not in class', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'outsider', targetClassId: classId, rating: 3 }), 'participated in');
    });

    await it('should reject self-review', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'u1', targetUserId: 'u1', targetClassId: classId, rating: 3 }), 'cannot review yourself');
    });

    await it('should reject targetUserId not in class', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      await assertThrowsAsync(() => reviewService.submitReview({ userId: 'u1', targetUserId: 'outsider', targetClassId: classId, rating: 3 }), 'participant in the same class');
    });

    await it('should reject duplicate review for same class and recipient', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      await reviewService.submitReview({ userId: 'u1', targetClassId: classId, rating: 3, text: 'First' });
      await assertThrowsAsync(
        () => reviewService.submitReview({ userId: 'u1', targetClassId: classId, rating: 4, text: 'Second' }),
        'already submitted a review'
      );
    });
  });

  await describe('ReviewService.submitReview() — Sensitive Word Filtering (real ModerationService)', async () => {
    await it('should block review with sensitive words', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(
        () => reviewService.submitReview({ userId: 'u1', rating: 3, text: 'This is a spam review' }),
        'prohibited content'
      );
    });

    await it('should not persist blocked review', async () => {
      const { reviewService, repos } = buildTestServices();
      try { await reviewService.submitReview({ userId: 'u1', rating: 3, text: 'This is fraud' }); } catch (_) {}
      const all = await repos.reviewRepository.getAll();
      assertEqual(all.length, 0);
    });

    await it('should allow clean text', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: classId, rating: 3, text: 'Great class, learned a lot' });
      assert(review.id);
    });
  });

  await describe('ReviewService.submitReview() — Image Validation', async () => {
    await it('should reject more than 6 images', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(
        () => reviewService.submitReview({ userId: 'u1', rating: 3, images: Array(7).fill({ size: 100, type: 'image/png' }) }),
        'Maximum 6 images'
      );
    });

    await it('should reject image > 2MB', async () => {
      const { reviewService } = buildTestServices();
      await assertThrowsAsync(
        () => reviewService.submitReview({ userId: 'u1', rating: 3, images: [{ size: 3 * 1024 * 1024, type: 'image/png' }] }),
        'under 2MB'
      );
    });

    await it('should accept valid images', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: classId, rating: 3, images: [{ size: 1024 * 1024, type: 'image/jpeg' }] });
      assertEqual(review.images.length, 1);
    });
  });

  await describe('ReviewService.submitFollowUp() (real service)', async () => {
    await it('should allow follow-up within 14 days', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      const original = await reviewService.submitReview({ userId: 'u1', targetClassId: classId, rating: 3, text: 'Original' });
      const followUp = await reviewService.submitFollowUp(original.id, { rating: 4, text: 'Updated' }, 'u1');
      assertEqual(followUp.followUpOf, original.id);
    });

    await it('should block second follow-up', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      const original = await reviewService.submitReview({ userId: 'u1', targetClassId: classId, rating: 3, text: 'Original' });
      await reviewService.submitFollowUp(original.id, { rating: 4, text: 'First follow-up' }, 'u1');
      await assertThrowsAsync(
        () => reviewService.submitFollowUp(original.id, { rating: 5, text: 'Second follow-up' }, 'u1'),
        'already been submitted'
      );
    });

    await it('should block follow-up by different user', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      const original = await reviewService.submitReview({ userId: 'u1', targetClassId: classId, rating: 3, text: 'Original' });
      await assertThrowsAsync(() => reviewService.submitFollowUp(original.id, { rating: 4 }, 'u2'), 'Only the original reviewer');
    });

    await it('should block follow-up with sensitive words at service level', async () => {
      const { reviewService, repos } = buildTestServices();
      const classId = await seedReviewClass(repos, 'u1');
      const original = await reviewService.submitReview({ userId: 'u1', targetClassId: classId, rating: 3, text: 'Good' });
      await assertThrowsAsync(
        () => reviewService.submitFollowUp(original.id, { text: 'This is a fraud!' }, 'u1'),
        'prohibited content'
      );
    });

    await it('should block follow-up after 14 days', async () => {
      const { reviewService, repos } = buildTestServices();
      await repos.reviewRepository.add({
        id: 'old-review', userId: 'u1', rating: 3, text: 'Old', direction: 'learner_to_class',
        images: [], tags: [], followUpOf: null,
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await assertThrowsAsync(
        () => reviewService.submitFollowUp('old-review', { rating: 4 }, 'u1'),
        'within 14 days'
      );
    });
  });
}
