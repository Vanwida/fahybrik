// listWearableConnections — pure mapping over a fake SQL client (row shape →
// response shape). The exact SQL is exercised separately in status.db.test.ts
// against a real branch; here we pin the status→connected and Date→ISO mapping.

import { describe, expect, it } from 'vitest';
import { createFakeSql } from '../utils/fake-sql';
import { listWearableConnections } from '@/lib/wearables/status';

describe('listWearableConnections (mapping)', () => {
  it('maps rows: connected reflects status, connected_at → ISO', async () => {
    const connectedAt = new Date('2026-07-01T10:20:30.000Z');
    const sql = createFakeSql(() => [
      { provider: 'garmin', status: 'revoked', connected_at: connectedAt },
      { provider: 'polar', status: 'connected', connected_at: connectedAt },
    ]);

    const out = await listWearableConnections({ athlete_id: BigInt(42) }, sql);

    expect(out).toEqual([
      { provider: 'garmin', connected: false, connected_at: '2026-07-01T10:20:30.000Z' },
      { provider: 'polar', connected: true, connected_at: '2026-07-01T10:20:30.000Z' },
    ]);
  });

  it("treats any non-'connected' status as not connected", async () => {
    const at = new Date('2026-07-02T00:00:00.000Z');
    const sql = createFakeSql(() => [{ provider: 'polar', status: 'error', connected_at: at }]);
    const out = await listWearableConnections({ athlete_id: BigInt(1) }, sql);
    expect(out[0]!.connected).toBe(false);
  });

  it('no rows → empty array', async () => {
    const sql = createFakeSql(() => []);
    const out = await listWearableConnections({ athlete_id: BigInt(1) }, sql);
    expect(out).toEqual([]);
  });

  it('scopes the query to the athlete and orders by provider', async () => {
    let seenSql = '';
    let seenValues: unknown[] = [];
    const sql = createFakeSql((text, values) => {
      seenSql = text;
      seenValues = values;
      return [];
    });
    await listWearableConnections({ athlete_id: BigInt(77) }, sql);
    expect(seenSql).toContain('from wearable_connections');
    expect(seenSql).toContain('where athlete_id = $1');
    expect(seenSql).toContain('order by provider asc');
    expect(seenValues[0]).toBe(BigInt(77));
  });
});
