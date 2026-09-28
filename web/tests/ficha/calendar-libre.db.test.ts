// El coach ve los entrenos LIBRES que el atleta ya hizo — en el calendario de la
// ficha, en los siete puntos del vistazo y al abrir la sesión — marcados «Libre»,
// de solo lectura y sin tocar la adherencia. Un libre que el atleta montó y no
// hizo no aparece. Hasta el 28-sep los tres lectores filtraban `origin = 'coach'`
// y el coach no veía nada de lo que su atleta hacía por su cuenta.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadFichaCalendar } from '@/lib/dashboard/v2/ficha-calendar';
import { loadFichaSessionEditor } from '@/lib/dashboard/v2/ficha-session';
import { loadAthletePeek } from '@/lib/coach/athlete-peek';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('ficha · los libres hechos se ven, de solo lectura (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let tpl: number;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    tpl = await makeTemplate({ fx, name: 'Umbral' });
  });

  afterAll(async () => {
    await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
    await fx?.cleanup();
    await closeTestSql();
  });

  async function assignment(date: string, origin: 'coach' | 'self', status: string, executed: boolean) {
    const rows = await sql<{ id: string }[]>`
      insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status, origin)
      values (${fx.athleteId}, ${date}::date, ${tpl}, 1, ${status}::assignment_status, ${origin}::workout_origin)
      returning id::text
    `;
    const id = rows[0]!.id;
    if (executed) {
      await sql`
        insert into workout_executions (assignment_id, athlete_id, started_at, total_duration_seconds, source, recorded_via)
        values (${id}, ${fx.athleteId}, (${date}::date + time '10:00') at time zone 'Europe/Madrid', 2400, 'manual', 'live')
      `;
    }
    return id;
  }

  it('calendario: el libre hecho sale marcado y fuera de las cuentas; el no hecho no sale', async () => {
    const days = await sql<{ d: string; d1: string; d2: string }[]>`
      select to_char((now() at time zone 'Europe/Madrid')::date - 9, 'YYYY-MM-DD') as d,
             to_char((now() at time zone 'Europe/Madrid')::date - 8, 'YYYY-MM-DD') as d1,
             to_char((now() at time zone 'Europe/Madrid')::date - 7, 'YYYY-MM-DD') as d2
    `;
    const { d, d1, d2 } = days[0]!;
    const coach = await assignment(d, 'coach', 'completed', true);
    const libre = await assignment(d1, 'self', 'completed', true);
    const libreSinHacer = await assignment(d2, 'self', 'scheduled', false);

    const cal = await loadFichaCalendar({ coach_id: fx.coachId, athlete_id: fx.athleteId, zoom: 'plan', client: sql });
    const all = cal!.weeks.flatMap((w) => w.days.flatMap((x) => x.sessions));
    const byId = new Map(all.map((s) => [s.id, s]));

    expect(byId.get(coach)).toMatchObject({ libre: false, done: true });
    expect(byId.get(libre)).toMatchObject({ libre: true, done: true, missed: false, editable: false, planned_min: null });
    expect(byId.has(libreSinHacer)).toBe(false);

    // Lo debido/hecho de las semanas solo cuenta el plan: una sesión del coach, hecha.
    const due = cal!.weeks.reduce((n, w) => n + w.due, 0);
    const done = cal!.weeks.reduce((n, w) => n + w.done, 0);
    expect({ due, done }).toEqual({ due: 1, done: 1 });

    // Abrirlo: el panel lo lee como libre y no deja editarlo.
    const editor = await loadFichaSessionEditor({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      assignment_id: Number(libre),
      client: sql,
    });
    expect(editor).toMatchObject({ origin: 'self', editable: false, done: true });
  });

  it('vistazo: el día nombra el libre sin cambiar su punto ni la adherencia', async () => {
    const tz = 'Europe/Madrid';
    await sql`update athletes set timezone = ${tz} where id = ${fx.athleteId}`;
    // Miércoles 12-mar-2031; lunes plan hecho, martes solo libre, miércoles plan pendiente.
    const now = new Date('2031-03-12T12:00:00Z');
    await assignment('2031-03-10', 'coach', 'completed', true);
    await assignment('2031-03-11', 'self', 'completed', true);
    await assignment('2031-03-12', 'coach', 'scheduled', false);

    const peek = await loadAthletePeek({ coach_id: fx.coachId, athlete_id: fx.athleteId, now, client: sql });
    const [mon, tue, wed] = peek!.week.days;
    expect(mon).toMatchObject({ state: 'done', sessions: [{ title: 'Umbral', done: true }] });
    expect(tue).toMatchObject({ state: 'rest', sessions: [{ title: 'Umbral', done: true, libre: true }] });
    expect(wed).toMatchObject({ state: 'pending' });
    expect(peek!.adherence).toMatchObject({ due: 1, done: 1 });
  });
});
