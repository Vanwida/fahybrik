/**
 * Real-DB integration test for the readiness DETAIL contract — the raw values
 * and 7-day trend the athlete detail sheet renders.
 *
 * Asserts, against real biometric_streams / daily_checkins / snapshot rows on a
 * Neon test branch (never a mock, per CLAUDE.md):
 *   1. `computeAthleteDailyReadiness` surfaces the SAME inputs it scores with —
 *      hrv_ms, hrv_baseline_ms, rhr_bpm, sleep_hours, sleep_target_h — no invented
 *      metric (there is deliberately no personal RHR baseline nor sleep media).
 *   2. `getAthleteReadinessToday` returns an ascending 7-day trend AND self-heals
 *      a legacy today-snapshot (one written before enrichment) so the references
 *      appear without a backfill.
 */
import { afterEach, beforeEach, expect, test } from 'vitest';
import {
  computeAthleteDailyReadiness,
  getAthleteReadinessToday,
} from '@fahybrid/shared/domain/coach/athlete-daily-readiness';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

// Fixed athlete-local "today". June → Europe/Madrid is CEST (UTC+2); the seeded
// UTC instants below land inside the compute's overnight / day / baseline windows
// for this date regardless of that offset.
const TODAY = '2026-06-15';
const YESTERDAY = '2026-06-14';
const ON_DATE = new Date('2026-06-15T12:00:00Z'); // Madrid 14:00 → today = 2026-06-15

// Seeded raw values (the numbers the sheet shows).
const HRV_TODAY = 47; // ms
const HRV_BASELINE = 42; // ms
const RHR = 51; // bpm
const SLEEP_HOURS = 6.6;

