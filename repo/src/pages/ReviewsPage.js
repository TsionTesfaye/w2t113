/**
 * ReviewsPage — thin orchestrator for reviews, Q&A, ratings, favorites, history, moderation, appeals.
 */

import authService from '../services/AuthService.js';
import { USER_ROLES } from '../models/User.js';
import { ReviewsListTab } from './ReviewsListTab.js';
import { QATab } from './QATab.js';
import { RatingsTab } from './RatingsTab.js';
import { ReviewsFavoritesTab } from './ReviewsFavoritesTab.js';
import { ReviewsHistoryTab } from './ReviewsHistoryTab.js';
import { ReviewsModerationTab } from './ReviewsModerationTab.js';

export class ReviewsPage {
  constructor(appShell) {
    this.appShell = appShell;
    this.activeTab = 'reviews';
    this._listTab = new ReviewsListTab(this);
    this._qaTab = new QATab(this);
    this._ratingsTab = new RatingsTab(this);
    this._favoritesTab = new ReviewsFavoritesTab(this);
    this._historyTab = new ReviewsHistoryTab(this);
    this._moderationTab = new ReviewsModerationTab(this);
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
      case 'reviews':    await this._listTab.render(tabContent); break;
      case 'qa':         await this._qaTab.render(tabContent); break;
      case 'ratings':    await this._ratingsTab.render(tabContent); break;
      case 'favorites':  await this._favoritesTab.render(tabContent); break;
      case 'history':    await this._historyTab.render(tabContent); break;
      case 'moderation': await this._moderationTab.renderModeration(tabContent); break;
      case 'appeals':    await this._moderationTab.renderAppeals(tabContent); break;
    }
  }
}

export default ReviewsPage;
