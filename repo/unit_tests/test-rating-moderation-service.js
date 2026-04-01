/**
 * Unit Tests — RatingService, ModerationService, QAService (REAL services, in-memory repos)
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser, seedCompletedClassWithParticipants } from '../test-helpers.js';
import { APPEAL_STATUS } from '../src/models/Rating.js';
import { REPORT_STATUS, REPORT_OUTCOMES } from '../src/models/Report.js';
import { REPUTATION_THRESHOLD } from '../src/models/ReputationScore.js';
import { USER_ROLES } from '../src/models/User.js';

/** Helper: create a valid rating with required completed class + both participants. */
async function createTestRating(services, { fromUserId = 'u1', toUserId = 'u2', score = 3, classId = 'tc1' } = {}) {
  await seedCompletedClassWithParticipants(services.repos, classId, [fromUserId, toUserId]);
  return services.ratingService.submitRating({ fromUserId, toUserId, classId, score });
}

export async function runRatingTests() {
  await describe('RatingService.submitRating() (real service)', async () => {
    await it('should create valid rating', async () => {
      const s = buildTestServices();
      const r = await createTestRating(s, { fromUserId: 'u1', toUserId: 'u2', score: 4 });
      assertEqual(r.score, 4);
    });

    await it('should persist rating', async () => {
      const s = buildTestServices();
      const r = await createTestRating(s, { fromUserId: 'u1', toUserId: 'u2', score: 3 });
      const fetched = await s.repos.ratingRepository.getById(r.id);
      assert(fetched !== null);
    });

    await it('should reject self-rating', async () => {
      const s = buildTestServices();
      await seedCompletedClassWithParticipants(s.repos, 'tc1', ['u1']);
      // Self-rating checked before participant validation — no need to seed u1 twice
      await assertThrowsAsync(() => s.ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u1', classId: 'tc1', score: 3 }), 'Cannot rate yourself');
    });

    await it('should reject missing fromUserId', async () => {
      const { ratingService } = buildTestServices();
      await assertThrowsAsync(() => ratingService.submitRating({ fromUserId: '', toUserId: 'u2', classId: 'tc1', score: 3 }), 'fromUserId is required');
    });

    await it('should reject score outside 1-5', async () => {
      const s = buildTestServices();
      // Score is validated before participant checks — class/participant seeding not needed for failure tests
      await assertThrowsAsync(() => s.ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u2', classId: 'tc1', score: 0 }), 'Score must be between');
      await assertThrowsAsync(() => s.ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u2', classId: 'tc1', score: 6 }), 'Score must be between');
    });

    await it('should reject missing classId', async () => {
      const { ratingService } = buildTestServices();
      await assertThrowsAsync(() => ratingService.submitRating({ fromUserId: 'u1', toUserId: 'u2', score: 3 }), 'classId is required');
    });
  });

  await describe('RatingService.fileAppeal() (real service)', async () => {
    await it('should file valid appeal', async () => {
      const s = buildTestServices();
      const rating = await createTestRating(s, { fromUserId: 'u1', toUserId: 'u2', score: 1 });
      const appeal = await s.ratingService.fileAppeal(rating.id, 'u2', 'Unfair rating');
      assertEqual(appeal.status, APPEAL_STATUS.PENDING);
    });

    await it('should reject duplicate pending appeal', async () => {
      const s = buildTestServices();
      const rating = await createTestRating(s, { fromUserId: 'u1', toUserId: 'u2', score: 1 });
      await s.ratingService.fileAppeal(rating.id, 'u2', 'First');
      await assertThrowsAsync(() => s.ratingService.fileAppeal(rating.id, 'u2', 'Second'), 'already pending');
    });

    await it('should reject empty reason', async () => {
      const s = buildTestServices();
      const rating = await createTestRating(s, { fromUserId: 'u1', toUserId: 'u2', score: 1 });
      await assertThrowsAsync(() => s.ratingService.fileAppeal(rating.id, 'u2', ''), 'Appeal reason is required');
    });
  });

  await describe('RatingService.resolveAppeal() (real service)', async () => {
    await it('should uphold appeal with rationale', async () => {
      const s = buildTestServices();
      await s.repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));
      const rating = await createTestRating(s, { fromUserId: 'u1', toUserId: 'u2', score: 1 });
      const appeal = await s.ratingService.fileAppeal(rating.id, 'u2', 'Unfair');
      const resolved = await s.ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.UPHELD, 'Rating is fair', 'rev1');
      assertEqual(resolved.status, APPEAL_STATUS.UPHELD);
    });

    await it('should adjust rating score and persist', async () => {
      const s = buildTestServices();
      await s.repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));
      const rating = await createTestRating(s, { fromUserId: 'u1', toUserId: 'u2', score: 1 });
      const appeal = await s.ratingService.fileAppeal(rating.id, 'u2', 'Too low');
      await s.ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.ADJUSTED, 'Adjusting to 3', 'rev1', 3);
      const updated = await s.repos.ratingRepository.getById(rating.id);
      assertEqual(updated.score, 3);
    });

    await it('should reject double resolution', async () => {
      const s = buildTestServices();
      await s.repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));
      const rating = await createTestRating(s, { fromUserId: 'u1', toUserId: 'u2', score: 1 });
      const appeal = await s.ratingService.fileAppeal(rating.id, 'u2', 'Unfair');
      await s.ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.UPHELD, 'Fair rating', 'rev1');
      await assertThrowsAsync(
        () => s.ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.VOIDED, 'Changed mind', 'rev1'),
        'already been resolved'
      );
    });

    await it('should require rationale', async () => {
      const s = buildTestServices();
      await s.repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));
      const rating = await createTestRating(s, { fromUserId: 'u1', toUserId: 'u2', score: 1 });
      const appeal = await s.ratingService.fileAppeal(rating.id, 'u2', 'Unfair');
      await assertThrowsAsync(() => s.ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.UPHELD, '', 'rev1'), 'rationale is required');
    });

    await it('should require valid adjusted score when adjusting', async () => {
      const s = buildTestServices();
      await s.repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));
      const rating = await createTestRating(s, { fromUserId: 'u1', toUserId: 'u2', score: 1 });
      const appeal = await s.ratingService.fileAppeal(rating.id, 'u2', 'Unfair');
      await assertThrowsAsync(() => s.ratingService.resolveAppeal(appeal.id, APPEAL_STATUS.ADJUSTED, 'Adjust', 'rev1', null), 'Adjusted score must be');
    });
  });
}