describeWithDb('readiness detail contract (real DB)', () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await makeCoachAndAthlete(getTestSql());
    const sql = fx.sql;
    const a = fx.athleteId;

    const insertBio = (metric: string, recordedAt: string, value: number, unit: string) =>
      sql`
        insert into biometric_streams (athlete_id, source, metric_type, recorded_at, value_numeric, unit)
        values (${a}, 'healthkit', ${metric}::biometric_metric, ${new Date(recordedAt)}, ${value}, ${unit})
      `;

    // Today's mean HRV (within the day window) + its 14–60d baseline.
    await insertBio('hrv', '2026-06-15T08:00:00Z', HRV_TODAY, 'ms');
    await insertBio('hrv', '2026-05-16T08:00:00Z', HRV_BASELINE, 'ms'); // ~30d back → baseline window
    // Last night's sleep + resting HR (within the overnight window).
    await insertBio('sleep_duration', '2026-06-15T05:00:00Z', SLEEP_HOURS * 3600, 'seconds');
    await insertBio('hr_resting', '2026-06-15T04:00:00Z', RHR, 'bpm');
    // Today's morning check-in (the subjective sub-score).
    await sql`
      insert into daily_checkins
        (athlete_id, recorded_for, recorded_at, sub_score, soreness, mood, motivation, fatigue, sleep_quality)
      values (${a}, ${TODAY}::date, ${new Date('2026-06-15T06:30:00Z')}, 60, 3, 3, 3, 3, 3)
    `;
  });

  afterEach(async () => {
    const sql = fx.sql;
    const a = fx.athleteId;
    await sql`delete from athlete_daily_readiness_snapshots where athlete_id = ${a}`;
    await sql`delete from biometric_streams where athlete_id = ${a}`;
    await sql`delete from daily_checkins where athlete_id = ${a}`;
    await fx.cleanup();
    await closeTestSql();
  });

  test('compute surfaces the raw values it scores with (no invented metric)', async () => {
    const snap = await computeAthleteDailyReadiness({
      athlete_id: fx.athleteId,
      recorded_for: TODAY,
      client: fx.sql,
    });
    expect(snap).not.toBeNull();
    const b = snap!.breakdown;
    expect(b.hrv_ms).toBe(HRV_TODAY);
    expect(b.hrv_baseline_ms).toBe(HRV_BASELINE);
    expect(b.rhr_bpm).toBe(RHR);
    expect(b.sleep_hours).toBeCloseTo(SLEEP_HOURS, 3);
    expect(b.sleep_target_h).toBe(8);
    // The component scores still exist (the bars) and the overall score is valid.
    expect(b.hrv_component).not.toBeNull();
    expect(b.sleep_component).not.toBeNull();
    expect(b.rhr_component).not.toBeNull();
    expect(snap!.score).toBeGreaterThanOrEqual(0);
    expect(snap!.score).toBeLessThanOrEqual(100);
  });

  test('getAthleteReadinessToday: computes TODAY when the stored latest snapshot is days old', async () => {
    const sql = fx.sql;
    const a = fx.athleteId;
    // The frozen-sheet bug (27-jul-2026): the ONLY stored snapshot is 11 days
    // old (born mid-first-sync, rhr-only) and nothing ever computed a newer day,
    // so the athlete sheet showed "Jueves 16 jul · Sueño/HRV: Sin dato aún"
    // forever while fresh biometrics sat in biometric_streams. The athlete's
    // own today-read must compute today from the live inputs, not echo the
    // stale row.
    await sql`
      insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score, breakdown_json)
      values (${a}, '2026-06-04'::date, 98, '{"rhr_component":98,"sleep_target_h":8}'::jsonb)
    `;

    const snap = await getAthleteReadinessToday({ athlete_id: a, on_date: ON_DATE, client: sql });
    expect(snap).not.toBeNull();
    expect(snap!.recorded_for).toBe(TODAY);
    expect(snap!.breakdown.sleep_component).not.toBeNull();
    expect(snap!.breakdown.hrv_component).not.toBeNull();
    expect(snap!.breakdown.rhr_component).not.toBeNull();
    // And it PERSISTED, so coach surfaces (stored-snapshot readers) see it too.
    const stored = await sql<Array<{ n: string }>>`
      select count(*)::text as n from athlete_daily_readiness_snapshots
      where athlete_id = ${a} and recorded_for = ${TODAY}::date
    `;
    expect(stored[0]!.n).toBe('1');
  });

  test('getAthleteReadinessToday: falls back to the stored latest when today has zero signals', async () => {
    const sql = fx.sql;
    const a = fx.athleteId;
    // No signals at all for today (wipe the seeded ones) — only an old snapshot
    // remains. The honest answer is that snapshot, dated as the day it was
    // computed for — never an invented score, never null while history exists.
    await sql`delete from biometric_streams where athlete_id = ${a}`;
    await sql`delete from daily_checkins where athlete_id = ${a}`;
    await sql`
      insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score, breakdown_json)
      values (${a}, ${YESTERDAY}::date, 70, '{"sleep_target_h":8}'::jsonb)
    `;

    const snap = await getAthleteReadinessToday({ athlete_id: a, on_date: ON_DATE, client: sql });
    expect(snap).not.toBeNull();
    expect(snap!.recorded_for).toBe(YESTERDAY);
    expect(snap!.score).toBe(70);
  });

  test('getAthleteReadinessToday: ascending trend + self-heals a legacy today snapshot', async () => {
    const sql = fx.sql;
    const a = fx.athleteId;
    // A prior day (so the trend has ≥2 points) and a LEGACY today snapshot with no
    // raw fields (no sleep_target_h) — the shape written before enrichment.
    await sql`
      insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score, breakdown_json)
      values (${a}, ${YESTERDAY}::date, 70, '{}'::jsonb)
    `;
    const legacyBreakdown = {
      sub_score: 60,
      sub_score_weight: 0.35,
      hrv_component: 55,
      sleep_hours: 6.6,
      sleep_component: 82,
      rhr_component: 98,
      recovery_component: null,
    };
    await sql`
      insert into athlete_daily_readiness_snapshots (athlete_id, recorded_for, score, breakdown_json)
      values (${a}, ${TODAY}::date, 55, ${JSON.stringify(legacyBreakdown)}::jsonb)
    `;

    const snap = await getAthleteReadinessToday({ athlete_id: a, on_date: ON_DATE, client: sql });
    expect(snap).not.toBeNull();
    expect(snap!.recorded_for).toBe(TODAY);

    // The legacy today snapshot was recomputed → raw references now present.
    expect(snap!.breakdown.sleep_target_h).toBe(8);
    expect(snap!.breakdown.hrv_ms).toBe(HRV_TODAY);
    expect(snap!.breakdown.hrv_baseline_ms).toBe(HRV_BASELINE);
    expect(snap!.breakdown.rhr_bpm).toBe(RHR);

    // Trend ascending by date, today inclusive; today's point equals the score.
    expect(snap!.trend).toBeDefined();
    expect(snap!.trend!.map((p) => p.recorded_for)).toEqual([YESTERDAY, TODAY]);
    expect(snap!.trend![1].score).toBe(snap!.score);
  });
});
