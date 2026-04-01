import { BaseRepository } from './BaseRepository.js';

export class RegistrationEventRepository extends BaseRepository {
  constructor() {
    super('registrationEvents');
  }

  async getByRegistrationId(registrationId) {
    const events = await this.getByIndex('registrationId', registrationId);
    return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
}

export default new RegistrationEventRepository();
