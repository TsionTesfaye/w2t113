/**
 * SchedulerService — periodic enforcement of moderation SLA deadlines.
 * Uses enforceDeadlines() which directly resolves overdue reports (strict 7-day SLA).
 */

import moderationService from './ModerationService.js';
import notificationService from './NotificationService.js';

export class SchedulerService {
  constructor() {
    this._intervals = [];
  }

  start() {
    this._intervals.push(
      setInterval(() => this._enforceModeration(), 30 * 60 * 1000)
    );
    this._enforceModeration();
  }

  stop() {
    for (const id of this._intervals) clearInterval(id);
    this._intervals = [];
  }

  async _enforceModeration() {
    try {
      // Run enforcement twice: escalate then resolve in the same cycle.
      // This guarantees no report survives past the SLA boundary.
      const pass1 = await moderationService.enforceDeadlines();
      const pass2 = await moderationService.enforceDeadlines();

      const allResolved = [...(pass1.autoResolved || []), ...(pass2.autoResolved || [])];
      for (const report of allResolved) {
        await notificationService.notify(
          'system', 'Report Auto-Resolved',
          `Abuse report ${report.id} auto-dismissed — 7-day SLA deadline exceeded.`,
          'warning', '#/reviews'
        );
      }
    } catch (err) {
      console.error('Scheduler: moderation enforcement failed', err);
    }
  }
}

export default new SchedulerService();
