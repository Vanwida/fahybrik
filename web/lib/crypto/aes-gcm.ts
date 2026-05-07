// AES-256-GCM for encrypting OAuth tokens at rest in Postgres.
//
// Layout of the bytea blob: [12-byte IV][16-byte auth tag][ciphertext...]
//
// The encryption key is taken from ENCRYPTION_KEY (env), expected as 32 bytes
// hex-encoded (64 hex chars). To generate one:
//
//   openssl rand -hex 32
//
// Rotation strategy (when needed):
//   1. add ENCRYPTION_KEY_NEXT, decrypt-with-old/encrypt-with-new lazily on
//      next access, then promote NEXT → current and remove old.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new CryptoConfigError('ENCRYPTION_KEY env var is required');
  }
  // Accept either hex (64 chars) or base64 (44 chars).
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    try {
      key = Buffer.from(raw, 'base64');
    } catch {
      throw new CryptoConfigError('ENCRYPTION_KEY must be 32 bytes (hex or base64 encoded)');
    }
  }
  if (key.length !== KEY_BYTES) {
    throw new CryptoConfigError(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`,
    );
  }
  return key;
}

export function encrypt(plaintext: string, key: Buffer = loadKey()): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decrypt(blob: Buffer, key: Buffer = loadKey()): string {
  if (blob.length < IV_BYTES + TAG_BYTES) {
    throw new Error('ciphertext blob too short');
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export class CryptoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoConfigError';
  }
}

export function isCryptoConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}
