/**
 * Security Hardening Final Tests
 *
 * Covers:
 *   1. Bootstrap flow — first-run admin creation, gate enforcement
 *   2. Blank canvas signature rejection — UI-level flag and service-level check
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser } from '../test-helpers.js';
import { AuthService } from '../src/services/AuthService.js';
import { ContractService } from '../src/services/ContractService.js';
import { InMemoryStore } from '../test-helpers.js';
import { USER_ROLES } from '../src/models/User.js';

export async function runSecurityHardeningFinalTests() {

  // ============================================================
  // 1. BOOTSTRAP FLOW
  // ============================================================

  await describe('Bootstrap: isBootstrapNeeded() detects empty user store', async () => {
    await it('returns true when no users exist', async () => {
      const userRepo = new InMemoryStore();
      const svc = new AuthService({
        userRepository: userRepo,
        sessionRepository: new InMemoryStore(),
        cryptoService: { hashPassword: async (p) => ({ hash: 'h', salt: 's' }), verifyPassword: async () => true },
        auditService: { log: async () => {} },
      });
      const needed = await svc.isBootstrapNeeded();
      assert(needed === true, 'Bootstrap needed when user store is empty');
    });

    await it('returns false when at least one user exists', async () => {
      const userRepo = new InMemoryStore();
      await userRepo.add(makeUser({ id: 'u1', role: USER_ROLES.ADMINISTRATOR }));
      const svc = new AuthService({
        userRepository: userRepo,
        sessionRepository: new InMemoryStore(),
        cryptoService: { hashPassword: async () => ({ hash: 'h', salt: 's' }), verifyPassword: async () => true },
        auditService: { log: async () => {} },
      });
      const needed = await svc.isBootstrapNeeded();
      assert(needed === false, 'Bootstrap not needed when user exists');
    });
  });

  await describe('Bootstrap: createBootstrapAdmin() creates first administrator', async () => {
    await it('creates admin user with Administrator role', async () => {
      const userRepo = new InMemoryStore();
      const svc = new AuthService({
        userRepository: userRepo,
        sessionRepository: new InMemoryStore(),
        cryptoService: { hashPassword: async (p) => ({ hash: 'testhash', salt: 'testsalt' }), verifyPassword: async () => true },
        auditService: { log: async () => {} },
      });
      const result = await svc.createBootstrapAdmin('sysadmin', 'securepass1');
      assert(result.success, 'Bootstrap admin creation succeeds');
      assertEqual(result.user.role, USER_ROLES.ADMINISTRATOR, 'Created user has Administrator role');
      assertEqual(result.user.username, 'sysadmin', 'Username matches');
    });

    await it('admin is persisted to user repository', async () => {
      const userRepo = new InMemoryStore();
      const svc = new AuthService({
        userRepository: userRepo,
        sessionRepository: new InMemoryStore(),
        cryptoService: { hashPassword: async () => ({ hash: 'h', salt: 's' }), verifyPassword: async () => true },
        auditService: { log: async () => {} },
      });
      await svc.createBootstrapAdmin('firstadmin', 'password99');
      const count = await userRepo.count();
      assertEqual(count, 1, 'Exactly one user in repository after bootstrap');
    });

    await it('rejects username shorter than required', async () => {
      const svc = new AuthService({
        userRepository: new InMemoryStore(),
        sessionRepository: new InMemoryStore(),
        cryptoService: { hashPassword: async () => ({ hash: 'h', salt: 's' }), verifyPassword: async () => true },
        auditService: { log: async () => {} },
      });
      const result = await svc.createBootstrapAdmin('', 'password99');
      assert(!result.success, 'Empty username rejected');
      assert(result.error.includes('required'), 'Error mentions required');
    });

    await it('rejects password shorter than 8 characters', async () => {
      const svc = new AuthService({
        userRepository: new InMemoryStore(),
        sessionRepository: new InMemoryStore(),
        cryptoService: { hashPassword: async () => ({ hash: 'h', salt: 's' }), verifyPassword: async () => true },
        auditService: { log: async () => {} },
      });
      const result = await svc.createBootstrapAdmin('admin', 'short');
      assert(!result.success, 'Short password rejected');
      assert(result.error.includes('8'), 'Error mentions 8 characters');
    });
  });

  await describe('Bootstrap: cannot be bypassed — second creation fails', async () => {
    await it('createBootstrapAdmin throws if users already exist', async () => {
      const userRepo = new InMemoryStore();
      const svc = new AuthService({
        userRepository: userRepo,
        sessionRepository: new InMemoryStore(),
        cryptoService: { hashPassword: async () => ({ hash: 'h', salt: 's' }), verifyPassword: async () => true },
        auditService: { log: async () => {} },
      });
      // First admin created successfully
      await svc.createBootstrapAdmin('admin1', 'password99');
      // Second call must throw
      await assertThrowsAsync(
        () => svc.createBootstrapAdmin('admin2', 'password99'),
        'Bootstrap setup has already been completed'
      );
    });

    await it('isBootstrapNeeded is false after admin creation', async () => {
      const userRepo = new InMemoryStore();
      const svc = new AuthService({
        userRepository: userRepo,
        sessionRepository: new InMemoryStore(),
        cryptoService: { hashPassword: async () => ({ hash: 'h', salt: 's' }), verifyPassword: async () => true },
        auditService: { log: async () => {} },
      });
      await svc.createBootstrapAdmin('admin1', 'password12');
      const needed = await svc.isBootstrapNeeded();
      assert(needed === false, 'Bootstrap gate lifts permanently after first admin is created');
    });
  });

  await describe('Bootstrap: normal login works after admin creation', async () => {
    await it('admin can log in after bootstrap with correct credentials', async () => {
      const { CryptoService } = await import('../src/services/CryptoService.js');
      const crypto = new CryptoService();
      const userRepo = new InMemoryStore();
      const sessionRepo = new InMemoryStore();
      const { AuditService } = await import('../src/services/AuditService.js');
      const audit = new AuditService({ auditLogRepository: new InMemoryStore() });

      const svc = new AuthService({
        userRepository: userRepo,
        sessionRepository: sessionRepo,
        cryptoService: crypto,
        auditService: audit,
      });

      // Bootstrap: create admin
      const createResult = await svc.createBootstrapAdmin('myadmin', 'strongPass99');
      assert(createResult.success, 'Bootstrap admin created');

      // Login with correct credentials
      const loginResult = await svc.login('myadmin', 'strongPass99');
      assert(loginResult.success, 'Login succeeds with correct credentials after bootstrap');
      assertEqual(loginResult.user.role, USER_ROLES.ADMINISTRATOR, 'Logged-in user is Administrator');
    });

    await it('login fails with wrong password after bootstrap', async () => {
      const { CryptoService } = await import('../src/services/CryptoService.js');
      const crypto = new CryptoService();
      const userRepo = new InMemoryStore();
      const sessionRepo = new InMemoryStore();
      const { AuditService } = await import('../src/services/AuditService.js');
      const audit = new AuditService({ auditLogRepository: new InMemoryStore() });

      const svc = new AuthService({
        userRepository: userRepo,
        sessionRepository: sessionRepo,
        cryptoService: crypto,
        auditService: audit,
      });

      await svc.createBootstrapAdmin('myadmin', 'strongPass99');
      const loginResult = await svc.login('myadmin', 'wrongpassword');
      assert(!loginResult.success, 'Login fails with wrong password');
    });
  });

  await describe('Bootstrap: no default credentials exist', async () => {
    await it('AuthService has no seedDefaultUsers method', async () => {
      const svc = new AuthService({
        userRepository: new InMemoryStore(),
        sessionRepository: new InMemoryStore(),
        cryptoService: { hashPassword: async () => ({ hash: 'h', salt: 's' }), verifyPassword: async () => true },
        auditService: { log: async () => {} },
      });
      assert(typeof svc.seedDefaultUsers === 'undefined', 'seedDefaultUsers must not exist — no hardcoded credentials');
    });

    await it('fresh user store is empty — no pre-seeded accounts', async () => {
      const userRepo = new InMemoryStore();
      const count = await userRepo.count();
      assertEqual(count, 0, 'No users exist by default — bootstrap required');
    });
  });

  // ============================================================
  // 2. BLANK CANVAS SIGNATURE REJECTION
  // ============================================================

  await describe('Signature integrity: service rejects blank drawn signature', async () => {
    await it('throws when signatureData is a very short data URL (blank canvas)', async () => {
      const { contractRepository, templateRepository, userRepository } = {
        contractRepository: new InMemoryStore(),
        templateRepository: new InMemoryStore(),
        userRepository: new InMemoryStore(),
      };

      const user = makeUser({ id: 'signer-1', role: USER_ROLES.LEARNER });
      await userRepository.add(user);

      const svc = new ContractService({
        contractRepository,
        templateRepository,
        userRepository,
        documentRepository: new InMemoryStore(),
        auditService: { log: async () => {} },
        cryptoService: { generateSignatureHash: async () => 'testhash' },
      });

      // Seed a contract in INITIATED status
      await contractRepository.add({
        id: 'ctr-blank-test',
        templateId: 'tmpl-1',
        templateVersion: 1,
        content: 'Agreement content.',
        status: 'initiated',
        createdBy: 'signer-1',
        signedBy: null,
        signedAt: null,
        signatureData: null,
        signatureHash: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Blank canvas data URL — base64 payload well under 500 chars
      const blankDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      await assertThrowsAsync(
        () => svc.signContract('ctr-blank-test', blankDataUrl, 'Test User', 'signer-1'),
        'blank'
      );
    });

    await it('accepts a data URL with sufficient drawing data', async () => {
      const contractRepository = new InMemoryStore();
      const userRepository = new InMemoryStore();

      const user = makeUser({ id: 'signer-2', role: USER_ROLES.LEARNER });
      await userRepository.add(user);

      const svc = new ContractService({
        contractRepository,
        templateRepository: new InMemoryStore(),
        userRepository,
        documentRepository: new InMemoryStore(),
        auditService: { log: async () => {} },
        cryptoService: { generateSignatureHash: async () => 'hash-abc' },
      });

      await contractRepository.add({
        id: 'ctr-real-sig',
        templateId: 'tmpl-1',
        templateVersion: 1,
        content: 'Agreement content.',
        status: 'initiated',
        createdBy: 'signer-2',
        signedBy: null,
        signedAt: null,
        signatureData: null,
        signatureHash: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Simulate a real drawn signature — data URL with base64 payload > 500 chars
      const realSignatureData = 'data:image/png;base64,' + 'A'.repeat(600);

      const signed = await svc.signContract('ctr-real-sig', realSignatureData, 'Test User', 'signer-2');
      assertEqual(signed.status, 'signed', 'Contract is signed with valid drawn signature');
    });

    await it('typed name signatures are not subject to blank canvas check', async () => {
      const contractRepository = new InMemoryStore();
      const userRepository = new InMemoryStore();

      const user = makeUser({ id: 'signer-3', role: USER_ROLES.LEARNER });
      await userRepository.add(user);

      const svc = new ContractService({
        contractRepository,
        templateRepository: new InMemoryStore(),
        userRepository,
        documentRepository: new InMemoryStore(),
        auditService: { log: async () => {} },
        cryptoService: { generateSignatureHash: async () => 'hash-xyz' },
      });

      await contractRepository.add({
        id: 'ctr-typed-sig',
        templateId: 'tmpl-1',
        templateVersion: 1,
        content: 'Agreement content.',
        status: 'initiated',
        createdBy: 'signer-3',
        signedBy: null,
        signedAt: null,
        signatureData: null,
        signatureHash: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Typed name — not a data URL, should pass regardless of length
      const signed = await svc.signContract('ctr-typed-sig', 'Jane Smith', 'Jane Smith', 'signer-3');
      assertEqual(signed.status, 'signed', 'Typed name signature accepted without blank canvas check');
    });

    await it('empty signatureData is always rejected', async () => {
      const contractRepository = new InMemoryStore();
      const userRepository = new InMemoryStore();
      const user = makeUser({ id: 'signer-4', role: USER_ROLES.LEARNER });
      await userRepository.add(user);

      const svc = new ContractService({
        contractRepository,
        templateRepository: new InMemoryStore(),
        userRepository,
        documentRepository: new InMemoryStore(),
        auditService: { log: async () => {} },
        cryptoService: { generateSignatureHash: async () => 'hash' },
      });

      await contractRepository.add({
        id: 'ctr-empty-sig',
        status: 'initiated',
        createdBy: 'signer-4',
        content: 'text',
        templateId: 't1', templateVersion: 1,
        signedBy: null, signedAt: null, signatureData: null, signatureHash: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      await assertThrowsAsync(
        () => svc.signContract('ctr-empty-sig', '', 'Jane', 'signer-4'),
        'required'
      );
    });
  });


  // ============================================================
  // 3. PASSWORD RECOVERY FLOW (resetPassword)
  // ============================================================

  await describe('Password recovery: resetPassword() flow', async () => {
    const makeCrypto = () => ({
      hashPassword: async (p) => ({ hash: 'h-' + p, salt: 'salt' }),
      verifyPassword: async (p, h, s) => h === 'h-' + p,
    });

    await it('rejects missing userId', async () => {
      const svc = new AuthService({
        userRepository: new InMemoryStore(),
        sessionRepository: new InMemoryStore(),
        cryptoService: makeCrypto(),
        auditService: { log: async () => {} },
      });
      const result = await svc.resetPassword(null, 'newpassword1');
      assert(!result.success, 'Null userId rejected');
      assert(result.error.includes('required'), 'Error mentions required');
    });

    await it('rejects password shorter than 8 characters', async () => {
      const svc = new AuthService({
        userRepository: new InMemoryStore(),
        sessionRepository: new InMemoryStore(),
        cryptoService: makeCrypto(),
        auditService: { log: async () => {} },
      });
      const result = await svc.resetPassword('some-id', 'short');
      assert(!result.success, 'Short password rejected');
      assert(result.error.includes('8'), 'Error mentions 8 characters');
    });

    await it('rejects unknown userId', async () => {
      const svc = new AuthService({
        userRepository: new InMemoryStore(),
        sessionRepository: new InMemoryStore(),
        cryptoService: makeCrypto(),
        auditService: { log: async () => {} },
      });
      const result = await svc.resetPassword('nonexistent-id', 'newpassword1');
      assert(!result.success, 'Unknown userId rejected');
      assert(result.error.toLowerCase().includes('not found'), 'Error mentions not found');
    });

    await it('full recovery: plaintext-imported user blocked → reset → login succeeds', async () => {
      const { CryptoService } = await import('../src/services/CryptoService.js');
      const { AuditService } = await import('../src/services/AuditService.js');

      const userRepo = new InMemoryStore();
      const sessionRepo = new InMemoryStore();
      const realCrypto = new CryptoService();
      const audit = new AuditService({ auditLogRepository: new InMemoryStore() });

      const svc = new AuthService({
        userRepository: userRepo,
        sessionRepository: sessionRepo,
        cryptoService: realCrypto,
        auditService: audit,
      });

      // Simulate plaintext export state: no hash, reset required
      await userRepo.add({
        id: 'recovery-u1', username: 'imported_user',
        passwordHash: null, _requiresPasswordReset: true,
        role: USER_ROLES.LEARNER, displayName: 'Imported User',
        lockoutUntil: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      // Step 1: login blocked, recovery flag returned
      const before = await svc.login('imported_user', 'anything');
      assert(!before.success, 'Login blocked for null-hash user');
      assert(before.requiresPasswordReset, 'requiresPasswordReset flag set');
      assertEqual(before.userId, 'recovery-u1', 'userId returned for UI recovery');

      // Step 2: reset password
      const reset = await svc.resetPassword('recovery-u1', 'Recovered123!');
      assert(reset.success, 'Password reset succeeds');

      // Step 3: login now works
      const after = await svc.login('imported_user', 'Recovered123!');
      assert(after.success, 'Login succeeds after password reset');
      assertEqual(after.user.id, 'recovery-u1', 'Correct user returned');

      // Step 4: old wrong password still fails
      const wrong = await svc.login('imported_user', 'anything');
      assert(!wrong.success, 'Wrong password still rejected after reset');
    });

    await it('clears _requiresPasswordReset flag after reset', async () => {
      const { CryptoService } = await import('../src/services/CryptoService.js');
      const userRepo = new InMemoryStore();
      const realCrypto = new CryptoService();

      const svc = new AuthService({
        userRepository: userRepo,
        sessionRepository: new InMemoryStore(),
        cryptoService: realCrypto,
        auditService: { log: async () => {} },
      });

      await userRepo.add({
        id: 'reset-flag-u1', username: 'reset_flag_user',
        passwordHash: null, _requiresPasswordReset: true,
        role: USER_ROLES.LEARNER, displayName: 'Flag User',
        lockoutUntil: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      await svc.resetPassword('reset-flag-u1', 'ClearedFlag99!');

      const user = await userRepo.getById('reset-flag-u1');
      assert(user._requiresPasswordReset === false, '_requiresPasswordReset cleared after reset');
    });
  });

}
