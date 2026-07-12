// Real-DB test (#66) — run compliance against the DEMO athlete's (id 70) actual
// executed run sessions. Read-only: it loads the SAME assembled detail + actuals
// the coach endpoint builds, runs buildRunCompliance, and asserts the aggregate is
// coherent and honest (no NaN, evaluable = dentro+fuera_*, at least one real %).
//
// Skips automatically when TEST_DATABASE_URL is unset (describeWithDb) — point it
// at a branch that carries the demo seed to exercise this locally.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { buildRunCompliance } from '@/lib/dashboard/coach/run-compliance';
import { loadSegmentActuals } from '@/lib/dashboard/coach/session-actuals';
import { RUN_COMPLIANCE_VERDICTS } from '@fahybrid/shared/domain/adherence';

const ATHLETE_ID = 70;

describeWithDb('run compliance vs athlete 70 real executions (#66)', () => {
  const sql = getTestSql();

  beforeAll(async () => {
    await sql`select 1 as ok`; // wake / validate the branch
  });
  afterAll(async () => {
    await closeTestSql();
  });

  // Generous timeout: this walks every real run session serially over the pooled
  // Neon branch (several queries per session), so the default 5 s is too tight.
  test('every executed run session yields coherent verdicts + a sane aggregate', async () => {
    const sessions = await sql<{ assignment_id: string; execution_id: string }[]>`
      select a.id::text as assignment_id, e.id::text as execution_id
      from workout_assignments a
      join workout_executions e on e.assignment_id = a.id
      join segment_executions s on s.execution_id = e.id
      where a.athlete_id = ${ATHLETE_ID} and s.modality = 'run'
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
        athlete_id: BigInt(ATHLETE_ID),
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

    // The demo athlete has real prescribed-vs-executed run work → the pipeline must
    // resolve real zone bands against real laps for at least some session.
    expect(totalTramos).toBeGreaterThan(0);
    expect(totalEvaluable).toBeGreaterThan(0);
    expect(sessionsWithEvaluable).toBeGreaterThan(0);
  }, 60_000);
});
