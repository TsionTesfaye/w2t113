/**
 * QuizService — question bank CRUD, bulk import, paper generation, auto-grading, wrong-question tracking.
 */

import questionRepository from '../repositories/QuestionRepository.js';
import quizRepository from '../repositories/QuizRepository.js';
import quizResultRepository from '../repositories/QuizResultRepository.js';
import wrongQuestionRepository from '../repositories/WrongQuestionRepository.js';
import userRepository from '../repositories/UserRepository.js';
import defaultAuditService from './AuditService.js';
import { createQuestion, QUESTION_TYPES } from '../models/Question.js';
import { createQuiz, createQuizResult } from '../models/Quiz.js';
import { createWrongQuestion } from '../models/WrongQuestion.js';
import { USER_ROLES } from '../models/User.js';
import { generateId, now } from '../utils/helpers.js';
import { validateQuestionRow } from '../utils/validators.js';

export class QuizService {
  constructor(deps = {}) {
    this._questionRepo = deps.questionRepository || questionRepository;
    this._quizRepo = deps.quizRepository || quizRepository;
    this._quizResultRepo = deps.quizResultRepository || quizResultRepository;
    this._wrongQRepo = deps.wrongQuestionRepository || wrongQuestionRepository;
    this._userRepo = deps.userRepository || userRepository;
    this._auditService = deps.auditService || defaultAuditService;
    this._inFlightSubmissions = new Set(); // duplicate submission guard
  }

  /**
   * Validate that the acting user is an Instructor or Administrator (fail-closed).
   * Rejects if user is not found, null, or has wrong role.
   */
  async _requireInstructorOrAdmin(userId) {
    if (!userId) throw new Error('userId is required for this operation.');
    const user = await this._userRepo.getById(userId);
    if (!user) {
      throw new Error('Acting user not found. Cannot perform this operation.');
    }
    if (![USER_ROLES.ADMINISTRATOR, USER_ROLES.INSTRUCTOR].includes(user.role)) {
      throw new Error('Only instructors or administrators can manage questions.');
    }
  }

  async createQuestion(data) {
    await this._requireInstructorOrAdmin(data.createdBy);
    if (!data.questionText || String(data.questionText).trim() === '') throw new Error('questionText is required.');
    const validTypes = Object.values(QUESTION_TYPES);
    if (!validTypes.includes(data.type)) throw new Error(`type must be one of: ${validTypes.join(', ')}`);
    if (data.type !== QUESTION_TYPES.SUBJECTIVE && (!data.correctAnswer || String(data.correctAnswer).toString().trim() === '')) {
      throw new Error('correctAnswer is required for non-subjective questions.');
    }
    const diff = Number(data.difficulty);
    if (!Number.isInteger(diff) || diff < 1 || diff > 5) throw new Error('difficulty must be an integer between 1 and 5.');

    const question = createQuestion({ id: generateId(), ...data });
    await this._questionRepo.add(question);
    await this._auditService.log('question', question.id, 'created', `Question created: ${question.type}`, data.createdBy || 'system');
    return question;
  }

  async updateQuestion(id, updates, userId) {
    await this._requireInstructorOrAdmin(userId);
    const question = await this._questionRepo.getById(id);
    if (!question) throw new Error('Question not found.');
    Object.assign(question, updates, { updatedAt: now() });
    await this._questionRepo.put(question);
    await this._auditService.log('question', id, 'updated', `Question updated`, userId || 'system');
    return question;
  }

  async deleteQuestion(id, userId) {
    await this._requireInstructorOrAdmin(userId);
    await this._questionRepo.delete(id);
    await this._auditService.log('question', id, 'deleted', `Question deleted`, userId || 'system');
  }
  async getQuestionById(id) { return this._questionRepo.getById(id); }
  async getAllQuestions() { return this._questionRepo.getAll(); }
  async getQuestionsByType(type) { return this._questionRepo.getByType(type); }
  async getQuestionsByDifficulty(difficulty) { return this._questionRepo.getByDifficulty(difficulty); }

