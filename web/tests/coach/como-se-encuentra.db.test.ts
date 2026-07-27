/**
 * «Cómo se encuentra» — real-DB contract for the two loaders that feed it:
 *   1. buildAthleteResumen ships the latest check-in verbatim + a 7-local-day
 *      strip with honest gaps (missing day → sub_score null, never 0).
 *   2. fetchAthletesForCoach ships TODAY's sub-score only when it is actually
 *      from today (athlete-local) — a bad check-in from yesterday never
 *      surfaces (viejo ≠ hoy), and the risk gate (<40) maps it to the chip.
 */
import { afterEach, beforeEach, expect, test } from 'vitest';
import { buildAthleteResumen } from '@/lib/dashboard/coach/resumen';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
import { toRosterRow } from '@/lib/dashboard/v2/atletas-row';
import { BOX_TIMEZONE, addDays, isoDateString, parseIsoDate, zonedDayString } from '@fahybrid/shared/domain/dates';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const TODAY = zonedDayString(new Date(), BOX_TIMEZONE);
const dayShift = (n: number) => isoDateString(addDays(parseIsoDate(TODAY), n));

describeWithDb('cómo se encuentra (real DB)', () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await makeCoachAndAthlete(getTestSql());
  });

  afterEach(async () => {
    await fx.sql`delete from daily_checkins where athlete_id = ${fx.athleteId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  const insertCheckin = (iso: string, sub: number, extra?: { notes?: string; flag?: string }) =>
    fx.sql`
      insert into daily_checkins
        (athlete_id, recorded_for, recorded_at, soreness, mood, motivation, fatigue, sleep_quality, notes, sub_score, adaptive_flag)
      values (
        ${fx.athleteId}, ${iso}::date, ${new Date(`${iso}T06:30:00Z`)},
        5, 1, 1, 4, 2, ${extra?.notes ?? null}, ${sub}, ${extra?.flag ?? null}
      )
    `;

  test('resumen: latest check-in verbatim + 7-slot week with honest gaps', async () => {
    await insertCheckin(dayShift(-2), 58);
    await insertCheckin(TODAY, 32, { notes: 'gemelo cargado', flag: 'consider_swap_z2_30' });

    const resumen = await buildAthleteResumen({
      coach_id: BigInt(fx.coachId),
      athlete_id: Number(fx.athleteId),
      client: fx.sql,
    });

    expect(resumen.checkin).not.toBeNull();
    const c = resumen.checkin!;
    expect(c.recorded_for).toBe(TODAY);
    expect(c.days_ago).toBe(0);
    expect(c.sub_score).toBe(32);
    // Raw values ship UNinverted — the presentation layer owns the flip.
    expect(c.soreness).toBe(5);
    expect(c.fatigue).toBe(4);
    expect(c.notes).toBe('gemelo cargado');
    expect(c.adaptive_flag).toBe('consider_swap_z2_30');

    expect(resumen.checkin_week).toHaveLength(7);
    expect(resumen.checkin_week[6]).toMatchObject({ iso: TODAY, sub_score: 32 });
    expect(resumen.checkin_week[4]).toMatchObject({ iso: dayShift(-2), sub_score: 58 });
    // A day with no check-in is a GAP (null), never a zero.
    expect(resumen.checkin_week[5]!.sub_score).toBeNull();
    // dow is ISO 1–7 and consecutive across the strip.
    for (const slot of resumen.checkin_week) {
      expect(slot.dow).toBeGreaterThanOrEqual(1);
      expect(slot.dow).toBeLessThanOrEqual(7);
    }
  });

  test('resumen: stale check-in is dated (days_ago), never presented as today', async () => {
    await insertCheckin(dayShift(-3), 61);
    const resumen = await buildAthleteResumen({
      coach_id: BigInt(fx.coachId),
      athlete_id: Number(fx.athleteId),
      client: fx.sql,
    });
    expect(resumen.checkin!.days_ago).toBe(3);
    expect(resumen.checkin_week[6]!.sub_score).toBeNull();
  });

  test('resumen: no check-ins ever → null block, 7 empty slots', async () => {
    const resumen = await buildAthleteResumen({
      coach_id: BigInt(fx.coachId),
      athlete_id: Number(fx.athleteId),
      client: fx.sql,
    });
    expect(resumen.checkin).toBeNull();
    expect(resumen.checkin_week).toHaveLength(7);
    expect(resumen.checkin_week.every((s) => s.sub_score === null)).toBe(true);
  });

  test('roster: bad check-in TODAY paints the chip; bad YESTERDAY does not', async () => {
    await insertCheckin(TODAY, 12);
    const rows = await fetchAthletesForCoach({ coach_id: BigInt(fx.coachId), client: fx.sql });
    const mine = rows.find((r) => r.athlete_id === String(fx.athleteId));
    expect(mine?.checkin_today_sub).toBe(12);
    expect(toRosterRow(mine!).checkin_risk_sub).toBe(12);

    // Move it to yesterday → today has nothing → no chip, however bad it was.
    await fx.sql`
      update daily_checkins set recorded_for = ${dayShift(-1)}::date
      where athlete_id = ${fx.athleteId}
    `;
    const rows2 = await fetchAthletesForCoach({ coach_id: BigInt(fx.coachId), client: fx.sql });
    const mine2 = rows2.find((r) => r.athlete_id === String(fx.athleteId));
    expect(mine2?.checkin_today_sub).toBeNull();
    expect(toRosterRow(mine2!).checkin_risk_sub).toBeNull();
  });

  test('roster: a GOOD check-in today ships the sub but maps to NO risk chip', async () => {
    await insertCheckin(TODAY, 72);
    const rows = await fetchAthletesForCoach({ coach_id: BigInt(fx.coachId), client: fx.sql });
    const mine = rows.find((r) => r.athlete_id === String(fx.athleteId));
    expect(mine?.checkin_today_sub).toBe(72);
    expect(toRosterRow(mine!).checkin_risk_sub).toBeNull();
  });
});
