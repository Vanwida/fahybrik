import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { hashGarminAccessToken } from '@/lib/garmin/token-store';
import { ingestGarminPayload } from '@/lib/sync/ingest-garmin';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

// Finding M15: the webhook must resolve athletes via an indexed SHA-256 lookup
// on garmin_oauth_tokens.access_token_sha256 — NOT by decrypting every row.

describe('hashGarminAccessToken', () => {
  test('is the hex SHA-256 of the token (same scheme as magic_link/partner_invitation)', () => {
    const token = 'garmin-user-access-token-abc123';
    const expected = createHash('sha256').update(token).digest('hex');
    expect(hashGarminAccessToken(token)).toBe(expected);
    expect(hashGarminAccessToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('is deterministic and collision-free for distinct tokens', () => {
    expect(hashGarminAccessToken('a')).toBe(hashGarminAccessToken('a'));
    expect(hashGarminAccessToken('a')).not.toBe(hashGarminAccessToken('b'));
  });
});

describe('ingestGarminPayload — athlete resolution by hashed token', () => {
  // A resolver that mirrors the webhook route: hash the incoming token and do a
  // single indexed lookup. The fake sql only returns a row when queried with the
  // EXACT hash of the known token — modelling the UNIQUE index match.
  const KNOWN_TOKEN = 'live-user-access-token-xyz';
  const KNOWN_HASH = hashGarminAccessToken(KNOWN_TOKEN);
  const KNOWN_ATHLETE = BigInt(42);

  function makeResolver() {
    const seenSql: string[] = [];
    const handler: SqlHandler = (sqlText, values) => {
      seenSql.push(sqlText);
      // Lookup query must filter by access_token_sha256 and must NOT select
      // access_token_encrypted (no full-table decrypt).
      if (sqlText.includes('access_token_sha256') && values.includes(KNOWN_HASH)) {
        return [{ athlete_id: KNOWN_ATHLETE }];
      }
      // Any insert/dup-check during ingest — return empty so nothing inserts.
      return [];
    };
    const sql = createFakeSql(handler);
    const resolveAthlete = async (token: string): Promise<bigint | null> => {
      const hash = hashGarminAccessToken(token);
      const rows = await sql<{ athlete_id: bigint }[]>`
        select athlete_id from garmin_oauth_tokens
        where access_token_sha256 = ${hash}
        limit 1
      `;
      return rows[0]?.athlete_id ?? null;
    };
    return { sql, resolveAthlete, seenSql };
  }

  test('resolves a known token to its athlete via the hash index', async () => {
    const { sql, resolveAthlete, seenSql } = makeResolver();
    const result = await ingestGarminPayload({
      sql,
      rawBody: '{}',
      resolveAthlete,
      payload: {
        dailies: [
          { userAccessToken: KNOWN_TOKEN, summaryId: 's1', startTimeInSeconds: 1_700_000_000, steps: 9000 },
        ],
      },
    });

    expect(result.skipped_unknown_athlete).toBe(0);
    // The resolver issued a hash-keyed lookup, never a full-table token scan.
    const lookup = seenSql.find((s) => s.includes('from garmin_oauth_tokens'));
    expect(lookup).toBeDefined();
    expect(lookup).toContain('access_token_sha256');
    expect(lookup).not.toContain('access_token_encrypted');
  });

  test('skips an unknown token (no matching hash → no athlete)', async () => {
    const { sql, resolveAthlete } = makeResolver();
    const result = await ingestGarminPayload({
      sql,
      rawBody: '{}',
      resolveAthlete,
      payload: {
        dailies: [
          { userAccessToken: 'some-other-token', summaryId: 's2', startTimeInSeconds: 1_700_000_000, steps: 1000 },
        ],
      },
    });
    expect(result.skipped_unknown_athlete).toBe(1);
    expect(result.inserted_streams).toBe(0);
  });
});
