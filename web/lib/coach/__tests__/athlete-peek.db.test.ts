// El vistazo de un atleta (lib/coach/athlete-peek) contra DB real: alcance por
// coach, los 7 puntos de la semana, semana oculta con su fecha de apertura,
// adherencia due-only, último check-in y «por responder».

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../../../tests/utils/test-db';
import { makeClub, type Club } from '../../../tests/plan-delivery/fixtures';
import { loadAthletePeek } from '@/lib/coach/athlete-peek';

// Miércoles 23 sept 2026, mediodía en Madrid.
const NOW = new Date('2026-09-23T10:00:00Z');

describeWithDb('vistazo de un atleta (DB real)', () => {
  const sql = getTestSql();
  let a: Club;
  let b: Club;
  let athlete: number;

  const assign = (day: string, status: string) =>
    sql`insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
        values (${athlete}, ${day}::date, ${a.templateId}, 1, ${status}::assignment_status)`;

  beforeAll(async () => {
    a = await makeClub(sql, 1);
    b = await makeClub(sql, 1);
    athlete = a.athleteIds[0]!;
    await sql`update athletes set lifecycle_status = 'activo', onboarded_at = now() - interval '60 days' where id = ${athlete}`;
    // Esta semana: lun hecho, mar sin hacer, mié (hoy) pendiente, vie futuro. Semana pasada: 1 hecho.
    await assign('2026-09-14', 'completed');
    await assign('2026-09-21', 'completed');
    await assign('2026-09-22', 'scheduled');
    await assign('2026-09-23', 'scheduled');
    await assign('2026-09-25', 'scheduled');
    await sql`insert into daily_checkins (athlete_id, recorded_for, recorded_at, sub_score, notes)
              values (${athlete}, '2026-09-23', '2026-09-23T05:40:00Z', 38, 'Dormí fatal dos noches')`;
    const coachUser = await sql<Array<{ user_id: string }>>`select user_id::text from coaches where id = ${a.coachId}`;
    const athUser = await sql<Array<{ user_id: string }>>`select user_id::text from athletes where id = ${athlete}`;
    const t = await sql<Array<{ id: string }>>`
      insert into chat_threads (coach_id, athlete_id) values (${a.coachId}, ${athlete}) returning id::text`;
    await sql`insert into chat_messages (thread_id, sender_user_id, sender_role, body, created_at)
              values (${Number(t[0]!.id)}, ${Number(coachUser[0]!.user_id)}, 'coach', '¿Qué tal ayer?', '2026-09-22T08:00:00Z'),
                     (${Number(t[0]!.id)}, ${Number(athUser[0]!.user_id)}, 'athlete', 'Me costó mucho', '2026-09-22T19:00:00Z')`;
  });

  afterAll(async () => {
    await sql`delete from chat_messages where thread_id in (select id from chat_threads where athlete_id = any(${[...a.athleteIds, ...b.athleteIds]}::bigint[]))`;
    await sql`delete from chat_threads where athlete_id = any(${[...a.athleteIds, ...b.athleteIds]}::bigint[])`;
    await a.cleanup();
    await b.cleanup();
    await closeTestSql();
  });

  test('un atleta de otro coach no existe', async () => {
    expect(await loadAthletePeek({ coach_id: b.coachId, athlete_id: athlete, now: NOW, client: sql })).toBeNull();
    expect(await loadAthletePeek({ coach_id: a.coachId, athlete_id: 'x', now: NOW, client: sql })).toBeNull();
  });

  test('la semana en 7 puntos, visible sin fila de weekly_plans', async () => {
    const p = await loadAthletePeek({ coach_id: a.coachId, athlete_id: athlete, now: NOW, client: sql });
    expect(p).not.toBeNull();
    expect(p!.week.week_start).toBe('2026-09-21');
    expect(p!.week.today).toBe('2026-09-23');
    expect(p!.week.visible).toBe(true);
    expect(p!.week.days.map((d) => d.state)).toEqual(['done', 'missed', 'pending', 'rest', 'pending', 'rest', 'rest']);
    expect(p!.week.days[2]!.is_today).toBe(true);
  });

  test('adherencia due-only de 14 días: 2 hechas de 3 debidas (hoy y el futuro no cuentan)', async () => {
    const p = await loadAthletePeek({ coach_id: a.coachId, athlete_id: athlete, now: NOW, client: sql });
    expect(p!.adherence).toEqual({ pct: 67, due: 3, done: 2, window_days: 14 });
  });

  test('último check-in con nota y el hilo por responder', async () => {
    const p = await loadAthletePeek({ coach_id: a.coachId, athlete_id: athlete, now: NOW, client: sql });
    expect(p!.last_checkin).toMatchObject({ on: '2026-09-23', notes: 'Dormí fatal dos noches', score: 38 });
    expect(p!.last_message).toMatchObject({ body: 'Me costó mucho', from: 'athlete' });
    expect(p!.awaiting_reply).toBe(true);
  });

  test('semana oculta en automático: invisible, con el día en que se abre; retenida sin fecha', async () => {
    await sql`insert into weekly_plans (athlete_id, week_start, status, delivery_mode)
              values (${athlete}, '2026-09-21', 'draft', 'scheduled')`;
    let p = await loadAthletePeek({ coach_id: a.coachId, athlete_id: athlete, now: NOW, client: sql });
    expect(p!.week.visible).toBe(false);
    expect(p!.week.held).toBe(false);
    expect(p!.week.opens_on).toBe('2026-09-19');
    // Oculta: lo de ayer sin hacer no es «sin hacer» — no podía verlo.
    expect(p!.week.days[1]!.state).toBe('pending');

    await sql`update weekly_plans set delivery_mode = 'manual' where athlete_id = ${athlete} and week_start = '2026-09-21'`;
    p = await loadAthletePeek({ coach_id: a.coachId, athlete_id: athlete, now: NOW, client: sql });
    expect(p!.week.held).toBe(true);
    expect(p!.week.opens_on).toBeNull();
  });
});
