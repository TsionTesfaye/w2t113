/**
 * ReviewService — review CRUD, follow-up logic, two-way reviews, tag-based feedback.
 * Sensitive word filtering enforced at service level.
 */

import reviewRepository from '../repositories/ReviewRepository.js';
import imageRepository from '../repositories/ImageRepository.js';
import defaultClassRepository from '../repositories/ClassRepository.js';
import defaultRegistrationRepository from '../repositories/RegistrationRepository.js';
import defaultAuditService from './AuditService.js';
import defaultModerationService from './ModerationService.js';
import { createReview } from '../models/Review.js';
import { REGISTRATION_STATUS } from '../models/Registration.js';
import { generateId, now } from '../utils/helpers.js';
import { getConfig } from '../config/appConfig.js';

// Fallback defaults; overridden by appConfig at runtime
const DEFAULT_MAX_IMAGES = 6;
const DEFAULT_MAX_IMAGE_SIZE_MB = 2;
const DEFAULT_MAX_TEXT_LENGTH = 2000;
const DEFAULT_FOLLOW_UP_WINDOW_DAYS = 14;

export class ReviewService {
  constructor(deps = {}) {
    this._reviewRepo = deps.reviewRepository || reviewRepository;
    this._imageRepo = deps.imageRepository || imageRepository;
    this._classRepo = deps.classRepository || defaultClassRepository;
    this._registrationRepo = deps.registrationRepository || defaultRegistrationRepository;
    this._auditService = deps.auditService || defaultAuditService;
    this._moderationService = deps.moderationService || defaultModerationService;
  }

  /**
   * Store images in the dedicated ImageRepository and return reference IDs.
   */
  async _storeImages(images, entityId) {
    if (!images || images.length === 0) return [];
    const refs = [];
    for (const img of images) {
      const imageRecord = {
        id: generateId(),
        entityId,
        entityType: 'review',
        data: img.dataUrl || img.data || null,
        filename: img.filename || img.name || '',
        size: img.size,
        type: img.type || '',
        createdAt: now(),
      };
      await this._imageRepo.add(imageRecord);
      refs.push({ imageId: imageRecord.id, filename: imageRecord.filename, size: img.size, type: img.type });
    }
    return refs;
  }

  async submitReview({ userId, targetUserId, targetClassId, direction, rating, text, images, tags }) {
    const config = getConfig();
    const MAX_TEXT_LENGTH = (config.review && config.review.maxTextLength) || DEFAULT_MAX_TEXT_LENGTH;
    const MAX_IMAGES = (config.review && config.review.maxImages) || DEFAULT_MAX_IMAGES;
    const MAX_IMAGE_SIZE_MB = (config.review && config.review.maxImageSizeMB) || DEFAULT_MAX_IMAGE_SIZE_MB;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5.');
    }
    if (text && text.length > MAX_TEXT_LENGTH) {
      throw new Error(`Review text must be at most ${MAX_TEXT_LENGTH} characters.`);
    }
    if (text) {
      const modCheck = this._moderationService.checkContent(text);
      if (modCheck.flagged) {
        throw new Error(`Review contains prohibited content: ${modCheck.words.join(', ')}. Please revise.`);
      }
    }
    if (images && images.length > MAX_IMAGES) {
      throw new Error(`Maximum ${MAX_IMAGES} images allowed.`);
    }
    if (images) {
      const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
      for (const img of images) {
        if (img.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
          throw new Error(`Each image must be under ${MAX_IMAGE_SIZE_MB}MB.`);
        }
        if (img.type && !ALLOWED_TYPES.includes(img.type)) {
          throw new Error('Only JPG and PNG images are allowed.');
        }
      }
    }

    // Class binding — required for ALL reviews
    if (!targetClassId) {
      throw new Error('targetClassId is required. Reviews must be tied to a completed class.');
    }
    const cls = await this._classRepo.getById(targetClassId);
    if (!cls) {
      throw new Error('Class not found. Reviews must reference an existing class.');
    }
    if (cls.status !== 'completed') {
      throw new Error('Reviews can only be submitted for completed classes.');
    }

    // Validate reviewer is an approved participant
    const regs = await this._registrationRepo.getByClassId(targetClassId);
    const reviewerIsParticipant = regs.some(r => r.userId === userId && r.status === REGISTRATION_STATUS.APPROVED);
    const reviewerIsInstructor = cls.instructorId === userId;
    if (!reviewerIsParticipant && !reviewerIsInstructor) {
      throw new Error('You can only review a class you participated in (approved registration required).');
    }

