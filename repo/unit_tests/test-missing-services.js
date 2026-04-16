/**
 * Tests for NotificationService, BrowsingHistoryService, SchedulerService.
 */

import { describe, it, assert, assertEqual } from '../test-helpers.js';
import { InMemoryStore } from '../test-helpers.js';
import { NotificationService } from '../src/services/NotificationService.js';
import { BrowsingHistoryService } from '../src/services/BrowsingHistoryService.js';
import { SchedulerService } from '../src/services/SchedulerService.js';

// Minimal EventBus for test isolation (EventBus class is not exported)
function makeBus() {
  const _listeners = {};
  return {
    emit(event, data) {
      if (!_listeners[event]) return;
      for (const cb of _listeners[event]) cb(data);
    },
    on(event, cb) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(cb);
      return () => { _listeners[event] = _listeners[event].filter(h => h !== cb); };
    },
  };
}

export async function runMissingServicesTests() {

  // ================================================================
  // NotificationService
  // ================================================================

  await describe('NotificationService: notify', async () => {
    await it('creates a notification with correct fields', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const notif = await svc.notify('u1', 'Hello', 'World', 'info', '#/link');
      assert(notif.id, 'has id');
      assertEqual(notif.userId, 'u1');
      assertEqual(notif.title, 'Hello');
      assertEqual(notif.message, 'World');
      assertEqual(notif.type, 'info');
      assertEqual(notif.read, false);
      assertEqual(notif.link, '#/link');
      assert(notif.createdAt, 'has createdAt');
    });

    await it('defaults type to info', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const notif = await svc.notify('u1', 'T', 'M');
      assertEqual(notif.type, 'info');
    });

    await it('defaults link to empty string', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const notif = await svc.notify('u1', 'T', 'M');
      assertEqual(notif.link, '');
    });

    await it('stores notification in repo', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const notif = await svc.notify('u1', 'T', 'M');
      const stored = await repo.getById(notif.id);
      assert(stored !== null, 'stored in repo');
      assertEqual(stored.userId, 'u1');
    });

    await it('emits notification:new event with the notification', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      let emitted = null;
      bus.on('notification:new', (n) => { emitted = n; });
      const notif = await svc.notify('u1', 'T', 'M');
      assert(emitted !== null, 'event emitted');
      assertEqual(emitted.id, notif.id);
    });

    await it('supports warning type notifications', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const notif = await svc.notify('u1', 'Warn', 'msg', 'warning');
      assertEqual(notif.type, 'warning');
    });

    await it('supports error type notifications', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const notif = await svc.notify('u1', 'Err', 'msg', 'error');
      assertEqual(notif.type, 'error');
    });

    await it('supports success type notifications', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const notif = await svc.notify('u1', 'OK', 'msg', 'success');
      assertEqual(notif.type, 'success');
    });
  });

  await describe('NotificationService: getByUserId', async () => {
    await it('returns all notifications for a user', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      await svc.notify('u1', 'A', 'msg');
      await svc.notify('u1', 'B', 'msg');
      await svc.notify('u2', 'C', 'msg');
      const results = await svc.getByUserId('u1');
      assertEqual(results.length, 2);
    });

    await it('returns empty array for user with no notifications', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const results = await svc.getByUserId('nobody');
      assertEqual(results.length, 0);
    });

    await it('does not return other users notifications', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      await svc.notify('u2', 'A', 'msg');
      const results = await svc.getByUserId('u1');
      assertEqual(results.length, 0);
    });
  });

  await describe('NotificationService: getUnreadByUserId', async () => {
    await it('returns only unread notifications', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const n1 = await svc.notify('u1', 'A', 'msg');
      const n2 = await svc.notify('u1', 'B', 'msg');
      await svc.markAsRead(n1.id);
      const unread = await svc.getUnreadByUserId('u1');
      assertEqual(unread.length, 1);
      assertEqual(unread[0].id, n2.id);
    });

    await it('returns all notifications when none are read', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      await svc.notify('u1', 'A', 'msg');
      await svc.notify('u1', 'B', 'msg');
      const unread = await svc.getUnreadByUserId('u1');
      assertEqual(unread.length, 2);
    });

    await it('returns empty when all are read', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const n = await svc.notify('u1', 'A', 'msg');
      await svc.markAsRead(n.id);
      const unread = await svc.getUnreadByUserId('u1');
      assertEqual(unread.length, 0);
    });
  });

  await describe('NotificationService: markAsRead', async () => {
    await it('sets read to true in repo', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const notif = await svc.notify('u1', 'T', 'M');
      assertEqual(notif.read, false);
      await svc.markAsRead(notif.id);
      const stored = await repo.getById(notif.id);
      assertEqual(stored.read, true);
    });

    await it('emits notification:read event', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const notif = await svc.notify('u1', 'T', 'M');
      let emitted = null;
      bus.on('notification:read', (n) => { emitted = n; });
      await svc.markAsRead(notif.id);
      assert(emitted !== null, 'event emitted');
      assertEqual(emitted.id, notif.id);
      assertEqual(emitted.read, true);
    });

    await it('is a no-op for non-existent notification', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      // Must not throw
      await svc.markAsRead('nonexistent-id');
    });

    await it('does not affect other notifications', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const n1 = await svc.notify('u1', 'A', 'msg');
      const n2 = await svc.notify('u1', 'B', 'msg');
      await svc.markAsRead(n1.id);
      const n2Stored = await repo.getById(n2.id);
      assertEqual(n2Stored.read, false, 'n2 still unread');
    });
  });

  await describe('NotificationService: markAllAsRead', async () => {
    await it('marks all unread for a user as read', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      await svc.notify('u1', 'A', 'msg');
      await svc.notify('u1', 'B', 'msg');
      await svc.markAllAsRead('u1');
      const unread = await svc.getUnreadByUserId('u1');
      assertEqual(unread.length, 0);
    });

    await it('emits notification:allRead event with userId', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      await svc.notify('u1', 'T', 'M');
      let emitted = null;
      bus.on('notification:allRead', (e) => { emitted = e; });
      await svc.markAllAsRead('u1');
      assert(emitted !== null, 'event emitted');
      assertEqual(emitted.userId, 'u1');
    });

    await it('does not affect other users notifications', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      await svc.notify('u1', 'A', 'msg');
      await svc.notify('u2', 'B', 'msg');
      await svc.markAllAsRead('u1');
      const u2Unread = await svc.getUnreadByUserId('u2');
      assertEqual(u2Unread.length, 1, 'u2 notification still unread');
    });

    await it('is a no-op for user with no notifications', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      // Must not throw
      await svc.markAllAsRead('nobody');
    });
  });

  await describe('NotificationService: getUnreadCount', async () => {
    await it('returns count of unread notifications', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      await svc.notify('u1', 'A', 'msg');
      await svc.notify('u1', 'B', 'msg');
      await svc.notify('u1', 'C', 'msg');
      const n1 = (await svc.getByUserId('u1'))[0];
      await svc.markAsRead(n1.id);
      const count = await svc.getUnreadCount('u1');
      assertEqual(count, 2);
    });

    await it('returns 0 for user with no notifications', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      const count = await svc.getUnreadCount('nobody');
      assertEqual(count, 0);
    });

    await it('returns 0 after all are marked read', async () => {
      const repo = new InMemoryStore();
      const bus = makeBus();
      const svc = new NotificationService({ notificationRepository: repo, eventBus: bus });
      await svc.notify('u1', 'A', 'msg');
      await svc.markAllAsRead('u1');
      const count = await svc.getUnreadCount('u1');
      assertEqual(count, 0);
    });
  });

  // ================================================================
  // BrowsingHistoryService
  // ================================================================

  await describe('BrowsingHistoryService: record', async () => {
    await it('returns entry with all required fields', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      const entry = await svc.record('u1', 'class', 'c1', 'Intro to Math');
      assert(entry.id, 'has id');
      assertEqual(entry.userId, 'u1');
      assertEqual(entry.itemType, 'class');
      assertEqual(entry.itemId, 'c1');
      assertEqual(entry.title, 'Intro to Math');
      assert(entry.timestamp, 'has timestamp');
    });

    await it('title defaults to empty string', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      const entry = await svc.record('u1', 'review', 'r1');
      assertEqual(entry.title, '');
    });

    await it('stores entry in repo', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      const entry = await svc.record('u1', 'class', 'c1');
      const stored = await repo.getById(entry.id);
      assert(stored !== null, 'stored in repo');
    });

    await it('supports different item types', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      for (const type of ['class', 'question', 'review', 'thread']) {
        const e = await svc.record('u1', type, 'item1');
        assertEqual(e.itemType, type);
      }
    });
  });

  await describe('BrowsingHistoryService: getHistory', async () => {
    await it('returns all entries for a user', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      await svc.record('u1', 'class', 'c1');
      await svc.record('u1', 'review', 'r1');
      await svc.record('u2', 'class', 'c2');
      const history = await svc.getHistory('u1');
      assertEqual(history.length, 2);
    });

    await it('returns empty array for user with no history', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      const history = await svc.getHistory('nobody');
      assertEqual(history.length, 0);
    });

    await it('does not include other users entries', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      await svc.record('u2', 'class', 'c1');
      const history = await svc.getHistory('u1');
      assertEqual(history.length, 0);
    });
  });

  await describe('BrowsingHistoryService: getHistoryByType', async () => {
    await it('filters entries by item type', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      await svc.record('u1', 'class', 'c1');
      await svc.record('u1', 'class', 'c2');
      await svc.record('u1', 'review', 'r1');
      const classes = await svc.getHistoryByType('u1', 'class');
      assertEqual(classes.length, 2);
      const reviews = await svc.getHistoryByType('u1', 'review');
      assertEqual(reviews.length, 1);
    });

    await it('returns empty array for type not in history', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      await svc.record('u1', 'class', 'c1');
      const questions = await svc.getHistoryByType('u1', 'question');
      assertEqual(questions.length, 0);
    });

    await it('returns empty array for user with no history', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      const results = await svc.getHistoryByType('nobody', 'class');
      assertEqual(results.length, 0);
    });

    await it('does not include other users entries', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      await svc.record('u2', 'class', 'c1');
      const results = await svc.getHistoryByType('u1', 'class');
      assertEqual(results.length, 0);
    });
  });

  await describe('BrowsingHistoryService: clearHistory', async () => {
    await it('removes all entries for a user', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      await svc.record('u1', 'class', 'c1');
      await svc.record('u1', 'review', 'r1');
      await svc.clearHistory('u1');
      const history = await svc.getHistory('u1');
      assertEqual(history.length, 0);
    });

    await it('does not clear other users history', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      await svc.record('u1', 'class', 'c1');
      await svc.record('u2', 'class', 'c2');
      await svc.clearHistory('u1');
      const u2History = await svc.getHistory('u2');
      assertEqual(u2History.length, 1, 'u2 history intact');
    });

    await it('is a no-op for user with no history', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      // Must not throw
      await svc.clearHistory('nobody');
      const history = await svc.getHistory('nobody');
      assertEqual(history.length, 0);
    });

    await it('clears multiple entries', async () => {
      const repo = new InMemoryStore();
      const svc = new BrowsingHistoryService({ browsingHistoryRepository: repo });
      await svc.record('u1', 'class', 'c1');
      await svc.record('u1', 'class', 'c2');
      await svc.record('u1', 'class', 'c3');
      await svc.clearHistory('u1');
      const history = await svc.getHistory('u1');
      assertEqual(history.length, 0);
    });
  });

  // ================================================================
  // SchedulerService
  // ================================================================

  await describe('SchedulerService: start / stop', async () => {
    await it('starts with no intervals', async () => {
      const svc = new SchedulerService({
        moderationService: { enforceDeadlines: async () => ({ escalated: [], autoResolved: [] }) },
        notificationService: { notify: async () => {} },
      });
      assertEqual(svc._intervals.length, 0);
    });

    await it('registers an interval on start', async () => {
      const svc = new SchedulerService({
        moderationService: { enforceDeadlines: async () => ({ escalated: [], autoResolved: [] }) },
        notificationService: { notify: async () => {} },
      });
      svc.start();
      assert(svc._intervals.length > 0, 'interval registered');
      svc.stop();
    });

    await it('clears all intervals on stop', async () => {
      const svc = new SchedulerService({
        moderationService: { enforceDeadlines: async () => ({ escalated: [], autoResolved: [] }) },
        notificationService: { notify: async () => {} },
      });
      svc.start();
      svc.stop();
      assertEqual(svc._intervals.length, 0, 'intervals cleared');
    });

    await it('stop is safe to call when not started', async () => {
      const svc = new SchedulerService({
        moderationService: { enforceDeadlines: async () => ({ escalated: [], autoResolved: [] }) },
        notificationService: { notify: async () => {} },
      });
      // Must not throw
      svc.stop();
      assertEqual(svc._intervals.length, 0);
    });
  });

  await describe('SchedulerService: _enforceModeration', async () => {
    await it('calls enforceDeadlines exactly twice per cycle', async () => {
      let callCount = 0;
      const svc = new SchedulerService({
        moderationService: {
          enforceDeadlines: async () => { callCount++; return { escalated: [], autoResolved: [] }; },
        },
        notificationService: { notify: async () => {} },
      });
      await svc._enforceModeration();
      assertEqual(callCount, 2, 'called twice per cycle');
    });

    await it('sends notification for each auto-resolved report from both passes', async () => {
      const resolved = [{ id: 'r1' }, { id: 'r2' }];
      const notifCalls = [];
      const svc = new SchedulerService({
        moderationService: {
          enforceDeadlines: async () => ({ escalated: [], autoResolved: resolved }),
        },
        notificationService: {
          notify: async (userId, title, msg, type, link) => notifCalls.push({ userId, title, type, link }),
        },
      });
      await svc._enforceModeration();
      // Both passes return 2 resolved, so 4 total notifications (2+2)
      assertEqual(notifCalls.length, 4, 'notifies for all resolved reports');
    });

    await it('uses warning type for auto-resolved notifications', async () => {
      const resolved = [{ id: 'r1' }];
      const notifCalls = [];
      const svc = new SchedulerService({
        moderationService: {
          enforceDeadlines: async () => ({ escalated: [], autoResolved: resolved }),
        },
        notificationService: {
          notify: async (userId, title, msg, type, link) => notifCalls.push({ type }),
        },
      });
      await svc._enforceModeration();
      assert(notifCalls.every(c => c.type === 'warning'), 'all notifications are warning type');
    });

    await it('notifies system user for auto-resolved reports', async () => {
      const resolved = [{ id: 'r1' }];
      const notifCalls = [];
      const svc = new SchedulerService({
        moderationService: {
          enforceDeadlines: async () => ({ escalated: [], autoResolved: resolved }),
        },
        notificationService: {
          notify: async (userId, title, msg, type, link) => notifCalls.push({ userId }),
        },
      });
      await svc._enforceModeration();
      assert(notifCalls.every(c => c.userId === 'system'), 'all sent to system user');
    });

    await it('sends no notifications when no reports auto-resolved', async () => {
      const notifCalls = [];
      const svc = new SchedulerService({
        moderationService: {
          enforceDeadlines: async () => ({ escalated: [], autoResolved: [] }),
        },
        notificationService: {
          notify: async () => notifCalls.push(true),
        },
      });
      await svc._enforceModeration();
      assertEqual(notifCalls.length, 0);
    });

    await it('handles enforceDeadlines errors gracefully', async () => {
      const svc = new SchedulerService({
        moderationService: {
          enforceDeadlines: async () => { throw new Error('DB down'); },
        },
        notificationService: { notify: async () => {} },
      });
      // Must not throw — errors are caught and logged
      await svc._enforceModeration();
    });

    await it('includes report id in notification message', async () => {
      const resolved = [{ id: 'report-abc-123' }];
      const notifCalls = [];
      const svc = new SchedulerService({
        moderationService: {
          enforceDeadlines: async () => ({ escalated: [], autoResolved: resolved }),
        },
        notificationService: {
          notify: async (userId, title, msg) => notifCalls.push({ title, msg }),
        },
      });
      await svc._enforceModeration();
      assert(notifCalls[0].msg.includes('report-abc-123'), 'message contains report id');
    });

    await it('links notification to reviews page', async () => {
      const resolved = [{ id: 'r1' }];
      const notifCalls = [];
      const svc = new SchedulerService({
        moderationService: {
          enforceDeadlines: async () => ({ escalated: [], autoResolved: resolved }),
        },
        notificationService: {
          notify: async (userId, title, msg, type, link) => notifCalls.push({ link }),
        },
      });
      await svc._enforceModeration();
      assert(notifCalls[0].link.includes('/reviews'), 'link points to reviews');
    });
  });
}
