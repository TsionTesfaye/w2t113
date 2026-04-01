import { BaseRepository } from './BaseRepository.js';

export class FavoriteRepository extends BaseRepository {
  constructor() {
    super('favorites');
  }

  async getByUserId(userId) {
    return this.getByIndex('userId', userId);
  }

  async getByUserAndType(userId, itemType) {
    const all = await this.getByUserId(userId);
    return all.filter(f => f.itemType === itemType);
  }
}

export default new FavoriteRepository();
