import { BaseRepository } from './BaseRepository.js';

export class UserRepository extends BaseRepository {
  constructor() {
    super('users');
  }

  async getByUsername(username) {
    const results = await this.getByIndex('username', username);
    return results[0] || null;
  }

  async getByRole(role) {
    return this.getByIndex('role', role);
  }
}

export default new UserRepository();
