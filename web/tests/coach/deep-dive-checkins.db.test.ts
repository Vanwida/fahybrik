/**
 * La ficha del MCP y de /api/coach/athletes/[id] (`buildAthleteDeepDive`) lee los
 * check-ins de `daily_checkins`, la misma fuente que Fisiología y la columna
 * Estado. Antes contaba filas de `notifications` (kind daily_checkin) que nadie
 * escribe: «0 check-ins en 7 días» y ánimo/fatiga vacíos siempre. Y su índice de
 * disposición usa los pesos del coach (0256).
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { buildAthleteDeepDive } from '@/lib/coach/athlete-deep-dive';

const sql = getTestSql();

describeWithDb('deep-dive: check-ins de verdad (BD real)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const t = await sql<Array<{ today: string }>>`select to_char((now() at time zone 'Europe/Madrid')::date,'YYYY-MM-DD') as today`;
    const today = t[0]!.today;
    await sql`
      insert into daily_checkins (athlete_id, recorded_for, recorded_at, sub_score, soreness, fatigue, mood)
      values (${fx.athleteId}, ${today}::date - 10, now() - interval '10 days', 70, 2, 2, 4),
             (${fx.athleteId}, ${today}::date - 2, now() - interval '2 days', 55, 3, 4, 4),
             (${fx.athleteId}, ${today}::date - 1, now() - interval '1 day', 50, 3, 4, 3),
             (${fx.athleteId}, ${today}::date, now(), 42, 2, 5, 2)
    `;
  });

  afterAll(async () => {
    await sql`delete from daily_checkins where athlete_id = ${fx.athleteId}`;
    await sql`delete from coach_signal_thresholds where coach_id = ${fx.coachId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  it('cuenta los check-ins de los últimos 7 días y lee ánimo y fatiga del último', async () => {
    const d = await buildAthleteDeepDive({ athlete_id: String(fx.athleteId), coach_id: fx.coachId, client: sql });
    expect(d.compliance.checkin_done_7d).toBe(3);
    expect(d.readiness.mood).toBe(2);
    expect(d.readiness.fatigue).toBe(5);
  });
});
