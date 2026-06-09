/**
 * Real-DB integration tests for `buildMacroProgress` + `buildAthleteMacroSummary`
 * (consumed by iOS).
 *
 * Exercises the real `date_trunc('week', ...)` weekly rollup, the
 * scheduled/completed compliance maths, week status derivation
 * (completed/current/upcoming/missed), and the current-block join. Nothing is
 * mocked — every number is computed by Postgres over seeded rows and verified
 * against a fixed `on_date`.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import {
  buildAthleteMacroSummary,
  buildMacroProgress,
} from '@fahybrid/shared/domain/coach/macro-progress';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeMacrocycleWithBlock,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

// Macro spans 3 ISO weeks. `on_date` sits inside week 2 so we get
// completed (wk1), current (wk2), upcoming (wk3) statuses.
const MACRO_START = '2026-03-02'; // Monday (ISO week 10)
const MACRO_END = '2026-03-22'; // Sunday of wk3
const ON_DATE = new Date('2026-03-11T12:00:00Z'); // Wednesday of week 2

const WK1 = ['2026-03-02', '2026-03-04']; // Mon, Wed
const WK2 = ['2026-03-09', '2026-03-11'];
const WK3 = ['2026-03-16', '2026-03-18'];

describeWithDb('buildMacroProgress (real DB)', () => {
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

  async function seedMacroWithWeeks(): Promise<{ fx: Fixture; microId: number }> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const { blockId } = await makeMacrocycleWithBlock({
      sql,
      athleteId: fx.athleteId,
      startIso: MACRO_START,
      endIso: MACRO_END,
      status: 'active',
    });
    // A microcycle covering ON_DATE so getCurrentBlock resolves.
    const micro = await sql<Array<{ id: string }>>`
      insert into microcycles (block_id, week_number, start_date, end_date)
      values (${blockId}, 2, '2026-03-09'::date, '2026-03-15'::date)
      returning id::text
    `;
    const microId = Number(micro[0]!.id);

    const tplId = await makeTemplate({ fx, name: 'session' });

    // Week 1 (past): both completed → compliance 100%, status completed.
    for (const d of WK1) {
      await makeAssignment({ fx, templateId: tplId, scheduledForIso: d, status: 'completed', microcycleId: microId });
    }
    // Week 2 (current): one completed, one scheduled.
    await makeAssignment({ fx, templateId: tplId, scheduledForIso: WK2[0]!, status: 'completed', microcycleId: microId });
    await makeAssignment({ fx, templateId: tplId, scheduledForIso: WK2[1]!, status: 'scheduled', microcycleId: microId });
    // Week 3 (future): both scheduled.
    for (const d of WK3) {
      await makeAssignment({ fx, templateId: tplId, scheduledForIso: d, status: 'scheduled', microcycleId: microId });
    }

    return { fx, microId };
  }

  test('rolls weeks up with correct compliance and status', async () => {
    const { fx } = await seedMacroWithWeeks();

    const p = await buildMacroProgress({ athlete_id: fx.athleteId, on_date: ON_DATE, client: sql });

    expect(p.athlete_id).toBe(String(fx.athleteId));
    expect(p.block).toBe('ACC');
    expect(p.total_assigned_weeks).toBe(3);
    expect(p.weeks).toHaveLength(3);

    const [w1, w2, w3] = p.weeks;
    expect(w1!.week_start).toBe('2026-03-02');
    expect(w1!.status).toBe('completed');
    expect(w1!.compliance_pct).toBe(1); // 2/2

    expect(w2!.week_start).toBe('2026-03-09');
    expect(w2!.status).toBe('current');
    expect(w2!.compliance_pct).toBe(0.5); // 1/2

    expect(w3!.week_start).toBe('2026-03-16');
    expect(w3!.status).toBe('upcoming');
    expect(w3!.compliance_pct).toBe(0); // 0/2
  });

  test('past week below 50% completion is marked missed', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    await makeMacrocycleWithBlock({
      sql,
      athleteId: fx.athleteId,
      startIso: MACRO_START,
      endIso: MACRO_END,
      status: 'active',
    });
    const tplId = await makeTemplate({ fx, name: 's' });
    // Past week with 0/2 completed → missed (completed < scheduled*0.5).
    for (const d of WK1) {
      await makeAssignment({ fx, templateId: tplId, scheduledForIso: d, status: 'missed' });
    }

    const p = await buildMacroProgress({ athlete_id: fx.athleteId, on_date: ON_DATE, client: sql });
    const w1 = p.weeks.find((w) => w.week_start === '2026-03-02');
    expect(w1?.status).toBe('missed');
    expect(w1?.compliance_pct).toBe(0);
  });

  test('athlete with no macrocycle returns empty progress (no crash)', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const p = await buildMacroProgress({ athlete_id: fx.athleteId, on_date: ON_DATE, client: sql });
    expect(p.block).toBeNull();
    expect(p.macrocycle_id).toBeNull();
    expect(p.weeks).toEqual([]);
    expect(p.total_assigned_weeks).toBe(0);
  });

  test('buildAthleteMacroSummary surfaces block + current week label', async () => {
    const { fx } = await seedMacroWithWeeks();
    const s = await buildAthleteMacroSummary({ athlete_id: fx.athleteId, on_date: ON_DATE, client: sql });
    expect(s.block).toBe('ACC');
    expect(s.current_week_start).toBe('2026-03-09'); // Monday of ON_DATE's week
    expect(s.current_week_end).toBe('2026-03-15');
    expect(s.week_label).toMatch(/ACC/);
  });
});
