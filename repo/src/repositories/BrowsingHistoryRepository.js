import { BaseRepository } from './BaseRepository.js';

export class BrowsingHistoryRepository extends BaseRepository {
  constructor() {
    super('browsingHistory');
  }

  async getByUserId(userId) {
    const entries = await this.getByIndex('userId', userId);
    return entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
}

export default new BrowsingHistoryRepository();
