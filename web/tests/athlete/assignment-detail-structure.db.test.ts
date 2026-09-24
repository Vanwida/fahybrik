// Real-DB test (#61) — the athlete wire emits the STRUCTURED running grammar for
// an athlete's actual prescribed run blocks. It loads the SAME assignment detail
// the iOS app consumes and asserts the emitted `prescription_json.structure` is
// present and well-typed on real rows (every work bout has a valid measure; any
// resolved band is well-formed). This is the end-to-end complement to the
// deterministic pure cases in assignment-detail.test.ts.
//
// It used to read the demo athlete (id 70) off the Neon demo branch; it now
// seeds its own executed session with the two run shapes the wire has to emit,
// and deletes it afterwards:
//   · a STORED phased structure (warm-up · 4×1000 @Z4 with jog · cool-down),
//   · a legacy sets-only pyramid (1200/1000/800 @Z4) with no structure — the
//     real shape that motivated #61, seeded into a structure by the wire.
//
// Skips automatically when TEST_DATABASE_URL is unset (describeWithDb).

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import {
  makeRunExecution,
  makeRunExercise,
  makeRunZoneProfile,
  makeTemplateSegment,
  type RunLap,
} from '../utils/run-fixtures';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { flattenSegments } from '@fahybrid/shared/domain/prescription';

describeWithDb('#61 · athlete wire structure emission vs real run blocks', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await makeRunZoneProfile(fx); // a tested athlete: zone bouts resolve to a band
    const run = await makeRunExercise(fx);
    const templateId = await makeTemplate({ fx, name: 'Umbral + pirámide', format: 'intervals' });

    const phased = await makeTemplateSegment({
      fx,
      templateId,
      exerciseId: run,
      position: 0,
      prescription: {
        scheme: 'intervals',
        modality: 'run',
        structure: [
          {
            role: 'warmup',
            elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'pace_zone', zone: 2 } }],
          },
          {
            role: 'main',
            elements: [
              {
                times: 4,
                elements: [
                  { kind: 'work', measure: { type: 'distance', m: 1000 }, target: { type: 'pace_zone', zone: 4 } },
                  { kind: 'recovery', measure: { type: 'duration', s: 90 }, target: null, recovery_mode: 'trote' },
                ],
              },
            ],
          },
          { role: 'cooldown', elements: [{ kind: 'work', measure: { type: 'duration', s: 300 }, target: null }] },
        ],
      },
    });
    const pyramid = await makeTemplateSegment({
      fx,
      templateId,
      exerciseId: run,
      position: 1,
      prescription: {
        scheme: 'intervals',
        modality: 'run',
        sets: [1200, 1000, 800].map((m) => ({
          measure: { kind: 'distance', meters: m },
          target: { kind: 'hr_zone', value: 4 },
          rest_s: 120,
        })),
      },
    });

    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: '2026-08-04' });
    // The phased block laps carry their leg attribution (warm-up, 4 reps + jogs,
    // cool-down = 10 legs); the pyramid is logged one lap per rep, no attribution.
    const laps: RunLap[] = [
      { template_segment_id: phased, duration_s: 600, distance_m: 1800, leg: { index: 0, role: 'work', phase: 'warmup' } },
    ];
    for (let i = 0; i < 4; i++) {
      laps.push({ template_segment_id: phased, duration_s: 285, distance_m: 1000, pace_s_per_km: 285, leg: { index: 1 + 2 * i, role: 'work', phase: 'main' } });
      laps.push({ template_segment_id: phased, duration_s: 90, distance_m: 220, leg: { index: 2 + 2 * i, role: 'recovery', phase: 'main' } });
    }
    laps.push({ template_segment_id: phased, duration_s: 300, distance_m: 850, leg: { index: 9, role: 'work', phase: 'cooldown' } });
    for (const m of [1200, 1000, 800]) {
      laps.push({ template_segment_id: pyramid, duration_s: Math.round((m / 1000) * 280), distance_m: m, pace_s_per_km: 280 });
    }
    await makeRunExecution({ fx, assignmentId, startedAtIso: '2026-08-04T06:00:00Z', laps });
  }, 60_000);

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('real run blocks emit a well-typed structure with per-bout measures', async () => {
    // Assignments that carry real executed RUN work — those definitely have run
    // prescriptions to emit a structure from.
    const sessions = await sql<{ assignment_id: string }[]>`
      select distinct a.id::text as assignment_id
      from workout_assignments a
      join workout_executions e on e.assignment_id = a.id
      join segment_executions s on s.execution_id = e.id
      where a.athlete_id = ${fx.athleteId} and s.modality = 'run'
      order by 1
    `;
    expect(sessions.length).toBeGreaterThan(0);

    let runItems = 0;
    let itemsWithStructure = 0;
    let itemsWithDistinctMeasures = 0;
    let resolvedBands = 0;

    for (const s of sessions) {
      const detail = await loadAssignmentDetail({
        sql,
        athlete_id: BigInt(fx.athleteId),
        assignment_id: BigInt(s.assignment_id),
      });
      if (!detail?.workout) continue;

      for (const block of detail.workout.blocks) {
        for (const item of block.items) {
          if (item.exercise_category !== 'running') continue;
          runItems++;
          const structure = item.prescription_json?.structure;
          if (!structure) continue;
          itemsWithStructure++;

          const works = flattenSegments(structure).filter((l) => l.kind === 'work');
          expect(works.length, `assignment ${s.assignment_id} run structure has work bouts`).toBeGreaterThan(0);

          for (const w of works) {
            // Every work bout carries its OWN valid measure (the per-bout distance
            // the legacy scalar path dropped for heterogeneous series).
            if (w.measure.type === 'distance') {
              expect(w.measure.m).toBeGreaterThan(0);
            } else if (w.measure.type === 'duration') {
              expect(w.measure.s).toBeGreaterThan(0);
            } else {
              throw new Error(`unexpected measure type ${JSON.stringify(w.measure)}`);
            }
            // Any resolved band is well-formed (never a fabricated/NaN pace).
            if (w.resolved) {
              resolvedBands++;
              expect(w.resolved.fast_s).toBeGreaterThan(0);
              expect(['per_km', 'per_500m']).toContain(w.resolved.pace_unit);
              if (w.resolved.slow_s !== null) expect(w.resolved.slow_s).toBeGreaterThanOrEqual(w.resolved.fast_s);
            }
          }

          const distinct = new Set(works.map((w) => JSON.stringify(w.measure)));
          if (distinct.size >= 2) itemsWithDistinctMeasures++;
        }
      }
    }

    // Real prescribed run work → the wire MUST emit at least one structure
    // end-to-end (the whole point of the ola).
    expect(runItems).toBeGreaterThan(0);
    expect(itemsWithStructure).toBeGreaterThan(0);
    // These two were only surfaced "for signal", to stay robust to whatever plan
    // the demo branch held. The plan is now this test's own, and both of its
    // blocks are heterogeneous series against a tested athlete, so both branches
    // above MUST be exercised — otherwise their checks would pass vacuously.
    expect(itemsWithDistinctMeasures).toBeGreaterThan(0);
    expect(resolvedBands).toBeGreaterThan(0);
  }, 60_000);
});
