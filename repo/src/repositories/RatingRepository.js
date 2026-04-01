import { BaseRepository } from './BaseRepository.js';

export class RatingRepository extends BaseRepository {
  constructor() {
    super('ratings');
  }

  async getByFromUserId(fromUserId) {
    return this.getByIndex('fromUserId', fromUserId);
  }

  async getByToUserId(toUserId) {
    return this.getByIndex('toUserId', toUserId);
  }
}

export default new RatingRepository();
