// Real-DB test (#66) — run compliance against an athlete's executed run
// sessions. It loads the SAME assembled detail + actuals the coach endpoint
// builds, runs buildRunCompliance, and asserts the aggregate is coherent and
// honest (no NaN, evaluable = dentro+fuera_*, at least one real %).
//
// It used to read the demo athlete (id 70) off the Neon demo branch; it now
// seeds its own athlete with the three shapes real run sessions take, and
// deletes them afterwards:
//   · a structured 3×1000 whose laps carry `leg_index` (the native path),
//   · a steady run logged as ONE lap against its line (the legacy 1 item ↔ 1 lap
//     path, its zone resolved from the athlete's profile),
//   · a run whose lap came back with no distance or pace (honest `sin_dato`).
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
import { buildRunCompliance } from '@/lib/dashboard/coach/run-compliance';
import { loadSegmentActuals } from '@/lib/dashboard/coach/session-actuals';
import { RUN_COMPLIANCE_VERDICTS } from '@fahybrid/shared/domain/adherence';

describeWithDb('run compliance vs real executions (#66)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  /** A one-line session (template + line + assignment); returns both ids. */
  async function session(name: string, dateIso: string, exerciseId: number, prescription: Record<string, unknown>) {
    const templateId = await makeTemplate({ fx, name, format: prescription.scheme as string });
    const segmentId = await makeTemplateSegment({ fx, templateId, exerciseId, position: 0, prescription });
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: dateIso });
    return { segmentId, assignmentId };
  }

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await makeRunZoneProfile(fx); // Z4 = 4:30–5:00/km, Z2 = 5:30–6:00/km
    const run = await makeRunExercise(fx);

    // Native: 3×1000 @Z4 with 90 s jog — one rep in band, one fast, one slow.
    const series = await session('Series 3×1000', '2026-08-03', run, {
      scheme: 'intervals',
      modality: 'run',
      structure: [
        {
          role: 'main',
          elements: [
            {
              times: 3,
              elements: [
                { kind: 'work', measure: { type: 'distance', m: 1000 }, target: { type: 'pace_zone', zone: 4 } },
                { kind: 'recovery', measure: { type: 'duration', s: 90 }, target: null, recovery_mode: 'trote' },
              ],
            },
          ],
        },
      ],
    });
    const laps: RunLap[] = [285, 262, 312].flatMap((pace, i) => [
      {
        template_segment_id: series.segmentId,
        duration_s: pace,
        distance_m: 1000,
        pace_s_per_km: pace,
        leg: { index: 2 * i, role: 'work', phase: 'main' },
      },
      {
        template_segment_id: series.segmentId,
        duration_s: 90,
        distance_m: 220,
        leg: { index: 2 * i + 1, role: 'recovery', phase: 'main' },
      },
    ]);
    await makeRunExecution({ fx, assignmentId: series.assignmentId, startedAtIso: '2026-08-03T06:00:00Z', laps });

    // Legacy: a 30' steady run @Z2 logged as one lap against its line.
    const steady = await session('Rodaje 30′', '2026-08-05', run, {
      scheme: 'steady',
      modality: 'run',
      total_s: 1800,
      target: { kind: 'hr_zone', value: 2 },
    });
    await makeRunExecution({
      fx,
      assignmentId: steady.assignmentId,
      startedAtIso: '2026-08-05T06:00:00Z',
      laps: [{ template_segment_id: steady.segmentId, duration_s: 1800, distance_m: 5300, pace_s_per_km: 340 }],
    });

    // No data: the lap arrived with a duration and nothing else.
    const blind = await session('Rodaje 20′', '2026-08-07', run, {
      scheme: 'steady',
      modality: 'run',
      total_s: 1200,
      target: { kind: 'hr_zone', value: 3 },
    });
    await makeRunExecution({
      fx,
      assignmentId: blind.assignmentId,
      startedAtIso: '2026-08-07T06:00:00Z',
      laps: [{ template_segment_id: blind.segmentId, duration_s: 1200 }],
    });
  }, 60_000);

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  // Generous timeout: this walks every run session serially over the pooled
  // Neon branch (several queries per session), so the default 5 s is too tight.
  test('every executed run session yields coherent verdicts + a sane aggregate', async () => {
    const sessions = await sql<{ assignment_id: string; execution_id: string }[]>`
      select a.id::text as assignment_id, e.id::text as execution_id
      from workout_assignments a
      join workout_executions e on e.assignment_id = a.id
      join segment_executions s on s.execution_id = e.id
      where a.athlete_id = ${fx.athleteId} and s.modality = 'run'
      group by a.id, e.id
      order by a.id
    `;
    expect(sessions.length).toBeGreaterThan(0);

    const verdictSet = new Set<string>(RUN_COMPLIANCE_VERDICTS);
    let sessionsWithEvaluable = 0;
    let totalEvaluable = 0;
    let totalTramos = 0;

    for (const s of sessions) {
      const detail = await loadAssignmentDetail({
        sql,
        athlete_id: BigInt(fx.athleteId),
        assignment_id: BigInt(s.assignment_id),
      });
      expect(detail, `detail for assignment ${s.assignment_id}`).not.toBeNull();

      const actuals = await loadSegmentActuals(sql, Number(s.execution_id));
      const { summary, tramos } = buildRunCompliance(detail!.workout, actuals);

      // Structural coherence — the aggregate must reconcile with the tramos.
      expect(summary.total).toBe(tramos.length);
      expect(summary.evaluable).toBe(summary.dentro + summary.fuera_rapido + summary.fuera_lento);
      expect(summary.total).toBe(summary.evaluable + summary.sin_dato);
      for (const t of tramos) expect(verdictSet.has(t.verdict)).toBe(true);

      // Honest aggregate: a real % in [0,100] or null — never NaN, never 0/NaN faked.
      if (summary.pct_dentro !== null) {
        expect(Number.isNaN(summary.pct_dentro)).toBe(false);
        expect(summary.pct_dentro).toBeGreaterThanOrEqual(0);
        expect(summary.pct_dentro).toBeLessThanOrEqual(100);
        sessionsWithEvaluable++;
      }
      totalEvaluable += summary.evaluable;
      totalTramos += summary.total;
    }

    // The athlete has real prescribed-vs-executed run work → the pipeline must
    // resolve real zone bands against real laps for at least some session.
    expect(totalTramos).toBeGreaterThan(0);
    expect(totalEvaluable).toBeGreaterThan(0);
    expect(sessionsWithEvaluable).toBeGreaterThan(0);
  }, 60_000);
});
