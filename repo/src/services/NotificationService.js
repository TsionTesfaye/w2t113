/**
 * NotificationService — in-app notifications, read/unread tracking.
 */

import notificationRepository from '../repositories/NotificationRepository.js';
import { createNotification } from '../models/Notification.js';
import { generateId } from '../utils/helpers.js';
import eventBus from '../utils/EventBus.js';

export class NotificationService {
  constructor(deps = {}) {
    this._repo = deps.notificationRepository || notificationRepository;
    this._eventBus = deps.eventBus || eventBus;
  }

  /**
   * Create a notification for a user.
   */
  async notify(userId, title, message, type = 'info', link = '') {
    const notification = createNotification({
      id: generateId(),
      userId,
      title,
      message,
      type,
      link,
    });
    await this._repo.add(notification);
    this._eventBus.emit('notification:new', notification);
    return notification;
  }

  /**
   * Get all notifications for a user (newest first).
   */
  async getByUserId(userId) {
    return this._repo.getByUserId(userId);
  }

  /**
   * Get unread notifications for a user.
   */
  async getUnreadByUserId(userId) {
    return this._repo.getUnreadByUserId(userId);
  }

  /**
   * Mark a notification as read.
   */
  async markAsRead(notificationId) {
    const notif = await this._repo.getById(notificationId);
    if (!notif) return;
    notif.read = true;
    await this._repo.put(notif);
    this._eventBus.emit('notification:read', notif);
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId) {
    const unread = await this.getUnreadByUserId(userId);
    for (const notif of unread) {
      notif.read = true;
      await this._repo.put(notif);
    }
    this._eventBus.emit('notification:allRead', { userId });
  }

  /**
   * Get unread count for a user.
   */
  async getUnreadCount(userId) {
    const unread = await this.getUnreadByUserId(userId);
    return unread.length;
  }
}

export default new NotificationService();
