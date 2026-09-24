/**
 * LA FICHA DEL COACH (deep dive): EL PLAN EN EL DÍA DEL CLUB, LA CARRERA EN EL DEL
 * ATLETA — contra base de datos REAL.
 *
 * La regla (DECISIONS 2026-09-23, «Qué día es en cada sitio»): lo que el coach lee
 * del PLAN va en el calendario del club (`coaches.timezone`); una CARRERA es del
 * atleta y su cuenta atrás va en el suyo (`athletes.timezone`). En la ficha:
 *   · `a_event.days_until` (la carrera objetivo): se contaba desde el día de Madrid
 *     del instante (`getTargetRaceRow` con un instante pasa por `startOfDayInBox`);
 *   · `macrocycle.weeks_to_event` (la cuenta atrás que da `getCurrentMicrociclo`):
 *     se contaba desde el día del CLUB, el mismo con el que se sitúa el plan;
 *   · `macrocycle.current_day_of_week` (qué día de la semana es hoy en la cinta): el
 *     reloj UTC real, ni siquiera el `now` de la ficha.
 *
 * El caso: club en Ciudad de México (UTC−6), atleta en Auckland (UTC+12). El plan A
 * acaba el domingo 20 y el lunes 21 empieza el B. Su carrera objetivo es el lunes 28.
 *   · domingo 20 sept 13:30 UTC — Madrid y UTC: domingo 20; club: domingo 20;
 *     atleta: LUNES 21 (su día no es ni el de Madrid ni el UTC);
 *   · lunes 21 sept 03:30 UTC — Madrid y UTC: lunes 21; atleta: lunes 21; club:
 *     DOMINGO 20 (su día no es ni el de Madrid ni el UTC).
 * En los dos, el club sigue en el plan A y el atleta está a 7 días de su carrera.
 *
 * El reloj: se pasa `now` y además se congela `Date` (solo `Date`) en el mismo
 * instante, para que lo que lea el reloj lea ese instante y no el de hoy.
 */

import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { getCurrentMicrociclo } from '@fahybrid/shared/domain/coach/current-microciclo';
import { parseIsoDate } from '@fahybrid/shared/domain/dates';
import { buildAthleteDeepDive } from '@/lib/coach/athlete-deep-dive';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const CLUB_TZ = 'America/Mexico_City';
const ATHLETE_TZ = 'Pacific/Auckland';
/** El atleta ya vive el lunes 21; el club (y Madrid, y UTC) siguen en el domingo 20. */
const ATHLETE_AHEAD = '2026-09-20T13:30:00Z';
/** El club aún vive el domingo 20; el atleta (y Madrid, y UTC) ya están en el lunes 21. */
const CLUB_BEHIND = '2026-09-21T03:30:00Z';

describeWithDb('ficha del coach: el plan en el día del club, la carrera en el del atleta (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const tag = `${Date.now()}`;
  const PLAN_A = `Plan A ${tag}`;
  const PLAN_B = `Plan B ${tag}`;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update coaches set timezone = ${CLUB_TZ} where id = ${fx.coachId}`;
    await sql`update athletes set timezone = ${ATHLETE_TZ} where id = ${fx.athleteId}`;

    const month = async (name: string): Promise<number> => {
      const [row] = await sql<Array<{ id: string }>>`
        insert into program_month_templates (coach_id, name) values (${fx.coachId}, ${name}) returning id::text
      `;
      const id = Number(row!.id);
      fx.monthTemplates.push({ monthId: id, weekIds: [] });
      return id;
    };
    const a = await month(PLAN_A);
    const b = await month(PLAN_B);
    await sql`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, created_by_coach_id)
      values (${fx.athleteId}, ${a}, '2026-08-24', '2026-09-20', ${fx.coachId}),
             (${fx.athleteId}, ${b}, '2026-09-21', '2026-10-18', ${fx.coachId})
    `;
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority, status, race_date)
      values (${fx.athleteId}, 'HYROX Auckland', 'hyrox', 'singles', 'open', 'men', 'target', 'planned', '2026-09-28')
    `;
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    // Las carreras caen con el atleta (on delete cascade).
    await fx.cleanup();
    await closeTestSql();
  }, 60_000);

  async function deepDiveAt(instant: string) {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(instant) });
    try {
      return await buildAthleteDeepDive({
        coach_id: fx.coachId,
        athlete_id: String(fx.athleteId),
        now: new Date(instant),
        client: sql,
      });
    } finally {
      vi.useRealTimers();
    }
  }

  it('la carrera objetivo cuenta desde el lunes 21 del atleta (7 días), no desde el domingo de Madrid (8)', async () => {
    const dd = await deepDiveAt(ATHLETE_AHEAD);
    expect(dd.a_event).toEqual({ name: 'HYROX Auckland', iso_date: '2026-09-28', days_until: 7 });
  });

  it('la cuenta atrás de la cinta es del atleta (1 semana) y la posición en el plan, del club (plan A, semana 4)', async () => {
    for (const instant of [ATHLETE_AHEAD, CLUB_BEHIND]) {
      const dd = await deepDiveAt(instant);
      // Con el domingo 20 del club, la carrera estaba a 8 días: 2 semanas.
      expect(dd.macrocycle?.weeks_to_event).toBe(1);
      // El lunes 21 del atleta ya es el plan B: la posición sigue siendo la del club.
      expect(dd.macrocycle?.current_block).toBe(PLAN_A);
      expect(dd.macrocycle?.current_week).toBe(4);
      expect(dd.macrocycle?.blocks.find((blk) => blk.is_current)?.type).toBe(PLAN_A);
    }
  });

  it('el día de la semana de la cinta es el del club: domingo (7), no el lunes UTC (1)', async () => {
    expect((await deepDiveAt(CLUB_BEHIND)).macrocycle?.current_day_of_week).toBe(7);
    expect((await deepDiveAt(ATHLETE_AHEAD)).macrocycle?.current_day_of_week).toBe(7);
  });

  it('getCurrentMicrociclo: la posición sale de on_date y la cuenta atrás de race_on_date; sin él, de on_date', async () => {
    const clubDay = parseIsoDate('2026-09-20');
    const athleteDay = parseIsoDate('2026-09-21');

    const split = await getCurrentMicrociclo({
      athlete_id: fx.athleteId,
      on_date: clubDay,
      race_on_date: athleteDay,
      client: sql,
    });
    expect(split).toMatchObject({ name: PLAN_A, week_index: 4, a_event_days: 7, weeks_to_event: 1 });

    const planDayOnly = await getCurrentMicrociclo({ athlete_id: fx.athleteId, on_date: clubDay, client: sql });
    expect(planDayOnly).toMatchObject({ name: PLAN_A, week_index: 4, a_event_days: 8, weeks_to_event: 2 });
  });
});
