import { BaseRepository } from './BaseRepository.js';

export class TemplateRepository extends BaseRepository {
  constructor() {
    super('templates');
  }

  /**
   * Returns all active templates.
   * NEVER calls getByIndex with a boolean — uses getAll() + filter() to avoid
   * "DataError: The parameter is not a valid key" (booleans are not IDB key types).
   */
  async getActive() {
    try {
      const all = await this.getAll();
      return all.filter(t => t.active === true);
    } catch (err) {
      console.warn('TemplateRepository.getActive fallback:', err);
      return [];
    }
  }
}

export default new TemplateRepository();
