import { BaseRepository } from './BaseRepository.js';

export class QuestionRepository extends BaseRepository {
  constructor() {
    super('questions');
  }

  async getByType(type) {
    return this.getByIndex('type', type);
  }

  async getByDifficulty(difficulty) {
    return this.getByIndex('difficulty', difficulty);
  }
}

export default new QuestionRepository();
