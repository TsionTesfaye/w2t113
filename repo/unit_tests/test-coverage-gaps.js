/**
 * Coverage Gap Tests
 * Targets: ImportExportService, FavoriteService, validators, helpers, AuthService.
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, InMemoryStore, makeUser } from '../test-helpers.js';
import { ImportExportService } from '../src/services/ImportExportService.js';
import { FavoriteService } from '../src/services/FavoriteService.js';
import { AuthService } from '../src/services/AuthService.js';
import { CryptoService } from '../src/services/CryptoService.js';
import { AuditService } from '../src/services/AuditService.js';
import { USER_ROLES } from '../src/models/User.js';
import {
  required, minLength, maxLength, inRange, isInteger, isOneOf,
  validateField, validateObject, validateQuestionRow,
} from '../src/utils/validators.js';
import {
  generateId, now, deepClone, maskString, formatDate, debounce,
  escapeHtml, validateImageFile, maskEmail, maskId,
} from '../src/utils/helpers.js';

// ─────────────────────────────────────────────────────────────
// Shared factory helpers
// ─────────────────────────────────────────────────────────────

function makeImportExportService() {
  const userRepo = new InMemoryStore();
  const service = new ImportExportService({ userRepository: userRepo });
  return { service, userRepo };
}

function makeFavoriteService() {
  const favoriteRepo = new InMemoryStore();
  const service = new FavoriteService({ favoriteRepository: favoriteRepo });
  return { service, favoriteRepo };
}

function makeAuthService() {
  const userRepo = new InMemoryStore();
  const sessionRepo = new InMemoryStore();
  const cryptoSvc = new CryptoService();
  const auditService = new AuditService({ auditLogRepository: new InMemoryStore() });
  const auth = new AuthService({
    userRepository: userRepo,
    sessionRepository: sessionRepo,
    cryptoService: cryptoSvc,
    auditService,
  });
  // Override localStorage accessors — localStorage is unavailable in Node.js
  let _ls = {};
  auth._lsGet = (key) => _ls[key] || null;
  auth._lsSet = (key, val) => { _ls[key] = val; };
  auth._lsRemove = (key) => { delete _ls[key]; };
  auth._ls = _ls; // expose for test inspection
  return { auth, userRepo, sessionRepo, cryptoSvc, auditService };
}

async function seedAdmin(userRepo, cryptoSvc, opts = {}) {
  const username = opts.username || 'admin';
  const password = opts.password || 'AdminPass1!';
  const { hash, salt } = await cryptoSvc.hashPassword(password);
  const user = makeUser({ id: opts.id || generateId(), username, role: USER_ROLES.ADMINISTRATOR, passwordHash: `${hash}:${salt}` });
  await userRepo.add(user);
  return { user, password };
}

async function seedLearner(userRepo, cryptoSvc, opts = {}) {
  const username = opts.username || 'learner';
  const password = opts.password || 'LearnerPass1!';
  const { hash, salt } = await cryptoSvc.hashPassword(password);
  const user = makeUser({ id: opts.id || generateId(), username, role: USER_ROLES.LEARNER, passwordHash: `${hash}:${salt}` });
  await userRepo.add(user);
  return { user, password };
}

// ─────────────────────────────────────────────────────────────
// ImportExportService
// ─────────────────────────────────────────────────────────────

export async function runCoverageGapTests() {
  // ── ImportExportService._requireAdmin ──
  await describe('ImportExportService — _requireAdmin', async () => {
    await it('throws when no userId given', async () => {
      const { service } = makeImportExportService();
      await assertThrowsAsync(
        () => service._requireAdmin(null),
        'userId is required',
      );
    });

    await it('throws when acting user not found', async () => {
      const { service } = makeImportExportService();
      await assertThrowsAsync(
        () => service._requireAdmin('nonexistent-id'),
        'Acting user not found',
      );
    });

    await it('throws when acting user is not Administrator', async () => {
      const { service, userRepo } = makeImportExportService();
      const learner = makeUser({ role: USER_ROLES.LEARNER });
      await userRepo.add(learner);
      await assertThrowsAsync(
        () => service._requireAdmin(learner.id),
        'Only administrators',
      );
    });

    await it('passes for an Administrator', async () => {
      const { service, userRepo } = makeImportExportService();
      const admin = makeUser({ role: USER_ROLES.ADMINISTRATOR });
      await userRepo.add(admin);
      // Should not throw
      await service._requireAdmin(admin.id);
      assert(true, '_requireAdmin did not throw');
    });
  });

  // ── ImportExportService.parseImportFile ──
  await describe('ImportExportService — parseImportFile', async () => {
    await it('returns error for invalid JSON', async () => {
      const { service, userRepo } = makeImportExportService();
      const admin = makeUser({ role: USER_ROLES.ADMINISTRATOR });
      await userRepo.add(admin);
      const file = { text: async () => 'not json at all {{{' };
      const result = await service.parseImportFile(admin.id, file);
      assertEqual(result.success, false, 'should fail');
      assert(result.error.includes('Invalid JSON'), `unexpected error: ${result.error}`);
    });

    await it('returns error for encrypted file without passphrase', async () => {
      const { service, userRepo } = makeImportExportService();
      const admin = makeUser({ role: USER_ROLES.ADMINISTRATOR });
      await userRepo.add(admin);
      const encryptedPayload = JSON.stringify({ encrypted: true, salt: 'aa', iv: 'bb', ciphertext: 'cc' });
      const file = { text: async () => encryptedPayload };
      const result = await service.parseImportFile(admin.id, file, null);
      assertEqual(result.success, false, 'should fail');
      assert(result.error.includes('encrypted'), `unexpected error: ${result.error}`);
    });

    await it('returns error for wrong passphrase on encrypted file', async () => {
      const { service, userRepo } = makeImportExportService();
      const admin = makeUser({ role: USER_ROLES.ADMINISTRATOR });
      await userRepo.add(admin);
      // Encrypt with real CryptoService, then try wrong passphrase
      const cryptoSvc = new CryptoService();
      const encrypted = await cryptoSvc.encrypt('{"users":[]}', 'correct-pass');
      const payload = JSON.stringify({ encrypted: true, ...encrypted });
      const file = { text: async () => payload };
      const result = await service.parseImportFile(admin.id, file, 'wrong-pass');
      assertEqual(result.success, false, 'should fail');
      assert(result.error.includes('Decryption failed'), `unexpected error: ${result.error}`);
    });

    await it('successfully parses a valid plaintext backup', async () => {
      const { service, userRepo } = makeImportExportService();
      const admin = makeUser({ role: USER_ROLES.ADMINISTRATOR });
      await userRepo.add(admin);
      const data = { users: [{ id: 'user-abc123', username: 'tester', role: 'Learner' }] };
      const file = { text: async () => JSON.stringify(data) };
      const result = await service.parseImportFile(admin.id, file);
      assertEqual(result.success, true, `should succeed, got: ${result.error}`);
      assertEqual(result.preview.users, 1, 'preview should count 1 user');
      assert(Array.isArray(result.data.users), 'data.users should be array');
    });

    await it('successfully decrypts and parses a valid encrypted backup', async () => {
      const { service, userRepo } = makeImportExportService();
      const admin = makeUser({ role: USER_ROLES.ADMINISTRATOR });
      await userRepo.add(admin);
      const cryptoSvc = new CryptoService();
      const inner = { users: [{ id: 'user-abc123', username: 'encrypted-user' }] };
      const encrypted = await cryptoSvc.encrypt(JSON.stringify(inner), 'my-passphrase');
      const payload = JSON.stringify({ encrypted: true, ...encrypted });
      const file = { text: async () => payload };
      const result = await service.parseImportFile(admin.id, file, 'my-passphrase');
      assertEqual(result.success, true, `should succeed, got: ${result.error}`);
      assertEqual(result.preview.users, 1, 'preview should count 1 user');
    });

    await it('returns validation error for malformed record IDs', async () => {
      const { service, userRepo } = makeImportExportService();
      const admin = makeUser({ role: USER_ROLES.ADMINISTRATOR });
      await userRepo.add(admin);
      const data = { users: [{ id: '<script>alert(1)</script>', username: 'xss' }] };
      const file = { text: async () => JSON.stringify(data) };
      const result = await service.parseImportFile(admin.id, file);
      assertEqual(result.success, false, 'should fail validation');
      assert(result.error.includes('validation failed'), `unexpected error: ${result.error}`);
    });
  });

  // ── ImportExportService._validateImportData ──
  await describe('ImportExportService — _validateImportData', async () => {
    await it('returns empty array for valid data', async () => {
      const { service } = makeImportExportService();
      const errors = service._validateImportData({
        users: [{ id: 'user-abc-123', username: 'ok' }],
      });
      assertEqual(errors.length, 0, 'should have no errors');
    });

    await it('skips the _localStorage key without errors', async () => {
      const { service } = makeImportExportService();
      const errors = service._validateImportData({
        _localStorage: { someKey: 'someValue' },
      });
      assertEqual(errors.length, 0, 'should skip _localStorage');
    });

    await it('ignores unknown store keys', async () => {
      const { service } = makeImportExportService();
      const errors = service._validateImportData({
        unknownStoreThatDoesNotExist: 'not an array',
      });
      assertEqual(errors.length, 0, 'unknown stores are silently ignored');
    });

    await it('errors when a known store value is not an array', async () => {
      const { service } = makeImportExportService();
      const errors = service._validateImportData({ users: 'not-an-array' });
      assert(errors.length > 0, 'should report error');
      assert(errors[0].includes('must be an array'), `unexpected error: ${errors[0]}`);
    });

    await it('errors when a record has an invalid ID format', async () => {
      const { service } = makeImportExportService();
      const errors = service._validateImportData({
        users: [{ id: '../../../etc/passwd', username: 'hack' }],
      });
      assert(errors.length > 0, 'should report ID error');
      assert(errors[0].includes('invalid ID format'), `unexpected: ${errors[0]}`);
    });

    await it('allows IDs with alphanumeric, dash, underscore, dot, colon', async () => {
      const { service } = makeImportExportService();
      const errors = service._validateImportData({
        users: [{ id: 'abc_123-xyz.4:5', username: 'ok' }],
      });
      assertEqual(errors.length, 0, 'should be valid');
    });

    await it('errors when a record in an array is not an object', async () => {
      const { service } = makeImportExportService();
      const errors = service._validateImportData({ users: ['not-an-object'] });
      assert(errors.length > 0, 'should error on non-object record');
      assert(errors[0].includes('must be an object'), `unexpected: ${errors[0]}`);
    });
  });

  // ── ImportExportService.exportAll ──
  await describe('ImportExportService — exportAll', async () => {
    await it('throws Database not initialized when no DB in Node.js', async () => {
      const { service, userRepo } = makeImportExportService();
      const admin = makeUser({ role: USER_ROLES.ADMINISTRATOR });
      await userRepo.add(admin);
      await assertThrowsAsync(
        () => service.exportAll(admin.id),
        'Database not initialized',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FavoriteService
  // ─────────────────────────────────────────────────────────────

  await describe('FavoriteService — toggle', async () => {
    await it('adds a new favorite and returns action=added', async () => {
      const { service } = makeFavoriteService();
      const result = await service.toggle('user-1', 'question', 'q-abc');
      assertEqual(result.action, 'added', 'should add');
      assert(result.favorite, 'should return favorite object');
      assertEqual(result.favorite.userId, 'user-1');
      assertEqual(result.favorite.itemType, 'question');
      assertEqual(result.favorite.itemId, 'q-abc');
    });

    await it('removes an existing favorite and returns action=removed', async () => {
      const { service } = makeFavoriteService();
      await service.toggle('user-1', 'question', 'q-abc');
      const result = await service.toggle('user-1', 'question', 'q-abc');
      assertEqual(result.action, 'removed', 'should remove on second toggle');
      assert(!result.favorite, 'should not return favorite after removal');
    });

    await it('toggling twice leaves the favorite absent', async () => {
      const { service } = makeFavoriteService();
      await service.toggle('user-1', 'class', 'class-1');
      await service.toggle('user-1', 'class', 'class-1');
      const isFav = await service.isFavorited('user-1', 'class', 'class-1');
      assertEqual(isFav, false, 'should not be favorited after double toggle');
    });

    await it('different users can favorite the same item independently', async () => {
      const { service } = makeFavoriteService();
      await service.toggle('user-1', 'review', 'rev-1');
      const u1 = await service.isFavorited('user-1', 'review', 'rev-1');
      const u2 = await service.isFavorited('user-2', 'review', 'rev-1');
      assertEqual(u1, true, 'user-1 should have favorited');
      assertEqual(u2, false, 'user-2 should not have favorited');
    });
  });

  await describe('FavoriteService — isFavorited', async () => {
    await it('returns false when item is not favorited', async () => {
      const { service } = makeFavoriteService();
      const result = await service.isFavorited('user-1', 'question', 'q-xyz');
      assertEqual(result, false, 'should be false');
    });

    await it('returns true after item is favorited', async () => {
      const { service } = makeFavoriteService();
      await service.toggle('user-1', 'question', 'q-xyz');
      const result = await service.isFavorited('user-1', 'question', 'q-xyz');
      assertEqual(result, true, 'should be true after toggle');
    });
  });

  await describe('FavoriteService — find', async () => {
    await it('returns null when favorite does not exist', async () => {
      const { service } = makeFavoriteService();
      const result = await service.find('user-1', 'question', 'q-nothere');
      assertEqual(result, null, 'should return null');
    });

    await it('returns the favorite object when it exists', async () => {
      const { service } = makeFavoriteService();
      await service.toggle('user-1', 'thread', 't-1');
      const result = await service.find('user-1', 'thread', 't-1');
      assert(result !== null, 'should find it');
      assertEqual(result.itemType, 'thread');
      assertEqual(result.itemId, 't-1');
    });
  });

  await describe('FavoriteService — getByUserId', async () => {
    await it('returns empty array for a user with no favorites', async () => {
      const { service } = makeFavoriteService();
      const results = await service.getByUserId('user-nobody');
      assertEqual(results.length, 0, 'should be empty');
    });

    await it('returns all favorites for a user', async () => {
      const { service } = makeFavoriteService();
      await service.toggle('user-1', 'question', 'q-1');
      await service.toggle('user-1', 'review', 'rev-1');
      await service.toggle('user-2', 'question', 'q-1'); // different user
      const results = await service.getByUserId('user-1');
      assertEqual(results.length, 2, 'should return 2 favorites for user-1');
    });
  });

  await describe('FavoriteService — getByUserAndType', async () => {
    await it('returns empty array when no favorites match the type', async () => {
      const { service } = makeFavoriteService();
      await service.toggle('user-1', 'question', 'q-1');
      const results = await service.getByUserAndType('user-1', 'review');
      assertEqual(results.length, 0, 'wrong type should return empty');
    });

    await it('returns only favorites matching the given itemType', async () => {
      const { service } = makeFavoriteService();
      await service.toggle('user-1', 'question', 'q-1');
      await service.toggle('user-1', 'question', 'q-2');
      await service.toggle('user-1', 'review', 'rev-1');
      const results = await service.getByUserAndType('user-1', 'question');
      assertEqual(results.length, 2, 'should return 2 question favorites');
      assert(results.every(r => r.itemType === 'question'), 'all should be question type');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // validators.js
  // ─────────────────────────────────────────────────────────────

  await describe('validators — required', async () => {
    await it('returns error for null', async () => {
      assert(required(null) !== null, 'should fail for null');
    });
    await it('returns error for undefined', async () => {
      assert(required(undefined) !== null, 'should fail for undefined');
    });
    await it('returns error for empty string', async () => {
      assert(required('') !== null, 'should fail for empty string');
    });
    await it('returns error for whitespace-only string', async () => {
      assert(required('   ') !== null, 'should fail for whitespace');
    });
    await it('returns null for a valid non-empty string', async () => {
      assertEqual(required('hello'), null, 'should pass for non-empty');
    });
    await it('includes custom fieldName in error message', async () => {
      const err = required('', 'Username');
      assert(err.includes('Username'), `should mention fieldName, got: ${err}`);
    });
  });

  await describe('validators — minLength', async () => {
    await it('returns error when value is too short', async () => {
      assert(minLength('ab', 5) !== null, 'should fail when too short');
    });
    await it('returns null when value is exactly minimum length', async () => {
      assertEqual(minLength('abcde', 5), null, 'should pass at exact min');
    });
    await it('returns null when value exceeds minimum length', async () => {
      assertEqual(minLength('abcdefg', 5), null, 'should pass when longer');
    });
  });

  await describe('validators — maxLength', async () => {
    await it('returns error when value exceeds max', async () => {
      assert(maxLength('abcdef', 3) !== null, 'should fail when too long');
    });
    await it('returns null when value is exactly max length', async () => {
      assertEqual(maxLength('abc', 3), null, 'should pass at exact max');
    });
    await it('returns null when value is shorter than max', async () => {
      assertEqual(maxLength('ab', 3), null, 'should pass when shorter');
    });
  });

  await describe('validators — inRange', async () => {
    await it('returns error for NaN input', async () => {
      assert(inRange('not-a-number', 0, 100) !== null, 'should fail for NaN');
    });
    await it('returns error when below minimum', async () => {
      assert(inRange(-1, 0, 100) !== null, 'should fail below min');
    });
    await it('returns error when above maximum', async () => {
      assert(inRange(101, 0, 100) !== null, 'should fail above max');
    });
    await it('returns null when at minimum', async () => {
      assertEqual(inRange(0, 0, 100), null, 'should pass at min boundary');
    });
    await it('returns null when at maximum', async () => {
      assertEqual(inRange(100, 0, 100), null, 'should pass at max boundary');
    });
    await it('returns null when within range', async () => {
      assertEqual(inRange(50, 0, 100), null, 'should pass within range');
    });
  });

  await describe('validators — isInteger', async () => {
    await it('returns error for float value', async () => {
      assert(isInteger(3.5) !== null, 'should fail for float');
    });
    await it('returns error for non-numeric string', async () => {
      assert(isInteger('abc') !== null, 'should fail for non-numeric');
    });
    await it('returns null for integer value', async () => {
      assertEqual(isInteger(42), null, 'should pass for integer');
    });
    await it('returns null for integer as string', async () => {
      assertEqual(isInteger('7'), null, 'should pass for integer string');
    });
  });

  await describe('validators — isOneOf', async () => {
    await it('returns error when value is not in the allowed list', async () => {
      assert(isOneOf('banana', ['apple', 'orange']) !== null, 'should fail');
    });
    await it('returns null when value is in the allowed list', async () => {
      assertEqual(isOneOf('apple', ['apple', 'orange']), null, 'should pass');
    });
  });

  await describe('validators — validateField', async () => {
    await it('returns the first error when a rule fails', async () => {
      const err = validateField('', [
        v => required(v, 'Name'),
        v => minLength(v, 3, 'Name'),
      ]);
      assert(err !== null, 'should return an error');
      assert(err.includes('Name'), `should mention field, got: ${err}`);
    });

    await it('returns null when all rules pass', async () => {
      const result = validateField('hello', [
        v => required(v, 'Name'),
        v => minLength(v, 3, 'Name'),
      ]);
      assertEqual(result, null, 'should pass');
    });

    await it('returns only the first error even when multiple rules fail', async () => {
      let callCount = 0;
      const ruleA = () => { callCount++; return 'error-A'; };
      const ruleB = () => { callCount++; return 'error-B'; };
      const result = validateField('x', [ruleA, ruleB]);
      assertEqual(result, 'error-A', 'should return first error');
      assertEqual(callCount, 1, 'should stop after first failure');
    });
  });

  await describe('validators — validateObject', async () => {
    await it('returns valid=true and empty errors when all fields pass', async () => {
      const { valid, errors } = validateObject(
        { name: 'Alice', age: '30' },
        { name: [v => required(v)], age: [v => required(v)] },
      );
      assertEqual(valid, true, 'should be valid');
      assertEqual(Object.keys(errors).length, 0, 'should have no errors');
    });

    await it('returns valid=false with errors for failing fields', async () => {
      const { valid, errors } = validateObject(
        { name: '', age: '30' },
        { name: [v => required(v, 'Name')], age: [v => required(v)] },
      );
      assertEqual(valid, false, 'should be invalid');
      assert(errors.name, 'should have name error');
      assert(!errors.age, 'should not have age error');
    });

    await it('reports errors for all failing fields simultaneously', async () => {
      const { valid, errors } = validateObject(
        { name: '', age: '' },
        { name: [v => required(v, 'Name')], age: [v => required(v, 'Age')] },
      );
      assertEqual(valid, false, 'should be invalid');
      assert(errors.name, 'should have name error');
      assert(errors.age, 'should have age error');
    });
  });

  await describe('validators — validateQuestionRow', async () => {
    const validRow = {
      questionText: 'What is 2+2?',
      type: 'single',
      correctAnswer: '4',
      difficulty: 2,
      tags: 'math',
    };

    await it('returns empty array for a fully valid row', async () => {
      const errors = validateQuestionRow({ ...validRow }, 0);
      assertEqual(errors.length, 0, 'should have no errors');
    });

    await it('errors on missing questionText', async () => {
      const errors = validateQuestionRow({ ...validRow, questionText: '' }, 0);
      assert(errors.some(e => e.includes('questionText')), 'should mention questionText');
    });

    await it('errors on whitespace-only questionText', async () => {
      const errors = validateQuestionRow({ ...validRow, questionText: '   ' }, 1);
      assert(errors.some(e => e.includes('questionText')), 'should catch whitespace');
    });

    await it('errors on invalid question type', async () => {
      const errors = validateQuestionRow({ ...validRow, type: 'essay' }, 0);
      assert(errors.some(e => e.includes('type')), 'should mention type');
    });

    await it('errors on missing correctAnswer for single type', async () => {
      const errors = validateQuestionRow({ ...validRow, correctAnswer: '' }, 0);
      assert(errors.some(e => e.includes('correctAnswer')), 'should require correctAnswer');
    });

    await it('does not require correctAnswer for subjective type', async () => {
      const errors = validateQuestionRow({
        ...validRow, type: 'subjective', correctAnswer: '',
      }, 0);
      assert(!errors.some(e => e.includes('correctAnswer')), 'subjective should skip correctAnswer');
    });

    await it('errors on non-integer difficulty', async () => {
      const errors = validateQuestionRow({ ...validRow, difficulty: 2.5 }, 0);
      assert(errors.some(e => e.includes('difficulty')), 'should catch float difficulty');
    });

    await it('errors on out-of-range difficulty (0)', async () => {
      const errors = validateQuestionRow({ ...validRow, difficulty: 0 }, 0);
      assert(errors.some(e => e.includes('difficulty')), 'difficulty must be >= 1');
    });

    await it('errors on out-of-range difficulty (6)', async () => {
      const errors = validateQuestionRow({ ...validRow, difficulty: 6 }, 0);
      assert(errors.some(e => e.includes('difficulty')), 'difficulty must be <= 5');
    });

    await it('errors on missing tags', async () => {
      const errors = validateQuestionRow({ ...validRow, tags: '' }, 0);
      assert(errors.some(e => e.includes('tags')), 'should require tags');
    });

    await it('accepts all four valid question types', async () => {
      for (const type of ['single', 'multiple', 'fill-in', 'subjective']) {
        const row = { ...validRow, type, correctAnswer: type === 'subjective' ? '' : 'answer' };
        const errors = validateQuestionRow(row, 0);
        assert(!errors.some(e => e.includes('type')), `type "${type}" should be valid`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // helpers.js
  // ─────────────────────────────────────────────────────────────

  await describe('helpers — generateId', async () => {
    await it('returns a non-empty string', async () => {
      const id = generateId();
      assert(typeof id === 'string' && id.length > 0, 'should return a string');
    });

    await it('returns unique IDs on repeated calls', async () => {
      const ids = new Set(Array.from({ length: 50 }, () => generateId()));
      assertEqual(ids.size, 50, 'all 50 IDs should be unique');
    });
  });

  await describe('helpers — now', async () => {
    await it('returns an ISO 8601 string', async () => {
      const result = now();
      assert(typeof result === 'string', 'should be string');
      assert(!isNaN(Date.parse(result)), 'should be valid date');
    });

    await it('is close to the current time', async () => {
      const before = Date.now();
      const result = now();
      const after = Date.now();
      const ts = new Date(result).getTime();
      assert(ts >= before && ts <= after, 'should be current time');
    });
  });

  await describe('helpers — deepClone', async () => {
    await it('returns an equal but distinct object', async () => {
      const original = { a: 1, b: { c: 2 } };
      const clone = deepClone(original);
      assertEqual(JSON.stringify(clone), JSON.stringify(original), 'values should be equal');
      assert(clone !== original, 'should be a different reference');
    });

    await it('mutations to the clone do not affect the original', async () => {
      const original = { x: { y: 42 } };
      const clone = deepClone(original);
      clone.x.y = 999;
      assertEqual(original.x.y, 42, 'original should be unchanged');
    });
  });

  await describe('helpers — maskString', async () => {
    await it('returns value unchanged when length equals visibleCount', async () => {
      assertEqual(maskString('abcd', 4), 'abcd', 'should return as-is');
    });

    await it('returns value unchanged when shorter than visibleCount', async () => {
      assertEqual(maskString('ab', 4), 'ab', 'should return as-is');
    });

    await it('masks all but the last N characters', async () => {
      const result = maskString('abc12345', 4);
      assertEqual(result, '****2345', 'should mask first 4 chars');
    });

    await it('returns empty string for falsy input', async () => {
      const result = maskString('', 4);
      assertEqual(result, '', 'should return empty for empty string');
    });
  });

  await describe('helpers — formatDate', async () => {
    await it('returns empty string for null', async () => {
      assertEqual(formatDate(null), '', 'null should return empty');
    });

    await it('returns empty string for undefined', async () => {
      assertEqual(formatDate(undefined), '', 'undefined should return empty');
    });

    await it('returns a non-empty formatted string for a valid ISO date', async () => {
      const result = formatDate('2026-01-15T10:30:00.000Z');
      assert(typeof result === 'string' && result.length > 0, 'should return formatted string');
      assert(result.includes('2026'), `should include year, got: ${result}`);
    });
  });

  await describe('helpers — debounce', async () => {
    await it('does not fire immediately', async () => {
      let count = 0;
      const fn = debounce(() => count++, 20);
      fn();
      assertEqual(count, 0, 'should not have fired yet');
    });

    await it('fires once after the delay', async () => {
      let count = 0;
      const fn = debounce(() => count++, 20);
      fn();
      await new Promise(r => setTimeout(r, 40));
      assertEqual(count, 1, 'should have fired exactly once');
    });

    await it('cancels prior calls within the delay window', async () => {
      let count = 0;
      const fn = debounce(() => count++, 30);
      fn();
      fn();
      fn();
      await new Promise(r => setTimeout(r, 50));
      assertEqual(count, 1, 'should fire only once despite multiple rapid calls');
    });
  });

  await describe('helpers — escapeHtml', async () => {
    await it('returns empty string for null', async () => {
      assertEqual(escapeHtml(null), '', 'null → empty string');
    });

    await it('returns empty string for undefined', async () => {
      assertEqual(escapeHtml(undefined), '', 'undefined → empty string');
    });

    await it('escapes ampersand', async () => {
      assertEqual(escapeHtml('a & b'), 'a &amp; b');
    });

    await it('escapes less-than', async () => {
      assertEqual(escapeHtml('<div>'), '&lt;div&gt;');
    });

    await it('escapes greater-than', async () => {
      assertEqual(escapeHtml('x > y'), 'x &gt; y');
    });

    await it('escapes double quotes', async () => {
      assertEqual(escapeHtml('"hello"'), '&quot;hello&quot;');
    });

    await it('escapes single quotes', async () => {
      assertEqual(escapeHtml("it's"), "it&#x27;s");
    });

    await it('escapes all five special characters in one string', async () => {
      const result = escapeHtml('<a href="x" onclick=\'y\'>a & b</a>');
      assert(result.includes('&lt;'), 'should escape <');
      assert(result.includes('&gt;'), 'should escape >');
      assert(result.includes('&quot;'), 'should escape "');
      assert(result.includes('&#x27;'), "should escape '");
      assert(result.includes('&amp;'), 'should escape &');
    });

    await it('passes through safe strings unchanged', async () => {
      assertEqual(escapeHtml('Hello World 123'), 'Hello World 123');
    });
  });

  await describe('helpers — validateImageFile', async () => {
    await it('rejects files that are not JPG or PNG', async () => {
      const file = { type: 'image/gif', size: 100 * 1024 };
      const result = validateImageFile(file);
      assertEqual(result.valid, false, 'GIF should be rejected');
      assert(result.error.includes('JPG'), `unexpected error: ${result.error}`);
    });

    await it('rejects files exceeding the size limit', async () => {
      const file = { type: 'image/jpeg', size: 3 * 1024 * 1024 }; // 3MB > 2MB default
      const result = validateImageFile(file);
      assertEqual(result.valid, false, 'oversized file should be rejected');
      assert(result.error.includes('MB'), `unexpected error: ${result.error}`);
    });

    await it('accepts a valid JPEG within size limit', async () => {
      const file = { type: 'image/jpeg', size: 500 * 1024 };
      const result = validateImageFile(file);
      assertEqual(result.valid, true, 'valid JPEG should be accepted');
      assertEqual(result.error, null, 'error should be null');
    });

    await it('accepts a valid PNG within size limit', async () => {
      const file = { type: 'image/png', size: 1 * 1024 * 1024 };
      const result = validateImageFile(file);
      assertEqual(result.valid, true, 'valid PNG should be accepted');
    });

    await it('accepts a custom size limit', async () => {
      const file = { type: 'image/jpeg', size: 5 * 1024 * 1024 }; // 5MB
      const result = validateImageFile(file, 10); // 10MB limit
      assertEqual(result.valid, true, 'should accept file within custom limit');
    });
  });

  await describe('helpers — maskEmail', async () => {
    await it('returns empty string for empty input', async () => {
      assertEqual(maskEmail(''), '', 'empty → empty');
    });

    await it('returns the value unchanged when there is no @', async () => {
      assertEqual(maskEmail('notanemail'), 'notanemail', 'no @ → unchanged');
    });

    await it('returns local@domain unchanged when local part is a single character', async () => {
      assertEqual(maskEmail('a@example.com'), 'a@example.com');
    });

    await it('masks all but the first character of the local part', async () => {
      const result = maskEmail('john@example.com');
      assertEqual(result, 'j***@example.com', `got: ${result}`);
    });

    await it('preserves the domain part exactly', async () => {
      const result = maskEmail('alice@mycompany.org');
      assert(result.endsWith('@mycompany.org'), `domain should be preserved, got: ${result}`);
    });
  });

  await describe('helpers — maskId', async () => {
    await it('masks all but last 4 characters by default (sharedMode=true)', async () => {
      const id = 'abcdefgh-1234-5678';
      const result = maskId(id);
      assert(result.endsWith('5678'), `should end with last 4 chars, got: ${result}`);
      assert(result.includes('*'), 'should contain mask chars');
    });

    await it('returns value unchanged when shorter than 4 characters', async () => {
      const result = maskId('ab');
      assertEqual(result, 'ab', 'short ID should not be masked');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // AuthService
  // ─────────────────────────────────────────────────────────────

  await describe('AuthService — isAuthenticated and getCurrentUser', async () => {
    await it('returns false before login', async () => {
      const { auth } = makeAuthService();
      assertEqual(auth.isAuthenticated(), false, 'should not be authenticated');
      assertEqual(auth.getCurrentUser(), null, 'should have no user');
    });

    await it('returns true after successful login', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedAdmin(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      assertEqual(auth.isAuthenticated(), true, 'should be authenticated');
      assert(auth.getCurrentUser() !== null, 'should have a current user');
    });
  });

  await describe('AuthService — hasRole', async () => {
    await it('returns falsy when no user is logged in', async () => {
      const { auth } = makeAuthService();
      assert(!auth.hasRole(USER_ROLES.ADMINISTRATOR), 'should be falsy with no user');
    });

    await it('returns true when current user has the given role', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedAdmin(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      assertEqual(auth.hasRole(USER_ROLES.ADMINISTRATOR), true, 'should match role');
    });

    await it('returns false when current user does not have the given role', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedLearner(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      assertEqual(auth.hasRole(USER_ROLES.ADMINISTRATOR), false, 'learner is not admin');
    });

    await it('accepts multiple role arguments and returns true if any match', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedLearner(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      assertEqual(
        auth.hasRole(USER_ROLES.ADMINISTRATOR, USER_ROLES.LEARNER),
        true,
        'should match second role',
      );
    });
  });

  await describe('AuthService — init', async () => {
    await it('returns null when no session exists (Node.js — no localStorage)', async () => {
      const { auth } = makeAuthService();
      const result = await auth.init();
      assertEqual(result, null, 'should return null with no session');
    });

    await it('restores user from a valid session', async () => {
      const { auth, userRepo, cryptoSvc, sessionRepo } = makeAuthService();
      const { user } = await seedAdmin(userRepo, cryptoSvc);
      const sessionId = 'sess-' + generateId();
      await sessionRepo.add({ id: sessionId, userId: user.id, createdAt: now() });
      auth._ls['trainingops_session'] = sessionId;

      const result = await auth.init();
      assert(result !== null, 'should return user');
      assertEqual(result.id, user.id, 'should restore correct user');
    });

    await it('returns null and clears session key when session record is missing', async () => {
      const { auth } = makeAuthService();
      auth._ls['trainingops_session'] = 'nonexistent-session-id';
      const result = await auth.init();
      assertEqual(result, null, 'should return null for missing session record');
      assert(!auth._ls['trainingops_session'], 'should remove orphan session key');
    });

    await it('returns null and clears session key when session user is missing', async () => {
      const { auth, sessionRepo } = makeAuthService();
      const sessionId = 'sess-orphan';
      await sessionRepo.add({ id: sessionId, userId: 'deleted-user', createdAt: now() });
      auth._ls['trainingops_session'] = sessionId;
      const result = await auth.init();
      assertEqual(result, null, 'should return null for deleted user');
      assert(!auth._ls['trainingops_session'], 'should remove orphan session key');
    });
  });

  await describe('AuthService — login', async () => {
    await it('returns error for empty username', async () => {
      const { auth } = makeAuthService();
      const result = await auth.login('', 'SomePass1!');
      assertEqual(result.success, false, 'should fail');
      assert(result.error.includes('Username'), `unexpected error: ${result.error}`);
    });

    await it('returns error for whitespace-only username', async () => {
      const { auth } = makeAuthService();
      const result = await auth.login('   ', 'SomePass1!');
      assertEqual(result.success, false, 'should fail');
    });

    await it('returns error for empty password', async () => {
      const { auth } = makeAuthService();
      const result = await auth.login('admin', '');
      assertEqual(result.success, false, 'should fail');
      assert(result.error.includes('Password'), `unexpected error: ${result.error}`);
    });

    await it('returns error for unknown username', async () => {
      const { auth } = makeAuthService();
      const result = await auth.login('no-such-user', 'SomePass1!');
      assertEqual(result.success, false, 'should fail');
      assert(result.error.includes('Invalid'), `unexpected error: ${result.error}`);
    });

    await it('returns error for wrong password', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user } = await seedAdmin(userRepo, cryptoSvc);
      const result = await auth.login(user.username, 'wrong-password');
      assertEqual(result.success, false, 'should fail with wrong password');
      assert(result.error.includes('Invalid'), `unexpected error: ${result.error}`);
    });

    await it('succeeds with correct credentials and fires onSessionChange', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedAdmin(userRepo, cryptoSvc);
      let callbackFired = false;
      auth.onSessionChange = () => { callbackFired = true; };
      const result = await auth.login(user.username, password);
      assertEqual(result.success, true, `should succeed, got: ${result.error}`);
      assertEqual(result.user.id, user.id, 'should return the user');
      assertEqual(callbackFired, true, 'onSessionChange should have fired');
    });

    await it('returns requiresPasswordReset prompt for flagged users', async () => {
      const { auth, userRepo } = makeAuthService();
      const user = { ...makeUser({ username: 'resetme' }), _requiresPasswordReset: true };
      await userRepo.add(user);
      const result = await auth.login('resetme', 'anypass');
      assertEqual(result.success, false, 'should fail');
      assertEqual(result.requiresPasswordReset, true, 'should signal password reset');
      assertEqual(result.userId, user.id, 'should include userId for reset flow');
    });

    await it('locks account after 5 consecutive wrong passwords', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user } = await seedAdmin(userRepo, cryptoSvc, { username: 'locktest' });
      for (let i = 0; i < 4; i++) {
        await auth.login(user.username, 'bad-pass');
      }
      const lockResult = await auth.login(user.username, 'bad-pass'); // 5th
      assertEqual(lockResult.success, false, '5th attempt should fail');
      assert(
        lockResult.error.includes('locked') || lockResult.error.includes('Too many'),
        `expected lockout message, got: ${lockResult.error}`,
      );
    });

    await it('subsequent login returns locked message while lockout is active', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user } = await seedAdmin(userRepo, cryptoSvc, { username: 'locktest2' });
      for (let i = 0; i < 5; i++) {
        await auth.login(user.username, 'bad-pass');
      }
      const result = await auth.login(user.username, 'bad-pass');
      assertEqual(result.success, false, 'should still be locked');
      assert(
        result.error.includes('locked') || result.error.includes('Too many'),
        `expected lockout error, got: ${result.error}`,
      );
    });
  });

  await describe('AuthService — logout', async () => {
    await it('clears current user', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedAdmin(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      assertEqual(auth.isAuthenticated(), true, 'should be logged in');
      await auth.logout();
      assertEqual(auth.isAuthenticated(), false, 'should be logged out');
      assertEqual(auth.getCurrentUser(), null, 'current user should be null');
    });

    await it('fires onSessionChange on logout', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedAdmin(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      let callbackFired = false;
      auth.onSessionChange = () => { callbackFired = true; };
      await auth.logout();
      assertEqual(callbackFired, true, 'onSessionChange should fire on logout');
    });

    await it('logout without any session does not throw', async () => {
      const { auth } = makeAuthService();
      await auth.logout(); // should complete without error
      assertEqual(auth.isAuthenticated(), false, 'still not authenticated');
    });
  });

  await describe('AuthService — resetPassword', async () => {
    await it('returns error for missing userId', async () => {
      const { auth } = makeAuthService();
      const result = await auth.resetPassword(null, 'NewPass1!');
      assertEqual(result.success, false, 'should fail');
      assert(result.error.includes('User ID'), `unexpected error: ${result.error}`);
    });

    await it('returns error when new password is too short', async () => {
      const { auth } = makeAuthService();
      const result = await auth.resetPassword('user-1', 'short');
      assertEqual(result.success, false, 'should fail');
      assert(result.error.includes('8 characters'), `unexpected error: ${result.error}`);
    });

    await it('returns error when target user does not exist', async () => {
      const { auth } = makeAuthService();
      const result = await auth.resetPassword('nonexistent', 'NewPass1!');
      assertEqual(result.success, false, 'should fail');
      assert(result.error.includes('not found'), `unexpected error: ${result.error}`);
    });

    await it('returns unauthorized error when caller is not admin and not self', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user: learner, password } = await seedLearner(userRepo, cryptoSvc, { username: 'learner-a' });
      const targetUser = makeUser({ role: USER_ROLES.LEARNER, username: 'learner-b' });
      await userRepo.add(targetUser);
      await auth.login(learner.username, password);
      const result = await auth.resetPassword(targetUser.id, 'NewPass1!');
      assertEqual(result.success, false, 'should be unauthorized');
      assert(result.error.includes('Unauthorized'), `unexpected error: ${result.error}`);
    });

    await it('allows an admin to reset any user password', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user: admin, password: adminPass } = await seedAdmin(userRepo, cryptoSvc);
      const target = makeUser({ role: USER_ROLES.LEARNER, username: 'some-learner' });
      await userRepo.add(target);
      await auth.login(admin.username, adminPass);
      const result = await auth.resetPassword(target.id, 'NewPass1!');
      assertEqual(result.success, true, `admin reset should succeed, got: ${result.error}`);
    });

    await it('allows a user to reset their own password', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedLearner(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      const result = await auth.resetPassword(user.id, 'NewStrongPass1!');
      assertEqual(result.success, true, `self reset should succeed, got: ${result.error}`);
    });

    await it('allows password reset in recovery mode (no session, _requiresPasswordReset=true)', async () => {
      const { auth, userRepo } = makeAuthService();
      const recoveryUser = { ...makeUser({ username: 'recovery' }), _requiresPasswordReset: true };
      await userRepo.add(recoveryUser);
      // No login — auth._currentUser is null
      const result = await auth.resetPassword(recoveryUser.id, 'NewPass1!');
      assertEqual(result.success, true, `recovery reset should succeed, got: ${result.error}`);
    });

    await it('clears _requiresPasswordReset flag after successful reset', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user: admin, password: adminPass } = await seedAdmin(userRepo, cryptoSvc);
      const target = makeUser({ username: 'needsreset', _requiresPasswordReset: true });
      await userRepo.add(target);
      await auth.login(admin.username, adminPass);
      await auth.resetPassword(target.id, 'NewPass1!');
      const updated = await userRepo.getById(target.id);
      assertEqual(updated._requiresPasswordReset, false, 'flag should be cleared');
    });
  });

  await describe('AuthService — registerUser', async () => {
    await it('throws when caller is not an Administrator', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedLearner(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      await assertThrowsAsync(
        () => auth.registerUser('newuser', 'NewPass1!', USER_ROLES.LEARNER),
        'Only administrators',
      );
    });

    await it('throws when no user is logged in', async () => {
      const { auth } = makeAuthService();
      await assertThrowsAsync(
        () => auth.registerUser('newuser', 'NewPass1!', USER_ROLES.LEARNER),
        'Only administrators',
      );
    });

    await it('returns error for empty username', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedAdmin(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      const result = await auth.registerUser('', 'NewPass1!', USER_ROLES.LEARNER);
      assertEqual(result.success, false, 'should fail');
      assert(result.error.includes('Username'), `unexpected: ${result.error}`);
    });

    await it('returns error when password is too short', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedAdmin(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      const result = await auth.registerUser('newuser', 'short', USER_ROLES.LEARNER);
      assertEqual(result.success, false, 'should fail');
      assert(result.error.includes('8 characters'), `unexpected: ${result.error}`);
    });

    await it('returns error for duplicate username', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedAdmin(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      // First registration
      await auth.registerUser('newlearner', 'NewPass1!', USER_ROLES.LEARNER);
      // Duplicate
      const result = await auth.registerUser('newlearner', 'AnotherPass1!', USER_ROLES.LEARNER);
      assertEqual(result.success, false, 'should fail on duplicate');
      assert(result.error.includes('already exists'), `unexpected: ${result.error}`);
    });

    await it('returns error for an invalid role', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedAdmin(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      const result = await auth.registerUser('newuser', 'NewPass1!', 'Ghost');
      assertEqual(result.success, false, 'should fail for invalid role');
      assert(result.error.includes('Invalid role'), `unexpected: ${result.error}`);
    });

    await it('successfully creates a new user with all valid inputs', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedAdmin(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      const result = await auth.registerUser('newlearner', 'NewPass1!', USER_ROLES.LEARNER, 'New Learner');
      assertEqual(result.success, true, `should succeed, got: ${result.error}`);
      assert(result.user, 'should return the created user');
      assertEqual(result.user.username, 'newlearner', 'username should match');
      assertEqual(result.user.role, USER_ROLES.LEARNER, 'role should match');
      assertEqual(result.user.displayName, 'New Learner', 'displayName should match');
    });

    await it('uses username as displayName when displayName is omitted', async () => {
      const { auth, userRepo, cryptoSvc } = makeAuthService();
      const { user, password } = await seedAdmin(userRepo, cryptoSvc);
      await auth.login(user.username, password);
      const result = await auth.registerUser('autodisplay', 'NewPass1!', USER_ROLES.INSTRUCTOR);
      assertEqual(result.success, true, 'should succeed');
      assertEqual(result.user.displayName, 'autodisplay', 'displayName should default to username');
    });
  });
}
