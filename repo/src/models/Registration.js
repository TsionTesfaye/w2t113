/**
 * Registration domain model and state machine.
 * Transitions are loaded from config at runtime; hardcoded values are fallback only.
 */

import { getConfig } from '../config/appConfig.js';

export const REGISTRATION_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  NEEDS_MORE_INFO: 'NeedsMoreInfo',
  UNDER_REVIEW: 'UnderReview',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  WAITLISTED: 'Waitlisted',
};

/**
 * Fallback state transitions (used if config not loaded yet).
 */
const FALLBACK_TRANSITIONS = {
  [REGISTRATION_STATUS.DRAFT]:           [REGISTRATION_STATUS.SUBMITTED, REGISTRATION_STATUS.CANCELLED],
  [REGISTRATION_STATUS.SUBMITTED]:       [REGISTRATION_STATUS.NEEDS_MORE_INFO, REGISTRATION_STATUS.UNDER_REVIEW, REGISTRATION_STATUS.CANCELLED, REGISTRATION_STATUS.WAITLISTED],
  [REGISTRATION_STATUS.NEEDS_MORE_INFO]: [REGISTRATION_STATUS.SUBMITTED, REGISTRATION_STATUS.CANCELLED],
  [REGISTRATION_STATUS.UNDER_REVIEW]:    [REGISTRATION_STATUS.APPROVED, REGISTRATION_STATUS.REJECTED, REGISTRATION_STATUS.NEEDS_MORE_INFO, REGISTRATION_STATUS.CANCELLED],
  [REGISTRATION_STATUS.WAITLISTED]:      [REGISTRATION_STATUS.UNDER_REVIEW, REGISTRATION_STATUS.CANCELLED],
  [REGISTRATION_STATUS.APPROVED]:        [REGISTRATION_STATUS.CANCELLED],
  [REGISTRATION_STATUS.REJECTED]:        [],
  [REGISTRATION_STATUS.CANCELLED]:       [],
};

const FALLBACK_TERMINAL = [REGISTRATION_STATUS.REJECTED, REGISTRATION_STATUS.CANCELLED];

/**
 * Get the current transitions map, preferring config values.
 */
export function getTransitions() {
  const config = getConfig();
  if (config.registration && config.registration.transitions) {
    return config.registration.transitions;
  }
  return FALLBACK_TRANSITIONS;
}

/**
 * Get terminal states from config or fallback.
 */
export function getTerminalStates() {
  const config = getConfig();
  if (config.registration && config.registration.terminalStates) {
    return config.registration.terminalStates;
  }
  return FALLBACK_TERMINAL;
}

// Legacy exports for backward compatibility with existing code
export const REGISTRATION_TRANSITIONS = FALLBACK_TRANSITIONS;
export const TERMINAL_STATES = FALLBACK_TERMINAL;

export function canTransition(fromStatus, toStatus) {
  const transitions = getTransitions();
  const allowed = transitions[fromStatus];
  return allowed ? allowed.includes(toStatus) : false;
}

export function createRegistration({ id, userId, classId, status, notes = '', createdAt, updatedAt }) {
  return {
    id,
    userId,
    classId,
    status: status || REGISTRATION_STATUS.DRAFT,
    notes,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
}

export function createRegistrationEvent({ id, registrationId, fromStatus, toStatus, comment = '', userId, timestamp }) {
  return {
    id,
    registrationId,
    fromStatus,
    toStatus,
    comment,
    userId,
    timestamp: timestamp || new Date().toISOString(),
  };
}
