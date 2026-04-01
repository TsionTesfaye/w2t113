/**
 * Contract and Template domain models.
 * Signing workflow: initiated → signed → withdrawn → voided.
 */

export const CONTRACT_STATUS = {
  INITIATED: 'initiated',
  SIGNED: 'signed',
  WITHDRAWN: 'withdrawn',
  VOIDED: 'voided',
};

export const CONTRACT_TRANSITIONS = {
  [CONTRACT_STATUS.INITIATED]: [CONTRACT_STATUS.SIGNED, CONTRACT_STATUS.WITHDRAWN, CONTRACT_STATUS.VOIDED],
  [CONTRACT_STATUS.SIGNED]:    [CONTRACT_STATUS.VOIDED],
  [CONTRACT_STATUS.WITHDRAWN]: [],  // terminal
  [CONTRACT_STATUS.VOIDED]:    [],  // terminal
};

export function createTemplate({ id, name, content, placeholders = [], active = true, version = 1, effectiveDate, createdAt, updatedAt }) {
  return {
    id,
    name,
    content,            // template text with {placeholders}
    placeholders,       // ['{LearnerName}', '{ClassStartDate}', ...]
    active,
    version,
    effectiveDate,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
}

export function createContract({ id, templateId, templateVersion, content, status, signatureData = null, signatureHash = null, signedBy = null, signedAt = null, signerName = null, createdBy, createdAt, updatedAt }) {
  return {
    id,
    templateId,
    templateVersion,
    content,            // rendered template with substituted values
    status: status || CONTRACT_STATUS.INITIATED,
    signatureData,      // base64 canvas image or typed name
    signatureHash,      // SHA-256(content + signer + timestamp)
    signedBy,           // userId of the signer (for access control)
    signedAt,
    signerName,         // human-readable signer name (for display/export)
    createdBy,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
}
