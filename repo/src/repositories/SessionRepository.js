import { BaseRepository } from './BaseRepository.js';

export class SessionRepository extends BaseRepository {
  constructor() {
    super('sessions');
  }

  async getByUserId(userId) {
    const results = await this.getByIndex('userId', userId);
    return results[0] || null;
  }
}

export default new SessionRepository();
