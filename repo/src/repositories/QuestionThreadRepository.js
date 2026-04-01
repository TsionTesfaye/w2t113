import { BaseRepository } from './BaseRepository.js';

export class QuestionThreadRepository extends BaseRepository {
  constructor() {
    super('questionThreads');
  }

  async getByAuthorId(authorId) {
    return this.getByIndex('authorId', authorId);
  }
}

export default new QuestionThreadRepository();
