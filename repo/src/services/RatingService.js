/**
 * RatingService — two-way ratings with tag-based feedback and appeal flow.
 * Ratings have explicit status (active/adjusted/voided).
 * Voided ratings are excluded from all active queries and aggregations.
 */

import ratingRepository from '../repositories/RatingRepository.js';
import appealRepository from '../repositories/AppealRepository.js';
import userRepository from '../repositories/UserRepository.js';
import registrationRepository from '../repositories/RegistrationRepository.js';
import classRepository from '../repositories/ClassRepository.js';
import defaultAuditService from './AuditService.js';
import { createRating, createAppeal, APPEAL_STATUS, RATING_STATUS } from '../models/Rating.js';
import { REGISTRATION_STATUS } from '../models/Registration.js';
import { USER_ROLES } from '../models/User.js';
import { generateId, now } from '../utils/helpers.js';

export class RatingService {
  constructor(deps = {}) {
    this._ratingRepo = deps.ratingRepository || ratingRepository;
    this._appealRepo = deps.appealRepository || appealRepository;
    this._userRepo = deps.userRepository || userRepository;
    this._registrationRepo = deps.registrationRepository || registrationRepository;
    this._classRepo = deps.classRepository || classRepository;
    this._auditService = deps.auditService || defaultAuditService;
  }

  async submitRating({ fromUserId, toUserId, classId, score, tags, comment }) {
    if (!fromUserId) throw new Error('fromUserId is required.');
    if (!toUserId) throw new Error('toUserId is required.');
    if (fromUserId === toUserId) throw new Error('Cannot rate yourself.');
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error('Score must be between 1 and 5.');
    }

    // Per prompt: "Two-way ratings are captured after completion."
    // classId is REQUIRED. Class must exist, be completed, and user must be a participant.
    if (!classId) {
      throw new Error('classId is required. Ratings can only be submitted for a completed class.');
    }
    const cls = await this._classRepo.getById(classId);
    if (!cls) {
      throw new Error('Class not found.');
    }
    if (cls.status !== 'completed') {
      throw new Error('Ratings can only be submitted for completed classes.');
    }
    const regs = await this._registrationRepo.getByClassId(classId);
    const isParticipant = regs.some(r => r.userId === fromUserId && r.status === REGISTRATION_STATUS.APPROVED);
    const fromIsInstructor = cls.instructorId === fromUserId;
    if (!isParticipant && !fromIsInstructor) {
      throw new Error('You can only rate a class you participated in (approved registration required).');
    }

    // Validate toUserId is also a participant in the same class
    const toIsParticipant = regs.some(r => r.userId === toUserId && r.status === REGISTRATION_STATUS.APPROVED);
    const toIsInstructor = cls.instructorId === toUserId;
    if (!toIsParticipant && !toIsInstructor) {
      throw new Error('The rated user must also be a participant in the same completed class.');
    }

    const rating = createRating({
      id: generateId(),
      fromUserId,
      toUserId,
      classId,
      score,
      tags: tags || [],
      comment: comment || '',
    });

