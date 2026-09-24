// Publicar por semana contra DB real: publicar / retener una semana, publicar la
// misma semana a varios (todo o nada por tenencia), la entrega automática de un
// programa recién asignado y el cron diario (N días antes, retenidas intactas).

import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeClub, makeProgram, mondayPlus, setWeek, weekRow, type Club } from './fixtures';
import {
  boxToday,
  listAthleteWeeks,
  publishAthleteWeek,
  publishWeekForAthletes,
  setAthleteWeekHeld,
  setAutoPublishDays,
  WeekPublishingError,
} from '@/lib/coach/week-publishing';
import { runAutoPublish } from '@/lib/coach/week-publishing-cron';
import { markFutureWeeksDraft } from '@/lib/coach/publish-week';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const bulkRoute = await import('@/app/api/coach/weeks/publish/route');
const holdRoute = await import('@/app/api/coach/athletes/[id]/weeks/[week_start]/hold/route');

describeWithDb('publicar por semana (DB real)', () => {
  const sql = getTestSql();
  const clubs: Club[] = [];
  let a: Club;
  let b: Club;
  const today = boxToday();
  const thisMonday = mondayPlus(today, 0);

  beforeAll(async () => {
    a = await makeClub(sql, 3);
    b = await makeClub(sql, 1);
    clubs.push(a, b);
  });

  afterEach(async () => {
    await sql`delete from weekly_plans where athlete_id = any(${[...a.athleteIds, ...b.athleteIds]}::bigint[])`;
    await sql`update coaches set auto_publish_days_before = null where id in (${a.coachId}, ${b.coachId})`;
  });

  afterAll(async () => {
    for (const c of clubs) await c.cleanup();
    await closeTestSql();
  });

  test('retener oculta y el cron no la abre; soltarla dentro de la ventana la publica ya', async () => {
    const [ath] = a.athleteIds;
    const week = thisMonday;
    const held = await setAthleteWeekHeld({ coach_id: a.coachId, athlete_id: ath!, week_start: week, held: true });
    expect(held.week).toMatchObject({ visible: false, held: true, status: 'draft' });
    expect(await weekRow(sql, ath!, week)).toEqual({ status: 'draft', delivery_mode: 'manual' });

    // Doble clic con held explícito: sigue retenida (no alterna).
    const again = await setAthleteWeekHeld({ coach_id: a.coachId, athlete_id: ath!, week_start: week, held: true });
    expect(again.week.held).toBe(true);

    await runAutoPublish({ client: sql, coach_id: a.coachId });
    expect(await weekRow(sql, ath!, week)).toEqual({ status: 'draft', delivery_mode: 'manual' });

    const released = await setAthleteWeekHeld({ coach_id: a.coachId, athlete_id: ath!, week_start: week, held: false });
    expect(released.became_visible).toBe(true);
    expect(released.week).toMatchObject({ visible: true, held: false, status: 'published' });
  });

  test('soltar una semana lejana la devuelve a lo automático (se abre N días antes)', async () => {
    const [ath] = a.athleteIds;
    const far = mondayPlus(today, 4);
    await setAthleteWeekHeld({ coach_id: a.coachId, athlete_id: ath!, week_start: far, held: true });
    const released = await setAthleteWeekHeld({ coach_id: a.coachId, athlete_id: ath!, week_start: far });
    expect(released.week).toMatchObject({ visible: false, held: false, status: 'draft' });
    const d = new Date(`${far}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 2);
    expect(released.week.opens_on).toBe(d.toISOString().slice(0, 10));
  });

  test('no se retiene una semana que ya pasó (le escondería su historial)', async () => {
    const past = mondayPlus(today, -2);
    await expect(
      setAthleteWeekHeld({ coach_id: a.coachId, athlete_id: a.athleteIds[0]!, week_start: past, held: true }),
    ).rejects.toMatchObject({ code: 'past_week', status: 409 });
  });

  test('publicar una semana en borrador: visible, y publicar de nuevo no cambia nada', async () => {
    const [ath] = a.athleteIds;
    const week = mondayPlus(today, 2);
    await setWeek(sql, ath!, week, 'draft', 'manual');
    const first = await publishAthleteWeek({ coach_id: a.coachId, athlete_id: ath!, week_start: week });
    expect(first.became_visible).toBe(true);
    const second = await publishAthleteWeek({ coach_id: a.coachId, athlete_id: ath!, week_start: week });
    expect(second.became_visible).toBe(false);
    expect(second.notified).toBe(false);
  });

  test('otro coach no puede tocar la semana de un atleta ajeno (404, nada escrito)', async () => {
    const week = mondayPlus(today, 1);
    await expect(
      publishAthleteWeek({ coach_id: b.coachId, athlete_id: a.athleteIds[0]!, week_start: week }),
    ).rejects.toBeInstanceOf(WeekPublishingError);

    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(b.coachId) } as never);
    const res = await holdRoute.POST(
      new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ held: true }) }),
      { params: Promise.resolve({ id: String(a.athleteIds[0]), week_start: week }) },
    );
    expect(res.status).toBe(404);
    expect(await weekRow(sql, a.athleteIds[0]!, week)).toBeNull();
  });

  test('la ruta rechaza un día que no es lunes con un mensaje que dice qué hacer', async () => {
    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(a.coachId) } as never);
    const res = await holdRoute.POST(new Request('http://localhost/x', { method: 'POST' }), {
      params: Promise.resolve({ id: String(a.athleteIds[0]), week_start: '2026-09-23' }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/lunes/);
  });

  test('publicar la misma semana a varios: todo o nada por tenencia', async () => {
    const week = mondayPlus(today, 1);
    for (const id of a.athleteIds) await setWeek(sql, id, week, 'draft', 'manual');

    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(a.coachId) } as never);
    const mixed = await bulkRoute.POST(
      new Request('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({ athlete_ids: [...a.athleteIds.map(String), String(b.athleteIds[0])], week_start: week }),
      }),
    );
    expect(mixed.status).toBe(404);
    for (const id of a.athleteIds) expect((await weekRow(sql, id, week))?.status).toBe('draft');

    const out = await publishWeekForAthletes({ coach_id: a.coachId, athlete_ids: a.athleteIds, week_start: week });
    expect(out.published).toBe(a.athleteIds.length);
    for (const id of a.athleteIds) expect((await weekRow(sql, id, week))?.status).toBe('published');
  });

  test('cron: abre lo que está a N días o menos, respeta retenidas, pausados y semanas pasadas', async () => {
    const [x, y, z] = a.athleteIds;
    // Fijamos «hoy» a un miércoles para que la ventana sea determinista.
    const now = new Date('2026-09-23T10:00:00Z'); // hoy de caja = mié 23-sep
    const current = '2026-09-21';
    const next = '2026-09-28'; // se abre el sáb 26 con N=2
    const past = '2026-09-14';

    await setWeek(sql, x!, current, 'draft', 'scheduled'); // el cron de ayer falló → se recoge
    await setWeek(sql, x!, next, 'draft', 'scheduled'); // aún no (N=2)
    await setWeek(sql, x!, past, 'draft', 'scheduled'); // ya acabó → no se toca
    await setWeek(sql, y!, current, 'draft', 'manual'); // retenida → no se toca
    await setWeek(sql, z!, current, 'draft', 'scheduled');
    await sql`update athletes set lifecycle_status = 'pausado' where id = ${z!}`;

    try {
      await runAutoPublish({ client: sql, now, coach_id: a.coachId });
      expect((await weekRow(sql, x!, current))?.status).toBe('published');
      expect((await weekRow(sql, x!, next))?.status).toBe('draft');
      expect((await weekRow(sql, x!, past))?.status).toBe('draft');
      expect(await weekRow(sql, y!, current)).toEqual({ status: 'draft', delivery_mode: 'manual' });
      expect((await weekRow(sql, z!, current))?.status).toBe('draft');

      // Con N=5 (método del coach) la semana que viene se abre ya el miércoles.
      await setAutoPublishDays(a.coachId, 5, sql);
      await runAutoPublish({ client: sql, now, coach_id: a.coachId });
      expect((await weekRow(sql, x!, next))?.status).toBe('published');
    } finally {
      await sql`update athletes set lifecycle_status = 'activo' where id = ${z!}`;
    }
  });

  test('entrega automática de un programa recién asignado: lo lejano se oculta, lo retenido sigue retenido', async () => {
    const [ath] = a.athleteIds;
    const program = await makeProgram(a, 4);
    const start = mondayPlus(today, 1);
    const w3 = mondayPlus(today, 3);
    await setWeek(sql, ath!, w3, 'draft', 'manual'); // el coach ya había retenido la 3.ª

    const res = await instantiateMonthFromTemplate({
      coach_id: a.coachId,
      athlete_id: ath!,
      month_template_id: program,
      start_date: start,
      client: sql,
    });
    try {
      await markFutureWeeksDraft({
        coach_id: a.coachId,
        athlete_id: ath!,
        start_date: res.start_date,
        week_count: res.microcycle_ids.length,
        client: sql,
      });
      const weeks = await listAthleteWeeks({
        coach_id: a.coachId,
        athlete_id: ath!,
        from: start,
        to: mondayPlus(today, 4),
        client: sql,
      });
      expect(weeks).toHaveLength(4);
      expect(weeks.every((w) => w.sessions === 3)).toBe(true);
      const byWeek = new Map(weeks.map((w) => [w.week_start, w]));
      expect(byWeek.get(w3)).toMatchObject({ held: true, visible: false });
      expect(byWeek.get(mondayPlus(today, 4))).toMatchObject({ held: false, visible: false, status: 'draft' });
      expect(byWeek.get(mondayPlus(today, 4))?.opens_on).not.toBeNull();
    } finally {
      await sql`delete from workout_assignments where athlete_id = ${ath!}`;
      await sql`delete from athlete_month_assignments where athlete_id = ${ath!}`;
      await sql`delete from microcycles where athlete_id = ${ath!}`;
    }
  });
});
