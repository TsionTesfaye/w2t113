/**
 * RegistrationService — registration CRUD, state machine, waitlist, audit logging.
 * All business rules enforced at service level.
 */

import registrationRepository from '../repositories/RegistrationRepository.js';
import registrationEventRepository from '../repositories/RegistrationEventRepository.js';
import classRepository from '../repositories/ClassRepository.js';
import userRepository from '../repositories/UserRepository.js';
import defaultAuditService from './AuditService.js';
import { createRegistration, createRegistrationEvent, REGISTRATION_STATUS, REGISTRATION_TRANSITIONS, canTransition, TERMINAL_STATES } from '../models/Registration.js';
import { USER_ROLES } from '../models/User.js';
import { generateId, now } from '../utils/helpers.js';
import eventBus from '../utils/EventBus.js';
import { getConfig } from '../config/appConfig.js';
import defaultReputationService from './ReputationService.js';

// Transitions only reviewers/admins may perform
const REVIEWER_ONLY_TRANSITIONS = [
  REGISTRATION_STATUS.UNDER_REVIEW,
  REGISTRATION_STATUS.APPROVED,
  REGISTRATION_STATUS.REJECTED,
  REGISTRATION_STATUS.NEEDS_MORE_INFO,
  REGISTRATION_STATUS.WAITLISTED,
];

export class RegistrationService {
  constructor(deps = {}) {
    this._registrationRepo = deps.registrationRepository || registrationRepository;
    this._eventRepo = deps.registrationEventRepository || registrationEventRepository;
    this._classRepo = deps.classRepository || classRepository;
    this._userRepo = deps.userRepository || userRepository;
    this._auditService = deps.auditService || defaultAuditService;
    this._reputationService = deps.reputationService || defaultReputationService;
  }

  async create(userId, classId, notes = '') {
    if (!userId) throw new Error('userId is required to create a registration.');
    if (!classId) throw new Error('classId is required to create a registration.');

    // Validate class exists and is available for registration
    const cls = await this._classRepo.getById(classId);
    if (!cls) throw new Error('Class not found. Cannot create registration for unknown class.');
    if (cls.status === 'completed') throw new Error('Cannot register for a completed class.');
    if (cls.capacity) {
      const existing = await this._registrationRepo.getByClassId(classId);
      const approvedCount = existing.filter(r => r.status === REGISTRATION_STATUS.APPROVED).length;
      if (approvedCount >= cls.capacity) throw new Error('This class is at full capacity. No spots available.');
    }

    // Reputation enforcement at service level per original prompt:
    // "a reputation score below 60 blocks new order-taking/booking privileges
    //  and forces manual review for future registrations"
    const restricted = await this._reputationService.isRestricted(userId);

    const registration = createRegistration({
      id: generateId(),
      userId,
      classId,
      status: restricted ? REGISTRATION_STATUS.NEEDS_MORE_INFO : REGISTRATION_STATUS.DRAFT,
      notes: restricted ? (notes ? notes + ' [LOW REPUTATION - REQUIRES MANUAL REVIEW]' : '[LOW REPUTATION - REQUIRES MANUAL REVIEW]') : notes,
    });
    await this._registrationRepo.add(registration);
    const createComment = restricted ? 'Registration created — low reputation, requires manual review' : 'Registration created';
    await this._logEvent(registration.id, null, registration.status, createComment, userId);
    await this._auditService.log('registration', registration.id, 'created', `Registration created in ${registration.status}`, userId);
    eventBus.emit('registration:created', registration);
    return registration;
  }

