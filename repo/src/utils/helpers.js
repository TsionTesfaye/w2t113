/**
 * General utility helpers used across the application.
 */

import { getConfig } from '../config/appConfig.js';

/**
 * Generate a UUID v4 string.
 */
export function generateId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

/**
 * Current ISO timestamp.
 */
export function now() {
  return new Date().toISOString();
}

/**
 * Deep clone a plain object via structuredClone (or JSON fallback).
 */
export function deepClone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Mask a string, showing only the last N characters.
 * @param {string} value
 * @param {number} visibleCount
 */
export function maskString(value, visibleCount = 4) {
  if (!value || value.length <= visibleCount) return value;
  return '*'.repeat(value.length - visibleCount) + value.slice(-visibleCount);
}

/**
 * Format a date string for display.
 */
export function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Debounce a function.
 */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Sanitize HTML to prevent XSS.
 * Uses string replacement (works in both browser and Node).
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validate file is JPG or PNG and within size limit.
 */
export function validateImageFile(file, maxSizeMB = 2) {
  const validTypes = ['image/jpeg', 'image/png'];
  if (!validTypes.includes(file.type)) {
    return { valid: false, error: 'Only JPG and PNG files are allowed.' };
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return { valid: false, error: `File must be under ${maxSizeMB}MB.` };
  }
  return { valid: true, error: null };
}

/**
 * Read a file as ArrayBuffer.
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read a file as text.
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Read a file as data URL (base64).
 */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Mask an email address for display (e.g. j***@example.com).
 */
export function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 1) return `${local}@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 1)}@${domain}`;
}

/**
 * Mask a user ID for display.
 * Default (sharedMode=true): IDs are masked to the last 4 characters for privacy.
 * When sharedMode=false (private/internal use): IDs are shown in full.
 */
export function maskId(id) {
  try {
    const cfg = getConfig();
    if (cfg && cfg.sharedMode === false) return id;
  } catch (_) {
    // If config unavailable (e.g. early boot), fall back to masking
  }
  return maskString(id, 4);
}

/**
 * Trigger a browser download for a Blob.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
