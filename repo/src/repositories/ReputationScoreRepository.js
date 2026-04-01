import { BaseRepository } from './BaseRepository.js';

export class ReputationScoreRepository extends BaseRepository {
  constructor() {
    super('reputationScores');
  }

  async getByUserId(userId) {
    const results = await this.getByIndex('userId', userId);
    return results[0] || null;
  }
}

export default new ReputationScoreRepository();
