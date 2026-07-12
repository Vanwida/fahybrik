// Real-DB test (#61) — the athlete wire emits the STRUCTURED running grammar for
// the DEMO athlete's (id 70) actual prescribed run blocks. Read-only: it loads the
// SAME assignment detail the iOS app consumes and asserts the emitted
// `prescription_json.structure` is present and well-typed on real data (every work
// bout has a valid measure; any resolved band is well-formed). This is the
// end-to-end complement to the deterministic pure cases in assignment-detail.test.ts.
//
// Skips automatically when TEST_DATABASE_URL is unset (describeWithDb) — point it at
// a branch that carries the demo seed to exercise locally.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { flattenSegments } from '@fahybrid/shared/domain/prescription';

const ATHLETE_ID = 70;

describeWithDb('#61 · athlete wire structure emission vs athlete 70 real run blocks', () => {
  const sql = getTestSql();

  beforeAll(async () => {
    await sql`select 1 as ok`; // wake / validate the branch
  });
  afterAll(async () => {
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
      where a.athlete_id = ${ATHLETE_ID} and s.modality = 'run'
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
        athlete_id: BigInt(ATHLETE_ID),
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

    // The demo athlete has real prescribed run work → the wire MUST emit at least one
    // structure end-to-end (the whole point of the ola).
    expect(runItems).toBeGreaterThan(0);
    expect(itemsWithStructure).toBeGreaterThan(0);
    // Surfaced for signal (not asserted, to stay robust to the exact demo plan): how
    // many heterogeneous (multi-measure) series and resolved bands the real data hit.
    expect(itemsWithDistinctMeasures).toBeGreaterThanOrEqual(0);
    expect(resolvedBands).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
