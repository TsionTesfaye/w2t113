/**
 * DashboardService — KPI computation for dashboard cards and charts.
 * Scoped: Learner sees own stats. Reviewer/Admin sees global stats.
 */

import registrationRepository from '../repositories/RegistrationRepository.js';
import quizResultRepository from '../repositories/QuizResultRepository.js';
import reportRepository from '../repositories/ReportRepository.js';
import classRepository from '../repositories/ClassRepository.js';
import userRepository from '../repositories/UserRepository.js';
import defaultAnalyticsSnapshotRepository from '../repositories/AnalyticsSnapshotRepository.js';
import { REGISTRATION_STATUS } from '../models/Registration.js';
import { REPORT_STATUS } from '../models/Report.js';
import { USER_ROLES } from '../models/User.js';
import { generateId, now } from '../utils/helpers.js';

export class DashboardService {
  constructor(deps = {}) {
    this._registrationRepo = deps.registrationRepository || registrationRepository;
    this._quizResultRepo = deps.quizResultRepository || quizResultRepository;
    this._reportRepo = deps.reportRepository || reportRepository;
    this._classRepo = deps.classRepository || classRepository;
    this._userRepo = deps.userRepository || userRepository;
    this._analyticsRepo = deps.analyticsSnapshotRepository || defaultAnalyticsSnapshotRepository;
  }

  /**
   * Get KPIs scoped by the acting user's role.
   * @param {string} [actingUserId] — if provided, scopes data by role
   */
  async getKPIs(actingUserId) {
    let isElevated = true;
    let userId = actingUserId;

    if (actingUserId) {
      const user = await this._userRepo.getById(actingUserId);
      if (user) {
        isElevated = [USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(user.role);
      }
    }

    const [registrationKPIs, quizKPIs, moderationKPIs, classKPIs] = await Promise.all([
      this._getRegistrationKPIs(isElevated ? null : userId),
      this._getQuizKPIs(isElevated ? null : userId),
      isElevated ? this._getModerationKPIs() : Promise.resolve({ openReports: null, resolvedReports: null, avgResolutionDays: null }),
      isElevated ? this._getClassKPIs() : Promise.resolve({ totalClasses: null, averageFillRate: null }),
    ]);

    const kpis = {
      ...registrationKPIs,
      ...quizKPIs,
      ...moderationKPIs,
      ...classKPIs,
    };

    // Save a daily KPI snapshot (non-fatal if write fails)
    try {
      await this._analyticsRepo.add({
        id: generateId(),
        snapshotDate: now().slice(0, 10),
        type: isElevated ? 'global' : 'user-scoped',
        scopeUserId: isElevated ? null : userId,
        data: kpis,
        createdAt: now(),
      });
    } catch (_) {
      // Duplicate snapshot for the same day is acceptable; write failures are non-fatal
    }

    return kpis;
  }

  async _getRegistrationKPIs(scopeUserId) {
    let all = await this._registrationRepo.getAll();
    if (scopeUserId) {
      all = all.filter(r => r.userId === scopeUserId);
    }
    const total = all.length;
    const approved = all.filter(r => r.status === REGISTRATION_STATUS.APPROVED).length;
    const rejected = all.filter(r => r.status === REGISTRATION_STATUS.REJECTED).length;
    const pending = all.filter(r =>
      [REGISTRATION_STATUS.SUBMITTED, REGISTRATION_STATUS.UNDER_REVIEW, REGISTRATION_STATUS.NEEDS_MORE_INFO].includes(r.status)
    ).length;

    return {
      totalRegistrations: total,
      approvedRegistrations: approved,
      rejectedRegistrations: rejected,
      pendingRegistrations: pending,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
      rejectionRate: total > 0 ? Math.round((rejected / total) * 100) : 0,
    };
  }

  async _getQuizKPIs(scopeUserId) {
    let results = await this._quizResultRepo.getAll();
    if (scopeUserId) {
      results = results.filter(r => r.userId === scopeUserId);
    }
    const scores = results.filter(r => r.totalScore !== null).map(r => r.totalScore);
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    return {
      totalQuizResults: results.length,
      averageQuizScore: avgScore,
    };
  }

  async _getModerationKPIs() {
    const allReports = await this._reportRepo.getAll();
    const open = allReports.filter(r => r.status !== REPORT_STATUS.RESOLVED);
    const resolved = allReports.filter(r => r.status === REPORT_STATUS.RESOLVED);

    // Average resolution time in days
    let avgResolutionDays = 0;
    if (resolved.length > 0) {
      const totalDays = resolved.reduce((sum, r) => {
        if (r.resolvedAt && r.createdAt) {
          return sum + (new Date(r.resolvedAt) - new Date(r.createdAt)) / (1000 * 60 * 60 * 24);
        }
        return sum;
      }, 0);
      avgResolutionDays = Math.round((totalDays / resolved.length) * 10) / 10;
    }

    return {
      openReports: open.length,
      resolvedReports: resolved.length,
      avgResolutionDays,
    };
  }

  async _getClassKPIs() {
    const classes = await this._classRepo.getAll();
    const allRegs = await this._registrationRepo.getAll();

    let totalFillRate = 0;
    let classCount = 0;

    for (const cls of classes) {
      if (!cls.capacity) continue;
      const approved = allRegs.filter(
        r => r.classId === cls.id && r.status === REGISTRATION_STATUS.APPROVED
      ).length;
      totalFillRate += approved / cls.capacity;
      classCount++;
    }

    return {
      totalClasses: classes.length,
      averageFillRate: classCount > 0 ? Math.round((totalFillRate / classCount) * 100) : 0,
    };
  }
}

export default new DashboardService();
