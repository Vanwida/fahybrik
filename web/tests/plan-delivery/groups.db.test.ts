// Grupos contra DB real: crear sin nivel ni días, reglas únicas, entrar alineado
// (también a mitad de programa), encadenar tras un plan personal, moverse de grupo
// y deshacerlo, pareja de dobles, reordenar la cadena con los cursores, borrar y
// sacar, la regla nivel×días de siempre, y tenencia entre dos coaches.

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeClub, makeLevel, makeProgram, mondayPlus, type Club } from './fixtures';
import {
  addMembers,
  createGroup,
  deleteGroup,
  getGroup,
  GroupError,
  listGroups,
  removeMembers,
  updateGroup,
} from '@/lib/coach/groups';
import { undoAssignBatch } from '@/lib/coach/assign-many';
import { boxToday } from '@/lib/coach/week-publishing';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import { assignSequenceToAthlete } from '@/lib/dashboard/coach/assign-sequence';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const groupRoute = await import('@/app/api/coach/groups/[id]/route');
const membersRoute = await import('@/app/api/coach/groups/[id]/members/route');

describeWithDb('grupos (DB real)', () => {
  const sql = getTestSql();
  let club: Club;
  let other: Club;
  let A: number; // 4 semanas
  let B: number; // 3 semanas
  const today = boxToday();
  const thisMonday = mondayPlus(today, 0);
  const nextMonday = mondayPlus(today, 1);

  const cursorOf = async (athleteId: number) =>
    sql<Array<{ sequence_id: string; current_position: number; status: string }>>`
      select sequence_id::text, current_position, status from athlete_sequence_progress
      where athlete_id = ${athleteId} order by id
    `;
  const receiptsOf = async (athleteId: number) =>
    sql<Array<{ month_template_id: string; start_date: string; end_date: string }>>`
      select month_template_id::text, to_char(start_date, 'YYYY-MM-DD') as start_date,
             to_char(end_date, 'YYYY-MM-DD') as end_date
      from athlete_month_assignments where athlete_id = ${athleteId} order by start_date
    `;
  const defaults = { on_conflict: 'chain' as const, delivery: 'visible' as const };

  beforeAll(async () => {
    club = await makeClub(sql, 12);
    other = await makeClub(sql, 1);
    A = await makeProgram(club, 4, 'Acumulación');
    B = await makeProgram(club, 3, 'Build');
  });

  afterAll(async () => {
    await club.cleanup();
    await other.cleanup();
    await closeTestSql();
  });

  describe('crear y validar', () => {
    test('un grupo sin nivel ni días, con su cadena', async () => {
      const g = await createGroup(club.coachId, {
        name: 'HYROX mañanas',
        end_policy: 'stop',
        programs: [{ program_id: String(A) }, { program_id: String(B) }],
      }, sql);
      expect(g).toMatchObject({ display_name: 'HYROX mañanas', auto_rule: false, level: null, member_count: 0, total_weeks: 7 });
      expect(g.programs.map((p) => p.name)).toEqual(['Acumulación', 'Build']);
      expect((await listGroups(club.coachId, sql)).some((x) => x.id === g.id)).toBe(true);
    });

    test('nombre repetido, regla repetida y «subir de nivel» sin regla se explican', async () => {
      await expect(createGroup(club.coachId, { name: 'hyrox MAÑANAS ', end_policy: 'stop', programs: [] }, sql)).rejects.toMatchObject({
        code: 'name_taken',
        status: 409,
      });
      const level = await makeLevel(club, 'N3', 3);
      await createGroup(club.coachId, { name: 'N3 5d', level_id: String(level), days_per_week: 5, end_policy: 'repeat', programs: [] }, sql);
      await expect(
        createGroup(club.coachId, { name: 'Otro N3 5d', level_id: String(level), days_per_week: 5, end_policy: 'repeat', programs: [] }, sql),
      ).rejects.toMatchObject({ code: 'rule_taken' });
      await expect(createGroup(club.coachId, { name: 'Sube', end_policy: 'level_up', programs: [] }, sql)).rejects.toMatchObject({
        code: 'level_up_needs_rule',
      });
    });

    test('la regla nivel×días sigue funcionando por el camino de siempre', async () => {
      const level = (await sql<Array<{ id: string }>>`select id::text from athlete_levels where coach_id = ${club.coachId} and name = 'N3'`)[0]!.id;
      const g = (await listGroups(club.coachId, sql)).find((x) => x.name === 'N3 5d')!;
      await updateGroup(club.coachId, Number(g.id), { programs: [{ program_id: String(B) }] }, sql);
      const ath = club.athleteIds[11]!;
      await sql`update athletes set level_id = ${Number(level)}, training_days_per_week = 5 where id = ${ath}`;
      const detail = await getGroup(club.coachId, Number(g.id), sql);
      expect(detail!.rule_candidates.map((c) => Number(c.athlete_id))).toContain(ath);
      const res = await assignSequenceToAthlete(ath, club.coachId, mondayPlus(today, 2), sql);
      expect(res.sequence_id).toBe(Number(g.id));
      expect((await cursorOf(ath)).at(-1)).toMatchObject({ status: 'active', current_position: 1 });
    });
  });

  describe('entrar en el grupo', () => {
    let groupId: number;

    beforeAll(async () => {
      groupId = Number((await listGroups(club.coachId, sql)).find((g) => g.name === 'HYROX mañanas')!.id);
      // Tres miembros que empezaron «Acumulación» hace dos semanas (montado a mano:
      // la API no deja empezar en el pasado).
      for (const id of club.athleteIds.slice(0, 3)) {
        await instantiateMonthFromTemplate({
          coach_id: club.coachId,
          athlete_id: id,
          month_template_id: A,
          start_date: mondayPlus(today, -2),
          client: sql,
        });
        await sql`
          insert into athlete_sequence_progress (athlete_id, coach_id, sequence_id, current_position, status)
          values (${id}, ${club.coachId}, ${groupId}, 1, 'active')
        `;
      }
    });

    test('a mitad de programa entra alineado: misma semana que el grupo', async () => {
      const newbie = club.athleteIds[3]!;
      const res = await addMembers({
        coach_id: club.coachId,
        group_id: groupId,
        input: { athlete_ids: [String(newbie)], ...defaults },
        client: sql,
      });
      const row = res.preview.athletes[0]!;
      expect(row).toMatchObject({ action: 'assign', start_date: nextMonday, start_week: 4, program: { name: 'Acumulación' } });
      expect(res.applied).toMatchObject({ assigned: 1 });
      // Solo la semana 4 (la que le queda al grupo): del lunes que viene a su domingo.
      const sunday = new Date(`${nextMonday}T00:00:00Z`);
      sunday.setUTCDate(sunday.getUTCDate() + 6);
      expect(await receiptsOf(newbie)).toEqual([
        { month_template_id: String(A), start_date: nextMonday, end_date: sunday.toISOString().slice(0, 10) },
      ]);
      const cur = await cursorOf(newbie);
      expect(cur).toEqual([{ sequence_id: String(groupId), current_position: 1, status: 'active' }]);
      const detail = await getGroup(club.coachId, groupId, sql);
      expect(detail!.calendar.anchor).toEqual({ position: 1, program_start: mondayPlus(today, -2) });
      expect(detail!.calendar.items.map((i) => [i.name, i.start_date])).toEqual([
        ['Acumulación', mondayPlus(today, -2)],
        ['Build', mondayPlus(today, 2)],
      ]);
      expect(detail!.members.find((m) => m.athlete_id === String(club.athleteIds[0]))?.week).toBe(3);
    });

    test('con un plan personal, se encadena detrás y entra donde esté el grupo entonces', async () => {
      const personal = club.athleteIds[4]!;
      // Su plan propio (un programa que NO está en la cadena del grupo), 3 semanas.
      const own = await makeProgram(club, 3, 'Plan de Marta');
      await instantiateMonthFromTemplate({
        coach_id: club.coachId,
        athlete_id: personal,
        month_template_id: own,
        start_date: thisMonday,
        client: sql,
      }); // hasta el domingo de dentro de 2 semanas
      const res = await addMembers({
        coach_id: club.coachId,
        group_id: groupId,
        input: { athlete_ids: [String(personal)], ...defaults, dry_run: true },
        client: sql,
      });
      const row = res.preview.athletes[0]!;
      expect(row.action).toBe('chain');
      expect(row.conflict?.program_name).toBe('Plan de Marta');
      // El lunes siguiente al fin de su plan el grupo va por «Build», semana 2.
      expect(row).toMatchObject({ start_date: mondayPlus(today, 3), program: { name: 'Build' }, start_week: 2 });
    });

    test('moverse de grupo deja el anterior en «salió» y deshacerlo lo devuelve', async () => {
      const mover = club.athleteIds[5]!;
      const g1 = await createGroup(club.coachId, { name: 'Tardes', end_policy: 'repeat', programs: [{ program_id: String(B) }] }, sql);
      await addMembers({ coach_id: club.coachId, group_id: Number(g1.id), input: { athlete_ids: [String(mover)], ...defaults }, client: sql });
      await sql`update athletes set plan_mode = 'personal' where id = ${mover}`;
      const moved = await addMembers({
        coach_id: club.coachId,
        group_id: groupId,
        input: { athlete_ids: [String(mover)], ...defaults, on_conflict: 'replace' },
        client: sql,
      });
      expect(moved.applied).toMatchObject({ assigned: 1 });
      const after = await cursorOf(mover);
      expect(after.map((c) => [c.sequence_id, c.status])).toEqual([
        [g1.id, 'left'],
        [String(groupId), 'active'],
      ]);
      await undoAssignBatch({ coach_id: club.coachId, batch_id: Number(moved.applied!.batch_id), client: sql });
      expect((await cursorOf(mover)).map((c) => [c.sequence_id, c.status])).toEqual([[g1.id, 'active']]);
      const mode = await sql<Array<{ plan_mode: string }>>`select plan_mode from athletes where id = ${mover}`;
      expect(mode[0]!.plan_mode).toBe('personal');
      expect((await receiptsOf(mover)).map((r) => r.month_template_id)).toEqual([String(B)]);
    });

    test('pareja de dobles: si solo va uno, la previa lo avisa', async () => {
      const [a, b] = [club.athleteIds[6]!, club.athleteIds[7]!];
      await sql`
        insert into doubles_pairs (coach_id, athlete_a_id, athlete_b_id, status)
        values (${club.coachId}, ${Math.min(a, b)}, ${Math.max(a, b)}, 'active')
      `;
      const res = await addMembers({
        coach_id: club.coachId,
        group_id: groupId,
        input: { athlete_ids: [String(a)], ...defaults, dry_run: true },
        client: sql,
      });
      expect(res.preview.athletes[0]!.pair_partner).toEqual({ id: String(b), name: expect.any(String), included: false });
    });

    test('reordenar la cadena mueve los cursores con su programa; quitar el que se está haciendo se rechaza', async () => {
      const g = await getGroup(club.coachId, groupId, sql);
      const [acc, build] = g!.programs;
      await updateGroup(club.coachId, groupId, {
        programs: [
          { program_id: build!.program_id, item_id: build!.item_id },
          { program_id: acc!.program_id, item_id: acc!.item_id },
        ],
      }, sql);
      expect((await cursorOf(club.athleteIds[0]!)).at(-1)).toMatchObject({ current_position: 2, status: 'active' });
      await expect(
        updateGroup(club.coachId, groupId, { programs: [{ program_id: build!.program_id, item_id: build!.item_id }] }, sql),
      ).rejects.toMatchObject({ code: 'program_in_use', status: 409 });
      // Vuelve a su orden.
      await updateGroup(club.coachId, groupId, {
        programs: [
          { program_id: acc!.program_id, item_id: acc!.item_id },
          { program_id: build!.program_id, item_id: build!.item_id },
        ],
      }, sql);
      expect((await cursorOf(club.athleteIds[0]!)).at(-1)).toMatchObject({ current_position: 1 });
    });

    test('con atletas no se borra; al sacarlos conservan su plan y ya se puede borrar', async () => {
      const g = await createGroup(club.coachId, { name: 'Temporal', end_policy: 'stop', programs: [{ program_id: String(A) }] }, sql);
      const who = club.athleteIds[8]!;
      await addMembers({ coach_id: club.coachId, group_id: Number(g.id), input: { athlete_ids: [String(who)], ...defaults }, client: sql });
      await expect(deleteGroup(club.coachId, Number(g.id), sql)).rejects.toMatchObject({ code: 'group_has_members' });
      const out = await removeMembers({ coach_id: club.coachId, group_id: Number(g.id), athlete_ids: [who], client: sql });
      expect(out.removed[0]!.plan_until).toBe((await receiptsOf(who)).at(-1)!.end_date);
      await deleteGroup(club.coachId, Number(g.id), sql);
      expect((await receiptsOf(who)).length).toBe(1);
    });
  });

  test('quien ya hace el programa del grupo lo conserva (adopt); el nuevo se alinea con ellos', async () => {
    const [x, y, fresh] = [club.athleteIds[9]!, club.athleteIds[10]!, club.athleteIds[6]!];
    for (const id of [x, y]) {
      await instantiateMonthFromTemplate({
        coach_id: club.coachId,
        athlete_id: id,
        month_template_id: A,
        start_date: mondayPlus(today, -1),
        client: sql,
      });
    }
    const g = await createGroup(club.coachId, { name: 'Migrados', end_policy: 'stop', programs: [{ program_id: String(A) }] }, sql);
    const before = await sql`select id from workout_assignments where athlete_id in (${x}, ${y})`;
    const res = await addMembers({
      coach_id: club.coachId,
      group_id: Number(g.id),
      input: { athlete_ids: [String(x), String(y), String(fresh)], ...defaults },
      client: sql,
    });
    const byId = new Map(res.preview.athletes.map((a) => [a.id, a]));
    expect(byId.get(String(x))).toMatchObject({ action: 'adopt', start_week: 3, program: { name: 'Acumulación' } });
    // El ancla la ponen los que ya lo hacen: el nuevo entra en SU semana 3, no en la 1.
    expect(byId.get(String(fresh))).toMatchObject({ action: 'assign', start_week: 3, program: { name: 'Acumulación' } });
    expect(await sql`select id from workout_assignments where athlete_id in (${x}, ${y})`).toHaveLength(before.length);
    expect((await cursorOf(x)).at(-1)).toMatchObject({ sequence_id: g.id, status: 'active', current_position: 1 });
    const detail = await getGroup(club.coachId, Number(g.id), sql);
    expect(detail!.calendar.anchor).toEqual({ position: 1, program_start: mondayPlus(today, -1) });

    await undoAssignBatch({ coach_id: club.coachId, batch_id: Number(res.applied!.batch_id), client: sql });
    expect((await cursorOf(x)).filter((c) => c.status === 'active')).toEqual([]);
    expect(await sql`select id from workout_assignments where athlete_id in (${x}, ${y})`).toHaveLength(before.length);
  });

  test('tenencia: otro coach no ve ni toca el grupo; un atleta ajeno invalida el alta', async () => {
    const g = (await listGroups(club.coachId, sql)).find((x) => x.name === 'HYROX mañanas')!;
    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(other.coachId) } as never);
    const ctx = { params: Promise.resolve({ id: g.id }) };
    expect((await groupRoute.GET(new Request('http://x'), ctx)).status).toBe(404);
    expect((await groupRoute.PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify({ name: 'Mío' }) }), ctx)).status).toBe(404);
    expect((await groupRoute.DELETE(new Request('http://x', { method: 'DELETE' }), ctx)).status).toBe(404);
    const addForeign = await membersRoute.POST(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ athlete_ids: [String(other.athleteIds[0])], action: 'add' }) }),
      ctx,
    );
    expect(addForeign.status).toBe(404);

    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(club.coachId) } as never);
    const mixed = await membersRoute.POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ athlete_ids: [String(club.athleteIds[9]), String(other.athleteIds[0])], action: 'add' }),
      }),
      ctx,
    );
    expect(mixed.status).toBe(404);
    expect(await cursorOf(club.athleteIds[9]!)).toEqual([]);
    await expect(removeMembers({ coach_id: other.coachId, group_id: Number(g.id), athlete_ids: [club.athleteIds[0]!], client: sql })).rejects.toBeInstanceOf(GroupError);
  });
});
