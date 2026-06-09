/**
 * Real-DB integration tests for `evaluateAthleteWeek` (the weekly verdict).
 *
 * Drives the actual aggregation SQL in `buildAthleteContextPack` (compliance
 * windows, missed-session counts, check-in sub_score) and asserts the verdict
 * + triggers the rules engine produces. No SQL is faked — compliance is
 * computed by Postgres over real `workout_assignments` rows.
 *
 * NOTE on the date window: `evaluateAthleteWeek` evaluates the week starting at
 * `week_start` (snapped to Monday) and builds context with `on_date =
 * week_start + 6`. Compliance is the [on_date - 7d, on_date] window. We seed
 * assignments inside the evaluated week so they land in that window.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { evaluateAthleteWeek } from '@fahybrid/shared/domain/coach/weekly-evaluation';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCheckin,
  makeCoachAndAthlete,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

// A Monday with 7 weekdays inside the evaluated window.
const WEEK_START = '2026-02-02'; // Monday
const DAYS = ['2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06']; // Mon–Fri

describeWithDb('evaluateAthleteWeek (real DB)', () => {
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

  async function freshAthlete(): Promise<{ fx: Fixture; tplId: number }> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tplId = await makeTemplate({ fx, name: 'session' });
    return { fx, tplId };
  }

  test('verdict ok when compliance is high and no triggers fire', async () => {
    const { fx, tplId } = await freshAthlete();
    // 5 scheduled, all completed → compliance 100%.
    for (const d of DAYS) {
      await makeAssignment({ fx, templateId: tplId, scheduledForIso: d, status: 'completed' });
    }
    await makeCheckin({ fx, recordedForIso: '2026-02-08', subScore: 78 }); // on_date = WEEK_START+6

    const r = await evaluateAthleteWeek({ athlete_id: fx.athleteId, week_start: WEEK_START, client: sql });

    expect(r.week_start).toBe('2026-02-02');
    expect(r.week_end).toBe('2026-02-08');
    expect(r.verdict).toBe('ok');
    expect(r.triggers).toEqual([]);
    expect(r.context_pack.compliance_7d).toBe(1);
  });

  test('verdict needs_adjustment when compliance < 60% and 2+ missed', async () => {
    const { fx, tplId } = await freshAthlete();
    // 5 scheduled, 1 completed, 3 missed → compliance 20%, missed 3.
    await makeAssignment({ fx, templateId: tplId, scheduledForIso: DAYS[0]!, status: 'completed' });
    await makeAssignment({ fx, templateId: tplId, scheduledForIso: DAYS[1]!, status: 'missed' });
    await makeAssignment({ fx, templateId: tplId, scheduledForIso: DAYS[2]!, status: 'missed' });
    await makeAssignment({ fx, templateId: tplId, scheduledForIso: DAYS[3]!, status: 'missed' });
    await makeAssignment({ fx, templateId: tplId, scheduledForIso: DAYS[4]!, status: 'scheduled' });

    const r = await evaluateAthleteWeek({ athlete_id: fx.athleteId, week_start: WEEK_START, client: sql });

    expect(r.verdict).toBe('needs_adjustment');
    expect(r.triggers).toContain('compliance_7d_below_60');
    expect(r.triggers).toContain('missed_sessions_2plus');
    expect(r.context_pack.compliance.missed_7d).toBe(3);
    expect(r.context_pack.compliance_7d).toBe(0.2);
  });

  test('verdict needs_adjustment when check-in sub_score < 40', async () => {
    const { fx, tplId } = await freshAthlete();
    // Full compliance (no compliance/missed trigger) but a poor check-in.
    for (const d of DAYS) {
      await makeAssignment({ fx, templateId: tplId, scheduledForIso: d, status: 'completed' });
    }
    await makeCheckin({ fx, recordedForIso: '2026-02-08', subScore: 30 });

    const r = await evaluateAthleteWeek({ athlete_id: fx.athleteId, week_start: WEEK_START, client: sql });

    expect(r.verdict).toBe('needs_adjustment');
    expect(r.triggers).toContain('sub_score_below_40');
    expect(r.triggers).not.toContain('compliance_7d_below_60');
    expect(r.context_pack.readiness_sub_score).toBe(30);
  });

  test('no compliance data → no compliance trigger (data gap, not a false fail)', async () => {
    const { fx } = await freshAthlete();
    // Zero assignments → compliance_7d is null → rule must not fire.
    const r = await evaluateAthleteWeek({ athlete_id: fx.athleteId, week_start: WEEK_START, client: sql });
    expect(r.context_pack.compliance_7d).toBeNull();
    expect(r.triggers).not.toContain('compliance_7d_below_60');
    expect(r.verdict).toBe('ok');
  });
});