  /**
   * Remove correctAnswer from a question object — safe to return to learners.
   * Prevents answer-key exposure before or during quiz attempts.
   */
  _stripAnswers(question) {
    if (!question) return question;
    const { correctAnswer, ...safe } = question;  // eslint-disable-line no-unused-vars
    return safe;
  }

  /**
   * Return all questions with answers stripped — safe for learner-facing views.
   * Instructors and admins should use getAllQuestions() instead.
   */
  async getQuestionsForLearner() {
    const all = await this._questionRepo.getAll();
    return all.map(q => this._stripAnswers(q));
  }

  /**
   * Get a single question with answers stripped — safe for learner-facing detail views.
   */
  async getQuestionByIdForLearner(id) {
    const q = await this._questionRepo.getById(id);
    return this._stripAnswers(q);
  }

  async bulkImport(rows, createdBy = 'system') {
    await this._requireInstructorOrAdmin(createdBy);
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, errors: ['Import data must be a non-empty array.'] };
    }
    const allErrors = [];
    for (let i = 0; i < rows.length; i++) {
      allErrors.push(...validateQuestionRow(rows[i], i + 1));
    }
    if (allErrors.length > 0) return { success: false, errors: allErrors };

    const questions = rows.map(row => createQuestion({
      id: generateId(), questionText: row.questionText, type: row.type,
      options: row.options || [], correctAnswer: row.correctAnswer,
      difficulty: Number(row.difficulty), tags: row.tags,
      chapter: row.chapter || '', explanation: row.explanation || '',
    }));

    await this._questionRepo.bulkAdd(questions);
    await this._auditService.log('question', 'bulk', 'bulk_import', `Imported ${questions.length} questions`, createdBy);
    return { success: true, count: questions.length };
  }

  async generatePaper(title, classId, rules, createdBy) {
    await this._requireInstructorOrAdmin(createdBy);
    if (!title || String(title).trim() === '') throw new Error('Paper title is required.');
    if (!rules || !rules.totalQuestions) throw new Error('Paper rules with totalQuestions are required.');
    const allQuestions = await this._questionRepo.getAll();
    if (allQuestions.length === 0) throw new Error('No questions available in the bank.');

    const selected = this._selectQuestions(allQuestions, rules);
    const quiz = createQuiz({ id: generateId(), title, classId, questionIds: selected.map(q => q.id), rules, createdBy });
    await this._quizRepo.add(quiz);
    await this._auditService.log('quiz', quiz.id, 'created', `Paper generated: ${title}`, createdBy);
    return quiz;
  }

  _selectQuestions(allQuestions, rules) {
    const total = rules.totalQuestions || 30;
    if (total <= 0) throw new Error('totalQuestions must be greater than 0.');
    const distribution = rules.difficultyDistribution || {};
    const chapterMin = rules.chapterConstraints || {};
    const difficultyCounts = {};
    let allocated = 0;
    const difficulties = Object.keys(distribution).map(Number).sort();
    for (const d of difficulties) { difficultyCounts[d] = Math.floor(total * distribution[d]); allocated += difficultyCounts[d]; }
    if (allocated < total && difficulties.length > 0) difficultyCounts[difficulties[difficulties.length - 1]] += total - allocated;
    const byDifficulty = {};
    for (const q of allQuestions) { if (!byDifficulty[q.difficulty]) byDifficulty[q.difficulty] = []; byDifficulty[q.difficulty].push(q); }
    for (const d of Object.keys(byDifficulty)) byDifficulty[d] = this._shuffle(byDifficulty[d]);
    const selected = [];
    const usedIds = new Set();
    for (const [chapter, minCount] of Object.entries(chapterMin)) {
      const chapterQs = allQuestions.filter(q => q.chapter === chapter && !usedIds.has(q.id));
      for (let i = 0; i < Math.min(minCount, chapterQs.length); i++) { selected.push(chapterQs[i]); usedIds.add(chapterQs[i].id); }
    }
    for (const [d, count] of Object.entries(difficultyCounts)) {
      const pool = (byDifficulty[d] || []).filter(q => !usedIds.has(q.id));
      const needed = count - selected.filter(q => q.difficulty === Number(d)).length;
      for (let i = 0; i < Math.min(needed, pool.length); i++) { selected.push(pool[i]); usedIds.add(pool[i].id); }
    }
    const result = selected.slice(0, total);
    if (result.length < total) {
      throw new Error(`Cannot generate quiz: insufficient questions. Required ${total}, found only ${result.length}. Add more questions or adjust constraints.`);
    }
    return result;
  }

  _shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  async submitAnswers(quizId, userId, answers) {
    if (!quizId) throw new Error('quizId is required.');
    if (!userId) throw new Error('userId is required.');
    if (!Array.isArray(answers)) throw new Error('answers must be an array.');
    const inFlightKey = `${quizId}:${userId}`;
    if (this._inFlightSubmissions.has(inFlightKey)) {
      throw new Error('Submission already in progress. Please wait.');
    }
    this._inFlightSubmissions.add(inFlightKey);
    try {
      const quiz = await this._quizRepo.getById(quizId);
      if (!quiz) throw new Error('Quiz not found.');
      if (!quiz.questionIds || quiz.questionIds.length === 0) throw new Error('Quiz has no questions.');

      const gradedAnswers = [];
      let objectiveCorrect = 0, objectiveTotal = 0;
      for (const ans of answers) {
        const question = await this._questionRepo.getById(ans.questionId);
        if (!question) continue;
        const graded = { questionId: ans.questionId, answer: ans.answer, autoGraded: false, isCorrect: null };
        if (question.type === QUESTION_TYPES.SUBJECTIVE) {
          graded.autoGraded = false;
        } else {
          graded.autoGraded = true;
          objectiveTotal++;
          if (question.type === QUESTION_TYPES.MULTIPLE) {
            const correct = Array.isArray(question.correctAnswer) ? question.correctAnswer.sort() : [];
            const given = Array.isArray(ans.answer) ? ans.answer.sort() : [];
            graded.isCorrect = JSON.stringify(correct) === JSON.stringify(given);
          } else {
            graded.isCorrect = String(ans.answer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();
          }
          if (graded.isCorrect) objectiveCorrect++;
          if (!graded.isCorrect) await this._addWrongQuestion(userId, question, ans.answer, quizId);
        }
        gradedAnswers.push(graded);
      }

      const result = createQuizResult({ id: generateId(), quizId, userId, answers: gradedAnswers, objectiveScore: objectiveTotal > 0 ? Math.round((objectiveCorrect / objectiveTotal) * 100) : null });
      await this._quizResultRepo.add(result);
      return result;
    } finally {
      this._inFlightSubmissions.delete(inFlightKey);
    }
  }

  async getResultsByUserId(userId) { return this._quizResultRepo.getByUserId(userId); }
  async getResultsByQuizId(quizId) { return this._quizResultRepo.getByQuizId(quizId); }
  async getAllQuizzes() { return this._quizRepo.getAll(); }
  async getQuizById(quizId) { return this._quizRepo.getById(quizId); }
  async getAllQuizResults() { return this._quizResultRepo.getAll(); }
  async getWrongQuestions(userId) { return this._wrongQRepo.getByUserId(userId); }

  async _addWrongQuestion(userId, question, userAnswer, quizId) {
    const entry = createWrongQuestion({ id: generateId(), userId, questionId: question.id, userAnswer: JSON.stringify(userAnswer), correctAnswer: JSON.stringify(question.correctAnswer), explanation: question.explanation, quizId });
    await this._wrongQRepo.add(entry);
  }
}

export default new QuizService();
