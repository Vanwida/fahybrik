/**
 * LA SEMANA DE UNA PAREJA DE DOBLES SE FECHA EN EL CALENDARIO DE SU CLUB — contra
 * base de datos REAL, a través de la ruta (`GET /api/athlete/dobles/plan`).
 *
 * El hub casa las dos semanas día a día (el lunes de uno con el lunes del otro) y
 * elige «Entrenar a la vez» desde el «hoy» de esa semana. Cada semana se fechaba en
 * el huso de SU atleta (`athletes.timezone`): con dos husos guardados distintos (o
 * uno sin guardar) las dos ventanas quedaban una semana separadas alrededor de la
 * medianoche del domingo al lunes, y el casado emparejaba fechas distintas. Una
 * pareja es del club (DECISIONS 2026-09-23, «Qué día es en cada sitio»): la ruta
 * resuelve una vez el huso del coach de la pareja (`loadDoublesPairTimezone`) y
 * fecha con él las dos semanas.
 *
 * Los instantes, elegidos para que el día del club no sea ni el de Madrid ni el UTC:
 *   · lunes 21 sept 03:30 UTC — en Madrid y en UTC ya es lunes 21; en el club de
 *     Ciudad de México (UTC−6) aún es el domingo 20;
 *   · domingo 20 sept 13:30 UTC — en Madrid y en UTC sigue siendo domingo 20; en el
 *     club de Auckland (UTC+12) ya es el lunes 21.
 *
 * El reloj: la ruta lee `new Date()`; se congela SOLO `Date` (los temporizadores y
 * el driver de Postgres siguen en tiempo real). La sesión del atleta se sustituye;
 * todo lo demás es la ruta de verdad contra la base.
 *
 * Limpieza: la ruta lee con el cliente de la app, así que el fixture no puede vivir
 * en una transacción que se deshace; cada caso borra exactamente lo suyo.
 */

import { afterAll, afterEach, expect, it, vi } from 'vitest';
import type { DoblesConnectedPlanDTO } from '@/lib/athlete/dobles-plan';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate } from '../utils/db-fixtures';

// La sesión que la ruta lee del bearer: el atleta A de cada caso.
let session: { athlete_id: bigint; full_name: string } | null = null;
vi.mock('@/lib/auth/athlete-session', () => ({
  getAthleteSessionFromBearer: async () => session,
}));

const { GET } = await import('@/app/api/athlete/dobles/plan/route');

const MEXICO = 'America/Mexico_City';
const AUCKLAND = 'Pacific/Auckland';