    // Validate targetUserId if provided (must be in same class)
    if (targetUserId) {
      if (targetUserId === userId) {
        throw new Error('You cannot review yourself.');
      }
      const targetIsParticipant = regs.some(r => r.userId === targetUserId && r.status === REGISTRATION_STATUS.APPROVED);
      const targetIsInstructor = cls.instructorId === targetUserId;
      if (!targetIsParticipant && !targetIsInstructor) {
        throw new Error('The reviewed user must also be a participant in the same class.');
      }
    }

    // Prevent duplicate reviews (same reviewer, target, class)
    const existingReviews = await this._reviewRepo.getByUserId(userId);
    const duplicate = existingReviews.find(r =>
      r.targetClassId === targetClassId &&
      r.targetUserId === (targetUserId || null) &&
      !r.followUpOf
    );
    if (duplicate) {
      throw new Error('You have already submitted a review for this class and recipient.');
    }

    const reviewId = generateId();
    // Store images in dedicated repository, keep references in the review
    const imageRefs = await this._storeImages(images, reviewId);

    const review = createReview({
      id: reviewId,
      userId,
      targetUserId,
      targetClassId,
      direction,
      rating,
      text: text || '',
      images: imageRefs,
      tags: tags || [],
    });

    await this._reviewRepo.add(review);
    await this._auditService.log('review', review.id, 'created', `Review submitted: ${rating} stars`, userId);
    return review;
  }

  async submitFollowUp(originalReviewId, { text, rating, images, tags }, userId) {
    const config = getConfig();
    const MAX_TEXT_LENGTH = (config.review && config.review.maxTextLength) || DEFAULT_MAX_TEXT_LENGTH;
    const MAX_IMAGES = (config.review && config.review.maxImages) || DEFAULT_MAX_IMAGES;
    const FOLLOW_UP_WINDOW_DAYS = (config.review && config.review.followUpWindowDays) || DEFAULT_FOLLOW_UP_WINDOW_DAYS;

    const original = await this._reviewRepo.getById(originalReviewId);
    if (!original) throw new Error('Original review not found.');
    if (original.userId !== userId) throw new Error('Only the original reviewer can follow up.');

    const allReviews = await this._reviewRepo.getByUserId(userId);
    const existingFollowUp = allReviews.find(r => r.followUpOf === originalReviewId);
    if (existingFollowUp) {
      throw new Error('A follow-up review has already been submitted.');
    }

    const daysSince = (Date.now() - new Date(original.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > FOLLOW_UP_WINDOW_DAYS) {
      throw new Error(`Follow-up reviews must be submitted within ${FOLLOW_UP_WINDOW_DAYS} days.`);
    }

    if (rating !== undefined && rating !== null) {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5.');
      }
    }
    if (text && text.length > MAX_TEXT_LENGTH) {
      throw new Error(`Review text must be at most ${MAX_TEXT_LENGTH} characters.`);
    }
    if (text) {
      const modCheck = this._moderationService.checkContent(text);
      if (modCheck.flagged) {
        throw new Error(`Follow-up contains prohibited content: ${modCheck.words.join(', ')}. Please revise.`);
      }
    }
    if (images && images.length > MAX_IMAGES) {
      throw new Error(`Maximum ${MAX_IMAGES} images allowed.`);
    }
    if (images) {
      const MAX_IMAGE_SIZE_MB = (config.review && config.review.maxImageSizeMB) || DEFAULT_MAX_IMAGE_SIZE_MB;
      const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
      for (const img of images) {
        if (img.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
          throw new Error(`Each image must be under ${MAX_IMAGE_SIZE_MB}MB.`);
        }
        if (img.type && !ALLOWED_TYPES.includes(img.type)) {
          throw new Error('Only JPG and PNG images are allowed.');
        }
      }
    }

    const followUpId = generateId();
    const imageRefs = await this._storeImages(images, followUpId);

    const followUp = createReview({
      id: followUpId,
      userId,
      targetUserId: original.targetUserId,
      targetClassId: original.targetClassId,
      direction: original.direction,
      rating: rating || original.rating,
      text: text || '',
      images: imageRefs,
      tags: tags || [],
      followUpOf: originalReviewId,
    });

    await this._reviewRepo.add(followUp);
    await this._auditService.log('review', followUp.id, 'follow_up', `Follow-up to review ${originalReviewId}`, userId);
    return followUp;
  }

  async getById(reviewId) { return this._reviewRepo.getById(reviewId); }
  async getAll() { return this._reviewRepo.getAll(); }
  async getByUserId(userId) { return this._reviewRepo.getByUserId(userId); }
  async getByTargetUserId(targetUserId) { return this._reviewRepo.getByTargetUserId(targetUserId); }
  async getByDirection(direction) { return this._reviewRepo.getByDirection(direction); }
}

export default new ReviewService();
