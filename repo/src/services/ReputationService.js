/**
 * ReputationService — score calculation with 90-day rolling window,
 * threshold enforcement, and config-driven weights.
 */

import reputationScoreRepository from '../repositories/ReputationScoreRepository.js';
import registrationRepository from '../repositories/RegistrationRepository.js';
import auditService from './AuditService.js';
import { createReputationScore, REPUTATION_THRESHOLD } from '../models/ReputationScore.js';
import { REGISTRATION_STATUS } from '../models/Registration.js';
import { generateId, now } from '../utils/helpers.js';
import { getConfig } from '../config/appConfig.js';

const DEFAULT_WEIGHTS = {
  fulfillmentRate: 0.5,
  lateRate: 0.3,
  complaintRate: 0.2,
};

export class ReputationService {
  constructor(deps = {}) {
    this._reputationScoreRepo = deps.reputationScoreRepository || reputationScoreRepository;
    this._registrationRepo = deps.registrationRepository || registrationRepository;
    this._auditService = deps.auditService || auditService;
  }

  /**
   * Compute reputation from actual registration history within the configured window.
   * Uses real fulfillment, late, and complaint rates from historical data.
   */
  async computeScoreFromHistory(userId) {
    if (!userId) throw new Error('userId is required.');

    const config = getConfig();
    const windowDays = (config.reputation && config.reputation.windowDays) || 90;
    const weights = (config.reputation && config.reputation.weights) || DEFAULT_WEIGHTS;

    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // Get all registrations for user within the window (exclude future-dated)
    const allRegs = await this._registrationRepo.getByUserId(userId);
    const nowStr = new Date().toISOString();
    const windowRegs = allRegs.filter(r => r.createdAt >= cutoff && r.createdAt <= nowStr);

    if (windowRegs.length === 0) {
      // No history in window — not restricted
      return null;
    }

    const total = windowRegs.length;
    const approved = windowRegs.filter(r => r.status === REGISTRATION_STATUS.APPROVED).length;
    const rejected = windowRegs.filter(r => r.status === REGISTRATION_STATUS.REJECTED).length;
    const cancelled = windowRegs.filter(r => r.status === REGISTRATION_STATUS.CANCELLED).length;

    const fulfillmentRate = total > 0 ? approved / total : 1;
    // Late rate: cancelled after approval counts as "late" (failed to attend)
    const lateRate = total > 0 ? cancelled / total : 0;
    const complaintRate = total > 0 ? rejected / total : 0;

    return this.computeScore(userId, { fulfillmentRate, lateRate, complaintRate }, weights);
  }

  /**
   * Compute and store reputation score for a user from provided metrics.
   * @param {string} userId
   * @param {object} metrics — { fulfillmentRate: 0–1, lateRate: 0–1, complaintRate: 0–1 }
   * @param {object} [weights] — optional custom weights
   */
  async computeScore(userId, metrics, weights) {
    if (!weights) {
      const config = getConfig();
      weights = (config.reputation && config.reputation.weights) || DEFAULT_WEIGHTS;
    }
    if (!userId) throw new Error('userId is required.');
    if (!metrics) throw new Error('metrics object is required.');

    const validate01 = (v, name) => {
      const n = Number(v);
      if (isNaN(n) || n < 0 || n > 1) throw new Error(`${name} must be between 0 and 1.`);
      return n;
    };
    metrics.fulfillmentRate = validate01(metrics.fulfillmentRate, 'fulfillmentRate');
    metrics.lateRate = validate01(metrics.lateRate, 'lateRate');
    metrics.complaintRate = validate01(metrics.complaintRate, 'complaintRate');

    const score = Math.round(
      (metrics.fulfillmentRate * weights.fulfillmentRate +
        (1 - metrics.lateRate) * weights.lateRate +
        (1 - metrics.complaintRate) * weights.complaintRate) * 100
    );

    const clampedScore = Math.max(0, Math.min(100, score));

    const existing = await this.getScore(userId);

    const record = createReputationScore({
      id: existing ? existing.id : generateId(),
      userId,
      score: clampedScore,
      fulfillmentRate: metrics.fulfillmentRate,
      lateRate: metrics.lateRate,
      complaintRate: metrics.complaintRate,
    });

    await this._reputationScoreRepo.put(record);
    await this._auditService.log('reputation', userId, 'computed', `Score: ${clampedScore}`, 'system');

    return record;
  }

  /**
   * Get the current reputation score for a user.
   */
  async getScore(userId) {
    const results = await this._reputationScoreRepo.getByUserId(userId);
    if (Array.isArray(results)) return results[0] || null;
    return results;
  }

  /**
   * Check if user is below threshold and should be restricted.
   */
  async isRestricted(userId) {
    const record = await this.getScore(userId);
    if (!record) return false; // no score computed yet, not restricted
    const config = getConfig();
    const threshold = (config.reputation && config.reputation.threshold) || REPUTATION_THRESHOLD;
    return record.score < threshold;
  }

  /**
   * Get all reputation scores.
   */
  async getAllScores() {
    return this._reputationScoreRepo.getAll();
  }
}

export default new ReputationService();
