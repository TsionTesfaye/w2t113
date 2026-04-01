/**
 * AuditService — append-only audit log management.
 */

import auditLogRepository from '../repositories/AuditLogRepository.js';
import { createAuditLog } from '../models/AuditLog.js';
import { generateId, now } from '../utils/helpers.js';

export class AuditService {
  constructor(deps = {}) {
    this._auditLogRepo = deps.auditLogRepository || auditLogRepository;
  }

  async log(entityType, entityId, action, details, userId) {
    const entry = createAuditLog({
      id: generateId(),
      entityType,
      entityId,
      action,
      details,
      userId,
      timestamp: now(),
    });
    await this._auditLogRepo.add(entry);
    return entry;
  }

  async getTimeline(entityId) {
    return this._auditLogRepo.getByEntityId(entityId);
  }

  async getByEntityType(entityType) {
    return this._auditLogRepo.getByEntityType(entityType);
  }

  async getAll() {
    return this._auditLogRepo.getAll();
  }
}

export default new AuditService();
