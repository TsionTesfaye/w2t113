/**
 * QuizPage — thin orchestrator that delegates to tab submodules.
 */

import authService from '../services/AuthService.js';
import { USER_ROLES } from '../models/User.js';
import { QuestionBankTab } from './QuestionBankTab.js';
import { QuizImportTab } from './QuizImportTab.js';
import { QuizBuilderTab } from './QuizBuilderTab.js';
import { QuizTakingTab } from './QuizTakingTab.js';
import { QuizResultsTab } from './QuizResultsTab.js';
import { WrongQuestionsTab } from './WrongQuestionsTab.js';
import { FavoriteQuestionsTab } from './FavoriteQuestionsTab.js';
import { QuizGradingTab } from './QuizGradingTab.js';

export class QuizPage {
  constructor(appShell) {
    this.appShell = appShell;
    this.activeTab = 'questions';
    this._importTab = new QuizImportTab(this);
    this._builderTab = new QuizBuilderTab(this);
    this._questionBankTab = new QuestionBankTab(this);
    this._quizTakingTab = new QuizTakingTab(this);
    this._resultsTab = new QuizResultsTab(this);
    this._wrongTab = new WrongQuestionsTab(this);
    this._favoritesTab = new FavoriteQuestionsTab(this);
    this._gradingTab = new QuizGradingTab(this);
  }

  async render() {
    this.appShell.setPageTitle('Quiz Center');
    const container = this.appShell.getContentContainer();
    const user = authService.getCurrentUser();
    const isInstructorOrAdmin = user && [USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR].includes(user.role);
    const isLearner = user && user.role === USER_ROLES.LEARNER;

    const tabs = [
      { id: 'questions', label: 'Question Bank' },
      { id: 'quizzes', label: 'Quizzes' },
    ];
    if (isLearner) {
      tabs.push({ id: 'my-results', label: 'My Results' });
      tabs.push({ id: 'wrong-notebook', label: 'Wrong Questions' });
      tabs.push({ id: 'favorites', label: 'Favorites' });
    }
    if (isInstructorOrAdmin) {
      tabs.push({ id: 'grading', label: 'Grading' });
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
      case 'questions':      await this._questionBankTab.render(tabContent); break;
      case 'quizzes':        await this._quizTakingTab.render(tabContent); break;
      case 'my-results':     await this._resultsTab.render(tabContent); break;
      case 'wrong-notebook': await this._wrongTab.render(tabContent); break;
      case 'favorites':      await this._favoritesTab.render(tabContent); break;
      case 'grading':        await this._gradingTab.render(tabContent); break;
    }
  }
}

export default QuizPage;
