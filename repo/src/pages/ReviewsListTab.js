/**
 * ReviewsListTab — reviews listing, creation, viewing, follow-up, and reporting.
 * Extracted from ReviewsPage.
 */

import reviewService from '../services/ReviewService.js';
import moderationService from '../services/ModerationService.js';
import favoriteService from '../services/FavoriteService.js';
import browsingHistoryService from '../services/BrowsingHistoryService.js';
import authService from '../services/AuthService.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';
import { getEligibleCompletedClasses, buildClassOptions, processImageFiles } from './helpers/ReviewsHelpers.js';
import userRepository from '../repositories/UserRepository.js';

export class ReviewsListTab {
  constructor(page) {
    this._page = page;
  }

  async render(container) {
    const reviews = await reviewService.getAll();
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = `
      <div class="flex-between mb-4">
        <span>${reviews.length} review(s)</span>
        <button class="btn btn-primary" id="btn-new-review">+ New Review</button>
      </div>
      <div id="reviews-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'rating', label: 'Rating', render: (r) => '&#9733;'.repeat(r.rating) + '&#9734;'.repeat(5 - r.rating) },
        { key: 'text', label: 'Text', render: (r) => escapeHtml((r.text || '').substring(0, 80)) + (r.text && r.text.length > 80 ? '...' : '') },
        { key: 'direction', label: 'Type', render: (r) => escapeHtml(r.direction || '') },
        { key: 'tags', label: 'Tags', render: (r) => escapeHtml(Array.isArray(r.tags) ? r.tags.join(', ') : '') },
        { key: 'followUpOf', label: 'Follow-up', render: (r) => r.followUpOf ? 'Yes' : '' },
        { key: 'createdAt', label: 'Date', render: (r) => formatDate(r.createdAt) },
      ],
      data: reviews,
      onRowClick: (r) => this._viewReview(r),
    });
    table.render(container.querySelector('#reviews-table'));

    container.querySelector('#btn-new-review').addEventListener('click', () => this._createReview());
  }

  async _createReview() {
    const user = authService.getCurrentUser();
    const classRepo = (await import('../repositories/ClassRepository.js')).default;
    const regRepo = (await import('../repositories/RegistrationRepository.js')).default;

    const eligibleClasses = await getEligibleCompletedClasses(classRepo, regRepo, user.id);
    const classOptions = buildClassOptions(eligibleClasses);

    Modal.custom('Submit Review', `
      <form id="review-form">
        <div class="form-group">
          <label for="r-class">Class (required)</label>
          <select id="r-class" class="form-control" required>
            <option value="">-- Select a completed class you attended --</option>
            ${classOptions}
          </select>
          ${eligibleClasses.length === 0 ? '<small style="color:var(--color-danger)">No eligible completed classes found.</small>' : ''}
        </div>
        <div class="form-group">
          <label for="r-target-user">Review a Specific Person (optional)</label>
          <select id="r-target-user" class="form-control">
            <option value="">-- Review the class overall --</option>
          </select>
        </div>
        <div class="form-group">
          <label for="r-rating">Rating (1–5)</label>
          <input id="r-rating" class="form-control" type="number" min="1" max="5" required>
        </div>
        <div class="form-group">
          <label for="r-text">Review Text (max 2000 chars)</label>
          <textarea id="r-text" class="form-control" rows="4" maxlength="2000"></textarea>
          <small id="r-charcount" style="color:var(--color-text-muted)">0 / 2000</small>
        </div>
        <div class="form-group">
          <label for="r-tags">Tags (comma-separated)</label>
          <input id="r-tags" class="form-control" type="text" placeholder="e.g. helpful, clear, engaging">
        </div>
        <div class="form-group">
          <label for="r-images">Images (JPG/PNG, max 6, each ≤2MB)</label>
          <input id="r-images" type="file" accept="image/jpeg,image/png" multiple>
          <small id="r-imgcount" style="color:var(--color-text-muted)">0 / 6 images</small>
        </div>
        <div id="r-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Submit</button>
      </form>
    `, (modalEl, close) => {
      const classSelect = modalEl.querySelector('#r-class');
      const targetUserSelect = modalEl.querySelector('#r-target-user');
      const textArea = modalEl.querySelector('#r-text');
      const charCount = modalEl.querySelector('#r-charcount');

      textArea.addEventListener('input', () => {
        charCount.textContent = `${textArea.value.length} / 2000`;
      });

      const imgInput = modalEl.querySelector('#r-images');
      imgInput.addEventListener('change', () => {
        modalEl.querySelector('#r-imgcount').textContent = `${imgInput.files.length} / 6 images`;
      });

      classSelect.addEventListener('change', async () => {
        const classId = classSelect.value;
        targetUserSelect.innerHTML = '<option value="">-- Review the class overall --</option>';
        if (!classId) return;

        const cls = eligibleClasses.find(c => c.id === classId);
        if (!cls) return;

        const classRegs = await regRepo.getByClassId(classId);
        const counterpartIds = new Set(
          classRegs.filter(r => r.status === 'Approved' && r.userId !== user.id).map(r => r.userId)
        );
        if (cls.instructorId && cls.instructorId !== user.id) {
          counterpartIds.add(cls.instructorId);
        }

        const allUsers = await userRepository.getAll();
        const counterparts = allUsers.filter(u => counterpartIds.has(u.id));
        counterparts.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = `${u.displayName || u.username} (${u.role})`;
          targetUserSelect.appendChild(opt);
        });
      });

      modalEl.querySelector('#review-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = modalEl.querySelector('#r-error');
        errorEl.textContent = '';

        const targetClassId = classSelect.value;
        if (!targetClassId) {
          errorEl.textContent = 'Please select a completed class.';
          return;
        }

        const targetUserId = targetUserSelect.value || undefined;
        const text = textArea.value;

        const modCheck = moderationService.checkContent(text);
        if (modCheck.flagged) {
          errorEl.textContent = `Content contains sensitive words: ${modCheck.words.join(', ')}. Please revise.`;
          return;
        }

        let images;
        try {
          images = await processImageFiles(Array.from(imgInput.files));
        } catch (err) {
          errorEl.textContent = err.message;
          return;
        }

        try {
          await reviewService.submitReview({
            userId: user.id,
            targetClassId,
            targetUserId,
            direction: targetUserId ? 'learner_to_learner' : 'learner_to_class',
            rating: Number(modalEl.querySelector('#r-rating').value),
            text,
            tags: modalEl.querySelector('#r-tags').value.split(',').map(t => t.trim()).filter(Boolean),
            images,
          });
          Toast.success('Review submitted.');
          close();
          this._page.render();
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });
    });
  }

  async _viewReview(review) {
    const user = authService.getCurrentUser();
    const canFollowUp = review.userId === user?.id && !review.followUpOf;

    await browsingHistoryService.record(user.id, 'review', review.id, (review.text || '').substring(0, 40));
    const isFav = await favoriteService.isFavorited(user.id, 'review', review.id);

    Modal.custom('Review Details', `
      <div class="form-group"><label>Rating</label><p>${'&#9733;'.repeat(review.rating)}${'&#9734;'.repeat(5 - review.rating)}</p></div>
      <div class="form-group"><label>Text</label><p>${escapeHtml(review.text || 'None')}</p></div>
      <div class="form-group"><label>Tags</label><p>${escapeHtml(Array.isArray(review.tags) ? review.tags.join(', ') : '')}</p></div>
      <div class="form-group"><label>Direction</label><p>${escapeHtml(review.direction || '')}</p></div>
      <div class="form-group"><label>Images</label><p>${review.images ? review.images.length : 0} attached</p></div>
      <div class="form-group"><label>Created</label><p>${formatDate(review.createdAt)}</p></div>
      <div class="btn-group mt-4" style="flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" id="btn-fav-review">${isFav ? 'Unfavorite' : 'Favorite'}</button>
        ${canFollowUp ? '<button class="btn btn-secondary btn-sm" id="btn-follow-up">Follow-Up</button>' : ''}
        <button class="btn btn-danger btn-sm" id="btn-report-review">Report</button>
      </div>
    `, (modalEl, close) => {
      modalEl.querySelector('#btn-fav-review').addEventListener('click', async () => {
        const result = await favoriteService.toggle(user.id, 'review', review.id);
        Toast.success(result.action === 'added' ? 'Added to favorites' : 'Removed from favorites');
        close();
      });

      modalEl.querySelector('#btn-report-review')?.addEventListener('click', async () => {
        close();
        this._reportContent(review.id, 'review');
      });

      modalEl.querySelector('#btn-follow-up')?.addEventListener('click', () => {
        close();
        this._submitFollowUp(review);
      });
    });
  }

  _reportContent(targetId, targetType) {
    Modal.custom('Report Content', `
      <form id="report-form">
        <div class="form-group">
          <label for="rep-reason">Reason for reporting</label>
          <textarea id="rep-reason" class="form-control" rows="3" required placeholder="Describe why this content should be reviewed..."></textarea>
        </div>
        <div id="rep-error" class="form-error"></div>
        <button type="submit" class="btn btn-danger mt-4">Submit Report</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#report-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        const reason = modalEl.querySelector('#rep-reason').value;
        try {
          await moderationService.submitReport(user.id, targetId, targetType, reason);
          Toast.success('Report submitted.');
          close();
        } catch (err) {
          modalEl.querySelector('#rep-error').textContent = err.message;
        }
      });
    });
  }

  _submitFollowUp(originalReview) {
    Modal.custom('Follow-Up Review', `
      <form id="followup-form">
        <p style="color:var(--color-text-secondary);margin-bottom:12px">Follow-up to review from ${formatDate(originalReview.createdAt)}. Must be within 14 days.</p>
        <div class="form-group">
          <label for="fu-rating">Rating (1–5)</label>
          <input id="fu-rating" class="form-control" type="number" min="1" max="5" required>
        </div>
        <div class="form-group">
          <label for="fu-text">Text (max 2000 chars)</label>
          <textarea id="fu-text" class="form-control" rows="4" maxlength="2000"></textarea>
        </div>
        <div id="fu-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Submit Follow-Up</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#followup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();

        const text = modalEl.querySelector('#fu-text').value;
        const modCheck = moderationService.checkContent(text);
        if (modCheck.flagged) {
          modalEl.querySelector('#fu-error').textContent = `Content contains sensitive words: ${modCheck.words.join(', ')}`;
          return;
        }

        try {
          await reviewService.submitFollowUp(originalReview.id, {
            rating: Number(modalEl.querySelector('#fu-rating').value),
            text,
          }, user.id);
          Toast.success('Follow-up submitted.');
          close();
          this._page.render();
        } catch (err) {
          modalEl.querySelector('#fu-error').textContent = err.message;
        }
      });
    });
  }
}

export default ReviewsListTab;
