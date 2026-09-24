/**
 * Rendimiento › Fisiología y la columna Estado del Plan leen el MISMO check-in
 * (`daily_checkins`). Antes Fisiología leía `notifications` (que nadie escribe) y
 * decía «sin datos de salud» mientras el Plan enseñaba agujetas y fatiga.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { buildAthleteBody } from '@/lib/dashboard/coach/deep-dive-body';
import { loadFichaEstado } from '@/lib/dashboard/v2/atleta-detalle';

const sql = getTestSql();

describeWithDb('fisiología y columna Estado: una fuente de check-ins (BD real)', () => {
  let fx: Fixture;
  let today: string;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const t = await sql<Array<{ today: string }>>`select to_char((now() at time zone 'Europe/Madrid')::date,'YYYY-MM-DD') as today`;
    today = t[0]!.today;
    await sql`
      insert into daily_checkins (athlete_id, recorded_for, recorded_at, sub_score, soreness, fatigue, mood)
      values (${fx.athleteId}, ${today}::date - 1, now() - interval '1 day', 55, 3, 4, 4),
             (${fx.athleteId}, ${today}::date, now(), 42, 2, 3, 3)
    `;
  });

  afterAll(async () => {
    await sql`delete from daily_checkins where athlete_id = ${fx.athleteId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  it('Fisiología ve los check-ins que ve la columna Estado', async () => {
    const [body, estado] = await Promise.all([
      buildAthleteBody({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql }),
      loadFichaEstado({ coach_id: fx.coachId, athlete_id: fx.athleteId, readiness: null, client: sql }),
    ]);
    expect(estado.last_checkin).toMatchObject({ on: today, soreness: 2, fatigue: 3 });
    expect(body.has_any_data).toBe(true);
    expect(body.wellness.checkins_done_30d).toBe(2);

    const soreness = body.wellness.metrics.find((m) => m.key === 'soreness')!;
    expect(soreness.label).toBe('Agujetas');
    // El último punto de la serie es el mismo check-in que la columna enseña.
    const last = soreness.series.filter((p) => p.value != null).at(-1)!;
    expect(last).toEqual({ iso_date: today, value: estado.last_checkin!.soreness });
    const fatigue = body.wellness.metrics.find((m) => m.key === 'fatigue')!;
    expect(fatigue.series.filter((p) => p.value != null).at(-1)!.value).toBe(estado.last_checkin!.fatigue);
  });

  it('otro coach no lee los check-ins de este atleta', async () => {
    const other = await makeCoachAndAthlete(sql);
    try {
      await expect(
        buildAthleteBody({ coach_id: other.coachId, athlete_id: fx.athleteId, client: sql }),
      ).rejects.toThrow();
    } finally {
      await other.cleanup();
    }
  });
});
