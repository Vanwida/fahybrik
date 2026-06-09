/**
 * Backfill `garmin_oauth_tokens.access_token_sha256` for rows created before
 * migration 0033 (Finding M15).
 *
 * The webhook now resolves an athlete via an indexed SHA-256 of the Garmin
 * userAccessToken instead of decrypting every row. New tokens get the hash
 * written at save time (lib/garmin/token-store.ts). This script fills the hash
 * for any pre-existing rows by decrypting each ONCE (a bounded, one-off cost)
 * and storing the hex SHA-256.
 *
 * Idempotent: only rows where access_token_sha256 IS NULL are touched, so
 * re-running is a no-op. No-op too when there are no rows.
 *
 *   pnpm --filter @fahybrid/infra backfill:garmin-hash
 *
 * Crypto layout mirrors web/lib/crypto/aes-gcm.ts exactly:
 *   bytea blob = [12-byte IV][16-byte auth tag][ciphertext]
 *   key        = ENCRYPTION_KEY (32 bytes, hex-64 or base64)
 * and the hash mirrors web/lib/auth/magic-link.ts:hashToken
 *   sha256(plaintext) → hex
 */
import { createDecipheriv, createHash } from 'node:crypto';
import { getSql } from './_db.js';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY env var is required to decrypt tokens');
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(`ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}`);
  }
  return key;
}

function decrypt(blob: Buffer, key: Buffer): string {
  if (blob.length < IV_BYTES + TAG_BYTES) throw new Error('ciphertext blob too short');
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

async function main(): Promise<void> {
  const sql = getSql();
  try {
    const rows = await sql<{ athlete_id: string; access_token_encrypted: Buffer }[]>`
      select athlete_id::text as athlete_id, access_token_encrypted
      from garmin_oauth_tokens
      where access_token_sha256 is null
    `;

    if (rows.length === 0) {
      console.log('[backfill:garmin-hash] no rows need backfilling — done.');
      return;
    }

    const key = loadKey();
    let updated = 0;
    let failed = 0;
    for (const r of rows) {
      let hash: string;
      try {
        hash = hashToken(decrypt(r.access_token_encrypted, key));
      } catch {
        failed += 1;
        console.warn(`[backfill:garmin-hash] could not decrypt athlete_id=${r.athlete_id}; skipped`);
        continue;
      }
      await sql`
        update garmin_oauth_tokens
        set access_token_sha256 = ${hash}
        where athlete_id = ${r.athlete_id}::bigint
          and access_token_sha256 is null
      `;
      updated += 1;
    }

    console.log(`[backfill:garmin-hash] done — ${updated} updated, ${failed} undecryptable.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
