import { BaseRepository } from './BaseRepository.js';

export class QuizResultRepository extends BaseRepository {
  constructor() {
    super('quizResults');
  }

  async getByQuizId(quizId) {
    return this.getByIndex('quizId', quizId);
  }

  async getByUserId(userId) {
    return this.getByIndex('userId', userId);
  }
}

export default new QuizResultRepository();
