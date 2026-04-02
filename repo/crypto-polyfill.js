/**
 * Polyfill globalThis.crypto for Node.js 18.
 * Node 18 has crypto.webcrypto but doesn't expose it as the global `crypto`.
 * Node 20+ exposes it automatically. This shim bridges the gap.
 */
if (typeof globalThis.crypto === 'undefined') {
  try {
    const { webcrypto } = await import('node:crypto');
    globalThis.crypto = webcrypto;
  } catch (_) {
    // Not in Node — browser already has crypto global
  }
}
