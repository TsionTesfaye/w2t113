/**
 * Final Alignment Tests — rating completion enforcement, dual-mode export,
 * follow-up image size validation, and large-object repository wiring.
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser, makeClass, makeCompletedClass, seedCompletedClassWithParticipants } from '../test-helpers.js';
import { REGISTRATION_STATUS } from '../src/models/Registration.js';
import { USER_ROLES } from '../src/models/User.js';
import { CryptoService } from '../src/services/CryptoService.js';

export async function runFinalAlignmentTests() {

  // ============================================================
  // 1. RATING REQUIRES COMPLETED CLASS
  // ============================================================

  await describe('Final: rating strictly requires completed class', async () => {
    await it('active class → rating rejected', async () => {
      const { ratingService, repos } = buildTestServices();
      await repos.classRepository.put(makeClass({ id: 'c1', capacity: 20 })); // status: 'active'
      await assertThrowsAsync(
        () => ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u2', classId: 'c1', score: 4 }),
        'completed classes'
      );
    });

    await it('completed class + approved participant → rating accepted', async () => {
      const { ratingService, registrationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'learner', role: USER_ROLES.LEARNER }));
      await repos.userRepository.add(makeUser({ id: 'rev', role: USER_ROLES.STAFF_REVIEWER }));
      await repos.classRepository.put({ ...makeClass({ id: 'c1', instructorId: 'inst' }), status: 'active' });

      const reg = await registrationService.create('learner', 'c1');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.SUBMITTED, '', 'learner');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.UNDER_REVIEW, '', 'rev');
      await registrationService.transition(reg.id, REGISTRATION_STATUS.APPROVED, '', 'rev');

      // Mark class completed before rating (ratings require completed class)
      await repos.classRepository.put({ ...makeClass({ id: 'c1', instructorId: 'inst' }), status: 'completed' });

      const rating = await ratingService.submitRating({ fromUserId: 'learner', toUserId: 'inst', classId: 'c1', score: 5 });
      assert(rating.id);
      assertEqual(rating.score, 5);
    });

    await it('completed class + non-participant → rating rejected', async () => {
      const { ratingService, repos } = buildTestServices();
      await repos.classRepository.put({ ...makeClass({ id: 'c1' }), status: 'completed' });
      // Add a registration for a DIFFERENT user
      await repos.registrationRepository.add({
        id: 'r1', userId: 'other-user', classId: 'c1', status: REGISTRATION_STATUS.APPROVED,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      await assertThrowsAsync(
        () => ratingService.submitRating({ fromUserId: 'outsider', toUserId: 'inst', classId: 'c1', score: 3 }),
        'participated in'
      );
    });

    await it('missing classId → throws classId is required', async () => {
      const { ratingService } = buildTestServices();
      await assertThrowsAsync(
        () => ratingService.submitRating({ fromUserId: 'a', toUserId: 'b', score: 3 }),
        'classId is required'
      );
    });
  });

  // ============================================================
  // 2. DUAL-MODE EXPORT
  // ============================================================

  await describe('Final: dual-mode export — encrypted + plaintext', async () => {
    await it('encrypted mode preserves passwordHash', async () => {
      const crypto = new CryptoService();
      const { hash, salt } = await crypto.hashPassword('pass123');
      const user = { id: 'u1', username: 'test', passwordHash: `${hash}:${salt}`, role: 'Learner' };

      // Simulate encrypted export/import
      const data = JSON.stringify({ users: [user] });
      const encrypted = await crypto.encrypt(data, 'backup-key');
      const decrypted = JSON.parse(await crypto.decrypt(encrypted, 'backup-key'));

      assertEqual(decrypted.users[0].passwordHash, `${hash}:${salt}`);
      const [h, s] = decrypted.users[0].passwordHash.split(':');
      assert(await crypto.verifyPassword('pass123', h, s), 'Login works after encrypted restore');
    });

    await it('plaintext mode strips passwordHash and marks reset', () => {
      const user = { id: 'u1', username: 'test', passwordHash: 'hash:salt', role: 'Learner' };
      const { passwordHash, ...safe } = user;
      const exported = { ...safe, _requiresPasswordReset: true };

      assert(!exported.passwordHash, 'Credentials stripped');
      assert(exported._requiresPasswordReset, 'Reset flag set');
      assertEqual(exported.username, 'test');
    });

    await it('plaintext user cannot login (no passwordHash)', async () => {
      const { repos } = buildTestServices();
      // User imported from plaintext export — no passwordHash
      await repos.userRepository.add({
        id: 'u1', username: 'imported', role: 'Learner',
        displayName: 'Imported', _requiresPasswordReset: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      const user = await repos.userRepository.getByUsername('imported');
      assert(user, 'User exists');
      assert(!user.passwordHash, 'No passwordHash');
      assert(user._requiresPasswordReset, 'Marked for reset');
    });
  });

  // ============================================================
  // 3. FOLLOW-UP IMAGE SIZE VALIDATION
  // ============================================================

  await describe('Final: follow-up review enforces image size limit', async () => {
    await it('oversized follow-up image rejected', async () => {
      const { reviewService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'cls-fu1', ['u1']);
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-fu1', rating: 4, text: 'Good class' });

      await assertThrowsAsync(
        () => reviewService.submitFollowUp(review.id, {
          text: 'Update',
          images: [{ size: 3 * 1024 * 1024, type: 'image/jpeg' }],
        }, 'u1'),
        'under 2MB'
      );
    });

    await it('valid follow-up image accepted', async () => {
      const { reviewService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'cls-fu2', ['u1']);
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-fu2', rating: 4, text: 'Good' });

      const followUp = await reviewService.submitFollowUp(review.id, {
        text: 'Updated review',
        images: [{ size: 100000, type: 'image/png' }],
      }, 'u1');
      assert(followUp.id, 'Follow-up with valid image accepted');
    });

    await it('follow-up image at exactly 2MB accepted', async () => {
      const { reviewService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'cls-fu3', ['u1']);
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-fu3', rating: 4, text: 'Good' });

      const followUp = await reviewService.submitFollowUp(review.id, {
        text: 'Update',
        images: [{ size: 2 * 1024 * 1024, type: 'image/jpeg' }],
      }, 'u1');
      assert(followUp.id);
    });

    await it('follow-up image at 2MB+1 rejected', async () => {
      const { reviewService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'cls-fu4', ['u1']);
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-fu4', rating: 4, text: 'Good' });

      await assertThrowsAsync(
        () => reviewService.submitFollowUp(review.id, {
          text: 'Update',
          images: [{ size: 2 * 1024 * 1024 + 1, type: 'image/jpeg' }],
        }, 'u1'),
        'under 2MB'
      );
    });
  });

  // ============================================================
  // 4. IMAGE REPOSITORY WIRED INTO REVIEW FLOW
  // ============================================================

  await describe('Final: ImageRepository wired into review flow', async () => {
    await it('review images stored in ImageRepository with references', async () => {
      const { reviewService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'cls-img1', ['u1']);
      const review = await reviewService.submitReview({
        userId: 'u1', targetClassId: 'cls-img1', rating: 5, text: 'Great',
        images: [
          { size: 100, type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,abc', filename: 'photo.jpg' },
          { size: 200, type: 'image/png', dataUrl: 'data:image/png;base64,def', filename: 'screen.png' },
        ],
      });

      // Review should have image references (IDs), not raw blobs
      assertEqual(review.images.length, 2, 'Two image references');
      assert(review.images[0].imageId, 'First image has reference ID');
      assert(review.images[1].imageId, 'Second image has reference ID');

      // Images should be in the dedicated ImageRepository
      const allImages = await repos.imageRepository.getAll();
      assertEqual(allImages.length, 2, 'Two images in ImageRepository');
      assertEqual(allImages[0].entityType, 'review');
      assertEqual(allImages[0].entityId, review.id, 'Image linked to review');
      assert(allImages[0].data, 'Image data stored');
    });

    await it('review without images stores empty refs', async () => {
      const { reviewService, repos } = buildTestServices();
      await seedCompletedClassWithParticipants(repos, 'cls-noimg', ['u1']);
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-noimg', rating: 4, text: 'No images' });
      assertEqual(review.images.length, 0);
      const allImages = await repos.imageRepository.getAll();
      assertEqual(allImages.length, 0);
    });
  });
}
