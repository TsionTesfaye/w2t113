import { BaseRepository } from './BaseRepository.js';

export class QuizRepository extends BaseRepository {
  constructor() {
    super('quizzes');
  }

  async getByClassId(classId) {
    return this.getByIndex('classId', classId);
  }
}

export default new QuizRepository();
