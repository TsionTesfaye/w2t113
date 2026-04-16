/**
 * Test Helpers — InMemoryStore compatible with BaseRepository interface,
 * plus assertion utilities and factory helpers.
 */

// ============================================================
// InMemoryStore — drop-in replacement for any repository
// ============================================================

export class InMemoryStore {
  constructor() {
    this._data = new Map();
  }

  async getById(id) {
    const v = this._data.get(id);
    return v ? JSON.parse(JSON.stringify(v)) : null;
  }

  async getAll() {
    return [...this._data.values()].map(v => JSON.parse(JSON.stringify(v)));
  }

  async getByIndex(indexName, value) {
    return [...this._data.values()].filter(r => r[indexName] === value).map(v => JSON.parse(JSON.stringify(v)));
  }

  async add(record) {
    const key = record.id || record.key;
    if (this._data.has(key)) throw new Error(`Duplicate key: ${key}`);
    this._data.set(key, JSON.parse(JSON.stringify(record)));
    return key;
  }

  async put(record) {
    const key = record.id || record.key;
    this._data.set(key, JSON.parse(JSON.stringify(record)));
    return key;
  }

  async delete(id) { this._data.delete(id); }
  async clear() { this._data.clear(); }
  async count() { return this._data.size; }

  async filter(predicate) {
    return [...this._data.values()].filter(predicate).map(v => JSON.parse(JSON.stringify(v)));
  }

  async bulkAdd(records) { for (const r of records) await this.add(r); }
  async bulkPut(records) { for (const r of records) await this.put(r); }

  /** Synchronous seeding — used by buildTestServices() before any async operations. */
  seed(records) {
    for (const r of records) {
      const key = r.id || r.key;
      this._data.set(key, JSON.parse(JSON.stringify(r)));
    }
  }

