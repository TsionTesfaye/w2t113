/**
 * QAService — question threads, answers, moderation integration.
 */

import questionThreadRepository from '../repositories/QuestionThreadRepository.js';
import answerRepository from '../repositories/AnswerRepository.js';
import defaultAuditService from './AuditService.js';
import defaultModerationService from './ModerationService.js';
import { createQuestionThread, createAnswer } from '../models/QA.js';
import { generateId } from '../utils/helpers.js';

export class QAService {
  constructor(deps = {}) {
    this._threadRepo = deps.questionThreadRepository || questionThreadRepository;
    this._answerRepo = deps.answerRepository || answerRepository;
    this._auditService = deps.auditService || defaultAuditService;
    this._moderationService = deps.moderationService || defaultModerationService;
  }

  async createThread(authorId, title, content, classId = null) {
    if (!authorId) throw new Error('authorId is required.');
    if (!title || String(title).trim() === '') throw new Error('Thread title is required.');
    if (!content || String(content).trim() === '') throw new Error('Thread content is required.');
    const titleCheck = this._moderationService.checkContent(title);
    if (titleCheck.flagged) throw new Error(`Thread title contains prohibited content: ${titleCheck.words.join(', ')}.`);
    const contentCheck = this._moderationService.checkContent(content);
    if (contentCheck.flagged) throw new Error(`Thread content contains prohibited content: ${contentCheck.words.join(', ')}.`);
    const thread = createQuestionThread({ id: generateId(), authorId, title, content, classId });
    await this._threadRepo.add(thread);
    await this._auditService.log('questionThread', thread.id, 'created', `Thread: ${title}`, authorId);
    return thread;
  }

  async submitAnswer(threadId, authorId, content) {
    if (!threadId) throw new Error('threadId is required.');
    if (!authorId) throw new Error('authorId is required.');
    if (!content || String(content).trim() === '') throw new Error('Answer content is required.');
    const modCheck = this._moderationService.checkContent(content);
    if (modCheck.flagged) throw new Error(`Answer contains prohibited content: ${modCheck.words.join(', ')}.`);
    const thread = await this._threadRepo.getById(threadId);
    if (!thread) throw new Error('Thread not found.');
    const answer = createAnswer({ id: generateId(), threadId, authorId, content });
    await this._answerRepo.add(answer);
    await this._auditService.log('answer', answer.id, 'created', `Answer on thread ${threadId}`, authorId);
    return answer;
  }

  async getAllThreads() { return this._threadRepo.getAll(); }
  async getThreadById(threadId) { return this._threadRepo.getById(threadId); }
  async getThreadsByAuthor(authorId) { return this._threadRepo.getByAuthorId(authorId); }
  async getAnswersByThreadId(threadId) { return this._answerRepo.getByThreadId(threadId); }
  async getAnswerById(answerId) { return this._answerRepo.getById(answerId); }
}

export default new QAService();