  async transition(registrationId, newStatus, comment, userId) {
    if (!registrationId) throw new Error('registrationId is required.');
    if (!newStatus) throw new Error('newStatus is required.');
    if (!userId) throw new Error('userId is required for transition.');

    const reg = await this._registrationRepo.getById(registrationId);
    if (!reg) throw new Error('Registration not found.');

    if (!canTransition(reg.status, newStatus)) {
      throw new Error(`Cannot transition from ${reg.status} to ${newStatus}.`);
    }

    const actingUser = await this._userRepo.getById(userId);
    if (!actingUser) {
      throw new Error('Acting user not found. Cannot perform transition.');
    }

    const isReviewerOrAdmin = [USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(actingUser.role);
    const isOwner = reg.userId === userId;

    if (REVIEWER_ONLY_TRANSITIONS.includes(newStatus) && !isReviewerOrAdmin) {
      throw new Error(`Only administrators or staff reviewers can transition to ${newStatus}.`);
    }

    if (!isReviewerOrAdmin) {
      if (!isOwner) {
        throw new Error('You can only modify your own registrations.');
      }
      const selfAllowed = [REGISTRATION_STATUS.SUBMITTED, REGISTRATION_STATUS.CANCELLED];
      if (!selfAllowed.includes(newStatus)) {
        throw new Error(`You do not have permission to transition to ${newStatus}.`);
      }
    }

    if (newStatus === REGISTRATION_STATUS.REJECTED) {
      const config = getConfig();
      const minLen = (config.registration && config.registration.rejectionCommentMinLength) || 20;
      if (!comment || comment.trim().length < minLen) {
        throw new Error(`Rejection comment must be at least ${minLen} characters.`);
      }
    }

    const fromStatus = reg.status;
    reg.status = newStatus;
    reg.updatedAt = now();
    await this._registrationRepo.put(reg);

    await this._logEvent(reg.id, fromStatus, newStatus, comment || '', userId);
    await this._auditService.log('registration', reg.id, 'status_change', `${fromStatus} → ${newStatus}${comment ? ': ' + comment : ''}`, userId);

    eventBus.emit('registration:transition', { registration: reg, fromStatus, toStatus: newStatus });

    if (fromStatus === REGISTRATION_STATUS.APPROVED && newStatus === REGISTRATION_STATUS.CANCELLED) {
      await this._checkWaitlistPromotion(reg.classId, userId);
    }

    return reg;
  }

  async batchTransition(registrationIds, newStatus, comment, userId) {
    const results = [];
    for (const id of registrationIds) {
      try {
        const reg = await this.transition(id, newStatus, comment, userId);
        results.push({ id, success: true, registration: reg });
      } catch (err) {
        results.push({ id, success: false, error: err.message });
      }
    }
    return results;
  }

  async getById(registrationId) {
    return this._registrationRepo.getById(registrationId);
  }

  async getAll() {
    return this._registrationRepo.getAll();
  }

  /**
   * Get registrations scoped by the acting user's role.
   * Learner: own records only. Reviewer/Admin: all records.
   */
  async getAllScoped(actingUserId) {
    if (!actingUserId) return [];
    const user = await this._userRepo.getById(actingUserId);
    if (!user) return [];
    if ([USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(user.role)) {
      return this._registrationRepo.getAll();
    }
    return this._registrationRepo.getByUserId(actingUserId);
  }

  async getByUserId(userId) {
    return this._registrationRepo.getByUserId(userId);
  }

  async getByStatus(status) {
    return this._registrationRepo.getByStatus(status);
  }

  /**
   * Get registrations by status, scoped by the acting user's role.
   */
  async getByStatusScoped(status, actingUserId) {
    if (!actingUserId) return [];
    const user = await this._userRepo.getById(actingUserId);
    if (!user) return [];
    const all = await this._registrationRepo.getByStatus(status);
    if ([USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(user.role)) {
      return all;
    }
    return all.filter(r => r.userId === actingUserId);
  }

  async getByClassId(classId) {
    return this._registrationRepo.getByClassId(classId);
  }

  async getEvents(registrationId) {
    return this._eventRepo.getByRegistrationId(registrationId);
  }

  async getClassFillRate(classId) {
    if (!classId) return 0;
    const cls = await this._classRepo.getById(classId);
    if (!cls || !cls.capacity) return 0;

    const regs = await this._registrationRepo.getByClassId(classId);
    const approvedCount = regs.filter(r => r.status === REGISTRATION_STATUS.APPROVED).length;
    return approvedCount / cls.capacity;
  }

  async _checkWaitlistPromotion(classId, userId) {
    if (!classId) return;

    const fillRate = await this.getClassFillRate(classId);
    const config = getConfig();
    const threshold = (config.registration && config.registration.waitlistPromotionFillRate) || 0.95;
    if (fillRate >= threshold) return;

    const waitlisted = await this._registrationRepo.filter(
      r => r.classId === classId && r.status === REGISTRATION_STATUS.WAITLISTED
    );
    if (waitlisted.length === 0) return;

    waitlisted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const next = waitlisted[0];
    const fromStatus = next.status;
    next.status = REGISTRATION_STATUS.UNDER_REVIEW;
    next.updatedAt = now();
    await this._registrationRepo.put(next);

    await this._logEvent(next.id, fromStatus, REGISTRATION_STATUS.UNDER_REVIEW, 'Auto-promoted from waitlist (seat available, fill rate < 95%)', userId);
    await this._auditService.log('registration', next.id, 'status_change', `${fromStatus} → ${REGISTRATION_STATUS.UNDER_REVIEW}: Waitlist promotion`, userId);

    eventBus.emit('registration:transition', { registration: next, fromStatus, toStatus: REGISTRATION_STATUS.UNDER_REVIEW });
  }

  async _logEvent(registrationId, fromStatus, toStatus, comment, userId) {
    const event = createRegistrationEvent({
      id: generateId(),
      registrationId,
      fromStatus,
      toStatus,
      comment,
      userId,
      timestamp: now(),
    });
    await this._eventRepo.add(event);
    return event;
  }
}

export default new RegistrationService();
