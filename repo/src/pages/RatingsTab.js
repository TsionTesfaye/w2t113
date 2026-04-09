/**
 * RatingsTab — ratings listing, creation, viewing, and appeal filing.
 * Extracted from ReviewsPage.
 */

import ratingService from '../services/RatingService.js';
import authService from '../services/AuthService.js';
import userRepository from '../repositories/UserRepository.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { USER_ROLES } from '../models/User.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';
import { getEligibleCompletedClasses, buildClassOptions } from './helpers/ReviewsHelpers.js';

export class RatingsTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const ratings = await ratingService.getAllActiveRatings();
    ratings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Load user names
    const userCache = {};
    const resolveUser = async (userId) => {
      if (!userId) return 'N/A';
      if (userCache[userId]) return userCache[userId];
      const u = await userRepository.getById(userId);
      userCache[userId] = u ? (u.displayName || u.username) : maskId(userId);
      return userCache[userId];
    };
    for (const r of ratings) {
      r._fromName = await resolveUser(r.fromUserId);
      r._toName = await resolveUser(r.toUserId);
    }

    container.innerHTML = `
      <div class="flex-between mb-4">
        <span>${ratings.length} rating(s)</span>
        <button class="btn btn-primary" id="btn-new-rating">+ Submit Rating</button>
      </div>
      <div id="ratings-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'score', label: 'Score', render: (r) => `${r.score}/5` },
        { key: 'fromUserId', label: 'From', render: (r) => escapeHtml(r._fromName) },
        { key: 'toUserId', label: 'To', render: (r) => escapeHtml(r._toName) },
        { key: 'tags', label: 'Tags', render: (r) => escapeHtml(Array.isArray(r.tags) ? r.tags.join(', ') : '') },
        { key: 'createdAt', label: 'Date', render: (r) => formatDate(r.createdAt) },
      ],
      data: ratings,
      onRowClick: (r) => this._viewRating(r),
    });
    table.render(container.querySelector('#ratings-table'));

    container.querySelector('#btn-new-rating').addEventListener('click', () => this._createRating());
  }

  async _createRating() {
    const user = authService.getCurrentUser();
    const classRepo = (await import('../repositories/ClassRepository.js')).default;
    const regRepo = (await import('../repositories/RegistrationRepository.js')).default;

    const eligibleClasses = await getEligibleCompletedClasses(classRepo, regRepo, user.id);
    const classOptions = buildClassOptions(eligibleClasses);

    Modal.custom('Submit Rating', `
      <form id="rating-form">
        <div class="form-group">
          <label for="rt-class">Class (required — ratings are captured after completion)</label>
          <select id="rt-class" class="form-control" required>
            <option value="">-- Select a completed class you attended --</option>
            ${classOptions}
          </select>
          ${eligibleClasses.length === 0 ? '<small style="color:var(--color-danger)">No eligible completed classes found.</small>' : ''}
        </div>
        <div class="form-group">
          <label for="rt-to">Rate User (required)</label>
          <select id="rt-to" class="form-control" required>
            <option value="">-- Select class first --</option>
          </select>
        </div>
        <div class="form-group">
          <label for="rt-score">Score (1–5)</label>
          <input id="rt-score" class="form-control" type="number" min="1" max="5" required>
        </div>
        <div class="form-group">
          <label for="rt-tags">Tags (comma-separated)</label>
          <input id="rt-tags" class="form-control" type="text" placeholder="e.g. punctual, knowledgeable, patient">
        </div>
        <div class="form-group">
          <label for="rt-comment">Comment</label>
          <textarea id="rt-comment" class="form-control" rows="2"></textarea>
        </div>
        <div id="rt-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Submit</button>
      </form>
    `, (modalEl, close) => {
      const classSelect = modalEl.querySelector('#rt-class');
      const toSelect = modalEl.querySelector('#rt-to');

      // Populate valid counterpart users when a class is selected
      classSelect.addEventListener('change', async () => {
        const classId = classSelect.value;
        toSelect.innerHTML = '<option value="">-- Select user to rate --</option>';
        if (!classId) return;

        const cls = eligibleClasses.find(c => c.id === classId);
        if (!cls) return;

        const classRegs = await regRepo.getByClassId(classId);
        const counterpartIds = new Set(
          classRegs.filter(r => r.status === 'Approved' && r.userId !== user.id).map(r => r.userId)
        );
        if (cls.instructorId && cls.instructorId !== user.id) counterpartIds.add(cls.instructorId);

        const allUsers = await userRepository.getAll();
        allUsers.filter(u => counterpartIds.has(u.id)).forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = `${u.displayName || u.username} (${u.role})`;
          toSelect.appendChild(opt);
        });
      });

      modalEl.querySelector('#rating-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const classId = classSelect.value;
        const toUserId = toSelect.value;
        const errorEl = modalEl.querySelector('#rt-error');
        errorEl.textContent = '';

        if (!classId) { errorEl.textContent = 'Please select a completed class.'; return; }
        if (!toUserId) { errorEl.textContent = 'Please select a user to rate.'; return; }

        try {
          await ratingService.submitRating({
            fromUserId: user.id,
            toUserId,
            classId,
            score: Number(modalEl.querySelector('#rt-score').value),
            tags: modalEl.querySelector('#rt-tags').value.split(',').map(t => t.trim()).filter(Boolean),
            comment: modalEl.querySelector('#rt-comment').value,
          });
          Toast.success('Rating submitted.');
          close();
          this._page.render();
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });
    });
  }

  _viewRating(rating) {
    const user = authService.getCurrentUser();
    const canAppeal = rating.toUserId === user?.id;

    Modal.custom('Rating Details', `
      <div class="form-group"><label>Score</label><p>${rating.score}/5</p></div>
      <div class="form-group"><label>From</label><p>${escapeHtml(rating._fromName || maskId(rating.fromUserId))}</p></div>
      <div class="form-group"><label>To</label><p>${escapeHtml(rating._toName || maskId(rating.toUserId))}</p></div>
      <div class="form-group"><label>Comment</label><p>${escapeHtml(rating.comment || 'None')}</p></div>
      <div class="form-group"><label>Tags</label><p>${escapeHtml(Array.isArray(rating.tags) ? rating.tags.join(', ') : '')}</p></div>
      <div class="form-group"><label>Date</label><p>${formatDate(rating.createdAt)}</p></div>
      ${canAppeal ? '<button class="btn btn-secondary mt-4" id="btn-appeal">File Appeal</button>' : ''}
    `, (modalEl, close) => {
      modalEl.querySelector('#btn-appeal')?.addEventListener('click', () => {
        close();
        this._fileAppeal(rating);
      });
    });
  }

  _fileAppeal(rating) {
    Modal.custom('File Appeal', `
      <form id="appeal-form">
        <div class="form-group">
          <label for="ap-reason">Reason for Appeal</label>
          <textarea id="ap-reason" class="form-control" rows="3" required></textarea>
        </div>
        <div id="ap-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Submit Appeal</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#appeal-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        try {
          await ratingService.fileAppeal(rating.id, user.id, modalEl.querySelector('#ap-reason').value);
          Toast.success('Appeal filed.');
          close();
          this._page.render();
        } catch (err) {
          modalEl.querySelector('#ap-error').textContent = err.message;
        }
      });
    });
  }
}

export default RatingsTab;
