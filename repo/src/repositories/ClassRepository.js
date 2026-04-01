import { BaseRepository } from './BaseRepository.js';

export class ClassRepository extends BaseRepository {
  constructor() {
    super('classes');
  }

  async getByInstructorId(instructorId) {
    return this.getByIndex('instructorId', instructorId);
  }
}

export default new ClassRepository();
