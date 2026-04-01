import { BaseRepository } from './BaseRepository.js';

export class ContractRepository extends BaseRepository {
  constructor() {
    super('contracts');
  }

  async getByTemplateId(templateId) {
    return this.getByIndex('templateId', templateId);
  }

  async getByStatus(status) {
    return this.getByIndex('status', status);
  }
}

export default new ContractRepository();
