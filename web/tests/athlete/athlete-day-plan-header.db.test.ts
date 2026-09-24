/**
 * LA CABECERA DEL PLAN DE LA APP VA EN EL DÍA DEL ATLETA — contra base de datos REAL.
 *
 * `GET /api/athlete/plan/week` (cabecera «semana N de M» del Plan) y
 * `GET /api/athlete/macro-progress` (la cinta de semanas) llamaban a los lectores
 * del plan sin día, y el lector caía al de Madrid. Lo vive el atleta, así que va
 * en SU huso (`athletes.timezone`; DECISIONS 2026-09-23, «Qué día es en cada
 * sitio»), como su semana (`week-plan`) y el camino (`plan/camino.ts`).
 *
 * El momento: lunes 21 sept 03:30 UTC. En Madrid ya es lunes 21; para el atleta
 * (Ciudad de México, UTC−6) aún es domingo 20: sigue en la semana 4 de 4 de su
 * programa, no en la 1 del siguiente. Su club no tiene huso (el defecto, Madrid):
 * así se ve que manda el día del atleta, no el del club.
 *
 * La semana en sí (`buildAthleteWeekPlan`) no es de este cambio y se sustituye por
 * un doble: aquí solo se mira la cabecera. Se fija `Date` (solo `Date`).
 */

import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeMicrocycle,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

let session: { athlete_id: bigint; full_name: string | null } | null = null;
vi.mock('@/lib/auth/athlete-session', () => ({
  getAthleteSessionFromBearer: async () => session,
}));
vi.mock('@/lib/athlete/week-plan', () => ({
  buildAthleteWeekPlan: async () => ({ peek_blocked_by_horizon: false }),
}));

const planWeekRoute = await import('@/app/api/athlete/plan/week/route');
const macroRoute = await import('@/app/api/athlete/macro-progress/route');

const ATHLETE_TZ = 'America/Mexico_City';
const NOW = new Date('2026-09-21T03:30:00Z');

function bearer(path: string): Request {
  return new Request(`http://localhost${path}`, { headers: { authorization: 'Bearer test' } });
}

describeWithDb('cabecera del Plan de la app en el día del atleta (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const tag = `${Date.now()}`;
  const CURRENT = `Programa en curso ${tag}`;
  const NEXT = `Programa siguiente ${tag}`;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update athletes set timezone = ${ATHLETE_TZ} where id = ${fx.athleteId}`;
    session = { athlete_id: BigInt(fx.athleteId), full_name: 'Ana Atleta' };

    const month = async (name: string): Promise<number> => {
      const [row] = await sql<Array<{ id: string }>>`
        insert into program_month_templates (coach_id, name) values (${fx.coachId}, ${name}) returning id::text
      `;
      const id = Number(row!.id);
      fx.monthTemplates.push({ monthId: id, weekIds: [] });
      return id;
    };
    const current = await month(CURRENT);
    const next = await month(NEXT);
    await sql`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, created_by_coach_id)
      values (${fx.athleteId}, ${current}, '2026-08-24', '2026-09-20', ${fx.coachId}),
             (${fx.athleteId}, ${next}, '2026-09-21', '2026-10-18', ${fx.coachId})
    `;

    // Una sesión del plan en cada una de las dos semanas que se discuten.
    const tpl = await makeTemplate({ fx, name: 'Sesión' });
    for (const [start, end, day] of [
      ['2026-09-14', '2026-09-20', '2026-09-16'],
      ['2026-09-21', '2026-09-27', '2026-09-23'],
    ] as const) {
      const { microcycleId } = await makeMicrocycle({ sql, athleteId: fx.athleteId, startIso: start, endIso: end });
      await makeAssignment({ fx, templateId: tpl, scheduledForIso: day, microcycleId });
    }
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    session = null;
    await fx.cleanup();
    await closeTestSql();
  }, 60_000);

  function atNow(): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  }

  it('GET /api/athlete/plan/week: la cabecera sigue en su domingo (semana 4 de 4)', async () => {
    atNow();
    const res = await planWeekRoute.GET(bearer('/api/athlete/plan/week'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      macro_summary: { week_label: string | null; current_week_start: string; current_week_end: string };
    };
    expect(body.macro_summary).toMatchObject({
      week_label: `${CURRENT} · semana 4 de 4`,
      current_week_start: '2026-09-14',
      current_week_end: '2026-09-20',
    });
  });

  it('GET /api/athlete/macro-progress: resumen y cinta cuentan desde su día', async () => {
    atNow();
    const res = await macroRoute.GET(bearer('/api/athlete/macro-progress'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      macro: { week_label: string | null; current_week_start: string };
      macro_progress: { weeks: Array<{ week_start: string; status: string }> };
    };
    expect(body.macro).toMatchObject({ week_label: `${CURRENT} · semana 4 de 4`, current_week_start: '2026-09-14' });
    expect(body.macro_progress.weeks).toEqual([
      expect.objectContaining({ week_start: '2026-09-14', status: 'current' }),
      expect.objectContaining({ week_start: '2026-09-21', status: 'upcoming' }),
    ]);
  });

  it('un huso guardado que no se puede usar cae al defecto sin tumbar la pantalla', async () => {
    atNow();
    await sql`update athletes set timezone = 'Marte/Olimpo' where id = ${fx.athleteId}`;
    try {
      const res = await macroRoute.GET(bearer('/api/athlete/macro-progress'));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { macro: { current_week_start: string } };
      // El defecto (Madrid) ya es lunes 21.
      expect(body.macro.current_week_start).toBe('2026-09-21');
    } finally {
      await sql`update athletes set timezone = ${ATHLETE_TZ} where id = ${fx.athleteId}`;
    }
  });
});