describeWithDb('Dobles: la semana de la pareja va en el calendario de su club (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    vi.useRealTimers();
    session = null;
    while (cleanups.length) await cleanups.pop()!();
  });

  afterAll(async () => {
    await closeTestSql();
  });

  interface Pair {
    self: number;
    partner: number;
    templateId: number;
  }

  /** Un club en `clubTz` con dos atletas suyos en pareja activa: A (el que mira,
   *  huso `selfTz`) y B (huso `partnerTz`); null = sin huso guardado. */
  async function pairIn(clubTz: string, selfTz: string | null, partnerTz: string | null): Promise<Pair> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    await sql`update coaches set timezone = ${clubTz} where id = ${fx.coachId}`;
    await sql`update athletes set timezone = ${selfTz}, full_name = 'Ana Dobles' where id = ${fx.athleteId}`;

    const tag = `dobles-club-week-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [user] = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${`${tag}@test.local`}, 'athlete') returning id::text
    `;
    const partnerUserId = Number(user!.id);
    const [athlete] = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name, timezone)
      values (${partnerUserId}, ${fx.coachId}, 'Berta Dobles', ${partnerTz})
      returning id::text
    `;
    const partner = Number(athlete!.id);
    // Se borra antes que el fixture (LIFO): sus sesiones apuntan a la plantilla del coach.
    cleanups.push(async () => {
      await sql`delete from doubles_pairs where coach_id = ${fx.coachId}`;
      await sql`delete from workout_assignments where athlete_id = ${partner}`;
      await sql`delete from athletes where id = ${partner}`;
      await sql`delete from users where id = ${partnerUserId}`;
    });

    const [a, b] = [fx.athleteId, partner].sort((x, y) => x - y);
    await sql`
      insert into doubles_pairs (coach_id, athlete_a_id, athlete_b_id, status)
      values (${fx.coachId}, ${a!}, ${b!}, 'active')
    `;
    const templateId = await makeTemplate({ fx, name: 'Sesión de la pareja' });
    return { self: fx.athleteId, partner, templateId };
  }

  /** Una sesión compartida (el defecto de `partner_visibility`) del atleta ese día. */
  async function shared(athleteId: number, templateId: number, iso: string): Promise<number> {
    const [row] = await sql<Array<{ id: string }>>`
      insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${athleteId}, ${iso}::date, ${templateId}, 1, 'scheduled'::assignment_status)
      returning id::text
    `;
    return Number(row!.id);
  }

  /** El plan conectado que ve `athleteId` con el reloj parado en `instant`. */
  async function planAt(instant: string, athleteId: number): Promise<DoblesConnectedPlanDTO> {
    session = { athlete_id: BigInt(athleteId), full_name: 'Ana Dobles' };
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(instant) });
    try {
      const res = await GET(
        new Request('http://localhost/api/athlete/dobles/plan', { headers: { authorization: 'Bearer test' } }),
      );
      expect(res.status).toBe(200);
      return (await res.json()) as DoblesConnectedPlanDTO;
    } finally {
      vi.useRealTimers();
    }
  }

  it('club en México, A sin huso y B en México: el domingo por la noche las dos semanas son la del 14 al 20', async () => {
    const p = await pairIn(MEXICO, null, MEXICO);
    const selfSunday = await shared(p.self, p.templateId, '2026-09-20');
    const partnerSunday = await shared(p.partner, p.templateId, '2026-09-20');

    const plan = await planAt('2026-09-21T03:30:00Z', p.self);

    // La ventana es la del club (lunes 14 → domingo 20) para los DOS lados. Con el
    // huso de cada uno, la de A era la del 21 (la de Madrid) y la de B la del 14.
    expect(plan.self_days.map((d) => d.day_label)).toEqual(['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']);
    expect(plan.self_days[0]!.id).toBe('rest-2026-09-14');
    expect(plan.partner_days[0]!.id).toBe('rest-2026-09-14');
    // El domingo 20 casa con el domingo 20: la misma sesión, compartida → juntos.
    expect(plan.self_days[6]).toMatchObject({ id: String(selfSunday), togetherness: 'optional_together' });
    expect(plan.partner_days[6]).toMatchObject({ id: String(partnerSunday), togetherness: 'optional_together' });
    // Hoy, en el club, es ese domingo: es la sesión de «Entrenar a la vez».
    expect(plan.train_together_session_id).toBe(String(selfSunday));
  });

  it('club en Auckland, los dos sin huso (Madrid): el domingo a mediodía de Madrid la pareja ya está en la semana del 21', async () => {
    const p = await pairIn(AUCKLAND, null, null);
    const selfMonday = await shared(p.self, p.templateId, '2026-09-21');
    const partnerMonday = await shared(p.partner, p.templateId, '2026-09-21');

    const plan = await planAt('2026-09-20T13:30:00Z', p.self);

    // Con el día de Madrid (y el UTC), la semana era aún la del 14 y el lunes 21 no salía.
    expect(plan.self_days[0]).toMatchObject({ id: String(selfMonday), togetherness: 'optional_together' });
    expect(plan.partner_days[0]).toMatchObject({ id: String(partnerMonday), togetherness: 'optional_together' });
    expect(plan.self_days[6]!.id).toBe('rest-2026-09-27');
    expect(plan.train_together_session_id).toBe(String(selfMonday));
  });
});
