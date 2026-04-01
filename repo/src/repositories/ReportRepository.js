import { BaseRepository } from './BaseRepository.js';

export class ReportRepository extends BaseRepository {
  constructor() {
    super('reports');
  }

  async getByStatus(status) {
    return this.getByIndex('status', status);
  }

  async getByTargetId(targetId) {
    return this.getByIndex('targetId', targetId);
  }
}

export default new ReportRepository();
