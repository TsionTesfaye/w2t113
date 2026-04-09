/**
 * ReputationTab — reputation score display and recomputation, extracted from AdminPage.
 */

import reputationService from '../services/ReputationService.js';
import DataTable from '../components/DataTable.js';
import Toast from '../components/Toast.js';
import { REPUTATION_THRESHOLD } from '../models/ReputationScore.js';
import userRepository from '../repositories/UserRepository.js';
import { escapeHtml, formatDate, maskString } from '../utils/helpers.js';

export class ReputationTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const scores = await reputationService.getAllScores();
    const users = await userRepository.getAll();
    const userMap = {};
    for (const u of users) { userMap[u.id] = u.displayName || u.username; }

    container.innerHTML = `
      <div class="mb-4">
        <p>Users with a reputation score below <strong>${REPUTATION_THRESHOLD}</strong> are restricted from creating new registrations.</p>
        <button class="btn btn-secondary btn-sm mt-4" id="btn-compute-rep">Recompute All Scores</button>
      </div>
      <div id="rep-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'userId', label: 'User', render: (s) => escapeHtml(userMap[s.userId] || maskString(s.userId, 4)) },
        { key: 'score', label: 'Score', render: (s) => {
          const color = s.score < REPUTATION_THRESHOLD ? 'var(--color-danger)' : 'var(--color-success)';
          return `<strong style="color:${color}">${s.score}</strong>`;
        }},
        { key: 'fulfillmentRate', label: 'Fulfillment', render: (s) => `${Math.round((s.fulfillmentRate || 0) * 100)}%` },
        { key: 'lateRate', label: 'Late Rate', render: (s) => `${Math.round((s.lateRate || 0) * 100)}%` },
        { key: 'complaintRate', label: 'Complaints', render: (s) => `${Math.round((s.complaintRate || 0) * 100)}%` },
        { key: 'computedAt', label: 'Computed', render: (s) => formatDate(s.computedAt) },
      ],
      data: scores,
    });
    table.render(container.querySelector('#rep-table'));

    container.querySelector('#btn-compute-rep').addEventListener('click', async () => {
      // Compute reputation for all users from actual registration history (90-day window)
      const allUsers = await userRepository.getAll();

      let computed = 0;
      for (const u of allUsers) {
        const result = await reputationService.computeScoreFromHistory(u.id);
        if (result) computed++;
      }

      Toast.success(`Computed reputation for ${computed} user(s).`);
      this._page.render();
    });
  }
}

export default ReputationTab;
