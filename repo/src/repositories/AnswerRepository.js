import { BaseRepository } from './BaseRepository.js';

export class AnswerRepository extends BaseRepository {
  constructor() {
    super('answers');
  }

  async getByThreadId(threadId) {
    const answers = await this.getByIndex('threadId', threadId);
    return answers.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  async getByAuthorId(authorId) {
    return this.getByIndex('authorId', authorId);
  }
}

export default new AnswerRepository();
