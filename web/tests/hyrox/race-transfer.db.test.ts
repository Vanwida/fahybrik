/**
 * Real-DB verification of the training × race CROSS loader (Fase 2). No SQL is
 * mocked — a fresh fixture athlete gets a SINGLES race with splits, a DOUBLES
 * race that must be EXCLUDED, zone-profile thresholds, and real
 * segment_executions (a fresh + a fatigued run, one fresh station practice). Then
 * `buildRaceTransfer` runs against the Neon test branch and every tier /
 * normalization / exclusion is asserted on the real result.
 *
 * SKIPPED unless TEST_DATABASE_URL is set (describeWithDb). Requires migrations
 * through 0120 (segment_executions context columns) + the exercises catalog on
 * the branch (a clone of demo-mockdata has both).
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildRaceTransfer } from '@/lib/athlete/race-transfer';
import { buildCarrerasOverview } from '@/lib/athlete/race-context';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('race-transfer cross (real DB)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  test('crosses trained vs competed with tiers, erg ÷2, and doubles excluded', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const athleteId = fx.athleteId;

    // ── Zone-profile thresholds (the `estimado` tier for ski/row/run) ──────────
    // zones_json only needs to be a 6-element array to satisfy the DB check.
    const zones = [{}, {}, {}, {}, {}, {}];
    for (const [modality, threshold, unit] of [
      ['run', 255, 'per_km'],
      ['ski', 132, 'per_500m'],
      ['row', 112, 'per_500m'],
    ] as const) {
      await sql`
        insert into athlete_zone_profiles (athlete_id, modality, threshold_s, pace_unit, zones_json, version, source)
        values (${athleteId}, ${modality}, ${threshold}, ${unit}, ${sql.json(zones)}, 1, 'coach_test')
      `;
    }

    // ── A SINGLES race with splits (the competed side) ─────────────────────────
    const singlesStations = [
      { index: 2, seconds: 295, rank: null }, // ski  → ÷2 = 147.5
      { index: 4, seconds: 138, rank: null }, // sled push (no practice → sin_datos)
      { index: 10, seconds: 300, rank: null }, // row → ÷2 = 150
      { index: 16, seconds: 345, rank: null }, // wall balls (has a practice)
    ];
    const runSplits = [300, 292, 296, 302, 298, 306, 284, 282]; // mean 295
    const singles = await sql<Array<{ id: string }>>`
      insert into races (athlete_id, name, event_type, format, division, gender_category, race_date,
        source, run_splits_json, station_splits_json)
      values (${athleteId}, 'Cross Singles', 'hyrox', 'singles', 'open', 'men', '2026-03-14'::date,
        'hyresult_import', ${sql.json(runSplits)}, ${sql.json(singlesStations)})
      returning id::text
    `;
    const singlesId = Number(singles[0]!.id);

    // ── A DOUBLES race, MORE RECENT + faster ski, that must NOT win the cross ──
    const doublesStations = [{ index: 2, seconds: 200, rank: null }]; // ÷2 = 100 if wrongly used
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, race_date,
        source, run_splits_json, station_splits_json)
      values (${athleteId}, 'Cross Doubles', 'hyrox', 'doubles', 'open', 'men', '2026-06-01'::date,
        'hyresult_import', ${sql.json([200, 200, 200, 200, 200, 200, 200, 200])}, ${sql.json(doublesStations)})
    `;

    // ── A wall-balls exercise from the catalog (functional station, position 8) ─
    const wbRows = await sql<Array<{ id: string }>>`
      select id::text as id from exercises where hyrox_station_position = 8 limit 1
    `;
    expect(wbRows.length).toBe(1);
    const wallBallsExerciseId = Number(wbRows[0]!.id);

    // ── Real training efforts on one execution ─────────────────────────────────
    const templateId = await makeTemplate({ fx, name: 'Cross session', format: 'circuit' });
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: '2026-02-01', status: 'completed' });
    const execRows = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source)
      values (${assignmentId}, ${athleteId}, '2026-02-01T08:00:00Z'::timestamptz, '2026-02-01T09:00:00Z'::timestamptz, 'manual')
      returning id::text
    `;
    const execId = Number(execRows[0]!.id);

    // run fresco (steady, pos 0, pw 0) · run fatigado (hyrox_sim) · wall balls fresco practice
    await sql`
      insert into segment_executions
        (execution_id, position, started_at, ended_at, modality, avg_pace_s_per_km, exercise_id, context_format, context_source, prior_work_s, is_structural, source)
      values
        (${execId}, 0, '2026-02-01T08:00:00Z'::timestamptz, '2026-02-01T08:05:00Z'::timestamptz, 'run', 270, null, 'steady', 'block', 0, false, 'demo'),
        (${execId}, 1, '2026-02-01T08:20:00Z'::timestamptz, '2026-02-01T08:24:00Z'::timestamptz, 'run', 250, null, 'hyrox_sim', 'block', 900, false, 'demo')
    `;
    // Wall-balls fresh practice: a 300 s station duration (started→ended), context 'sets'.
    await sql`
      insert into segment_executions
        (execution_id, position, started_at, ended_at, modality, exercise_id, context_format, context_source, prior_work_s, is_structural, source)
      values
        (${execId}, 2, '2026-02-01T08:40:00Z'::timestamptz, '2026-02-01T08:45:00Z'::timestamptz, null, ${wallBallsExerciseId}, 'sets', 'block', 0, false, 'demo')
    `;

    // ── Run the cross ──────────────────────────────────────────────────────────
    const res = await buildRaceTransfer({ athlete_id: athleteId }, sql);

    // Availability + the SINGLES race is the source (doubles ignored).
    expect(res.availability).toBe('ok');
    expect(res.race_id).toBe(singlesId);
    expect(res.race_name).toBe('Cross Singles');

    const byIndex = new Map(res.stations.map((s) => [s.index, s]));

    // Run — race mean 295. It has a 255 threshold → the headline is the threshold
    // (tier estimado); the observed fresh/fatigued efforts stay as BEST-effort context.
    const run = byIndex.get(0)!;
    expect(run.kind).toBe('run');
    expect(run.race_seconds).toBe(295);
    expect(run.trained.tier).toBe('estimado');
    expect(run.trained.value_s).toBe(255); // the calibrated threshold, not the run mean
    expect(run.trained.contexto?.fresco_s).toBe(270); // best fresh effort
    expect(run.trained.contexto?.fatigado_s).toBe(250); // best fatigued effort
    expect(run.trained.n_efforts).toBe(2);
    expect(run.transfer_delta_pct).toBe(16); // (295−255)/255 → POSITIVE now

    // Ski — estimado 132, erg split 295 ÷2 = 147.5 (NOT the doubles' 100).
    const ski = byIndex.get(2)!;
    expect(ski.unit).toBe('per_500m');
    expect(ski.race_seconds).toBe(147.5);
    expect(ski.trained.tier).toBe('estimado');
    expect(ski.trained.value_s).toBe(132);
    expect(ski.transfer_delta_pct).toBe(12);

    // Row — estimado 112, erg split 300 ÷2 = 150, +34 %.
    const row = byIndex.get(10)!;
    expect(row.race_seconds).toBe(150);
    expect(row.trained.tier).toBe('estimado');
    expect(row.transfer_delta_pct).toBe(34);

    // Wall balls — observado from the practice (functional seconds, no ÷2).
    const wb = byIndex.get(16)!;
    expect(wb.unit).toBe('seconds');
    expect(wb.race_seconds).toBe(345);
    expect(wb.trained.tier).toBe('observado');
    expect(wb.trained.value_s).toBe(300);
    expect(wb.transfer_delta_pct).toBe(15); // (345−300)/300

    // Sled push — a race split but no practice → sin_datos, delta null (never a fake 0).
    const sled = byIndex.get(4)!;
    expect(sled.race_seconds).toBe(138);
    expect(sled.trained.tier).toBe('sin_datos');
    expect(sled.transfer_delta_pct).toBeNull();
  }, 60000);

  test('an athlete with ONLY doubles gets the only_doubles gate', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, race_date,
        source, station_splits_json)
      values (${fx.athleteId}, 'Solo Doubles', 'hyrox', 'doubles', 'open', 'men', '2026-05-01'::date,
        'hyresult_import', ${sql.json([{ index: 2, seconds: 250, rank: null }])})
    `;
    const res = await buildRaceTransfer({ athlete_id: fx.athleteId }, sql);
    expect(res.availability).toBe('only_doubles');
    expect(res.race_id).toBeNull();
    // Trained side is still shaped (all sin_datos here — no efforts), never crashes.
    expect(res.stations.length).toBe(9);
  }, 60000);

  test('carreras hub fills the personal transfer delta on the station benchmark', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    // A ski threshold → the estimado trained level (132 s/500m → 264 s over 1 km).
    await sql`
      insert into athlete_zone_profiles (athlete_id, modality, threshold_s, pace_unit, zones_json, version, source)
      values (${fx.athleteId}, 'ski', 132, 'per_500m', ${sql.json([{}, {}, {}, {}, {}, {}])}, 1, 'coach_test')
    `;
    // A results.hyrox.com import (source 'hyrox_import') → the hub's benchmarks.
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, race_date,
        source, run_splits_json, station_splits_json, result_time_seconds)
      values (${fx.athleteId}, 'Hub Singles', 'hyrox', 'singles', 'open', 'men', '2026-04-01'::date,
        'hyrox_import', ${sql.json([300, 300, 300, 300, 300, 300, 300, 300])},
        ${sql.json([{ index: 2, seconds: 295, rank: null }])}, 3600)
    `;
    const hub = await buildCarrerasOverview({ athlete_id: fx.athleteId }, sql);
    const ski = hub.station_benchmarks.find((b) => b.id === 'station_2');
    expect(ski).toBeTruthy();
    // race split 295 − trained full (132×2 = 264) = +31 s over the 1 km ski split.
    expect(ski!.delta).toBe('+0:31');
  }, 60000);
});
