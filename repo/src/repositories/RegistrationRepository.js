import { BaseRepository } from './BaseRepository.js';

export class RegistrationRepository extends BaseRepository {
  constructor() {
    super('registrations');
  }

  async getByUserId(userId) {
    return this.getByIndex('userId', userId);
  }

  async getByStatus(status) {
    return this.getByIndex('status', status);
  }

  async getByClassId(classId) {
    return this.getByIndex('classId', classId);
  }
}

export default new RegistrationRepository();
