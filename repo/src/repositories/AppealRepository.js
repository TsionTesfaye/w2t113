import { BaseRepository } from './BaseRepository.js';

export class AppealRepository extends BaseRepository {
  constructor() {
    super('appeals');
  }

  async getByRatingId(ratingId) {
    return this.getByIndex('ratingId', ratingId);
  }

  async getByStatus(status) {
    return this.getByIndex('status', status);
  }
}

export default new AppealRepository();
