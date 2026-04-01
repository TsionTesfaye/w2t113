/**
 * appConfig — runtime access to configuration values from src/config/defaults.json.
 * ALL workflow transitions, thresholds, weights, and SLA values are config-driven.
 * Admin overrides are persisted to localStorage so they survive page reloads.
 *
 * Source of truth: src/config/defaults.json
 * The embedded fallback below mirrors that file exactly and is used only when the
 * JSON module import is unavailable (e.g. older runtime environments).
 */

const CONFIG_STORAGE_KEY = 'trainingops_config_overrides';

let _config = null;

function _readStoredOverrides() {
  try {
    const raw = (typeof localStorage !== 'undefined') && localStorage.getItem(CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function _writeStoredOverrides(cfg) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
    }
  } catch (_) {
    // Ignore (private browsing, quota exceeded, Node.js test env)
  }
}

/**
 * Emergency fallback — mirrors src/config/defaults.json exactly.
 * Used only when the JSON module import fails at runtime.
 * KEEP IN SYNC with defaults.json.
 */
const _EMBEDDED_DEFAULTS = {
  devMode: true,
  sharedMode: true,
  reputation: { weights: { fulfillmentRate: 0.5, lateRate: 0.3, complaintRate: 0.2 }, threshold: 60, windowDays: 90 },
  registration: {
    waitlistPromotionFillRate: 0.95,
    transitions: {
      Draft: ['Submitted', 'Cancelled'],
      Submitted: ['NeedsMoreInfo', 'UnderReview', 'Cancelled', 'Waitlisted'],
      NeedsMoreInfo: ['Submitted', 'Cancelled'],
      UnderReview: ['Approved', 'Rejected', 'NeedsMoreInfo', 'Cancelled'],
      Waitlisted: ['UnderReview', 'Cancelled'],
      Approved: ['Cancelled'],
      Rejected: [],
      Cancelled: [],
    },
    terminalStates: ['Rejected', 'Cancelled'],
    rejectionCommentMinLength: 20,
  },
  review: { maxImages: 6, maxImageSizeMB: 2, maxTextLength: 2000, followUpWindowDays: 14 },
  moderation: { resolutionDeadlineDays: 7 },
  quiz: { subjectiveScoreMin: 0, subjectiveScoreMax: 10 },
  contract: {
    transitions: {
      initiated: ['signed', 'withdrawn', 'voided'],
      signed: ['voided'],
      withdrawn: [],
      voided: [],
    },
  },
};

export async function loadAppConfig() {
  // Primary source of truth: src/config/defaults.json loaded via JSON module import.
  // Works in Node.js 20.10+ and Chrome 123+ without flags or network calls.
  // Falls back to _EMBEDDED_DEFAULTS on older runtimes — values are identical.
  let base;
  try {
    const { default: defaultsJson } = await import('./defaults.json', { with: { type: 'json' } });
    base = defaultsJson;
  } catch (_) {
    base = _EMBEDDED_DEFAULTS;
  }

  // Overlay any persisted admin overrides from localStorage
  const overrides = _readStoredOverrides();
  _config = overrides ? mergeDeep({ ...base }, overrides) : { ...base };

  return _config;
}

export function getConfig() {
  return _config || _EMBEDDED_DEFAULTS;
}

/**
 * Update runtime config. Merges provided values into the active config.
 * Services that call getConfig() on every operation will pick up changes immediately.
 */
export function updateConfig(partial) {
  const current = _config || { ..._EMBEDDED_DEFAULTS };
  _config = mergeDeep(current, partial);
  // Persist the full merged config so it survives page reloads
  _writeStoredOverrides(_config);
  return _config;
}

function mergeDeep(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export default { loadAppConfig, getConfig, updateConfig };
