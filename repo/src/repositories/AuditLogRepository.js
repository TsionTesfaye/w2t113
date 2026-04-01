import { BaseRepository } from './BaseRepository.js';

export class AuditLogRepository extends BaseRepository {
  constructor() {
    super('auditLogs');
  }

  async getByEntityId(entityId) {
    const logs = await this.getByIndex('entityId', entityId);
    return logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  async getByEntityType(entityType) {
    return this.getByIndex('entityType', entityType);
  }

  // Override delete/clear to enforce immutability
  async delete() {
    throw new Error('Audit logs are immutable and cannot be deleted.');
  }

  async clear() {
    throw new Error('Audit logs are immutable and cannot be cleared.');
  }
}

export default new AuditLogRepository();
