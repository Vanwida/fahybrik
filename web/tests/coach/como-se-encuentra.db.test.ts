/**
 * «Cómo se encuentra» — real-DB contract: fetchAthletesForCoach (the MCP's
 * athlete list) ships TODAY's sub-score only when it is actually from today
 * (athlete-local) — a bad check-in from yesterday never surfaces (viejo ≠ hoy).
 * (The old resumen loader and the v2 roster row mapper were retired with the
 * panel rebuild; the ficha reads check-ins through atleta-detalle.)
 */
import { afterEach, beforeEach, expect, test } from 'vitest';
import { fetchAthletesForCoach } from '@/lib/dashboard/athletes/list';
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

  test('roster: bad check-in TODAY paints the chip; bad YESTERDAY does not', async () => {
    await insertCheckin(TODAY, 12);
    const rows = await fetchAthletesForCoach({ coach_id: BigInt(fx.coachId), client: fx.sql });
    const mine = rows.find((r) => r.athlete_id === String(fx.athleteId));
    expect(mine?.checkin_today_sub).toBe(12);

    // Move it to yesterday → today has nothing → no chip, however bad it was.
    await fx.sql`
      update daily_checkins set recorded_for = ${dayShift(-1)}::date
      where athlete_id = ${fx.athleteId}
    `;
    const rows2 = await fetchAthletesForCoach({ coach_id: BigInt(fx.coachId), client: fx.sql });
    const mine2 = rows2.find((r) => r.athlete_id === String(fx.athleteId));
    expect(mine2?.checkin_today_sub).toBeNull();
  });

  test('roster: a GOOD check-in today ships the sub too', async () => {
    await insertCheckin(TODAY, 72);
    const rows = await fetchAthletesForCoach({ coach_id: BigInt(fx.coachId), client: fx.sql });
    const mine = rows.find((r) => r.athlete_id === String(fx.athleteId));
    expect(mine?.checkin_today_sub).toBe(72);
  });
});
