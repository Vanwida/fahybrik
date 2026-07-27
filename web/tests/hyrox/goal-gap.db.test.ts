/**
 * Real-DB verification of the GOAL / prediction / gap loaders (Fase 3). No SQL is
 * mocked — a fresh fixture athlete gets a target race (with a goal), a recent
 * complete singles race (the observed-prediction + own-budget basis), and a past
 * race + a frozen snapshot to exercise predicted-vs-real. Then buildGoalGap /
 * buildPredictionReview run against the Neon test branch and the budget closure,
 * the tiers, the gap, the snapshot persistence and the review math are asserted on
 * the real result.
 *
 * SKIPPED unless TEST_DATABASE_URL is set (describeWithDb). Requires migrations
 * through 0142 (races.is_synthetic) + the exercises catalog on the branch.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildGoalGap } from '@/lib/athlete/goal-gap';
import { buildPredictionReview } from '@/lib/athlete/prediction-review';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

// A self-consistent complete singles race: run + 8 stations + roxzone.
const RUN_TOTAL = 1800;
const STATIONS: Array<{ index: number; seconds: number }> = [
  { index: 2, seconds: 240 }, // SkiErg
  { index: 4, seconds: 150 }, // Sled push
  { index: 6, seconds: 200 }, // Sled pull
  { index: 8, seconds: 230 }, // Burpee broad jump
  { index: 10, seconds: 230 }, // Row
  { index: 12, seconds: 120 }, // Farmer carry
  { index: 14, seconds: 190 }, // Sandbag lunge
  { index: 16, seconds: 280 }, // Wall ball
];
const ROXZONE = 160;
const RESULT = RUN_TOTAL + STATIONS.reduce((a, s) => a + s.seconds, 0) + ROXZONE; // 3600
const GOAL = 3600;

function stationSplitsJson(): Array<{ index: number; seconds: number; rank: null }> {
  return STATIONS.map((s) => ({ index: s.index, seconds: s.seconds, rank: null }));
}

describeWithDb('goal-gap (real DB)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  test('budget closes to the goal, recent race → observado, gap read, snapshot persisted', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const athleteId = fx.athleteId;

    // Target race: upcoming, priority target, with a goal. Drives getTargetRaceRow.
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority,
        race_date, goal_time_seconds, status, source)
      values (${athleteId}, 'HYROX Objetivo', 'hyrox', 'singles', 'open', 'men', 'target',
        (current_date + 30), ${GOAL}, 'registered', 'manual')
    `;

    // A recent COMPLETE singles race (20 days ago) — the observed-prediction basis.
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority,
        race_date, result_time_seconds, run_total_seconds, roxzone_seconds,
        run_splits_json, station_splits_json, status, source)
      values (${athleteId}, 'HYROX Reciente', 'hyrox', 'singles', 'open', 'men', 'tune_up',
        (current_date - 20), ${RESULT}, ${RUN_TOTAL}, ${ROXZONE},
        ${sql.json([225, 225, 225, 225, 225, 225, 225, 225])}, ${sql.json(stationSplitsJson())},
        'completed', 'hyrox_import')
    `;

    const board = await buildGoalGap({ athlete_id: athleteId }, sql);

    expect(board.availability).toBe('ok');
    expect(board.goal?.total_s).toBe(GOAL);
    expect(board.goal?.label).toBe('Sub-60');
    expect(['cohorte', 'tu_carrera']).toContain(board.budget_source);
    expect(board.segments).toHaveLength(10);

    // Budget always closes to the goal.
    const budgetSum = board.segments.reduce((a, s) => a + s.budget_s, 0);
    expect(budgetSum).toBe(GOAL);

    // Recent own race → every recorded segment is observado, predicted == the split.
    const bySlug = new Map(board.segments.map((s) => [s.slug, s]));
    expect(bySlug.get('run')?.tier).toBe('observado');
    expect(bySlug.get('run')?.predicted_s).toBe(RUN_TOTAL);
    expect(bySlug.get('hyrox-wall-balls')?.tier).toBe('observado');
    expect(bySlug.get('hyrox-wall-balls')?.predicted_s).toBe(280);
    expect(bySlug.get('roxzone')?.tier).toBe('observado');
    expect(bySlug.get('roxzone')?.predicted_s).toBe(ROXZONE);

    // Predicted total = the sum of the observed splits = the race result; gap read.
    expect(board.predicted_total_s).toBe(RESULT);
    expect(board.gap_s).toBe(RESULT - GOAL);

    // delta = predicted − budget per segment.
    for (const s of board.segments) {
      if (s.predicted_s != null) expect(s.delta_s).toBe(s.predicted_s - s.budget_s);
    }

    // Snapshot persisted for today.
    const snap = await sql<Array<{ predicted_total_s: number; n_segments: number }>>`
      select predicted_total_s, jsonb_array_length(segments_json) as n_segments
      from race_predictions
      where athlete_id = ${athleteId}
      order by created_at desc
      limit 1
    `;
    expect(snap[0]?.predicted_total_s).toBe(RESULT);
    expect(Number(snap[0]?.n_segments)).toBe(10);
  });

  test('prediction-review compares a frozen snapshot vs the real race splits', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const athleteId = fx.athleteId;

    // A completed race 30 days ago (the event whose result we review).
    const raceRows = await sql<Array<{ id: string }>>`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority,
        race_date, result_time_seconds, run_total_seconds, roxzone_seconds,
        run_splits_json, station_splits_json, status, source)
      values (${athleteId}, 'HYROX Pasada', 'hyrox', 'singles', 'open', 'men', 'tune_up',
        (current_date - 30), ${RESULT}, ${RUN_TOTAL}, ${ROXZONE},
        ${sql.json([225, 225, 225, 225, 225, 225, 225, 225])}, ${sql.json(stationSplitsJson())},
        'completed', 'hyrox_import')
      returning id::text
    `;
    const raceId = Number(raceRows[0]!.id);

    // A snapshot FROZEN 40 days ago (before the race), aimed at that race. Sled push
    // was under-predicted (130 vs a real 150 → the worst delta); run matches.
    const snapshotSegments = [
      { slug: 'run', kind: 'run', budget_s: 1800, predicted_s: 1800, tier: 'observado' },
      { slug: 'hyrox-sled-push', kind: 'station', budget_s: 150, predicted_s: 130, tier: 'estimado' },
      { slug: 'hyrox-wall-balls', kind: 'station', budget_s: 280, predicted_s: 280, tier: 'observado' },
      { slug: 'ski-erg', kind: 'station', budget_s: 240, predicted_s: null, tier: 'sin_datos' },
    ];
    await sql`
      insert into race_predictions
        (athlete_id, target_race_id, goal_time_seconds, predicted_total_s, segments_json, model_version, pred_date, created_at)
      values
        (${athleteId}, ${raceId}, ${GOAL}, 3680, ${sql.json(snapshotSegments)}, 'goal-gap@test',
         (current_date - 40), (now() - interval '40 days'))
    `;

    const review = await buildPredictionReview({ athlete_id: athleteId, race_id: raceId }, sql);

    expect(review.availability).toBe('ok');
    expect(review.actual_total_s).toBe(RESULT); // 3600
    expect(review.predicted_total_s).toBe(3680);
    // accuracy = 100 - |3680-3600|/3600*100 = 100 - 2.2 ≈ 98.
    expect(review.accuracy_pct).toBe(98);
    // 98 ≥ 97 → the top precision tier, derived deterministically from accuracy_pct.
    expect(review.accuracy_label_es).toBe('clavado');

    // Event context surfaced for the card subtitle: the race name + its ISO day.
    expect(review.race_name).toBe('HYROX Pasada');
    const [expected] = await sql<Array<{ d: string }>>`
      select to_char((current_date - 30), 'YYYY-MM-DD') as d
    `;
    expect(review.race_date).toBe(expected!.d);

    // Only segments with both a predicted and a real split are compared (ski-erg
    // was sin_datos → excluded).
    const slugs = review.segments.map((s) => s.slug).sort();
    expect(slugs).toEqual(['hyrox-sled-push', 'hyrox-wall-balls', 'run']);
    const sled = review.segments.find((s) => s.slug === 'hyrox-sled-push')!;
    expect(sled.predicted_s).toBe(130);
    expect(sled.actual_s).toBe(150);
    expect(sled.delta_s).toBe(20);

    // Worst positive delta → the insight names the sled push.
    expect(review.insight_es).toBe('El Sled push perdió 0:20 más de lo previsto.');
  });

  test('gates: no target race, then a target without a goal', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const athleteId = fx.athleteId;

    const none = await buildGoalGap({ athlete_id: athleteId }, sql);
    expect(none.availability).toBe('no_target_race');

    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority,
        race_date, status, source)
      values (${athleteId}, 'HYROX Sin Goal', 'hyrox', 'singles', 'open', 'men', 'target',
        (current_date + 30), 'registered', 'manual')
    `;
    const noGoal = await buildGoalGap({ athlete_id: athleteId }, sql);
    expect(noGoal.availability).toBe('no_goal');
  });

  // 0142 — las carreras sembradas NO son evidencia de población. El cohorte es la
  // única lectura de `races` que cruza atletas, así que es por donde un tiempo
  // inventado se cuela en el presupuesto de un atleta real. Aquí hay 6 carreras
  // completas pegadas al objetivo, todas is_synthetic, con una forma imposible
  // (roxzone gigante): si el filtro se cayera, el cohorte se activaría y el
  // presupuesto tomaría esa forma. Con el filtro solo queda la carrera propia.
  test('el cohorte ignora las carreras sembradas (is_synthetic)', async () => {
    const fx = await makeCoachAndAthlete(sql);
    const seedFx = await makeCoachAndAthlete(sql);
    fixtures.push(fx, seedFx);

    // Ventana propia (±10 % de 5400 → 4860..5940): fuera del alcance del resto
    // de fixtures de la suite, que compiten en torno a 3600.
    const SYNTH_GOAL = 5400;
    const SYNTH_ROXZONE = 2000; // absurdo a propósito: delata la contaminación
    const SYNTH_RUN = 1800;
    const SYNTH_STATIONS = STATIONS.map((s) => ({ index: s.index, seconds: 200, rank: null }));
    const SYNTH_RESULT = SYNTH_RUN + 200 * SYNTH_STATIONS.length + SYNTH_ROXZONE; // 5400

    for (let i = 0; i < 6; i++) {
      await sql`
        insert into races (athlete_id, name, event_type, format, division, gender_category, priority,
          race_date, result_time_seconds, run_total_seconds, roxzone_seconds,
          run_splits_json, station_splits_json, status, source, is_synthetic)
        values (${seedFx.athleteId}, ${`HYROX Sembrada ${i}`}, 'hyrox', 'singles', 'open', 'men', 'tune_up',
          (current_date - 40), ${SYNTH_RESULT}, ${SYNTH_RUN}, ${SYNTH_ROXZONE},
          ${sql.json([225, 225, 225, 225, 225, 225, 225, 225])}, ${sql.json(SYNTH_STATIONS)},
          'completed', 'hyresult_import', true)
      `;
    }

    // El atleta real: objetivo en la misma ventana + su propia carrera completa.
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority,
        race_date, goal_time_seconds, status, source)
      values (${fx.athleteId}, 'HYROX Objetivo 90', 'hyrox', 'singles', 'open', 'men', 'target',
        (current_date + 30), ${SYNTH_GOAL}, 'registered', 'manual')
    `;
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority,
        race_date, result_time_seconds, run_total_seconds, roxzone_seconds,
        run_splits_json, station_splits_json, status, source)
      values (${fx.athleteId}, 'HYROX Propia 90', 'hyrox', 'singles', 'open', 'men', 'tune_up',
        (current_date - 20), ${SYNTH_GOAL}, ${SYNTH_RUN}, ${ROXZONE},
        ${sql.json([225, 225, 225, 225, 225, 225, 225, 225])}, ${sql.json(stationSplitsJson())},
        'completed', 'hyrox_import')
    `;

    const board = await buildGoalGap({ athlete_id: fx.athleteId }, sql);

    // Sin las 6 sembradas no se llega al mínimo de cohorte → manda su carrera.
    expect(board.budget_source).toBe('tu_carrera');
    // Y el presupuesto no arrastra la roxzone absurda del dato inventado.
    const roxzone = board.segments.find((s) => s.slug === 'roxzone');
    expect(roxzone!.budget_s).toBeLessThan(SYNTH_ROXZONE / 2);
  });
});
