/**
 * Integration Test — Review + Moderation + Appeal using REAL services
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser, seedCompletedClassWithParticipants } from '../test-helpers.js';
import { REPORT_STATUS, REPORT_OUTCOMES } from '../src/models/Report.js';
import { APPEAL_STATUS } from '../src/models/Rating.js';
import { USER_ROLES } from '../src/models/User.js';

export async function runReviewModerationFlowTests() {
  await describe('Integration: Review → Report → Resolution (real services)', async () => {
    await it('should complete full moderation flow', async () => {
      const { reviewService, moderationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'mod1', role: USER_ROLES.STAFF_REVIEWER }));
      await seedCompletedClassWithParticipants(repos, 'cls-flow', ['u1']);

      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-flow', rating: 4, text: 'Great class' });
      const report = await moderationService.submitReport('u2', review.id, 'review', 'Suspicious content');
      assertEqual(report.status, REPORT_STATUS.OPEN);

      const resolved = await moderationService.resolveReport(report.id, REPORT_OUTCOMES.DISMISSED, 'mod1');
      assertEqual(resolved.status, REPORT_STATUS.RESOLVED);
      assertEqual(resolved.resolution, REPORT_OUTCOMES.DISMISSED);

      // Verify persistence
      const persistedReport = await repos.reportRepository.getById(report.id);
      assertEqual(persistedReport.status, REPORT_STATUS.RESOLVED);
    });
  });

  await describe('Integration: Review blocked by sensitive words (real services)', async () => {
    await it('should block and not persist review with sensitive words', async () => {
      const { reviewService, repos } = buildTestServices();
      await assertThrowsAsync(
        () => reviewService.submitReview({ userId: 'u1', rating: 3, text: 'This is a spam review' }),
        'prohibited content'
      );
      const all = await repos.reviewRepository.getAll();
      assertEqual(all.length, 0);
    });
  });

  await describe('Integration: Rating → Appeal → Adjustment (real services)', async () => {
    await it('should adjust original rating score', async () => {
      const { ratingService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));

      await seedCompletedClassWithParticipants(repos, 'tc-1', ['u1', 'u2']);
      const rating = await ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u2', classId: 'tc-1', score: 1 });
      const appeal = await ratingService.fileAppeal(rating.id, 'u2', 'Rating is unfair');
      await ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.ADJUSTED, 'Adjusting to 3', 'rev1', 3);

      const updated = await repos.ratingRepository.getById(rating.id);
      assertEqual(updated.score, 3);

      // Verify audit trail recorded the appeal resolution
      const auditLogs = await repos.auditLogRepository.getAll();
      const appealLog = auditLogs.find(l => l.action === 'resolved' && l.entityType === 'appeal');
      assert(appealLog !== undefined, 'Appeal resolution should be in audit log');
    });
  });

  await describe('Integration: Double resolution prevention (real services)', async () => {
    await it('should prevent resolving same report twice', async () => {
      const { reviewService, moderationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'mod1', role: USER_ROLES.STAFF_REVIEWER }));
      await seedCompletedClassWithParticipants(repos, 'cls-dbl', ['u1']);
      const review = await reviewService.submitReview({ userId: 'u1', targetClassId: 'cls-dbl', rating: 4, text: 'Good' });
      const report = await moderationService.submitReport('u2', review.id, 'review', 'Reason');
      await moderationService.resolveReport(report.id, REPORT_OUTCOMES.DISMISSED, 'mod1');
      await assertThrowsAsync(() => moderationService.resolveReport(report.id, REPORT_OUTCOMES.REMOVED, 'mod1'), 'already been resolved');
    });

    await it('should prevent resolving same appeal twice', async () => {
      const { ratingService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));
      await seedCompletedClassWithParticipants(repos, 'tc-2', ['u1', 'u2']);
      const rating = await ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u2', classId: 'tc-2', score: 1 });
      const appeal = await ratingService.fileAppeal(rating.id, 'u2', 'Unfair');
      await ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.UPHELD, 'Fair', 'rev1');
      await assertThrowsAsync(() => ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.VOIDED, 'Changed', 'rev1'), 'already been resolved');
    });
  });
}
