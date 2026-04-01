import { BaseRepository } from './BaseRepository.js';

export class WrongQuestionRepository extends BaseRepository {
  constructor() {
    super('wrongQuestions');
  }

  async getByUserId(userId) {
    return this.getByIndex('userId', userId);
  }
}

export default new WrongQuestionRepository();
