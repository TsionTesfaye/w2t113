/**
 * ReviewsPage — reviews, Q&A, moderation, ratings, appeals, favorites, browsing history.
 */

import reviewService from '../services/ReviewService.js';
import moderationService from '../services/ModerationService.js';
import ratingService from '../services/RatingService.js';
import qaService from '../services/QAService.js';
import favoriteService from '../services/FavoriteService.js';
import browsingHistoryService from '../services/BrowsingHistoryService.js';
import authService from '../services/AuthService.js';
import userRepository from '../repositories/UserRepository.js';
import DataTable from '../components/DataTable.js';
import Modal from '../components/Modal.js';
import Toast from '../components/Toast.js';
import { REPORT_OUTCOMES } from '../models/Report.js';
import { APPEAL_STATUS } from '../models/Rating.js';
import { USER_ROLES } from '../models/User.js';
import { escapeHtml, formatDate, maskId } from '../utils/helpers.js';
import { getEligibleCompletedClasses, buildClassOptions, processImageFiles } from './helpers/ReviewsHelpers.js';

export class ReviewsPage {
  constructor(appShell) {
    this.appShell = appShell;
    this.activeTab = 'reviews';
  }

  async render() {
    this.appShell.setPageTitle('Reviews & Q&A');
    const container = this.appShell.getContentContainer();
    const user = authService.getCurrentUser();

    const tabs = [
      { id: 'reviews', label: 'Reviews' },
      { id: 'qa', label: 'Q&A' },
      { id: 'ratings', label: 'Ratings' },
      { id: 'favorites', label: 'Favorites' },
      { id: 'history', label: 'History' },
    ];
    if (user && [USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(user.role)) {
      tabs.push({ id: 'moderation', label: 'Moderation' });
      tabs.push({ id: 'appeals', label: 'Appeals' });
    }

    container.innerHTML = `
      <div class="filters-bar">
        ${tabs.map(t => `<button class="btn ${this.activeTab === t.id ? 'btn-primary' : 'btn-secondary'} tab-btn" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      <div id="tab-content"></div>
    `;

    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.render();
      });
    });

    const tabContent = container.querySelector('#tab-content');
    switch (this.activeTab) {
      case 'reviews':    await this._renderReviews(tabContent); break;
      case 'qa':         await this._renderQA(tabContent); break;
      case 'ratings':    await this._renderRatings(tabContent); break;
      case 'favorites':  await this._renderFavorites(tabContent); break;
      case 'history':    await this._renderHistory(tabContent); break;
      case 'moderation': await this._renderModeration(tabContent); break;
      case 'appeals':    await this._renderAppeals(tabContent); break;
    }
  }

  // ===================== REVIEWS TAB =====================
  async _renderReviews(container) {
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

      // Populate counterpart users when class is selected
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
        // Include instructor if they are not the current user
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

        // Sensitive word check
        const modCheck = moderationService.checkContent(text);
        if (modCheck.flagged) {
          errorEl.textContent = `Content contains sensitive words: ${modCheck.words.join(', ')}. Please revise.`;
          return;
        }

        // Process images
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
          this.render();
        } catch (err) {
          errorEl.textContent = err.message;
        }
      });
    });
  }

  async _viewReview(review) {
    const user = authService.getCurrentUser();
    const canFollowUp = review.userId === user?.id && !review.followUpOf;

    // Track browsing
    await browsingHistoryService.record(user.id, 'review', review.id, (review.text || '').substring(0, 40));

    // Check favorite status
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

        // Sensitive word check
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
          this.render();
        } catch (err) {
          modalEl.querySelector('#fu-error').textContent = err.message;
        }
      });
    });
  }

  // ===================== Q&A TAB =====================
  async _renderQA(container) {
    const threads = await qaService.getAllThreads();
    threads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = `
      <div class="flex-between mb-4">
        <span>${threads.length} thread(s)</span>
        <button class="btn btn-primary" id="btn-new-thread">+ Ask Question</button>
      </div>
      <div id="threads-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'title', label: 'Title', render: (t) => escapeHtml(t.title) },
        { key: 'content', label: 'Content', render: (t) => escapeHtml((t.content || '').substring(0, 60)) },
        { key: 'createdAt', label: 'Date', render: (t) => formatDate(t.createdAt) },
      ],
      data: threads,
      onRowClick: (t) => this._viewThread(t),
    });
    table.render(container.querySelector('#threads-table'));

    container.querySelector('#btn-new-thread').addEventListener('click', () => this._createThread());
  }

  _createThread() {
    Modal.custom('Ask a Question', `
      <form id="thread-form">
        <div class="form-group">
          <label for="t-title">Title</label>
          <input id="t-title" class="form-control" required>
        </div>
        <div class="form-group">
          <label for="t-content">Details</label>
          <textarea id="t-content" class="form-control" rows="4" required></textarea>
        </div>
        <div id="t-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Post</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#thread-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        try {
          await qaService.createThread(
            user.id,
            modalEl.querySelector('#t-title').value,
            modalEl.querySelector('#t-content').value
          );
          Toast.success('Question posted.');
          close();
          this.render();
        } catch (err) {
          modalEl.querySelector('#t-error').textContent = err.message;
        }
      });
    });
  }

  async _viewThread(thread) {
    const user = authService.getCurrentUser();
    await browsingHistoryService.record(user.id, 'thread', thread.id, thread.title);

    const answers = await qaService.getAnswersByThreadId(thread.id);

    Modal.custom(thread.title, `
      <div class="form-group"><p>${escapeHtml(thread.content)}</p></div>
      <hr style="margin:12px 0;border:none;border-top:1px solid var(--color-border)">
      <h4 style="margin-bottom:8px">Answers (${answers.length})</h4>
      ${answers.length === 0 ? '<p style="color:var(--color-text-muted)">No answers yet.</p>' :
        answers.map(a => `
          <div style="padding:8px;margin-bottom:8px;border:1px solid var(--color-border);border-radius:var(--radius)">
            <p>${escapeHtml(a.content)}</p>
            <small style="color:var(--color-text-muted)">${formatDate(a.createdAt)}</small>
          </div>
        `).join('')}
      <hr style="margin:12px 0;border:none;border-top:1px solid var(--color-border)">
      <form id="answer-form">
        <div class="form-group">
          <label for="a-content">Your Answer</label>
          <textarea id="a-content" class="form-control" rows="3" required></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Submit Answer</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#answer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await qaService.submitAnswer(thread.id, user.id, modalEl.querySelector('#a-content').value);
          Toast.success('Answer posted.');
          close();
          this._viewThread(thread);
        } catch (err) {
          Toast.error(err.message);
        }
      });
    });
  }

  // ===================== RATINGS TAB =====================
  async _renderRatings(container) {
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
          this.render();
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
          this.render();
        } catch (err) {
          modalEl.querySelector('#ap-error').textContent = err.message;
        }
      });
    });
  }

  // ===================== FAVORITES TAB =====================
  async _renderFavorites(container) {
    const user = authService.getCurrentUser();
    const allFavs = await favoriteService.getByUserId(user.id);

    container.innerHTML = `
      <div class="mb-4"><span>${allFavs.length} favorite(s)</span></div>
      <div id="fav-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'itemType', label: 'Type', render: (f) => escapeHtml(f.itemType) },
        { key: 'itemId', label: 'Item', render: (f) => escapeHtml(maskId(f.itemId)) },
        { key: 'createdAt', label: 'Added', render: (f) => formatDate(f.createdAt) },
        { key: 'actions', label: '', render: (f) => `<button class="btn btn-sm btn-danger unfav-btn" data-id="${f.id}" data-type="${f.itemType}" data-item="${f.itemId}">Remove</button>` },
      ],
      data: allFavs,
    });
    table.render(container.querySelector('#fav-table'));

    container.querySelectorAll('.unfav-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await favoriteService.toggle(user.id, btn.dataset.type, btn.dataset.item);
        Toast.success('Removed from favorites.');
        this.render();
      });
    });
  }

  // ===================== BROWSING HISTORY TAB =====================
  async _renderHistory(container) {
    const user = authService.getCurrentUser();
    const history = await browsingHistoryService.getHistory(user.id);

    container.innerHTML = `
      <div class="flex-between mb-4">
        <span>${history.length} item(s)</span>
        ${history.length > 0 ? '<button class="btn btn-danger btn-sm" id="btn-clear-history">Clear History</button>' : ''}
      </div>
      <div id="history-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'itemType', label: 'Type', render: (h) => escapeHtml(h.itemType) },
        { key: 'title', label: 'Title', render: (h) => escapeHtml(h.title || maskId(h.itemId)) },
        { key: 'timestamp', label: 'Viewed', render: (h) => formatDate(h.timestamp) },
      ],
      data: history,
    });
    table.render(container.querySelector('#history-table'));

    container.querySelector('#btn-clear-history')?.addEventListener('click', async () => {
      const confirmed = await Modal.confirm('Clear History', 'Remove all browsing history?');
      if (!confirmed) return;
      await browsingHistoryService.clearHistory(user.id);
      Toast.success('History cleared.');
      this.render();
    });
  }

  // ===================== MODERATION TAB =====================
  async _renderModeration(container) {
    const user = authService.getCurrentUser();
    if (!user || ![USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(user.role)) {
      container.innerHTML = '<p>You do not have permission to access this section.</p>';
      return;
    }
    const reports = await moderationService.getAllReports();
    const overdue = await moderationService.getOverdueReports();
    const overdueIds = new Set(overdue.map(r => r.id));
    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = `
      <div class="mb-4"><span>${reports.length} report(s), <strong>${overdue.length} overdue</strong></span></div>
      <div id="reports-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'targetType', label: 'Type', render: (r) => escapeHtml(r.targetType) },
        { key: 'reason', label: 'Reason', render: (r) => escapeHtml((r.reason || '').substring(0, 50)) },
        { key: 'status', label: 'Status', render: (r) => {
          const isOverdue = overdueIds.has(r.id);
          const badgeClass = r.status === 'resolved' ? 'badge-approved' : r.status === 'escalated' ? 'badge-rejected' : isOverdue ? 'badge-rejected' : 'badge-submitted';
          const suffix = r.status === 'escalated' ? ' (ESCALATED)' : isOverdue ? ' (OVERDUE)' : '';
          return `<span class="badge ${badgeClass}">${escapeHtml(r.status)}${suffix}</span>`;
        }},
        { key: 'resolution', label: 'Outcome', render: (r) => escapeHtml(r.resolution || '-') },
        { key: 'createdAt', label: 'Filed', render: (r) => formatDate(r.createdAt) },
      ],
      data: reports,
      onRowClick: (r) => this._resolveReport(r),
    });
    table.render(container.querySelector('#reports-table'));
  }

  _resolveReport(report) {
    if (report.status === 'resolved') {
      Modal.alert('Report Resolved', `Outcome: ${report.resolution}\nResolved: ${formatDate(report.resolvedAt)}`);
      return;
    }

    const outcomeOptions = Object.values(REPORT_OUTCOMES).map(o => `<option value="${o}">${o}</option>`).join('');

    Modal.custom('Resolve Report', `
      <div class="form-group"><label>Target</label><p>${escapeHtml(report.targetType)}: ${escapeHtml(maskId(report.targetId))}</p></div>
      <div class="form-group"><label>Reason</label><p>${escapeHtml(report.reason || '')}</p></div>
      <div class="form-group"><label>Filed</label><p>${formatDate(report.createdAt)}</p></div>
      <form id="resolve-form">
        <div class="form-group">
          <label for="rr-outcome">Outcome</label>
          <select id="rr-outcome" class="form-control" required>${outcomeOptions}</select>
        </div>
        <div id="rr-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Resolve</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#resolve-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        try {
          await moderationService.resolveReport(report.id, modalEl.querySelector('#rr-outcome').value, user.id);
          Toast.success('Report resolved.');
          close();
          this.render();
        } catch (err) {
          modalEl.querySelector('#rr-error').textContent = err.message;
        }
      });
    });
  }

  // ===================== APPEALS TAB =====================
  async _renderAppeals(container) {
    const user = authService.getCurrentUser();
    if (!user || ![USER_ROLES.ADMINISTRATOR, USER_ROLES.STAFF_REVIEWER].includes(user.role)) {
      container.innerHTML = '<p>You do not have permission to access this section.</p>';
      return;
    }
    const appeals = await ratingService.getAllAppeals();
    appeals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = `
      <div class="mb-4"><span>${appeals.length} appeal(s)</span></div>
      <div id="appeals-table"></div>
    `;

    const table = new DataTable({
      columns: [
        { key: 'ratingId', label: 'Rating', render: (a) => escapeHtml(maskId(a.ratingId)) },
        { key: 'reason', label: 'Reason', render: (a) => escapeHtml((a.reason || '').substring(0, 50)) },
        { key: 'status', label: 'Status', render: (a) => `<span class="badge ${a.status === 'pending' ? 'badge-submitted' : 'badge-approved'}">${escapeHtml(a.status)}</span>` },
        { key: 'decision', label: 'Decision', render: (a) => escapeHtml(a.decision || '-') },
        { key: 'createdAt', label: 'Filed', render: (a) => formatDate(a.createdAt) },
      ],
      data: appeals,
      onRowClick: (a) => this._resolveAppeal(a),
    });
    table.render(container.querySelector('#appeals-table'));
  }

  _resolveAppeal(appeal) {
    if (appeal.status !== APPEAL_STATUS.PENDING) {
      Modal.alert('Appeal Resolved', `Decision: ${appeal.decision}\nRationale: ${appeal.rationale}`);
      return;
    }

    Modal.custom('Resolve Appeal', `
      <div class="form-group"><label>Reason</label><p>${escapeHtml(appeal.reason || '')}</p></div>
      <form id="appeal-resolve-form">
        <div class="form-group">
          <label for="ar-decision">Decision</label>
          <select id="ar-decision" class="form-control" required>
            <option value="${APPEAL_STATUS.UPHELD}">Uphold</option>
            <option value="${APPEAL_STATUS.ADJUSTED}">Adjust</option>
            <option value="${APPEAL_STATUS.VOIDED}">Void</option>
          </select>
        </div>
        <div class="form-group">
          <label for="ar-score">Adjusted Score (if adjusting, 1–5)</label>
          <input id="ar-score" class="form-control" type="number" min="1" max="5">
        </div>
        <div class="form-group">
          <label for="ar-rationale">Rationale (required)</label>
          <textarea id="ar-rationale" class="form-control" rows="3" required></textarea>
        </div>
        <div id="ar-error" class="form-error"></div>
        <button type="submit" class="btn btn-primary mt-4">Resolve</button>
      </form>
    `, (modalEl, close) => {
      modalEl.querySelector('#appeal-resolve-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = authService.getCurrentUser();
        const decision = modalEl.querySelector('#ar-decision').value;
        const scoreVal = modalEl.querySelector('#ar-score').value;
        try {
          await ratingService.resolveAppeal(
            appeal.id,
            decision,
            modalEl.querySelector('#ar-rationale').value,
            user.id,
            decision === APPEAL_STATUS.ADJUSTED ? Number(scoreVal) : null
          );
          Toast.success('Appeal resolved.');
          close();
          this.render();
        } catch (err) {
          modalEl.querySelector('#ar-error').textContent = err.message;
        }
      });
    });
  }
}

export default ReviewsPage;
