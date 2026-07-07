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

/**
 * Query-routed fake sql: unlike makeFakeSql (one result for every SELECT), this
 * returns a DIFFERENT result depending on which table the SELECT hits, so we can
 * simulate "the workout is new (biometric_streams empty) BUT a structured
 * execution already recorded it (workout_executions has a source_workout_ref
 * match)". Inserts and updates are captured; SELECTs are routed by table.
 */
function makeRoutedFakeSql(routes: {
  executionGuard?: unknown[]; // select ... from workout_executions where ... source_workout_ref
  assignmentLookup?: unknown[]; // select ... from workout_assignments (nearest scheduled)
  biometric?: unknown[]; // select ... from biometric_streams (workout/sample dedupe)
}): { sql: Sql; calls: Call[] } {
  const calls: Call[] = [];
  const tag = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    const raw = strings.join('?');
    calls.push({ raw, values });
    if (/^\s*insert\s+into/i.test(raw)) return Promise.resolve([]);
    if (/^\s*update\s+/i.test(raw)) return Promise.resolve([]);
    // SELECTs, routed by target table. Guard check first (its FROM is
    // workout_executions AND it filters on source_workout_ref); the assignment
    // lookup's FROM is workout_assignments (workout_executions only appears in
    // its LEFT JOIN, without source_workout_ref), so the two never collide.
    if (/from\s+workout_executions/i.test(raw) && /source_workout_ref/i.test(raw)) {
      return Promise.resolve(routes.executionGuard ?? []);
    }
    if (/from\s+workout_assignments/i.test(raw)) {
      return Promise.resolve(routes.assignmentLookup ?? []);
    }
    if (/from\s+biometric_streams/i.test(raw)) {
      return Promise.resolve(routes.biometric ?? []);
    }
    return Promise.resolve([]);
  };
  return { sql: tag as unknown as Sql, calls };
}

function workoutOnlyBatch() {
  const parsed = healthkitSyncRequestSchema.safeParse({
    batch: {
      athlete_id: '7',
      sent_at: '2026-05-26T07:00:00.000Z',
      workouts: [
        {
          source_workout_id: 'HK-UUID-AM-RUN',
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
      samples: [],
    },
  });
  if (!parsed.success) throw new Error('fixture batch failed schema');
  return parsed.data.batch;
}

describe('ingestHealthkitBatch — double-transport guard (structured execution already recorded)', () => {
  it('does NOT link/flip any assignment when an execution with the same source_workout_ref exists', async () => {
    // Scenario: athlete has AM + PM assignments; ran the AM on the watch. The
    // structured execution (path 1) already logged AM with source_workout_ref =
    // 'HK-UUID-AM-RUN'. Now the raw HKWorkout arrives via HealthKit (path 2).
    // biometric_streams has no row for it yet (new → gets ingested), but the
    // execution guard finds the match and must skip the assignment link so the
    // PM session is NOT falsely marked completed.
    const { sql, calls } = makeRoutedFakeSql({
      biometric: [], // workout is new → biometric inserts proceed
      executionGuard: [{ id: '501' }], // structured execution already recorded it
      assignmentLookup: [{ id: '42', existing_source: null }], // available, but must be ignored
    });

    const result = await ingestHealthkitBatch({
      sql,
      athlete_id: BigInt(7),
      batch: workoutOnlyBatch(),
    });

    // Biometric streams STILL ingested (path 1 does not duplicate these).
    const biometricInserts = calls.filter(
      (c) =>
        /^\s*insert\s+into/i.test(c.raw) && /insert\s+into\s+biometric_streams/i.test(c.raw),
    );
    expect(biometricInserts.length).toBe(3); // training_load + hr + calories_active

    // The guard ran and matched.
    const guardSelects = calls.filter(
      (c) => /from\s+workout_executions/i.test(c.raw) && /source_workout_ref/i.test(c.raw),
    );
    expect(guardSelects.length).toBe(1);

    // No workout_executions row written, no assignment flipped — the whole point.
    const executionInserts = calls.filter((c) =>
      /insert\s+into\s+workout_executions/i.test(c.raw),
    );
    expect(executionInserts.length).toBe(0);
    const assignmentFlips = calls.filter((c) => /update\s+workout_assignments/i.test(c.raw));
    expect(assignmentFlips.length).toBe(0);

    // Guard skips before the assignment lookup even runs.
    const assignmentLookups = calls.filter((c) => /from\s+workout_assignments/i.test(c.raw));
    expect(assignmentLookups.length).toBe(0);

    expect(result.executions_linked).toBe(0);
    expect(result.workouts_inserted).toBe(1);
  });

  it('DOES link when no execution carries the incoming source_workout_ref (normal passive sync)', async () => {
    // Control: same workout, but path 1 never ran (executionGuard empty). The
    // ingest must still link to the day's scheduled assignment and flip it — the
    // guard only suppresses the DUPLICATE case, never the legitimate one.
    const { sql, calls } = makeRoutedFakeSql({
      biometric: [],
      executionGuard: [], // nothing recorded this workout yet
      assignmentLookup: [{ id: '42', existing_source: null }],
    });

    const result = await ingestHealthkitBatch({
      sql,
      athlete_id: BigInt(7),
      batch: workoutOnlyBatch(),
    });

    const executionInserts = calls.filter((c) =>
      /insert\s+into\s+workout_executions/i.test(c.raw),
    );
    expect(executionInserts.length).toBe(1);
    const assignmentFlips = calls.filter((c) => /update\s+workout_assignments/i.test(c.raw));
    expect(assignmentFlips.length).toBe(1);
    expect(result.executions_linked).toBe(1);
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