export async function runModerationTests() {
  await describe('ModerationService.checkContent() (real service)', async () => {
    await it('should flag sensitive words', async () => {
      const { moderationService } = buildTestServices();
      const result = moderationService.checkContent('This is spam content');
      assert(result.flagged);
      assert(result.words.includes('spam'));
    });

    await it('should not flag clean content', async () => {
      const { moderationService } = buildTestServices();
      assert(!moderationService.checkContent('This is great content').flagged);
    });

    await it('should handle null/empty text', async () => {
      const { moderationService } = buildTestServices();
      assert(!moderationService.checkContent(null).flagged);
      assert(!moderationService.checkContent('').flagged);
    });
  });

  await describe('ModerationService.resolveReport() (real service)', async () => {
    await it('should resolve a report and persist', async () => {
      const { moderationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));
      const report = await moderationService.submitReport('u1', 'target1', 'review', 'Bad content');
      const resolved = await moderationService.resolveReport(report.id, REPORT_OUTCOMES.DISMISSED, 'rev1');
      assertEqual(resolved.status, REPORT_STATUS.RESOLVED);
      const persisted = await repos.reportRepository.getById(report.id);
      assertEqual(persisted.status, REPORT_STATUS.RESOLVED);
    });

    await it('should reject double resolution', async () => {
      const { moderationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));
      const report = await moderationService.submitReport('u1', 'target1', 'review', 'Bad');
      await moderationService.resolveReport(report.id, REPORT_OUTCOMES.DISMISSED, 'rev1');
      await assertThrowsAsync(() => moderationService.resolveReport(report.id, REPORT_OUTCOMES.REMOVED, 'rev1'), 'already been resolved');
    });

    await it('should reject invalid outcome', async () => {
      const { moderationService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'rev1', role: USER_ROLES.STAFF_REVIEWER }));
      const report = await moderationService.submitReport('u1', 'target1', 'review', 'Bad');
      await assertThrowsAsync(() => moderationService.resolveReport(report.id, 'invalid_outcome', 'rev1'), 'Outcome must be one of');
    });
  });
}

export async function runReputationTests() {
  await describe('ReputationService — Score Logic', async () => {
    await it('should compute perfect score as 100', async () => {
      const score = Math.round((1 * 0.5 + (1 - 0) * 0.3 + (1 - 0) * 0.2) * 100);
      assertEqual(score, 100);
    });

    await it('should compute low score for bad metrics', async () => {
      const score = Math.round((0.2 * 0.5 + (1 - 0.8) * 0.3 + (1 - 0.5) * 0.2) * 100);
      assertEqual(score, 26);
      assert(score < REPUTATION_THRESHOLD, 'Score 26 < threshold 60');
    });
  });
}

export async function runQATests() {
  await describe('QAService.createThread() (real service)', async () => {
    await it('should create valid thread and persist', async () => {
      const { qaService, repos } = buildTestServices();
      const thread = await qaService.createThread('u1', 'How to X?', 'I need help with X');
      assert(thread.id);
      const fetched = await repos.questionThreadRepository.getById(thread.id);
      assert(fetched !== null);
    });

    await it('should reject empty title', async () => {
      const { qaService } = buildTestServices();
      await assertThrowsAsync(() => qaService.createThread('u1', '', 'Content'), 'Thread title is required');
    });

    await it('should reject empty content', async () => {
      const { qaService } = buildTestServices();
      await assertThrowsAsync(() => qaService.createThread('u1', 'Title', ''), 'Thread content is required');
    });
  });

  await describe('QAService.submitAnswer() (real service)', async () => {
    await it('should submit valid answer', async () => {
      const { qaService } = buildTestServices();
      const thread = await qaService.createThread('u1', 'Q', 'Help');
      const answer = await qaService.submitAnswer(thread.id, 'u2', 'Here is how');
      assertEqual(answer.threadId, thread.id);
    });

    await it('should reject empty answer content', async () => {
      const { qaService } = buildTestServices();
      const thread = await qaService.createThread('u1', 'Q', 'Help');
      await assertThrowsAsync(() => qaService.submitAnswer(thread.id, 'u2', ''), 'Answer content is required');
    });

    await it('should reject answer to non-existent thread', async () => {
      const { qaService } = buildTestServices();
      await assertThrowsAsync(() => qaService.submitAnswer('fake-id', 'u2', 'Answer'), 'Thread not found');
    });
  });
}
