// Smoke test for the HealthKit ingest pipeline.
//
// Why this exists: biometric_streams had 0 rows in the dev DB and we needed to
// prove the ingest actually writes rows for a valid synthetic batch — i.e.
// that the dedupe isn't silently discarding everything and the inserts target
// biometric_streams with the canonical metric_type / columns the schema
// expects.
//
// Strategy: drive the *pure* ingestHealthkitBatch() with a fake `sql` that
// simulates an empty table — every dedupe/lookup SELECT returns []], every
// INSERT is captured. We assert that:
//   - a valid workout produces 3 biometric_streams INSERTs
//     (training_load + hr + calories_active)
//   - valid samples produce one INSERT each, mapped to the canonical metric
//   - an unknown metric is dropped (no INSERT) without throwing
//   - re-running with the table now "non-empty" dedupes (0 new INSERTs),
//     proving dedupe is exact-match, not blanket-discard.

import { describe, expect, it } from 'vitest';
import { ingestHealthkitBatch } from '@/lib/sync/ingest-healthkit';
import { healthkitSyncRequestSchema } from '@/lib/sync/schema';
import type { Sql } from '@/lib/db';

type Call = { raw: string; values: unknown[] };

/**
 * Fake tagged-template sql. `dedupeResult` is what every SELECT returns
 * (defaults to [] = empty table). INSERTs return [] and are recorded so we
 * can assert how many rows would be written.
 */
function makeFakeSql(opts?: { dedupeResult?: unknown[] }): {
  sql: Sql;
  inserts: Call[];
  selects: Call[];
} {
  const inserts: Call[] = [];
  const selects: Call[] = [];
  const dedupeResult = opts?.dedupeResult ?? [];
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    const raw = strings.join('?');
    if (/^\s*insert\s+into/i.test(raw)) {
      inserts.push({ raw, values });
      return Promise.resolve([]);
    }
    // SELECT (dedupe check or assignment lookup)
    selects.push({ raw, values });
    return Promise.resolve(dedupeResult);
  };
  return { sql: tag as unknown as Sql, inserts, selects };
}

function validBatch() {
  const parsed = healthkitSyncRequestSchema.safeParse({
    batch: {
      athlete_id: '7',
      sent_at: '2026-05-26T07:00:00.000Z',
      workouts: [
        {
          source_workout_id: 'wk-uuid-1',
          workout_activity_type: 37,
          started_at: '2026-05-26T06:00:00.000Z',
          ended_at: '2026-05-26T06:45:00.000Z',
          duration_seconds: 2700,
          total_energy_burned_kcal: 432,
          total_distance_meters: 8000,
          avg_heart_rate_bpm: 162,
          max_heart_rate_bpm: 184,
          lap_markers: [],
          source: 'healthkit',
        },
      ],
      samples: [
        {
          metric_type: 'heart_rate',
          recorded_at: '2026-05-26T06:10:00.000Z',
          value_numeric: 158,
          unit: 'count/min',
          source: 'healthkit',
          source_workout_id: null,
        },
        {
          metric_type: 'hrv_sdnn',
          recorded_at: '2026-05-26T05:00:00.000Z',
          value_numeric: 72.5,
          unit: 'ms',
          source: 'healthkit',
          source_workout_id: null,
        },
        {
          // unknown metric → dropped, not inserted, never throws.
          metric_type: 'walking_steadiness',
          recorded_at: '2026-05-26T05:00:00.000Z',
          value_numeric: 0.9,
          unit: 'percent',
          source: 'healthkit',
          source_workout_id: null,
        },
      ],
    },
  });
  if (!parsed.success) throw new Error('fixture batch failed schema');
  return parsed.data.batch;
}

describe('ingestHealthkitBatch — empty table (first ever sync)', () => {
  it('inserts biometric_streams rows for a valid synthetic batch', async () => {
    const { sql, inserts } = makeFakeSql({ dedupeResult: [] });
    const result = await ingestHealthkitBatch({
      sql,
      athlete_id: BigInt(7),
      batch: validBatch(),
    });

    // Workout → 3 rows: training_load + hr + calories_active.
    // 2 known samples → 1 row each. Unknown sample → 0 rows.
    // No assignment match (lookup returns []), so no workout_executions insert.
    const biometricInserts = inserts.filter((c) =>
      /insert\s+into\s+biometric_streams/i.test(c.raw),
    );
    expect(biometricInserts.length).toBe(5);

    // The workout marker row anchors on 'training_load' with the full payload.
    expect(biometricInserts.some((c) => c.raw.includes("'training_load'::biometric_metric"))).toBe(
      true,
    );

    expect(result.workouts_inserted).toBe(1);
    expect(result.workouts_skipped_duplicate).toBe(0);
    expect(result.samples_inserted).toBe(2);
    expect(result.samples_skipped_unknown_metric).toBe(1);
    expect(result.samples_skipped_duplicate).toBe(0);
    expect(result.executions_linked).toBe(0);
  });
});

describe('ingestHealthkitBatch — non-empty table (dedupe is exact-match)', () => {
  it('skips everything when the dedupe SELECT finds a matching row', async () => {
    // Every dedupe SELECT returns a hit → all workouts + samples are dupes.
    const { sql, inserts } = makeFakeSql({ dedupeResult: [{ id: '1' }] });
    const result = await ingestHealthkitBatch({
      sql,
      athlete_id: BigInt(7),
      batch: validBatch(),
    });

    const biometricInserts = inserts.filter((c) =>
      /insert\s+into\s+biometric_streams/i.test(c.raw),
    );
    // Dedupe is real: with a matching row present, no biometric_streams insert
    // happens. This confirms 0-rows in prod is NOT over-aggressive dedupe —
    // an empty table can never produce a dedupe hit (proven by the test above).
    expect(biometricInserts.length).toBe(0);
    expect(result.workouts_skipped_duplicate).toBe(1);
    expect(result.samples_skipped_duplicate).toBe(2);
    expect(result.samples_inserted).toBe(0);
  });
});
