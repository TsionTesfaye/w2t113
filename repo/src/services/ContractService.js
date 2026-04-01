/**
 * ContractService — template management, placeholder substitution, versioning,
 * signature handling, signing workflow states, PDF-like print export.
 */

import contractRepository from '../repositories/ContractRepository.js';
import templateRepository from '../repositories/TemplateRepository.js';
import userRepository from '../repositories/UserRepository.js';
import defaultDocumentRepository from '../repositories/DocumentRepository.js';
import defaultAuditService from './AuditService.js';
import defaultCryptoService from './CryptoService.js';
import { createContract, createTemplate, CONTRACT_STATUS, CONTRACT_TRANSITIONS } from '../models/Contract.js';
import { getConfig } from '../config/appConfig.js';
import { USER_ROLES } from '../models/User.js';
import { generateId, now, downloadBlob, escapeHtml } from '../utils/helpers.js';

export class ContractService {
  constructor(deps = {}) {
    this._contractRepo = deps.contractRepository || contractRepository;
    this._templateRepo = deps.templateRepository || templateRepository;
    this._userRepo = deps.userRepository || userRepository;
    this._documentRepo = deps.documentRepository || defaultDocumentRepository;
    this._auditService = deps.auditService || defaultAuditService;
    this._cryptoService = deps.cryptoService || defaultCryptoService;
  }

  async _requireAdmin(userId) {
    if (!userId) throw new Error('userId is required for this operation.');
    const user = await this._userRepo.getById(userId);
    if (!user) {
      throw new Error('Acting user not found. Cannot perform this operation.');
    }
    if (user.role !== USER_ROLES.ADMINISTRATOR) {
      throw new Error('Only administrators can manage templates.');
    }
  }

  async createTemplate(data) {
    await this._requireAdmin(data.createdBy);
    // Extract placeholders from content
    const placeholders = (data.content.match(/\{[^}]+\}/g) || []);

    const template = createTemplate({
      id: generateId(),
      name: data.name,
      content: data.content,
      placeholders,
      active: true,
      version: 1,
      effectiveDate: data.effectiveDate || now(),
    });

