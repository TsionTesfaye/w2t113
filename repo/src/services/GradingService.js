/**
 * GradingService — subjective grading with 0–10 rubric and notes.
 * RBAC: only Instructor or Administrator can grade.
 */

import quizResultRepository from '../repositories/QuizResultRepository.js';
import userRepository from '../repositories/UserRepository.js';
import defaultAuditService from './AuditService.js';
import { USER_ROLES } from '../models/User.js';
import { now } from '../utils/helpers.js';

export class GradingService {
  constructor(deps = {}) {
    this._quizResultRepo = deps.quizResultRepository || quizResultRepository;
    this._userRepo = deps.userRepository || userRepository;
    this._auditService = deps.auditService || defaultAuditService;
  }

  /**
   * Validate that the acting user is an Instructor or Administrator (fail-closed).
   */
  async _requireGradingRole(userId) {
    if (!userId) throw new Error('gradedBy userId is required.');
    const user = await this._userRepo.getById(userId);
    if (!user) throw new Error('Acting user not found. Cannot grade.');
    if (![USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR].includes(user.role)) {
      throw new Error('Only instructors or administrators can grade submissions.');
    }
    return user;
  }

  /**
   * Grade a subjective answer within a quiz result.
   * @param {string} resultId — quiz result ID
   * @param {string} questionId — which question to grade
   * @param {number} score — integer 0–10
   * @param {string} notes — optional rubric notes
   * @param {string} gradedBy — instructor user ID
   */
  async gradeSubjective(resultId, questionId, score, notes, gradedBy) {
    await this._requireGradingRole(gradedBy);

    if (!Number.isInteger(score) || score < 0 || score > 10) {
      throw new Error('Score must be an integer between 0 and 10.');
    }

    const result = await this._quizResultRepo.getById(resultId);
    if (!result) throw new Error('Quiz result not found.');

    if (!result.subjectiveScores) result.subjectiveScores = {};

    result.subjectiveScores[questionId] = {
      score,
      notes: notes || '',
      gradedBy,
      gradedAt: now(),
    };

    // Recalculate total score
    result.totalScore = this._computeTotalScore(result);
    result.gradedBy = gradedBy;
    result.gradedAt = now();

    await this._quizResultRepo.put(result);
    await this._auditService.log('quizResult', resultId, 'graded', `Question ${questionId} scored ${score}/10`, gradedBy);

    return result;
  }

  /**
   * Get a quiz result by ID.
   */
  async getResultById(resultId) {
    return this._quizResultRepo.getById(resultId);
  }

  /**
   * Check if all subjective items in a result have been graded.
   */
  async isFullyGraded(resultId) {
    const result = await this._quizResultRepo.getById(resultId);
    if (!result) return false;

    const subjectiveAnswers = result.answers.filter(a => !a.autoGraded);
    return subjectiveAnswers.every(a => result.subjectiveScores && result.subjectiveScores[a.questionId]);
  }

  _computeTotalScore(result) {
    let totalPoints = 0;
    let totalPossible = 0;

    // Objective portion
    const objectiveAnswers = result.answers.filter(a => a.autoGraded);
    if (objectiveAnswers.length > 0) {
      const correct = objectiveAnswers.filter(a => a.isCorrect).length;
      totalPoints += correct;
      totalPossible += objectiveAnswers.length;
    }

    // Subjective portion (normalized to 0–1 scale per question)
    if (result.subjectiveScores) {
      for (const [, entry] of Object.entries(result.subjectiveScores)) {
        totalPoints += entry.score / 10;
        totalPossible += 1;
      }
    }

    return totalPossible > 0 ? Math.round((totalPoints / totalPossible) * 100) : null;
  }
}

export default new GradingService();
