/**
 * Real-DB integration tests for `ingestExecutionSegments` — the per-segment
 * persistence the `/api/sync/workout-execution` route delegates to.
 *
 * The route validates the bearer + owns the assignment, then hands the parsed
 * `segments[]` to this lib with an injectable `Sql` client; the lib owns the
 * actual upsert. We exercise that real upsert against a Neon test branch: a
 * posted run + row segment produce `segment_executions` rows carrying the
 * modality + modality-native intensity (pace /km, pace /500m, power), and a
 * re-send is IDEMPOTENT on (execution_id, position) — no duplicate rows.
 *
 * Nothing is mocked (project rule). Each test seeds its own coach/athlete/
 * assignment/execution and tears them down via `Fixture.cleanup()` (executions
 * + segments cascade from the assignment delete).
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import {
  ingestExecutionSegments,
  normalizeModality,
  segmentInputSchema,
  type SegmentInput,
} from '@/lib/sync/ingest-execution-segments';
import { loadSegmentActuals } from '@/lib/dashboard/coach/session-actuals';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

const START = '2026-04-06T08:00:00.000Z';

// Insert a workout_executions row for an assignment and return its id.
async function makeExecution(fx: Fixture, assignmentId: number): Promise<number> {
  const rows = await fx.sql<Array<{ id: string }>>`
    insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source)
    values (${assignmentId}, ${fx.athleteId}, ${START}::timestamptz, ${START}::timestamptz, 'healthkit')
    returning id::text
  `;
  return Number(rows[0]!.id);
}

describeWithDb('ingestExecutionSegments (real DB)', () => {
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

  async function seedExecution(): Promise<{ fx: Fixture; executionId: number }> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tplId = await makeTemplate({ fx, name: 'hyrox-session' });
    const assignmentId = await makeAssignment({ fx, templateId: tplId, scheduledForIso: '2026-04-06' });
    const executionId = await makeExecution(fx, assignmentId);
    return { fx, executionId };
  }

  test('persists a run + row segment with modality and modality-native intensity', async () => {
    const { fx, executionId } = await seedExecution();

    const segments: SegmentInput[] = [
      {
        position: 0,
        modality: 'running', // normalizes → run
        distance_meters: 1000,
        avg_pace_s_per_km: 240,
        duration_seconds: 240,
        avg_hr: 165,
      },
      {
        position: 1,
        modality: 'rowerg', // normalizes → row
        distance_meters: 500,
        avg_pace_s_per_500m: 110,
        avg_power_w: 280,
        stroke_rate_spm: 30,
        duration_seconds: 110,
      },
    ];

    const written = await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments,
    });
    expect(written).toBe(2);

    const rows = await sql<
      Array<{
        position: number;
        modality: string;
        distance_meters: string | null;
        avg_pace_s_per_km: string | null;
        avg_pace_s_per_500m: string | null;
        avg_power_w: string | null;
        stroke_rate_spm: string | null;
      }>
    >`
      select position, modality, distance_meters, avg_pace_s_per_km, avg_pace_s_per_500m,
             avg_power_w, stroke_rate_spm
      from segment_executions
      where execution_id = ${executionId}
      order by position
    `;
    expect(rows).toHaveLength(2);

    const run = rows[0]!;
    expect(run.modality).toBe('run');
    expect(Number(run.distance_meters)).toBe(1000);
    expect(Number(run.avg_pace_s_per_km)).toBe(240);
    expect(run.avg_pace_s_per_500m).toBeNull();

    const row = rows[1]!;
    expect(row.modality).toBe('row');
    expect(Number(row.avg_pace_s_per_500m)).toBe(110);
    expect(Number(row.avg_power_w)).toBe(280);
    expect(Number(row.stroke_rate_spm)).toBe(30);
    expect(row.avg_pace_s_per_km).toBeNull();

    void fx;
  });

  test('round-trips run_cadence_spm + incline_pct with pinned types and honest NULLs (mig 0124)', async () => {
    const { executionId } = await seedExecution();

    const segments: SegmentInput[] = [
      // A run leg with both new running signals in range.
      { position: 0, modality: 'run', distance_meters: 1000, avg_pace_s_per_km: 240, run_cadence_spm: 178, incline_pct: 6 },
      // A run leg with NEITHER signal → both must read back NULL (never a 0).
      { position: 1, modality: 'run', distance_meters: 1000, avg_pace_s_per_km: 250 },
      // Out-of-band values are gated to NULL by ingest, so the CHECK never trips.
      { position: 2, modality: 'run', distance_meters: 1000, avg_pace_s_per_km: 260, run_cadence_spm: 80, incline_pct: 45 },
    ];

    const written = await ingestExecutionSegments({ sql, executionId, executionStartedAt: START, segments });
    expect(written).toBe(3);

    const rows = await sql<
      Array<{ position: number; run_cadence_spm: number | null; incline_pct: string | null }>
    >`
      select position, run_cadence_spm, incline_pct::text as incline_pct
      from segment_executions
      where execution_id = ${executionId}
      order by position
    `;
    expect(rows).toHaveLength(3);

    // In-range values persist with the RIGHT types (integer → number; numeric → text).
    expect(rows[0]!.run_cadence_spm).toBe(178);
    expect(typeof rows[0]!.run_cadence_spm).toBe('number');
    expect(Number(rows[0]!.incline_pct)).toBe(6);

    // Absent signals are honest NULL, never a fabricated 0.
    expect(rows[1]!.run_cadence_spm).toBeNull();
    expect(rows[1]!.incline_pct).toBeNull();

    // Out-of-band → gated to NULL (row still inserted, CHECK not violated).
    expect(rows[2]!.run_cadence_spm).toBeNull();
    expect(rows[2]!.incline_pct).toBeNull();
  });

  test('is idempotent on (execution_id, position): re-send updates in place, no duplicates', async () => {
    const { executionId } = await seedExecution();

    const first: SegmentInput[] = [
      { position: 0, modality: 'run', distance_meters: 1000, avg_pace_s_per_km: 250 },
    ];
    await ingestExecutionSegments({ sql, executionId, executionStartedAt: START, segments: first });

    // Re-send the SAME position with a corrected pace → upsert, not insert.
    const second: SegmentInput[] = [
      { position: 0, modality: 'run', distance_meters: 1000, avg_pace_s_per_km: 235 },
    ];
    await ingestExecutionSegments({ sql, executionId, executionStartedAt: START, segments: second });

    const rows = await sql<Array<{ count: number }>>`
      select count(*)::int as count from segment_executions where execution_id = ${executionId}
    `;
    expect(rows[0]!.count).toBe(1);

    const [row] = await sql<Array<{ avg_pace_s_per_km: string }>>`
      select avg_pace_s_per_km from segment_executions where execution_id = ${executionId} and position = 0
    `;
    expect(Number(row!.avg_pace_s_per_km)).toBe(235);
  });

  test('derives ended_at from started_at + duration when no explicit end', async () => {
    const { executionId } = await seedExecution();
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [{ position: 0, modality: 'run', duration_seconds: 300 }],
    });
    const [row] = await sql<Array<{ secs: string }>>`
      select extract(epoch from (ended_at - started_at))::int as secs
      from segment_executions where execution_id = ${executionId} and position = 0
    `;
    expect(Number(row!.secs)).toBe(300);
  });

  test('persists the zone_seconds payload (round-trips back to the object)', async () => {
    const { executionId } = await seedExecution();
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [{ position: 0, modality: 'run', zone_seconds_json: { z2: 120, z3: 60 } }],
    });
    // The lib passes the wrapper through `sql.json(...)`, so the column stores a
    // real jsonb OBJECT (jsonb_typeof='object'), NOT a double-encoded string
    // scalar — `raw_lap_data_json->'zone_seconds'` reads back as the object.
    const [row] = await sql<Array<{ shape: string; payload: unknown }>>`
      select jsonb_typeof(raw_lap_data_json) as shape,
             raw_lap_data_json#>>'{}' as payload
      from segment_executions where execution_id = ${executionId} and position = 0
    `;
    expect(row!.shape).toBe('object');
    const decoded = JSON.parse(String(row!.payload)) as { zone_seconds?: Record<string, number> };
    expect(decoded.zone_seconds).toEqual({ z2: 120, z3: 60 });
  });

  test('erg detail (#33) round-trips POST → raw_lap_data_json → loadSegmentActuals', async () => {
    const { executionId } = await seedExecution();
    // A complete PM5 erg segment: the segment-level aggregates + the monitor's
    // interval splits, alongside zone_seconds (they must coexist in one blob).
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [
        {
          position: 0,
          modality: 'row',
          distance_meters: 1000,
          avg_pace_s_per_500m: 108,
          avg_power_w: 240,
          stroke_rate_spm: 29,
          zone_seconds_json: { z3: 200 },
          drag_factor: 118,
          avg_calories_per_hour: 900,
          peak_drive_force_lbs: 142.5,
          avg_drive_force_lbs: 98.2,
          erg_splits: [
            { index: 0, time_seconds: 108, distance_meters: 500, avg_pace_s_per_500m: 108, stroke_rate_spm: 29, avg_power_w: 245, calories: 12, calories_per_hour: 900, drag_factor: 118, rest_time_seconds: null, rest_distance_meters: null, avg_hr: 150 },
            { index: 1, time_seconds: 110, distance_meters: 500, avg_pace_s_per_500m: 110, stroke_rate_spm: 28, avg_power_w: 235, calories: 12, calories_per_hour: 880, drag_factor: 118, rest_time_seconds: 30, rest_distance_meters: 0, avg_hr: 152 },
          ],
        },
      ],
    });

    // Stored as a jsonb OBJECT (sql.json), NOT a double-encoded string scalar.
    const [shape] = await sql<Array<{ t: string }>>`
      select jsonb_typeof(raw_lap_data_json) as t
      from segment_executions where execution_id = ${executionId} and position = 0
    `;
    expect(shape!.t).toBe('object');

    // The coach/athlete detail reads it back through the SAME shape iOS decodes.
    const [a] = await loadSegmentActuals(sql, executionId);
    expect(a!.drag_factor).toBe(118);
    expect(a!.avg_calories_per_hour).toBe(900);
    expect(a!.peak_drive_force_lbs).toBe(142.5);
    expect(a!.avg_drive_force_lbs).toBe(98.2);
    expect(a!.erg_splits).toHaveLength(2);
    expect(a!.erg_splits![0]!.avg_power_w).toBe(245);
    expect(a!.erg_splits![1]!.rest_time_seconds).toBe(30);
    // The segment-level aggregate columns still land verbatim (unchanged path).
    expect(a!.avg_power_w).toBe(240);
    expect(a!.stroke_rate_spm).toBe(29);
  });

  test('EMOM completion (mig 0134) persists + reads back; a non-EMOM segment leaves it NULL', async () => {
    const { executionId } = await seedExecution();
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [
        // An EMOM segment: 8 of 10 intervals completed.
        { position: 0, modality: 'other', emom_rounds_completed: 8, emom_rounds_prescribed: 10 },
        // A plain run leg: no EMOM → both columns honest NULL, never a fabricated 0.
        { position: 1, modality: 'run', distance_meters: 1000, avg_pace_s_per_km: 240 },
      ],
    });

    const rows = await sql<
      Array<{ position: number; emom_rounds_completed: number | null; emom_rounds_prescribed: number | null }>
    >`
      select position, emom_rounds_completed, emom_rounds_prescribed
      from segment_executions where execution_id = ${executionId}
      order by position
    `;
    expect(rows[0]!.emom_rounds_completed).toBe(8);
    expect(rows[0]!.emom_rounds_prescribed).toBe(10);
    expect(rows[1]!.emom_rounds_completed).toBeNull();
    expect(rows[1]!.emom_rounds_prescribed).toBeNull();

    // The coach reader surfaces the completion so the loop is real ("X/Y rondas").
    const actuals = await loadSegmentActuals(sql, executionId);
    expect(actuals[0]!.emom_rounds_completed).toBe(8);
    expect(actuals[0]!.emom_rounds_prescribed).toBe(10);
    expect(actuals[1]!.emom_rounds_completed).toBeNull();
  });

  test('a non-erg segment writes NO raw_lap_data_json (honest null, no empty erg blob)', async () => {
    const { executionId } = await seedExecution();
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [{ position: 0, modality: 'strength', reps_actual: 8, weight_used_kg: 60 }],
    });
    const [row] = await sql<Array<{ raw: unknown }>>`
      select raw_lap_data_json as raw
      from segment_executions where execution_id = ${executionId} and position = 0
    `;
    expect(row!.raw).toBeNull();
  });

  test('empty segments[] writes nothing', async () => {
    const { executionId } = await seedExecution();
    const written = await ingestExecutionSegments({ sql, executionId, executionStartedAt: START, segments: [] });
    expect(written).toBe(0);
  });

  // --- Honest work logging (migration 0088) -------------------------------

  test('untouched prescribed reps log the prescribed value with reps_confirmed=false (NEVER 0)', async () => {
    const { executionId } = await seedExecution();
    // Athlete advanced past the segment without acting: client sends the primed
    // value (actual == prescribed) and reps_confirmed=false.
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [{ position: 0, modality: 'strength', reps_prescribed: 10, reps_actual: 10, reps_confirmed: false }],
    });
    const [row] = await sql<
      Array<{ reps_completed: number | null; reps_prescribed: number | null; reps_status: string | null; reps_confirmed: boolean }>
    >`
      select reps_completed, reps_prescribed, reps_status, reps_confirmed
      from segment_executions where execution_id = ${executionId} and position = 0
    `;
    expect(row!.reps_completed).toBe(10); // the prescribed value, NOT a fabricated 0
    expect(row!.reps_prescribed).toBe(10);
    expect(row!.reps_status).toBe('done');
    expect(row!.reps_confirmed).toBe(false);
  });

  test('a skipped segment logs NULL actual + reps_status=skipped (no fabricated 0)', async () => {
    const { executionId } = await seedExecution();
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [{ position: 0, modality: 'strength', reps_prescribed: 10, reps_actual: null }],
    });
    const [row] = await sql<Array<{ reps_completed: number | null; reps_status: string | null; reps_confirmed: boolean }>>`
      select reps_completed, reps_status, reps_confirmed
      from segment_executions where execution_id = ${executionId} and position = 0
    `;
    expect(row!.reps_completed).toBeNull();
    expect(row!.reps_status).toBe('skipped');
    expect(row!.reps_confirmed).toBe(false);
  });

  test('a pure run segment leaves reps_status NULL (coherence: a run is not a skipped rep set)', async () => {
    const { executionId } = await seedExecution();
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [{ position: 0, modality: 'run', distance_meters: 1000, avg_pace_s_per_km: 240 }],
    });
    const [row] = await sql<Array<{ reps_status: string | null; reps_completed: number | null }>>`
      select reps_status, reps_completed from segment_executions where execution_id = ${executionId} and position = 0
    `;
    expect(row!.reps_status).toBeNull();
    expect(row!.reps_completed).toBeNull();
  });

  test('a strength segment with sets writes set_executions rows (status derived; re-sync replaces in place)', async () => {
    const { executionId } = await seedExecution();
    const strength: SegmentInput = {
      position: 0,
      modality: 'strength',
      reps_completed: 27, // aggregate Σ actual
      weight_used_kg: 60,
      sets: [
        { set_index: 1, reps_prescribed: 10, reps_actual: 10, load_actual_kg: 60, confirmed: true }, // done
        { set_index: 2, reps_prescribed: 10, reps_actual: 9, load_actual_kg: 60, rpe: 8.5, status: 'scaled', confirmed: true },
        { set_index: 3, reps_prescribed: 10, reps_actual: 8, load_actual_kg: 60 }, // status derived → scaled
      ],
    };
    await ingestExecutionSegments({ sql, executionId, executionStartedAt: START, segments: [strength] });

    const sets = await sql<
      Array<{ set_index: number; reps_actual: number | null; status: string; confirmed: boolean; rpe: string | null }>
    >`
      select se.set_index, se.reps_actual, se.status, se.confirmed, se.rpe
      from set_executions se
      join segment_executions seg on seg.id = se.segment_execution_id
      where seg.execution_id = ${executionId} and seg.position = 0
      order by se.set_index
    `;
    expect(sets).toHaveLength(3);
    expect(sets[0]!.status).toBe('done');
    expect(sets[1]!.status).toBe('scaled');
    expect(Number(sets[1]!.rpe)).toBe(8.5);
    expect(sets[2]!.status).toBe('scaled'); // derived: 8 != prescribed 10
    expect(sets[2]!.reps_actual).toBe(8);

    // Re-sync the SAME segment with fewer/changed sets → delete-then-insert, no dupes.
    const resync: SegmentInput = {
      position: 0,
      modality: 'strength',
      reps_completed: 20,
      weight_used_kg: 62.5,
      sets: [
        { set_index: 1, reps_prescribed: 10, reps_actual: 10, load_actual_kg: 62.5, confirmed: true },
        { set_index: 2, reps_prescribed: 10, reps_actual: 10, load_actual_kg: 62.5, confirmed: true },
      ],
    };
    await ingestExecutionSegments({ sql, executionId, executionStartedAt: START, segments: [resync] });

    const [{ n }] = await sql<Array<{ n: number }>>`
      select count(*)::int as n
      from set_executions se
      join segment_executions seg on seg.id = se.segment_execution_id
      where seg.execution_id = ${executionId} and seg.position = 0
    `;
    expect(n).toBe(2); // replaced cleanly, the 3rd set is gone
  });

  test('is_approach viaja al set guardado y el agregado del tramo solo cuenta trabajo', async () => {
    const { executionId } = await seedExecution();
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [
        {
          position: 0,
          modality: 'strength',
          reps_completed: 20,
          weight_used_kg: 100,
          sets: [
            { set_index: 1, reps_prescribed: 5, reps_actual: 5, load_actual_kg: 50, is_approach: true },
            { set_index: 2, reps_prescribed: 5, reps_actual: 5, load_actual_kg: 50, is_approach: true },
            { set_index: 3, reps_prescribed: 5, reps_actual: 5, load_actual_kg: 100, confirmed: true },
            { set_index: 4, reps_prescribed: 5, reps_actual: 5, load_actual_kg: 100, confirmed: true },
          ],
        },
      ],
    });

    const sets = await sql<
      Array<{ set_index: number; load_actual_kg: string; is_approach: boolean }>
    >`
      select se.set_index, se.load_actual_kg::text as load_actual_kg, se.is_approach
      from set_executions se
      join segment_executions seg on seg.id = se.segment_execution_id
      where seg.execution_id = ${executionId} and seg.position = 0
      order by se.set_index
    `;
    expect(sets).toHaveLength(4);
    expect(sets[0]!.is_approach).toBe(true);
    expect(sets[1]!.is_approach).toBe(true);
    expect(sets[2]!.is_approach).toBe(false);
    expect(sets[3]!.is_approach).toBe(false);
    expect(Number(sets[0]!.load_actual_kg)).toBe(50);

    const [seg] = await sql<Array<{ reps_completed: number | null; weight_used_kg: string | null }>>`
      select reps_completed, weight_used_kg::text as weight_used_kg
      from segment_executions
      where execution_id = ${executionId} and position = 0
    `;
    expect(seg!.reps_completed).toBe(10);
    expect(Number(seg!.weight_used_kg)).toBe(100);

    const actuals = await loadSegmentActuals(sql, executionId);
    expect(actuals[0]!.sets.map((s) => s.is_approach)).toEqual([true, true, false, false]);
    expect(actuals[0]!.sets.filter((s) => s.is_approach)).toHaveLength(2);
  });

  test('sin is_approach en el cable la serie guardada es trabajo', async () => {
    const { executionId } = await seedExecution();
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [
        {
          position: 0,
          modality: 'strength',
          sets: [{ set_index: 1, reps_actual: 5, load_actual_kg: 80 }],
        },
      ],
    });
    const [row] = await sql<Array<{ is_approach: boolean }>>`
      select se.is_approach
      from set_executions se
      join segment_executions seg on seg.id = se.segment_execution_id
      where seg.execution_id = ${executionId}
    `;
    expect(row!.is_approach).toBe(false);
  });
});

// These are pure (no DB) — run regardless of TEST_DATABASE_URL.
import { describe } from 'vitest';
describe('normalizeModality + segmentInputSchema (pure)', () => {
  test('normalizes client aliases to the canonical set', () => {
    expect(normalizeModality('running')).toBe('run');
    expect(normalizeModality('row-erg')).toBe('row');
    expect(normalizeModality('skierg')).toBe('ski');
    expect(normalizeModality('assault-bike')).toBe('bike');
    expect(normalizeModality('weights')).toBe('strength');
    expect(normalizeModality('yoga')).toBe('other');
    expect(normalizeModality(null)).toBe('other');
  });

  test('setInputSchema acepta is_approach y lo omite como trabajo', () => {
    const withFlag = segmentInputSchema.safeParse({
      position: 0,
      modality: 'strength',
      sets: [{ set_index: 1, is_approach: true }],
    });
    expect(withFlag.success).toBe(true);
    if (withFlag.success) expect(withFlag.data.sets?.[0]?.is_approach).toBe(true);
    const omitted = segmentInputSchema.safeParse({
      position: 0,
      modality: 'strength',
      sets: [{ set_index: 1 }],
    });
    expect(omitted.success).toBe(true);
    if (omitted.success) expect(omitted.data.sets?.[0]?.is_approach).toBeUndefined();
  });

  test('segmentInputSchema requires position >= 0 and a non-empty modality', () => {
    expect(segmentInputSchema.safeParse({ position: 0, modality: 'run' }).success).toBe(true);
    expect(segmentInputSchema.safeParse({ position: -1, modality: 'run' }).success).toBe(false);
    expect(segmentInputSchema.safeParse({ position: 0, modality: '' }).success).toBe(false);
  });

  test('segmentInputSchema accepts EMOM completion (mig 0134), rejecting negatives', () => {
    const ok = segmentInputSchema.safeParse({
      position: 0,
      modality: 'other',
      emom_rounds_completed: 8,
      emom_rounds_prescribed: 10,
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.emom_rounds_completed).toBe(8);
      expect(ok.data.emom_rounds_prescribed).toBe(10);
    }
    // A non-EMOM segment simply omits them (both optional).
    expect(segmentInputSchema.safeParse({ position: 0, modality: 'run' }).success).toBe(true);
    // Negatives are rejected (a count is never < 0).
    expect(
      segmentInputSchema.safeParse({ position: 0, modality: 'other', emom_rounds_completed: -1 }).success,
    ).toBe(false);
  });
});
