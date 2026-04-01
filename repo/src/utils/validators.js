/**
 * Validation utilities for forms and business rules.
 */

export function required(value, fieldName = 'Field') {
  if (value === null || value === undefined || String(value).trim() === '') {
    return `${fieldName} is required.`;
  }
  return null;
}

export function minLength(value, min, fieldName = 'Field') {
  if (String(value).trim().length < min) {
    return `${fieldName} must be at least ${min} characters.`;
  }
  return null;
}

export function maxLength(value, max, fieldName = 'Field') {
  if (String(value).trim().length > max) {
    return `${fieldName} must be at most ${max} characters.`;
  }
  return null;
}

export function inRange(value, min, max, fieldName = 'Field') {
  const num = Number(value);
  if (isNaN(num) || num < min || num > max) {
    return `${fieldName} must be between ${min} and ${max}.`;
  }
  return null;
}

export function isInteger(value, fieldName = 'Field') {
  if (!Number.isInteger(Number(value))) {
    return `${fieldName} must be an integer.`;
  }
  return null;
}

export function isOneOf(value, allowed, fieldName = 'Field') {
  if (!allowed.includes(value)) {
    return `${fieldName} must be one of: ${allowed.join(', ')}.`;
  }
  return null;
}

/**
 * Validate an array of rules. Returns first error or null.
 */
export function validateField(value, rules) {
  for (const rule of rules) {
    const error = rule(value);
    if (error) return error;
  }
  return null;
}

/**
 * Validate an object against a schema of field → rules[].
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateObject(obj, schema) {
  const errors = {};
  for (const [field, rules] of Object.entries(schema)) {
    const error = validateField(obj[field], rules);
    if (error) errors[field] = error;
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validate question import row (for bulk import).
 */
export function validateQuestionRow(row, index) {
  const errors = [];
  if (!row.questionText || String(row.questionText).trim() === '') {
    errors.push(`Row ${index}: questionText is required`);
  }
  const validTypes = ['single', 'multiple', 'fill-in', 'subjective'];
  if (!validTypes.includes(row.type)) {
    errors.push(`Row ${index}: type must be one of ${validTypes.join(', ')}`);
  }
  if (row.type !== 'subjective' && (!row.correctAnswer || String(row.correctAnswer).trim() === '')) {
    errors.push(`Row ${index}: correctAnswer is required for ${row.type} type`);
  }
  const diff = Number(row.difficulty);
  if (!Number.isInteger(diff) || diff < 1 || diff > 5) {
    errors.push(`Row ${index}: difficulty must be 1–5`);
  }
  if (!row.tags || String(row.tags).trim() === '') {
    errors.push(`Row ${index}: tags is required`);
  }
  return errors;
}
