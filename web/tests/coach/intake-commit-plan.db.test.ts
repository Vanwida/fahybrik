// FIRMAR EL ALTA le da al atleta EXACTAMENTE lo que el coach eligió — su grupo o
// un programa — por el motor de asignar a varios, con las semanas en automático
// (visibles N días antes), y «Deshacer» lo repone todo: el plan que tenía, la
// bienvenida retirada y el alta otra vez pendiente. DB real.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { commitIntake, undoIntake } from '@/lib/coach/intake';
import { intakePlanLine } from '@/lib/coach/intake-plan-line';
import type { IntakeCommitInput } from '@/lib/coach/intake-schema';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeClub, makeProgram, mondayPlus, weekRow, type Club } from '../plan-delivery/fixtures';

const base = (plan: IntakeCommitInput['plan'], welcome = false): IntakeCommitInput => ({
  target_event_id: null,
  level: 2,
  baseline_tests: [],
  welcome: { send: welcome, body: welcome ? 'Hola, bienvenida.' : null },
  acknowledged_warnings: [],
  notes: null,
  plan,
  plan_mode: plan?.kind === 'personal' ? 'personal' : 'shared',
});

describeWithDb('alta · el plan que recibe y deshacer (DB real)', () => {
  const sql = getTestSql();
  let club: Club;
  let program: number;
  let groupId: number;
  let today: string;
  let nextMonday: string;

  beforeAll(async () => {
    club = await makeClub(sql, 3);
    program = await makeProgram(club, 4, 'Base');
    const g = await sql<Array<{ id: string }>>`
      insert into program_sequences (coach_id, name) values (${club.coachId}, 'Mañanas') returning id::text`;
    groupId = Number(g[0]!.id);
    await sql`insert into program_sequence_items (sequence_id, position, month_template_id)
              values (${groupId}, 1, ${program})`;
    const t = await sql<Array<{ d: string }>>`select to_char((now() at time zone 'Europe/Madrid')::date, 'YYYY-MM-DD') as d`;
    today = t[0]!.d;
    nextMonday = mondayPlus(today, 1);
    await sql`update athletes set onboarded_at = now() - interval '1 day', lifecycle_status = 'activo'
              where id = any(${club.athleteIds}::bigint[])`;
  });

  afterAll(async () => {
    const users = await sql<Array<{ id: string }>>`select user_id::text as id from athletes where id = any(${club.athleteIds}::bigint[])`;
    await sql`delete from chat_messages where thread_id in (select id from chat_threads where coach_id = ${club.coachId})`;
    await sql`delete from chat_threads where coach_id = ${club.coachId}`;
    await sql`delete from notifications where user_id = any(${users.map((u) => Number(u.id))}::bigint[])`;
    await club.cleanup();
    await closeTestSql();
  }, 120000);

  test('un programa desde el lunes: lo recibe, sus semanas se abren solas y la línea lo cuenta', async () => {
    const athlete = club.athleteIds[0]!;
    const r = await commitIntake({
      athlete_id: athlete,
      coach_id: club.coachId,
      coach_user_id: club.fx.coachUserId,
      payload: base({ kind: 'program', program_id: program, start_date: nextMonday }),
      client: sql,
    });
    expect(r.batch_id).not.toBeNull();
    expect(r.plan).toMatchObject({ kind: 'program', program_name: 'Base', week: 1, start_date: nextMonday });
    // Defecto del coach: 2 días antes (sábado).
    const sat = new Date(`${nextMonday}T00:00:00Z`);
    sat.setUTCDate(sat.getUTCDate() - 2);
    expect(r.plan.visible_on).toBe(sat.toISOString().slice(0, 10));
    const line = intakePlanLine(r.plan, today);
    expect(line).toMatch(/^Base desde la semana 1 · empieza lun /);
    expect(line).toMatch(/semana visible (el sáb \d+|ya)/);

    const ama = await sql<Array<{ start: string }>>`
      select to_char(start_date, 'YYYY-MM-DD') as start from athlete_month_assignments where athlete_id = ${athlete}`;
    expect(ama.map((x) => x.start)).toEqual([nextMonday]);
    const wk = await weekRow(sql, athlete, nextMonday);
    // En automático: o ya publicada (dentro de la ventana) o borrador que se abre solo; nunca retenida.
    expect(wk === null || wk.delivery_mode === 'scheduled').toBe(true);
    const done = await sql<Array<{ c: boolean }>>`select intake_completed_at is not null as c from athletes where id = ${athlete}`;
    expect(done[0]!.c).toBe(true);
  }, 120000);

  test('deshacer: sin programa, con la bienvenida retirada y el alta pendiente otra vez', async () => {
    const athlete = club.athleteIds[1]!;
    await commitIntake({
      athlete_id: athlete,
      coach_id: club.coachId,
      coach_user_id: club.fx.coachUserId,
      payload: base({ kind: 'program', program_id: program, start_date: nextMonday }, true),
      client: sql,
    });
    await undoIntake({ athlete_id: athlete, coach_id: club.coachId, coach_user_id: club.fx.coachUserId, client: sql });

    const ama = await sql<Array<{ n: number }>>`select count(*)::int as n from athlete_month_assignments where athlete_id = ${athlete}`;
    expect(ama[0]!.n).toBe(0);
    const wa = await sql<Array<{ n: number }>>`select count(*)::int as n from workout_assignments where athlete_id = ${athlete}`;
    expect(wa[0]!.n).toBe(0);
    const a = await sql<Array<{ completed: string | null; notes: unknown }>>`
      select intake_completed_at::text as completed, intake_notes_json as notes from athletes where id = ${athlete}`;
    expect(a[0]).toEqual({ completed: null, notes: {} });
    const msgs = await sql<Array<{ deleted: boolean }>>`
      select m.deleted_at is not null as deleted from chat_messages m
      join chat_threads t on t.id = m.thread_id where t.athlete_id = ${athlete}`;
    expect(msgs).toEqual([{ deleted: true }]);

    // Y se puede volver a firmar.
    const again = await commitIntake({
      athlete_id: athlete,
      coach_id: club.coachId,
      coach_user_id: club.fx.coachUserId,
      payload: base({ kind: 'personal' }),
      client: sql,
    });
    expect(again.plan.kind).toBe('personal');
  }, 120000);

  test('entrar en un grupo: miembro del grupo con su programa; deshacer lo saca', async () => {
    const athlete = club.athleteIds[2]!;
    const r = await commitIntake({
      athlete_id: athlete,
      coach_id: club.coachId,
      coach_user_id: club.fx.coachUserId,
      payload: base({ kind: 'group', group_id: groupId, start_date: nextMonday }),
      client: sql,
    });
    expect(r.plan).toMatchObject({ kind: 'group', group_name: 'Mañanas', program_name: 'Base' });
    expect(intakePlanLine(r.plan, today)).toMatch(/^Entra en Mañanas · Base, semana \d+ · empieza lun /);
    const member = await sql<Array<{ status: string }>>`
      select status from athlete_sequence_progress where athlete_id = ${athlete} and sequence_id = ${groupId}`;
    expect(member.map((m) => m.status)).toContain('active');

    await undoIntake({ athlete_id: athlete, coach_id: club.coachId, client: sql });
    const after = await sql<Array<{ n: number }>>`
      select count(*)::int as n from athlete_sequence_progress
      where athlete_id = ${athlete} and sequence_id = ${groupId} and status = 'active'`;
    expect(after[0]!.n).toBe(0);
  }, 120000);

  test('un plan que no se puede dar (programa vacío) deja el alta sin firmar', async () => {
    const athlete = club.athleteIds[2]!;
    const empty = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name) values (${club.coachId}, 'Vacío') returning id::text`;
    await expect(
      commitIntake({
        athlete_id: athlete,
        coach_id: club.coachId,
        coach_user_id: club.fx.coachUserId,
        payload: base({ kind: 'program', program_id: Number(empty[0]!.id), start_date: nextMonday }),
        client: sql,
      }),
    ).rejects.toMatchObject({ status: 422 });
    const a = await sql<Array<{ completed: string | null }>>`select intake_completed_at::text as completed from athletes where id = ${athlete}`;
    expect(a[0]!.completed).toBeNull();
    await sql`delete from program_month_templates where id = ${Number(empty[0]!.id)}`;
  }, 120000);

  test('otro coach no deshace un alta ajena', async () => {
    const other = await makeClub(sql, 1);
    try {
      await expect(undoIntake({ athlete_id: club.athleteIds[0]!, coach_id: other.coachId, client: sql })).rejects.toMatchObject({
        code: 'forbidden',
      });
    } finally {
      await other.cleanup();
    }
  }, 120000);
});