    await this._ratingRepo.add(rating);
    await this._auditService.log('rating', rating.id, 'created', `Rating ${score}/5 from ${fromUserId} to ${toUserId}`, fromUserId);
    return rating;
  }

  /**
   * File an appeal on a rating.
   */
  async fileAppeal(ratingId, appealerId, reason) {
    if (!ratingId) throw new Error('ratingId is required.');
    if (!appealerId) throw new Error('appealerId is required.');
    if (!reason || String(reason).trim() === '') throw new Error('Appeal reason is required.');

    const rating = await this._ratingRepo.getById(ratingId);
    if (!rating) throw new Error('Rating not found.');

    if (rating.toUserId !== appealerId) {
      await this._auditService.log('appeal', ratingId, 'unauthorized_attempt', `User ${appealerId} tried to appeal rating belonging to ${rating.toUserId}`, appealerId);
      throw new Error('Only the rated user can file an appeal on this rating.');
    }

    const existingAppeals = await this._appealRepo.getByRatingId(ratingId);
    const pending = existingAppeals.find(a => a.status === APPEAL_STATUS.PENDING);
    if (pending) throw new Error('An appeal is already pending for this rating.');

    const appeal = createAppeal({
      id: generateId(),
      ratingId,
      appealerId,
      reason,
    });

    await this._appealRepo.add(appeal);
    await this._auditService.log('appeal', appeal.id, 'filed', `Appeal filed for rating ${ratingId}`, appealerId);
    return appeal;
  }

  /**
   * Resolve an appeal (reviewer decision: uphold, adjust, void).
   * Void: rating becomes VOIDED and excluded from active queries.
   * Adjust: rating score updated, status becomes ADJUSTED.
   */
  async resolveAppeal(appealId, decision, rationale, reviewerId, adjustedScore = null) {
    if (!appealId) throw new Error('appealId is required.');
    if (!reviewerId) throw new Error('reviewerId is required.');

    const actingUser = await this._userRepo.getById(reviewerId);
    if (!actingUser) {
      throw new Error('Acting user not found. Cannot resolve appeal.');
    }
    if (![USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(actingUser.role)) {
      throw new Error('Only administrators or staff reviewers can resolve appeals.');
    }

    const appeal = await this._appealRepo.getById(appealId);
    if (!appeal) throw new Error('Appeal not found.');

    if (appeal.status !== APPEAL_STATUS.PENDING) {
      throw new Error('Appeal has already been resolved.');
    }

    if (!rationale || rationale.trim().length === 0) {
      throw new Error('Written rationale is required.');
    }

    const validDecisions = [APPEAL_STATUS.UPHELD, APPEAL_STATUS.ADJUSTED, APPEAL_STATUS.VOIDED];
    if (!validDecisions.includes(decision)) {
      throw new Error(`Decision must be one of: ${validDecisions.join(', ')}`);
    }

    if (decision === APPEAL_STATUS.ADJUSTED && (adjustedScore === null || adjustedScore < 1 || adjustedScore > 5)) {
      throw new Error('Adjusted score must be between 1 and 5.');
    }

    appeal.status = decision;
    appeal.decision = decision;
    appeal.rationale = rationale;
    appeal.reviewerId = reviewerId;
    appeal.adjustedScore = adjustedScore;
    appeal.resolvedAt = now();

    await this._appealRepo.put(appeal);

    // Apply real void/adjust semantics to the rating
    const rating = await this._ratingRepo.getById(appeal.ratingId);
    if (rating) {
      if (decision === APPEAL_STATUS.VOIDED) {
        rating.status = RATING_STATUS.VOIDED;
        await this._ratingRepo.put(rating);
      } else if (decision === APPEAL_STATUS.ADJUSTED) {
        rating.score = adjustedScore;
        rating.status = RATING_STATUS.ADJUSTED;
        await this._ratingRepo.put(rating);
      }
      // UPHELD: rating stays active, no changes needed
    }

    await this._auditService.log('appeal', appealId, 'resolved', `Decision: ${decision}, rationale: ${rationale}`, reviewerId);
    return appeal;
  }

  async getRatingById(ratingId) {
    return this._ratingRepo.getById(ratingId);
  }

  /** Get active (non-voided) ratings for a user. */
  async getActiveRatingsForUser(toUserId) {
    const all = await this._ratingRepo.getByToUserId(toUserId);
    return all.filter(r => r.status !== RATING_STATUS.VOIDED);
  }

  async getRatingsForUser(toUserId) {
    return this._ratingRepo.getByToUserId(toUserId);
  }

  async getRatingsByUser(fromUserId) {
    return this._ratingRepo.getByFromUserId(fromUserId);
  }

  /** Get all active (non-voided) ratings. */
  async getAllActiveRatings() {
    const all = await this._ratingRepo.getAll();
    return all.filter(r => r.status !== RATING_STATUS.VOIDED);
  }

  async getAllRatings() {
    return this._ratingRepo.getAll();
  }

  async getPendingAppeals() {
    return this._appealRepo.getByStatus(APPEAL_STATUS.PENDING);
  }

  async getAppealsByRatingId(ratingId) {
    return this._appealRepo.getByRatingId(ratingId);
  }

  async getAllAppeals() {
    return this._appealRepo.getAll();
  }
}

export default new RatingService();
