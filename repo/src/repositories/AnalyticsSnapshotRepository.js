import { BaseRepository } from './BaseRepository.js';

export class AnalyticsSnapshotRepository extends BaseRepository {
  constructor() { super('analyticsSnapshots'); }
  async getByType(type) { return this.getByIndex('type', type); }
  async getBySnapshotDate(date) { return this.getByIndex('snapshotDate', date); }
}

export default new AnalyticsSnapshotRepository();
