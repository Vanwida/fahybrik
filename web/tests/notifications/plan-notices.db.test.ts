/**
 * EL AVISO DE PLAN, DE PUNTA A PUNTA — contra base de datos REAL (auditoría de la
 * app del atleta, D-10).
 *
 * Lo que se fija, por cada camino que lo envía:
 *  · la semana se cuenta desde el «hoy» del ATLETA (su huso), no el del servidor;
 *  · publicar la semana en curso dice «esta semana» (decía «la próxima»);
 *  · el cron dice la semana que abre; un bloque de varias, «a partir de»;
 *  · dobles y «avanzar» solo avisan si el atleta YA ve alguna semana de lo
 *    asignado (antes avisaban siempre: «Tu plan está listo» sobre un Plan vacío),
 *    y «avanzar» habla de «programa».
 *
 * El APNs se sustituye por una grabadora (es el canal externo, no la base): el
 * texto del push no se guarda en `notifications`, solo viaja.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeClub, mondayPlus, setWeek, type Club } from '../plan-delivery/fixtures';

interface SentPush {
  user_id: bigint;
  title: string;
  body: string;
  deeplink?: Record<string, unknown>;
}
const sent: SentPush[] = [];
vi.mock('@/lib/push/apns', () => ({
  sendPush: vi.fn(async (args: SentPush) => {
    sent.push({ user_id: args.user_id, title: args.title, body: args.body, deeplink: args.deeplink });
    return { attempted: 0, sent: 0, failed: 0, errors: [] };
  }),
}));
vi.mock('@/lib/push/webpush', () => ({ sendWebPush: vi.fn(async () => ({ sent: 0 })) }));
vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/dashboard/coach/doubles-pairs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dashboard/coach/doubles-pairs')>()),
  assignSequenceToPair: vi.fn(),
}));
vi.mock('@/lib/dashboard/coach/assign-sequence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dashboard/coach/assign-sequence')>()),
  advanceSequenceForAthlete: vi.fn(),
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { assignSequenceToPair } = await import('@/lib/dashboard/coach/doubles-pairs');
const { advanceSequenceForAthlete } = await import('@/lib/dashboard/coach/assign-sequence');
const { notifyPlanPublished } = await import('@/lib/notifications/plan-published');
const { boxToday, publishAthleteWeek, runAutoPublish } = await import('@/lib/coach/week-publishing');
const { publishBlock } = await import('@/lib/coach/publish-week');
const doublesRoute = await import('@/app/api/coach/doubles/pairs/[id]/assign-sequence/route');
const advanceRoute = await import('@/app/api/coach/athletes/[id]/advance-sequence/route');

describeWithDb('el aviso de plan nombra la semana correcta y solo llega si hay algo que ver (DB real)', () => {
  const sql = getTestSql();
  let club: Club;
  const userOf = new Map<number, bigint>();
  const today = boxToday();
  const thisMonday = mondayPlus(today, 0);
  const nextMonday = mondayPlus(today, 1);

  beforeAll(async () => {
    club = await makeClub(sql, 3);
    const rows = await sql<Array<{ id: string; user_id: string }>>`
      select id::text, user_id::text from athletes where id = any(${club.athleteIds}::bigint[])
    `;
    for (const r of rows) userOf.set(Number(r.id), BigInt(r.user_id));
  }, 60_000);

  beforeEach(async () => {
    sent.length = 0;
    await sql`delete from weekly_plans where athlete_id = any(${club.athleteIds}::bigint[])`;
    await sql`delete from workout_assignments where athlete_id = any(${club.athleteIds}::bigint[])`;
    await sql`update athletes set timezone = null where id = any(${club.athleteIds}::bigint[])`;
    const users = [...userOf.values()].map(Number);
    await sql`delete from notifications where user_id = any(${users}::bigint[])`;
  });

  afterAll(async () => {
    await club.cleanup();
    await closeTestSql();
  }, 60_000);

  const pushesTo = (athleteId: number) => sent.filter((p) => p.user_id === userOf.get(athleteId));
  const noticeWeeks = async (athleteId: number) => {
    const rows = await sql<Array<{ week_start: string }>>`
      select payload_json->>'week_start' as week_start from notifications
      where user_id = ${Number(userOf.get(athleteId))} and type = 'plan_published'
      order by id
    `;
    return rows.map((r) => r.week_start);
  };
  const addSession = async (athleteId: number, day: string) => {
    await sql`
      insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
      values (${athleteId}, ${day}::date, ${club.templateId}, 1, 'scheduled')
    `;
  };

  describe('la semana es la del hoy del atleta', () => {
    // Lunes 28 a las 03:00 UTC: en Madrid ya es lunes; en Nueva York, domingo noche.
    const NOW = new Date('2026-09-28T03:00:00Z');

    test('Madrid lee «esta semana»; Nueva York, «la semana que viene»', async () => {
      const [madrid, newYork] = club.athleteIds;
      await sql`update athletes set timezone = 'America/New_York' where id = ${newYork!}`;
      await notifyPlanPublished({ sql, athlete_id: madrid!, variant: 'weekly', week_start: '2026-09-28', now: NOW });
      await notifyPlanPublished({ sql, athlete_id: newYork!, variant: 'weekly', week_start: '2026-09-28', now: NOW });
      expect(pushesTo(madrid!)[0]!.body).toMatch(/ha publicado tu plan para esta semana\.$/);
      expect(pushesTo(newYork!)[0]!.body).toMatch(/ha publicado tu plan para la semana que viene\.$/);
      // El payload no cambia: la app enruta por `type` y la semana viaja igual.
      expect(pushesTo(madrid!)[0]!.deeplink).toMatchObject({ type: 'plan_published', screen: 'plan', week_start: '2026-09-28' });
      expect(await noticeWeeks(madrid!)).toEqual(['2026-09-28']);
    });

    test('un huso guardado que no existe no tumba el aviso: cae al del producto', async () => {
      const [ath] = club.athleteIds;
      await sql`update athletes set timezone = 'Marte/Olimpo' where id = ${ath!}`;
      const out = await notifyPlanPublished({ sql, athlete_id: ath!, variant: 'weekly', week_start: '2026-09-28', now: NOW });
      expect(out).not.toBeNull();
      expect(pushesTo(ath!)[0]!.body).toMatch(/para esta semana\.$/);
    });
  });

  describe('publicar una semana', () => {
    test('publicar la semana EN CURSO dice «esta semana» (decía «la próxima»)', async () => {
      const [ath] = club.athleteIds;
      await addSession(ath!, thisMonday);
      await setWeek(sql, ath!, thisMonday, 'draft', 'manual');
      const out = await publishAthleteWeek({ coach_id: club.coachId, athlete_id: ath!, week_start: thisMonday });
      expect(out.notified).toBe(true);
      expect(pushesTo(ath!)).toHaveLength(1);
      expect(pushesTo(ath!)[0]).toMatchObject({
        title: 'Tu plan de la semana está listo',
        body: expect.stringMatching(/ha publicado tu plan para esta semana\.$/),
      });
    });

    test('publicar la semana siguiente dice «la semana que viene»', async () => {
      const [ath] = club.athleteIds;
      await addSession(ath!, nextMonday);
      await setWeek(sql, ath!, nextMonday, 'draft', 'manual');
      await publishAthleteWeek({ coach_id: club.coachId, athlete_id: ath!, week_start: nextMonday });
      expect(pushesTo(ath!)[0]!.body).toMatch(/para la semana que viene\.$/);
    });

    test('el cron dice la semana que abre, desde el día del atleta', async () => {
      const [ath] = club.athleteIds;
      // Sábado 3 de octubre: con el defecto (2 días antes) se abre la del lunes 5.
      await addSession(ath!, '2026-10-05');
      await setWeek(sql, ath!, '2026-10-05', 'draft', 'scheduled');
      const out = await runAutoPublish({ client: sql, coach_id: club.coachId, now: new Date('2026-10-03T10:00:00Z') });
      expect(out.notified).toBe(1);
      expect(pushesTo(ath!)[0]).toMatchObject({
        title: 'Tu plan de la semana está listo',
        body: expect.stringMatching(/para la semana que viene\.$/),
      });
    });

    test('un bloque de varias semanas: un aviso, «a partir de» la primera', async () => {
      const [ath] = club.athleteIds;
      await publishBlock({
        coach_id: club.coachId,
        athlete_id: ath!,
        week_starts: [mondayPlus(today, 2), nextMonday],
        client: sql,
      });
      expect(pushesTo(ath!)).toHaveLength(1);
      expect(pushesTo(ath!)[0]).toMatchObject({
        title: 'Tu plan está listo',
        body: expect.stringMatching(/ha publicado tu plan a partir de la semana que viene\.$/),
      });
    });
  });

  describe('asignar a una pareja de dobles y avanzar la cadena', () => {
    const W1 = mondayPlus(today, 3);
    const W2 = mondayPlus(today, 4);
    const materialized = (start: string) => ({
      already_enrolled: false,
      materialization: {
        month_assignment_id: '1',
        assignment_count: 6,
        start_date: start,
        end_date: start,
        microcycle_ids: ['1', '2'],
      },
    });

    beforeEach(() => {
      vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(club.coachId) } as never);
    });

    test('dobles: solo avisa a quien ya ve una semana, y nombra ESA semana', async () => {
      const [hidden, seesW2] = club.athleteIds;
      // Entrega automática: las dos semanas del primero aún no se abren; el
      // segundo ya ve la segunda.
      await setWeek(sql, hidden!, W1, 'draft', 'scheduled');
      await setWeek(sql, hidden!, W2, 'draft', 'scheduled');
      await setWeek(sql, seesW2!, W1, 'draft', 'scheduled');
      await setWeek(sql, seesW2!, W2, 'published', 'scheduled');
      vi.mocked(assignSequenceToPair).mockResolvedValue({
        athlete_a: { athlete_id: hidden!, result: materialized(W1) },
        athlete_b: { athlete_id: seesW2!, result: materialized(W1) },
      } as never);

      const res = await doublesRoute.POST(new Request('http://localhost/x', { method: 'POST' }), {
        params: Promise.resolve({ id: '1' }),
      });
      expect(res.status).toBe(200);

      expect(pushesTo(hidden!)).toHaveLength(0);
      expect(await noticeWeeks(hidden!)).toEqual([]);
      expect(await noticeWeeks(seesW2!)).toEqual([W2]);
      expect(pushesTo(seesW2!)[0]).toMatchObject({
        title: 'Tu plan está listo',
        body: expect.stringMatching(/ha publicado tu plan de entrenamiento\. Empieza la semana del lunes \d+ de \p{L}+\.$/u),
      });
    });

    test('avanzar: sin semana visible no hay aviso; con ella, «Nuevo programa listo»', async () => {
      const [ath] = club.athleteIds;
      await setWeek(sql, ath!, W1, 'draft', 'scheduled');
      await setWeek(sql, ath!, W2, 'draft', 'scheduled');
      vi.mocked(advanceSequenceForAthlete).mockResolvedValue(materialized(W1) as never);
      const call = () =>
        advanceRoute.POST(new Request('http://localhost/x', { method: 'POST' }), {
          params: Promise.resolve({ id: String(ath) }),
        });

      expect((await call()).status).toBe(200);
      expect(pushesTo(ath!)).toHaveLength(0);
      expect(await noticeWeeks(ath!)).toEqual([]);

      await setWeek(sql, ath!, W1, 'published', 'scheduled');
      expect((await call()).status).toBe(200);
      expect(await noticeWeeks(ath!)).toEqual([W1]);
      expect(pushesTo(ath!)[0]).toMatchObject({
        title: 'Nuevo programa listo',
        body: expect.stringMatching(/ha publicado el siguiente programa de tu plan\. Empieza la semana del lunes/),
      });
    });
  });
});
