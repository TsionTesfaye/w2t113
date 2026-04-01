/**
 * ModerationService — sensitive-word filtering, abuse reports, resolution tracking.
 */

import reportRepository from '../repositories/ReportRepository.js';
import userRepository from '../repositories/UserRepository.js';
import defaultAuditService from './AuditService.js';
import { createReport, REPORT_STATUS, REPORT_OUTCOMES } from '../models/Report.js';
import { USER_ROLES } from '../models/User.js';
import { generateId, now } from '../utils/helpers.js';
import { getConfig } from '../config/appConfig.js';

// Resolution deadline is loaded from config; this is only a fallback default
const DEFAULT_RESOLUTION_DEADLINE_DAYS = 7;

const FALLBACK_WORDS = ['spam', 'scam', 'fake', 'fraud', 'abuse', 'harassment', 'threat', 'exploit', 'illegal', 'offensive'];

let sensitiveWords = [];

export class ModerationService {
  constructor(deps = {}) {
    this._reportRepo = deps.reportRepository || reportRepository;
    this._userRepo = deps.userRepository || userRepository;
    this._auditService = deps.auditService || defaultAuditService;
    if (deps.sensitiveWords) {
      sensitiveWords = deps.sensitiveWords;
    }
  }

  async loadSensitiveWords() {
    // Primary source of truth: src/config/sensitiveWords.json loaded via JSON module import.
    // Falls back to FALLBACK_WORDS on older runtimes — values are identical.
    try {
      const { default: wordsJson } = await import('../config/sensitiveWords.json', { with: { type: 'json' } });
      sensitiveWords = (wordsJson.words || []).map(w => w.toLowerCase());
    } catch (_) {
      sensitiveWords = FALLBACK_WORDS.slice();
    }
  }

  checkContent(text) {
    if (!text) return { flagged: false, words: [] };
    const lower = text.toLowerCase();
    const found = sensitiveWords.filter(w => lower.includes(w));
    return { flagged: found.length > 0, words: found };
  }

  async submitReport(reporterId, targetId, targetType, reason) {
    if (!reporterId) throw new Error('reporterId is required.');
    if (!targetId) throw new Error('targetId is required.');
    if (!targetType) throw new Error('targetType is required.');

    // Risk-flag: auto-flag if reason contains sensitive words
    const riskCheck = this.checkContent(reason || '');
    const report = createReport({
      id: generateId(), reporterId, targetId, targetType, reason,
      riskFlag: riskCheck.flagged,
    });
    await this._reportRepo.add(report);
    await this._auditService.log('report', report.id, 'created',
      `Abuse report filed against ${targetType}:${targetId}${riskCheck.flagged ? ' [RISK-FLAGGED]' : ''}`, reporterId);
    return report;
  }

  async resolveReport(reportId, outcome, resolvedBy) {
    if (!reportId) throw new Error('reportId is required.');
    if (!resolvedBy) throw new Error('resolvedBy is required.');

    // RBAC: only reviewers and admins can resolve reports (fail-closed)
    const actingUser = await this._userRepo.getById(resolvedBy);
    if (!actingUser) {
      throw new Error('Acting user not found. Cannot resolve report.');
    }
    if (![USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(actingUser.role)) {
      throw new Error('Only administrators or staff reviewers can resolve reports.');
    }

    const report = await this._reportRepo.getById(reportId);
    if (!report) throw new Error('Report not found.');
    if (report.status === REPORT_STATUS.RESOLVED) throw new Error('Report has already been resolved.');
    const validOutcomes = Object.values(REPORT_OUTCOMES);
    if (!validOutcomes.includes(outcome)) throw new Error(`Outcome must be one of: ${validOutcomes.join(', ')}`);
    report.status = REPORT_STATUS.RESOLVED;
    report.resolution = outcome;
    report.resolvedBy = resolvedBy;
    report.resolvedAt = now();
    await this._reportRepo.put(report);
    await this._auditService.log('report', report.id, 'resolved', `Report resolved: ${outcome}`, resolvedBy);
    return report;
  }

  async getOpenReports() {
    const open = await this._reportRepo.getByStatus(REPORT_STATUS.OPEN);
    const underReview = await this._reportRepo.getByStatus(REPORT_STATUS.UNDER_REVIEW);
    const escalated = await this._reportRepo.getByStatus(REPORT_STATUS.ESCALATED);
    return [...open, ...underReview, ...escalated];
  }

  async getOverdueReports() {
    const open = await this.getOpenReports();
    const config = getConfig();
    const deadlineDays = (config.moderation && config.moderation.resolutionDeadlineDays) || DEFAULT_RESOLUTION_DEADLINE_DAYS;
    const cutoff = Date.now() - deadlineDays * 24 * 60 * 60 * 1000;
    return open.filter(r => new Date(r.createdAt).getTime() < cutoff);
  }

  /**
   * Enforce moderation SLA. Called by the scheduler.
   * Stage 1: open/under_review past deadline → escalated
   * Stage 2: escalated past deadline → force-resolved with valid outcome (dismissed)
   * The scheduler calls this repeatedly, guaranteeing terminal resolution.
   */
  async enforceDeadlines() {
    const overdue = await this.getOverdueReports();
    const escalated = [];
    const autoResolved = [];

    for (const report of overdue) {
      if (report.status === REPORT_STATUS.ESCALATED) {
        report.status = REPORT_STATUS.RESOLVED;
        report.resolution = REPORT_OUTCOMES.DISMISSED;
        report.resolvedBy = 'system';
        report.resolvedAt = now();
        await this._reportRepo.put(report);
        await this._auditService.log('report', report.id, 'auto_resolved',
          'Report auto-dismissed by system — SLA deadline exceeded', 'system');
        autoResolved.push(report);
      } else if (report.status === REPORT_STATUS.OPEN || report.status === REPORT_STATUS.UNDER_REVIEW) {
        report.status = REPORT_STATUS.ESCALATED;
        report.escalatedAt = now();
        await this._reportRepo.put(report);
        await this._auditService.log('report', report.id, 'escalated',
          'Report escalated due to SLA breach (>7 days unresolved)', 'system');
        escalated.push(report);
      }
    }
    return { escalated, autoResolved };
  }

  /**
   * Legacy escalation method retained for backward compatibility.
   * Escalates open/under_review reports past SLA to ESCALATED status.
   */
  async escalateOverdueReports() {
    const overdue = await this.getOverdueReports();
    const escalated = [];
    for (const report of overdue) {
      if (report.status === REPORT_STATUS.OPEN || report.status === REPORT_STATUS.UNDER_REVIEW) {
        report.status = REPORT_STATUS.ESCALATED;
        report.escalatedAt = now();
        await this._reportRepo.put(report);
        await this._auditService.log('report', report.id, 'escalated',
          'Report escalated due to SLA breach (>7 days unresolved)', 'system');
        escalated.push(report);
      }
    }
    return escalated;
  }

  async getAllReports() { return this._reportRepo.getAll(); }
  async getReportById(reportId) { return this._reportRepo.getById(reportId); }
}

export default new ModerationService();
