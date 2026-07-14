/**
 * listWearableConnections — real-DB integration (no SQL mocked). Requires
 * migration 0056 (wearable_connections). Verifies the actual query against a
 * branch: rows scoped to the athlete, ordered by provider, status→connected,
 * connected_at surfaced as an ISO string, and no rows → [].
 *
 * WRITE, do NOT run here (TCP egress is blocked; the orchestrator runs the suite
 * against an ephemeral branch).
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

const DB_TEST_TIMEOUT_MS = 30_000;

import { listWearableConnections } from '@/lib/wearables/status';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete } from '../utils/db-fixtures';

describeWithDb('listWearableConnections (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  // Raw insert (bypasses the encrypting store — access_token_encrypted is bytea
  // NOT NULL, so we pass a dummy blob; this suite reads status/connected_at, not
  // tokens).
  async function insertConnection(
    athleteId: number,
    provider: string,
    status: 'connected' | 'revoked' | 'error',
  ): Promise<void> {
    await sql`
      insert into wearable_connections (athlete_id, provider, access_token_encrypted, status)
      values (${athleteId}, ${provider}, ${Buffer.from('x')}, ${status})
    `;
  }

  test(
    'returns per-provider status ordered by provider, with connected flag + ISO connected_at',
    async () => {
      const fx = await makeCoachAndAthlete(sql);
      cleanups.push(fx.cleanup);
      // Connections cascade on athlete delete, but purge explicitly for clarity.
      cleanups.push(async () => {
        await sql`delete from wearable_connections where athlete_id = ${fx.athleteId}`;
      });

      await insertConnection(fx.athleteId, 'polar', 'connected');
      await insertConnection(fx.athleteId, 'garmin', 'revoked');

      const out = await listWearableConnections({ athlete_id: BigInt(fx.athleteId) }, sql);

      expect(out.map((p) => p.provider)).toEqual(['garmin', 'polar']); // alpha order
      const garmin = out.find((p) => p.provider === 'garmin')!;
      const polar = out.find((p) => p.provider === 'polar')!;
      expect(garmin.connected).toBe(false);
      expect(polar.connected).toBe(true);
      // connected_at is a non-empty ISO 8601 string (NOT NULL default now()).
      expect(polar.connected_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(() => new Date(polar.connected_at).toISOString()).not.toThrow();
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'an athlete with no connections → empty array',
    async () => {
      const fx = await makeCoachAndAthlete(sql);
      cleanups.push(fx.cleanup);
      const out = await listWearableConnections({ athlete_id: BigInt(fx.athleteId) }, sql);
      expect(out).toEqual([]);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'scopes strictly to the athlete (another athlete’s rows are not returned)',
    async () => {
      const a = await makeCoachAndAthlete(sql);
      const b = await makeCoachAndAthlete(sql);
      cleanups.push(a.cleanup);
      cleanups.push(b.cleanup);
      cleanups.push(async () => {
        await sql`delete from wearable_connections where athlete_id in (${a.athleteId}, ${b.athleteId})`;
      });

      await insertConnection(b.athleteId, 'polar', 'connected');

      const out = await listWearableConnections({ athlete_id: BigInt(a.athleteId) }, sql);
      expect(out).toEqual([]);
    },
    DB_TEST_TIMEOUT_MS,
  );
});
