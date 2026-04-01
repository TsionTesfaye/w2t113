import { BaseRepository } from './BaseRepository.js';

export class DocumentRepository extends BaseRepository {
  constructor() { super('documents'); }
  async getByContractId(contractId) { return this.getByIndex('contractId', contractId); }
  async getByType(type) { return this.getByIndex('type', type); }
}

export default new DocumentRepository();
