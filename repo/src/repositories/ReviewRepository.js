import { BaseRepository } from './BaseRepository.js';

export class ReviewRepository extends BaseRepository {
  constructor() {
    super('reviews');
  }

  async getByUserId(userId) {
    return this.getByIndex('userId', userId);
  }

  async getByTargetUserId(targetUserId) {
    return this.getByIndex('targetUserId', targetUserId);
  }

  async getByDirection(direction) {
    return this.getByIndex('direction', direction);
  }
}

export default new ReviewRepository();
