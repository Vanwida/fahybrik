// #64 — outdoor run GPS route persistence + read-back.
//
// Real-DB round-trip: the shared recorder persists the encoded polyline to
// workout_routes with a SERVER-derived point_count, UNIQUE per execution (a re-sync
// UPSERTS, never duplicates), and the athlete assignment-detail loader returns it.
// Types are pinned. Requires migration 0127 applied on the branch.
//
// WRITE, do NOT run here (TCP egress is blocked); Alex/CI runs the suite against a
// throwaway Neon branch (TEST_DATABASE_URL), which `describeWithDb` gates on.

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { recordWorkoutExecution } from '@/lib/sync/record-workout-execution';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { polylinePointCount } from '@/lib/sync/polyline';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate } from '../utils/db-fixtures';

// The Google reference vector — 3 coordinate pairs.
const REFERENCE_POLYLINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

describeWithDb('outdoor run route persistence (#64, real DB)', () => {
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

  test('persists the polyline + derived point_count, returns it on detail, upserts on re-sync', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tpl = await makeTemplate({ fx, name: 'Rodaje' });
    const assignmentId = await makeAssignment({
      fx,
      templateId: tpl,
      scheduledForIso: new Date().toISOString().slice(0, 10),
    });

    const res = await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: { perceived_exertion: 6, route_polyline: REFERENCE_POLYLINE },
      sql,
    });
    expect(res.ok).toBe(true);

    // The workout_routes row: exact polyline + server-derived point_count (3).
    const rows = await sql<Array<{ polyline: string; point_count: number | null }>>`
      select wr.polyline, wr.point_count
      from workout_routes wr
      join workout_executions we on we.id = wr.execution_id
      where we.assignment_id = ${assignmentId}
      limit 1
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].polyline).toBe(REFERENCE_POLYLINE);
    expect(rows[0].point_count).toBe(polylinePointCount(REFERENCE_POLYLINE));
    expect(rows[0].point_count).toBe(3);

    // The athlete detail loader returns it (typed string | null).
    const detail = await loadAssignmentDetail({
      sql,
      athlete_id: BigInt(fx.athleteId),
      assignment_id: BigInt(assignmentId),
    });
    const routePolyline: string | null = detail!.execution!.route_polyline;
    expect(routePolyline).toBe(REFERENCE_POLYLINE);

    // A re-sync UPSERTS (execution_id UNIQUE) — still exactly one route row.
    await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: { route_polyline: REFERENCE_POLYLINE },
      sql,
    });
    const count = await sql<Array<{ n: number }>>`
      select count(*)::int as n
      from workout_routes wr
      join workout_executions we on we.id = wr.execution_id
      where we.assignment_id = ${assignmentId}
    `;
    expect(count[0].n).toBe(1);
  });
});
