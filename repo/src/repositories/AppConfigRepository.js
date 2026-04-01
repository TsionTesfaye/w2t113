import { BaseRepository } from './BaseRepository.js';

export class AppConfigRepository extends BaseRepository {
  constructor() {
    super('appConfig');
  }

  async getValue(key) {
    const record = await this.getById(key);
    return record ? record.value : null;
  }

  async setValue(key, value) {
    return this.put({ key, value });
  }
}

export default new AppConfigRepository();
