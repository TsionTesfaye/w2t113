/**
 * Integration Test — Contract lifecycle using REAL ContractService
 */

import { describe, it, assert, assertEqual, assertThrowsAsync, buildTestServices, makeUser } from '../test-helpers.js';
import { CONTRACT_STATUS } from '../src/models/Contract.js';
import { USER_ROLES } from '../src/models/User.js';

export async function runContractSigningFlowTests() {
  await describe('Integration: Template → Contract → Sign → Void (real service)', async () => {
    await it('should complete full contract lifecycle', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      await repos.userRepository.add(makeUser({ id: 'u1', role: USER_ROLES.LEARNER }));

      const tpl = await contractService.createTemplate({ name: 'Enrollment Agreement', content: 'Dear {LearnerName}, your class {ClassName} starts on {StartDate}.', createdBy: 'admin1' });
      assert(tpl.placeholders.length === 3, 'Should detect 3 placeholders');

      const contract = await contractService.generateContract(tpl.id, { LearnerName: 'John', ClassName: 'Web Dev', StartDate: '2026-05-01' }, 'admin1');
      assert(contract.content.includes('John'));
      assertEqual(contract.status, CONTRACT_STATUS.INITIATED);

      // u1 is the contract creator via generateContract? No, admin1 created it. u1 signs.
      // u1 needs access — contract was created by admin1, so u1 doesn't have access.
      // Let's have admin1 sign or create for u1.
      const signed = await contractService.signContract(contract.id, 'data:image/png;base64,' + 'A'.repeat(600), 'John Doe', 'admin1');
      assertEqual(signed.status, CONTRACT_STATUS.SIGNED);
      assert(signed.signatureHash, 'Should have SHA-256 hash');
      assert(signed.signedAt);

      // Verify persistence
      const persisted = await repos.contractRepository.getById(contract.id);
      assertEqual(persisted.status, CONTRACT_STATUS.SIGNED);

      const voided = await contractService.voidContract(contract.id, 'admin1');
      assertEqual(voided.status, CONTRACT_STATUS.VOIDED);
    });
  });

  await describe('Integration: Contract signing validation (real service)', async () => {
    await it('should reject signing without signature data', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      const tpl = await contractService.createTemplate({ name: 'Test', content: 'Content', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'admin1');
      await assertThrowsAsync(() => contractService.signContract(contract.id, '', 'John', 'admin1'), 'Signature is required');
    });

    await it('should reject signing without signer name', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      const tpl = await contractService.createTemplate({ name: 'Test', content: 'Content', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'admin1');
      await assertThrowsAsync(() => contractService.signContract(contract.id, 'sig-data', '', 'admin1'), 'Signer name is required');
    });

    await it('should reject signing already signed contract', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      const tpl = await contractService.createTemplate({ name: 'Test', content: 'Content', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'admin1');
      await contractService.signContract(contract.id, 'sig-data', 'John', 'admin1');
      await assertThrowsAsync(() => contractService.signContract(contract.id, 'sig2', 'Jane', 'admin1'), 'initiated status');
    });
  });

  await describe('Integration: Contract state transitions (real service)', async () => {
    await it('should allow initiated → withdrawn', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'admin1');
      const withdrawn = await contractService.withdrawContract(contract.id, 'admin1');
      assertEqual(withdrawn.status, CONTRACT_STATUS.WITHDRAWN);
    });

    await it('should reject withdrawn → signed', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'admin1');
      await contractService.withdrawContract(contract.id, 'admin1');
      await assertThrowsAsync(() => contractService.transitionStatus(contract.id, CONTRACT_STATUS.SIGNED, 'admin1'), 'Cannot transition');
    });

    await it('should reject voided → any transition', async () => {
      const { contractService, repos } = buildTestServices();
      await repos.userRepository.add(makeUser({ id: 'admin1', role: USER_ROLES.ADMINISTRATOR }));
      const tpl = await contractService.createTemplate({ name: 'T', content: 'C', createdBy: 'admin1' });
      const contract = await contractService.generateContract(tpl.id, {}, 'admin1');
      await contractService.voidContract(contract.id, 'admin1');
      await assertThrowsAsync(() => contractService.transitionStatus(contract.id, CONTRACT_STATUS.INITIATED, 'admin1'), 'Cannot transition');
    });
  });
}
