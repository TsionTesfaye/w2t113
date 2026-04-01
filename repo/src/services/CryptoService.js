/**
 * CryptoService — PBKDF2 password hashing, AES encryption, SHA-256 hashing, masking.
 */

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const AES_IV_LENGTH = 12;

export class CryptoService {
  /**
   * Hash a password with PBKDF2.
   * @returns {{ hash: string, salt: string }}
   */
  async hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return {
      hash: this._bufToHex(bits),
      salt: this._bufToHex(salt),
    };
  }

  /**
   * Verify a password against a stored hash+salt.
   */
  async verifyPassword(password, storedHash, storedSalt) {
    const salt = this._hexToBuf(storedSalt);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return this._bufToHex(bits) === storedHash;
  }

  /**
   * SHA-256 hash of a string.
   */
  async sha256(content) {
    const data = new TextEncoder().encode(content);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return this._bufToHex(hash);
  }

  /**
   * AES-GCM encrypt with a passphrase.
   * @returns {{ iv: string, ciphertext: string, salt: string }}
   */
  async encrypt(plaintext, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const key = await this._deriveAESKey(passphrase, salt);
    const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    return {
      iv: this._bufToHex(iv),
      ciphertext: this._bufToHex(ciphertext),
      salt: this._bufToHex(salt),
    };
  }

  /**
   * AES-GCM decrypt with a passphrase.
   */
  async decrypt(encryptedData, passphrase) {
    const salt = this._hexToBuf(encryptedData.salt);
    const iv = this._hexToBuf(encryptedData.iv);
    const ciphertext = this._hexToBuf(encryptedData.ciphertext);
    const key = await this._deriveAESKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  }

  /**
   * Generate a tamper-evident hash for document signing.
   */
  async generateSignatureHash(documentContent, signerName, timestamp) {
    const payload = `${documentContent}|${signerName}|${timestamp}`;
    return this.sha256(payload);
  }

  /**
   * Mask a string showing only last N chars.
   */
  mask(value, visibleCount = 4) {
    if (!value || value.length <= visibleCount) return value;
    return '*'.repeat(value.length - visibleCount) + value.slice(-visibleCount);
  }

  // --- Internal helpers ---

  async _deriveAESKey(passphrase, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  _bufToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  _hexToBuf(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
  }
}

export default new CryptoService();
