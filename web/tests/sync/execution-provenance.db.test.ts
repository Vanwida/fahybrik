// Provenance persistence: the four columns the recorder derives from the tramos
// (migs 0143 + 0144) actually land, and a SECOND sync UNIONS the apparatus roster
// instead of replacing it.
//
// The derivation itself is pure and covered in tests/execution-merge/provenance.
// What only a real database can show is the ON CONFLICT: `source` must stay put
// (the first writer owns it — the multi-source precedence in ingest-healthkit /
// reconcile depends on that), while `contributing_sources` must GROW, because an
// erg's tramos can arrive in a later sync than the watch's and the apparatus
// already recorded did contribute.
//
// Requires migrations 0143 + 0144 applied on the branch.
//
// WRITE, do NOT run here (TCP egress is blocked); Alex/CI runs the suite against a
// throwaway Neon branch (TEST_DATABASE_URL), which `describeWithDb` gates on.

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { recordWorkoutExecution } from '@/lib/sync/record-workout-execution';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

interface ProvenanceRow {
  source: string | null;
  recorded_via: string | null;
  totals_source: string | null;
  contributing_sources: string[];
}

describeWithDb('execution provenance (migs 0143/0144, real DB)', () => {
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

  async function seed(): Promise<{ fx: Fixture; assignmentId: number }> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tpl = await makeTemplate({ fx, name: 'Remo + cinta' });
    const assignmentId = await makeAssignment({
      fx,
      templateId: tpl,
      scheduledForIso: new Date().toISOString().slice(0, 10),
    });
    return { fx, assignmentId };
  }

  const readProvenance = (assignmentId: number) => sql<ProvenanceRow[]>`
    select source::text          as source,
           recorded_via::text    as recorded_via,
           totals_source::text   as totals_source,
           contributing_sources::text[] as contributing_sources
    from workout_executions
    where assignment_id = ${assignmentId}
    limit 1
  `;

  test('a live PM5 session is stored as the erg that measured it, not as "a mano"', async () => {
    const { fx, assignmentId } = await seed();

    // Exactly what the live client sends today: source='manual' at the top,
    // PM5 tramos underneath. The tramos are the evidence and must win.
    const res = await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: {
        source: 'manual',
        perceived_exertion: 8,
        segments: [
          { position: 0, modality: 'row', duration_seconds: 300, source: 'pm5' },
          { position: 1, modality: 'row', duration_seconds: 240, source: 'pm5' },
        ],
      },
      sql,
    });
    expect(res.ok).toBe(true);

    const [row] = await readProvenance(assignmentId);
    expect(row!.source).toBe('concept2');
    expect(row!.totals_source).toBe('concept2');
    expect(row!.recorded_via).toBe('live');
    expect(row!.contributing_sources).toEqual(['concept2']);

    // And the athlete's detail returns both halves of the answer.
    const detail = await loadAssignmentDetail({
      sql,
      athlete_id: BigInt(fx.athleteId),
      assignment_id: BigInt(assignmentId),
    });
    expect(detail!.execution!.recorded_via).toBe('live');
    expect(detail!.execution!.contributing_sources).toEqual(['concept2']);
    expect(detail!.execution!.segments.map((s) => s.source)).toEqual(['pm5', 'pm5']);
  });

  test('a second sync ADDS the new apparatus and keeps the original source', async () => {
    const { fx, assignmentId } = await seed();

    await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: {
        segments: [{ position: 0, modality: 'row', duration_seconds: 600, source: 'pm5' }],
      },
      sql,
    });

    // The treadmill leg lands later — a different apparatus for the same session.
    await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: {
        segments: [{ position: 1, modality: 'run', duration_seconds: 900, source: 'treadmill' }],
      },
      sql,
    });

    const [row] = await readProvenance(assignmentId);
    // UNION, not replace: the erg still contributed.
    expect(row!.contributing_sources).toEqual(['concept2', 'treadmill']);
    // `source` is deliberately OUT of the DO UPDATE — the first writer owns it,
    // which is what the device precedence elsewhere relies on.
    expect(row!.source).toBe('concept2');
    // Same for the derived pair: coalesced, so the first non-null stands.
    expect(row!.totals_source).toBe('concept2');
    expect(row!.recorded_via).toBe('live');
  });

  test('a typed-in log with no tramos is recorded as manual, with no apparatus', async () => {
    const { fx, assignmentId } = await seed();

    await recordWorkoutExecution({
      athleteId: fx.athleteId,
      assignmentId,
      input: { source: 'manual', perceived_exertion: 5, total_duration_seconds: 1800 },
      sql,
    });

    const [row] = await readProvenance(assignmentId);
    expect(row!.source).toBe('manual');
    expect(row!.recorded_via).toBe('manual');
    expect(row!.totals_source).toBeNull();
    expect(row!.contributing_sources).toEqual([]);
  });
});
