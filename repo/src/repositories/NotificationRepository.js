import { BaseRepository } from './BaseRepository.js';

export class NotificationRepository extends BaseRepository {
  constructor() {
    super('notifications');
  }

  async getByUserId(userId) {
    const notifs = await this.getByIndex('userId', userId);
    return notifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async getUnreadByUserId(userId) {
    const all = await this.getByUserId(userId);
    return all.filter(n => !n.read);
  }
}

export default new NotificationRepository();
