import { BaseRepository } from './BaseRepository.js';

export class ImageRepository extends BaseRepository {
  constructor() { super('images'); }
  async getByEntityId(entityId) { return this.getByIndex('entityId', entityId); }
  async getByEntityType(entityType) { return this.getByIndex('entityType', entityType); }
}

export default new ImageRepository();
