/**
 * LA CUENTA ATRÁS A SU CARRERA VA EN EL DÍA DEL ATLETA — contra base de datos REAL.
 *
 * El progreso del plan (`buildMacroProgress`) y el contexto de la IA
 * (`buildAthleteContextPack`) sitúan el plan en el día que les pasa quien llama
 * (el del club, para el coach). La carrera, en cambio, es del atleta: los días
 * que faltan se cuentan desde SU día (DECISIONS 2026-09-23, «Qué día es en cada
 * sitio», «todas las lecturas de carreras» van en el calendario del atleta).
 *
 * El momento: domingo 9-mar-2031 12:00 UTC. En el club (sin huso guardado: el
 * defecto, Madrid) es domingo 9; en Auckland (UTC+13), donde vive el atleta, ya
 * es lunes 10. La carrera es el jueves 20: le quedan 10 días, no 11.
 */

import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { parseIsoDate } from '@fahybrid/shared/domain/dates';
import { buildAthleteContextPack } from '@fahybrid/shared/domain/coach/coach-ia-context';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const macroRoute = await import('@/app/api/coach/athletes/[id]/macro-progress/route');
const { buildAthletePlan } = await import('@/lib/dashboard/coach/athlete-plan');

const NOW = new Date('2031-03-09T12:00:00Z');
const CLUB_DAY = parseIsoDate('2031-03-09');

describeWithDb('cuenta atrás a la carrera objetivo en el día del atleta (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update athletes set timezone = 'Pacific/Auckland' where id = ${fx.athleteId}`;
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority, status, race_date)
      values (${fx.athleteId}, 'HYROX Auckland', 'hyrox', 'singles', 'open', 'men', 'target', 'planned', '2031-03-20')
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    // Las carreras caen con el atleta (on delete cascade).
    await fx.cleanup();
    await closeTestSql();
  });

  function atNow(): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  }

  test('el progreso del plan que lee el coach (ruta)', async () => {
    atNow();
    vi.mocked(getCoachSession).mockResolvedValue({
      user_id: BigInt(fx.coachUserId),
      coach_id: BigInt(fx.coachId),
    } as Awaited<ReturnType<typeof getCoachSession>>);
    const res = await macroRoute.GET(new Request('http://localhost/api/coach/athletes/x/macro-progress'), {
      params: Promise.resolve({ id: String(fx.athleteId) }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { macro_progress: { a_event_days: number | null } };
    expect(body.macro_progress.a_event_days).toBe(10);
  });

  test('el plan del atleta en el panel y el MCP («carrera en N días»)', async () => {
    atNow();
    const plan = await buildAthletePlan({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(plan.macro.a_event_days).toBe(10);
  });

  test('el contexto de la IA: con el instante, su día; con solo un día fijo, ese día', async () => {
    const live = await buildAthleteContextPack({ athlete_id: fx.athleteId, on_date: CLUB_DAY, now: NOW, client: sql });
    expect(live.identity.days_to_a_event).toBe(10);

    // Quien lee un día fijo (la revisión de una semana ya cerrada) cuenta desde él.
    const fixed = await buildAthleteContextPack({ athlete_id: fx.athleteId, on_date: CLUB_DAY, client: sql });
    expect(fixed.identity.days_to_a_event).toBe(11);
  });
});