  // Additional index-like methods used by specific repos
  async getByEntityId(entityId) { return this.getByIndex('entityId', entityId); }
  async getByEntityType(entityType) { return this.getByIndex('entityType', entityType); }
  async getByRegistrationId(registrationId) {
    const results = await this.getByIndex('registrationId', registrationId);
    return results.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
  async getByUserId(userId) { return this.getByIndex('userId', userId); }
  async getByUsername(username) { const r = await this.getByIndex('username', username); return r[0] || null; }
  async getByRole(role) { return this.getByIndex('role', role); }
  async getByStatus(status) { return this.getByIndex('status', status); }
  async getByClassId(classId) { return this.getByIndex('classId', classId); }
  async getByType(type) { return this.getByIndex('type', type); }
  async getByDifficulty(difficulty) { return this.getByIndex('difficulty', difficulty); }
  async getByQuizId(quizId) { return this.getByIndex('quizId', quizId); }
  async getByTargetUserId(targetUserId) { return this.getByIndex('targetUserId', targetUserId); }
  async getByDirection(direction) { return this.getByIndex('direction', direction); }
  async getByTargetId(targetId) { return this.getByIndex('targetId', targetId); }
  async getByTemplateId(templateId) { return this.getByIndex('templateId', templateId); }
  async getByRatingId(ratingId) { return this.getByIndex('ratingId', ratingId); }
  async getByFromUserId(fromUserId) { return this.getByIndex('fromUserId', fromUserId); }
  async getByToUserId(toUserId) { return this.getByIndex('toUserId', toUserId); }
  async getByThreadId(threadId) {
    const results = await this.getByIndex('threadId', threadId);
    return results.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
  async getByAuthorId(authorId) { return this.getByIndex('authorId', authorId); }
  async getActive() { return this.getByIndex('active', true); }
  async getByItemType(itemType) { return this.getByIndex('itemType', itemType); }
  async getByUserAndType(userId, itemType) {
    const all = await this.getByUserId(userId);
    return all.filter(r => r.itemType === itemType);
  }

  async getUnreadByUserId(userId) {
    const all = await this.getByUserId(userId);
    return all.filter(r => !r.read);
  }
}

// ============================================================
// Assertion helpers
// ============================================================

let _passCount = 0;
let _failCount = 0;
let _currentSuite = '';
const _failures = [];

export async function describe(name, fn) {
  _currentSuite = name;
  console.log(`\n  ${name}`);
  await fn();
}

export async function it(name, fn) {
  try {
    await fn();
    _passCount++;
    console.log(`    ✓ ${name}`);
  } catch (err) {
    _failCount++;
    _failures.push({ suite: _currentSuite, test: name, error: err.message });
    console.log(`    ✗ ${name}`);
    console.log(`      Error: ${err.message}`);
  }
}

export function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new Error(message);
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export async function assertThrowsAsync(fn, expectedMessage) {
  let threw = false, error = null;
  try { await fn(); } catch (e) { threw = true; error = e; }
  if (!threw) throw new Error(`Expected function to throw${expectedMessage ? ` "${expectedMessage}"` : ''}`);
  if (expectedMessage && !error.message.includes(expectedMessage)) {
    throw new Error(`Expected error containing "${expectedMessage}", got "${error.message}"`);
  }
}

export function printSummary() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ${_passCount} passing, ${_failCount} failing`);
  if (_failures.length > 0) {
    console.log('\n  Failures:');
    _failures.forEach((f, i) => console.log(`    ${i + 1}) ${f.suite} > ${f.test}\n       ${f.error}`));
  }
  console.log(`${'='.repeat(50)}\n`);
  return { passed: _passCount, failed: _failCount, failures: _failures };
}

export function resetCounters() { _passCount = 0; _failCount = 0; _failures.length = 0; }

// ============================================================
// Factory: creates real service instances backed by InMemoryStores
// ============================================================

import { AuditService } from './src/services/AuditService.js';
import { RegistrationService } from './src/services/RegistrationService.js';
import { ReviewService } from './src/services/ReviewService.js';
import { QuizService } from './src/services/QuizService.js';
import { RatingService } from './src/services/RatingService.js';
import { ModerationService } from './src/services/ModerationService.js';
import { QAService } from './src/services/QAService.js';
import { ContractService } from './src/services/ContractService.js';
import { CryptoService } from './src/services/CryptoService.js';
import { ReputationService } from './src/services/ReputationService.js';
import { GradingService } from './src/services/GradingService.js';

/**
 * Build a full set of real services wired to in-memory repositories.
 * Every service instance is the REAL class from src/services, not a mock.
 */
export function buildTestServices() {
  const repos = {
    auditLogRepository: new InMemoryStore(),
    registrationRepository: new InMemoryStore(),
    registrationEventRepository: new InMemoryStore(),
    classRepository: new InMemoryStore(),
    userRepository: new InMemoryStore(),
    reviewRepository: new InMemoryStore(),
    questionRepository: new InMemoryStore(),
    quizRepository: new InMemoryStore(),
    quizResultRepository: new InMemoryStore(),
    wrongQuestionRepository: new InMemoryStore(),
    ratingRepository: new InMemoryStore(),
    appealRepository: new InMemoryStore(),
    reportRepository: new InMemoryStore(),
    questionThreadRepository: new InMemoryStore(),
    answerRepository: new InMemoryStore(),
    contractRepository: new InMemoryStore(),
    templateRepository: new InMemoryStore(),
    reputationScoreRepository: new InMemoryStore(),
    imageRepository: new InMemoryStore(),
    documentRepository: new InMemoryStore(),
    analyticsSnapshotRepository: new InMemoryStore(),
  };

  // Pre-seed common test class IDs so tests calling registrationService.create()
  // without explicit class seeding continue to work after class-existence validation.
  repos.classRepository.seed([
    makeClass({ id: 'c1' }), makeClass({ id: 'c2' }),
    makeClass({ id: 'class-1' }), makeClass({ id: 'class-abc' }),
    makeClass({ id: 'class1' }),
  ]);

  const cryptoService = new CryptoService();

  const auditService = new AuditService({ auditLogRepository: repos.auditLogRepository });

  const moderationService = new ModerationService({
    reportRepository: repos.reportRepository,
    userRepository: repos.userRepository,
    auditService,
    sensitiveWords: ['spam', 'scam', 'fake', 'fraud', 'abuse', 'harassment', 'threat', 'exploit', 'illegal', 'offensive'],
  });

  const reputationService = new ReputationService({
    reputationScoreRepository: repos.reputationScoreRepository,
    registrationRepository: repos.registrationRepository,
    auditService,
  });

  const registrationService = new RegistrationService({
    registrationRepository: repos.registrationRepository,
    registrationEventRepository: repos.registrationEventRepository,
    classRepository: repos.classRepository,
    userRepository: repos.userRepository,
    auditService,
    reputationService,
  });

  const reviewService = new ReviewService({
    reviewRepository: repos.reviewRepository,
    imageRepository: repos.imageRepository,
    classRepository: repos.classRepository,
    registrationRepository: repos.registrationRepository,
    auditService,
    moderationService,
  });

  const quizService = new QuizService({
    questionRepository: repos.questionRepository,
    quizRepository: repos.quizRepository,
    quizResultRepository: repos.quizResultRepository,
    wrongQuestionRepository: repos.wrongQuestionRepository,
    userRepository: repos.userRepository,
    auditService,
  });

  const ratingService = new RatingService({
    ratingRepository: repos.ratingRepository,
    appealRepository: repos.appealRepository,
    userRepository: repos.userRepository,
    registrationRepository: repos.registrationRepository,
    classRepository: repos.classRepository,
    auditService,
  });

  const qaService = new QAService({
    questionThreadRepository: repos.questionThreadRepository,
    answerRepository: repos.answerRepository,
    auditService,
    moderationService,
  });

  const gradingService = new GradingService({
    quizResultRepository: repos.quizResultRepository,
    userRepository: repos.userRepository,
    auditService,
  });

  const contractService = new ContractService({
    contractRepository: repos.contractRepository,
    templateRepository: repos.templateRepository,
    userRepository: repos.userRepository,
    documentRepository: repos.documentRepository,
    auditService,
    cryptoService,
  });

  return {
    repos,
    auditService,
    registrationService,
    reviewService,
    quizService,
    ratingService,
    moderationService,
    qaService,
    contractService,
    cryptoService,
    reputationService,
    gradingService,
  };
}

// ============================================================
// Data factories for seeding test repos
// ============================================================

export function makeUser(overrides = {}) {
  return {
    id: overrides.id || `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    username: overrides.username || `user_${Math.random().toString(36).slice(2, 8)}`,
    passwordHash: overrides.passwordHash || 'fakehash:fakesalt',
    role: overrides.role || 'Learner',
    displayName: overrides.displayName || 'Test User',
    email: '', lockoutUntil: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

/**
 * Set up a completed class with approved participants for rating tests.
 * Returns { classId, participantIds }.
 */
export async function seedCompletedClassWithParticipants(repos, classId, participantUserIds) {
  await repos.classRepository.add(makeClass({ id: classId, status: 'completed' }));
  for (const userId of participantUserIds) {
    await repos.registrationRepository.add({
      id: `reg-${classId}-${userId}`, userId, classId,
      status: 'Approved',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  }
}

export function makeCompletedClass(overrides = {}) {
  return makeClass({ ...overrides, status: 'completed' });
}

export function makeClass(overrides = {}) {
  return {
    id: overrides.id || `class-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: overrides.title || 'Test Class', description: '',
    instructorId: overrides.instructorId || '', capacity: overrides.capacity || 30,
    startDate: '2026-05-01', endDate: '2026-07-01', status: overrides.status || 'active',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}