    await this._templateRepo.add(template);
    await this._auditService.log('template', template.id, 'created', `Template "${data.name}" v1 created`, data.createdBy || 'system');
    return template;
  }

  async updateTemplate(templateId, updates, updatedBy) {
    await this._requireAdmin(updatedBy);
    const existing = await this._templateRepo.getById(templateId);
    if (!existing) throw new Error('Template not found.');

    // Deactivate old version
    existing.active = false;
    existing.updatedAt = now();
    await this._templateRepo.put(existing);

    // Create new version
    const newVersion = createTemplate({
      id: generateId(),
      name: updates.name || existing.name,
      content: updates.content || existing.content,
      placeholders: (updates.content || existing.content).match(/\{[^}]+\}/g) || [],
      active: true,
      version: existing.version + 1,
      effectiveDate: updates.effectiveDate || now(),
    });

    await this._templateRepo.add(newVersion);
    await this._auditService.log('template', newVersion.id, 'versioned', `Template "${newVersion.name}" v${newVersion.version}`, updatedBy);
    return newVersion;
  }

  async getActiveTemplates() {
    try {
      return await this._templateRepo.getActive();
    } catch (err) {
      console.warn('ContractService.getActiveTemplates error, returning []:', err);
      return [];
    }
  }

  async getTemplateById(templateId) {
    return this._templateRepo.getById(templateId);
  }

  async getAllTemplates() {
    return this._templateRepo.getAll();
  }

  // --- Contract Generation ---

  /**
   * Generate a contract from a template with variable substitution.
   */
  async generateContract(templateId, variables, createdBy) {
    const template = await this._templateRepo.getById(templateId);
    if (!template) throw new Error('Template not found.');

    let content = template.content;
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    const contract = createContract({
      id: generateId(),
      templateId,
      templateVersion: template.version,
      content,
      status: CONTRACT_STATUS.INITIATED,
      createdBy,
    });

    await this._contractRepo.add(contract);
    await this._auditService.log('contract', contract.id, 'created', 'Contract generated from template', createdBy);
    return contract;
  }

  // --- Signing Workflow ---

  /**
   * Verify the acting user has access to the contract (owner or admin).
   */
  async _requireContractAccess(contract, userId) {
    if (!userId) throw new Error('userId is required for contract operations.');
    const user = await this._userRepo.getById(userId);
    if (!user) throw new Error('Acting user not found. Cannot perform contract operation.');
    if (user.role === USER_ROLES.ADMINISTRATOR) return user;
    if (contract.createdBy !== userId && contract.signedBy !== userId) {
      throw new Error('You do not have access to this contract.');
    }
    return user;
  }

  /**
   * Transition a contract's signing status.
   */
  async transitionStatus(contractId, newStatus, userId) {
    const contract = await this._contractRepo.getById(contractId);
    if (!contract) throw new Error('Contract not found.');

    await this._requireContractAccess(contract, userId);

    const config = getConfig();
    const configTransitions = (config.contract && config.contract.transitions) || CONTRACT_TRANSITIONS;
    const allowed = configTransitions[contract.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot transition contract from ${contract.status} to ${newStatus}.`);
    }

    const fromStatus = contract.status;
    contract.status = newStatus;
    contract.updatedAt = now();
    await this._contractRepo.put(contract);

    await this._auditService.log('contract', contractId, 'status_change', `${fromStatus} → ${newStatus}`, userId);
    return contract;
  }

  /**
   * Sign a contract — attach typed name or canvas signature + SHA-256 hash.
   */
  async signContract(contractId, signatureData, signerName, userId) {
    const contract = await this._contractRepo.getById(contractId);
    if (!contract) throw new Error('Contract not found.');

    await this._requireContractAccess(contract, userId);

    if (contract.status !== CONTRACT_STATUS.INITIATED) {
      throw new Error('Contract can only be signed when in initiated status.');
    }

    if (!signatureData || String(signatureData).trim() === '') {
      throw new Error('Signature is required before signing.');
    }

    if (!signerName || String(signerName).trim() === '') {
      throw new Error('Signer name is required.');
    }

    // Service-level blank drawn-signature rejection.
    // A blank canvas produces a very short base64 payload (~200 chars).
    // Any real stroke adds enough entropy to push well past 500 chars.
    if (String(signatureData).startsWith('data:image/')) {
      const base64Payload = signatureData.split(',')[1] || '';
      if (base64Payload.length < 500) {
        throw new Error('Drawn signature appears to be blank. Please draw your signature before submitting.');
      }
    }

    const timestamp = now();
    const hash = await this._cryptoService.generateSignatureHash(contract.content, signerName, timestamp);

    contract.signatureData = signatureData; // base64 canvas or typed name
    contract.signatureHash = hash;
    contract.signedBy = userId;             // user ID — preserved for access control
    contract.signerName = signerName;       // human-readable name for display/export
    contract.signedAt = timestamp;
    contract.status = CONTRACT_STATUS.SIGNED;
    contract.updatedAt = timestamp;

    await this._contractRepo.put(contract);
    await this._auditService.log('contract', contractId, 'signed', `Signed by ${signerName}, hash: ${hash.substring(0, 16)}...`, userId);
    return contract;
  }

  /**
   * Withdraw a contract.
   */
  async withdrawContract(contractId, userId) {
    return this.transitionStatus(contractId, CONTRACT_STATUS.WITHDRAWN, userId);
  }

  /**
   * Void a contract.
   */
  async voidContract(contractId, userId) {
    return this.transitionStatus(contractId, CONTRACT_STATUS.VOIDED, userId);
  }

  // --- Export ---

  /**
   * Export contract to a printable HTML blob for PDF-like output.
   */
  exportToPrintableHTML(contract) {
    // All user-controlled fields are escaped to prevent XSS in the exported HTML file.
    // Content is escaped first, then newlines are replaced with <br> tags.
    const safeContent = escapeHtml(contract.content || '').replace(/\n/g, '<br>');
    const safeId      = escapeHtml(String(contract.id || ''));
    // Use signerName for human-readable display; fall back to signedBy (userId) if not present
    const safeBy      = escapeHtml(String(contract.signerName || contract.signedBy || ''));
    const safeAt      = escapeHtml(String(contract.signedAt || ''));
    const safeHash    = escapeHtml(String(contract.signatureHash || ''));

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Contract ${safeId}</title>
<style>
  body { font-family: serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
  h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
  .sig-block { margin-top: 40px; border-top: 1px solid #999; padding-top: 10px; }
  .hash { font-size: 0.7em; color: #666; word-break: break-all; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>Training Contract</h1>
<div class="content">${safeContent}</div>
${contract.signedBy ? `
<div class="sig-block">
  <p><strong>Signed by:</strong> ${safeBy}</p>
  <p><strong>Date:</strong> ${safeAt}</p>
  <p class="hash"><strong>Integrity Hash:</strong> ${safeHash}</p>
</div>` : ''}
</body></html>`;
    return new Blob([html], { type: 'text/html' });
  }

  /**
   * Trigger download of a printable contract and record the export in DocumentRepository.
   */
  async downloadContract(contract) {
    // Record the export event in the documents store first (non-fatal)
    try {
      await this._documentRepo.add({
        id: generateId(),
        contractId: contract.id,
        type: 'html-export',
        filename: `contract-${contract.id}.html`,
        exportedAt: now(),
      });
    } catch (_) {
      // Non-fatal: duplicate or write failure must not block the download
    }

    // Trigger browser download (non-fatal in non-browser environments)
    try {
      const blob = this.exportToPrintableHTML(contract);
      downloadBlob(blob, `contract-${contract.id}.html`);
    } catch (_) {
      // Non-fatal in test/non-browser environments
    }
  }

  async getContractById(contractId) {
    return this._contractRepo.getById(contractId);
  }

  async getAllContracts() {
    return this._contractRepo.getAll();
  }

  /**
   * Get contracts scoped by the acting user's role.
   * Admin: all. Others: only contracts they created or signed.
   */
  async getAllContractsScoped(actingUserId) {
    if (!actingUserId) return [];
    const user = await this._userRepo.getById(actingUserId);
    if (!user) return [];
    const all = await this._contractRepo.getAll();
    if (user.role === USER_ROLES.ADMINISTRATOR) return all;
    return all.filter(c => c.createdBy === actingUserId || c.signedBy === actingUserId);
  }

  async getContractsByStatus(status) {
    return this._contractRepo.getByStatus(status);
  }
}

export default new ContractService();
