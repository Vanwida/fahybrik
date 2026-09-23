// «Asignar a varios» contra DB real: 20 atletas de una vez, un conflicto por
// política (encadenar / sustituir / saltar), deshacer exacto (sin sesiones
// huérfanas y reponiendo lo que Sustituir cortó), lo hecho nunca se borra, doble
// envío idempotente y tenencia (un atleta ajeno invalida el envío entero).

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeClub, makeProgram, mondayPlus, weekRow, type Club } from './fixtures';
import { AssignManyError, runAssign, undoAssignBatch } from '@/lib/coach/assign-many';
import { boxToday } from '@/lib/coach/week-publishing';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import type { AssignManyInput } from '@fahybrid/shared/schema/assign-many';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const assignRoute = await import('@/app/api/coach/assign/route');

type SessionRow = { id: string; scheduled_for: string; status: string; template_id: string; microcycle_id: string | null };

describeWithDb('asignar a varios (DB real)', () => {
  const sql = getTestSql();
  let club: Club;
  let other: Club;
  let program: number; // 4 semanas × 3 entrenos
  let existing: number; // 3 semanas, «el plan que ya tenían»
  const today = boxToday();
  const start = mondayPlus(today, 1);

  const input = (over: Partial<AssignManyInput>): AssignManyInput => ({
    program_id: String(program),
    athlete_ids: [],
    start_date: start,
    delivery: 'visible',
    on_conflict: 'chain',
    ...over,
  });

  async function sessionsOf(athleteId: number): Promise<SessionRow[]> {
    return sql<SessionRow[]>`
      select id::text, to_char(scheduled_for, 'YYYY-MM-DD') as scheduled_for, status::text as status,
             template_id::text, microcycle_id::text
      from workout_assignments where athlete_id = ${athleteId} order by id
    `;
  }

  async function receiptsOf(athleteId: number) {
    return sql<Array<{ id: string; month_template_id: string; start_date: string; end_date: string }>>`
      select id::text, month_template_id::text, to_char(start_date, 'YYYY-MM-DD') as start_date,
             to_char(end_date, 'YYYY-MM-DD') as end_date
      from athlete_month_assignments where athlete_id = ${athleteId} order by start_date
    `;
  }

  async function giveExisting(athleteId: number, from: string) {
    await instantiateMonthFromTemplate({
      coach_id: club.coachId,
      athlete_id: athleteId,
      month_template_id: existing,
      start_date: from,
      client: sql,
    });
  }

  beforeAll(async () => {
    club = await makeClub(sql, 20);
    other = await makeClub(sql, 1);
    program = await makeProgram(club, 4, 'Acumulación');
    existing = await makeProgram(club, 3, 'Plan anterior');
  });

  afterAll(async () => {
    await club.cleanup();
    await other.cleanup();
    await closeTestSql();
  });

  describe('20 atletas y un conflicto por política', () => {
    const X = () => club.athleteIds[0]!; // encadenar
    const Y = () => club.athleteIds[1]!; // sustituir
    const Z = () => club.athleteIds[2]!; // saltar
    let doneId: number;
    let yBefore: SessionRow[];
    let yReceiptsBefore: Awaited<ReturnType<typeof receiptsOf>>;

    beforeAll(async () => {
      await giveExisting(X(), start); // start .. start+3s → P va detrás
      await giveExisting(Y(), mondayPlus(today, 0)); // esta semana .. +2 → P lo sustituye desde `start`
      await giveExisting(Z(), start);
      // Y ya hizo el entreno del miércoles de la semana de `start`: NUNCA se borra.
      const wed = new Date(`${start}T00:00:00Z`);
      wed.setUTCDate(wed.getUTCDate() + 2);
      const done = await sql<Array<{ id: string }>>`
        update workout_assignments set status = 'completed'
        where athlete_id = ${Y()} and scheduled_for = ${wed.toISOString().slice(0, 10)}::date
        returning id::text
      `;
      doneId = Number(done[0]!.id);
      yBefore = await sessionsOf(Y());
      yReceiptsBefore = await receiptsOf(Y());
    });

    test('la previa no escribe nada y cuenta bien cada caso', async () => {
      const batchesBefore = await sql`select id from coach_assign_batches where coach_id = ${club.coachId}`;
      const res = await runAssign({
        coach_id: club.coachId,
        input: input({ athlete_ids: club.athleteIds.map(String), dry_run: true }),
        client: sql,
      });
      expect(res.applied).toBeUndefined();
      expect(res.preview.weeks).toBe(4);
      expect(res.preview.sessions_per_athlete).toBe(12);
      expect(res.preview.counts).toMatchObject({ total: 20, assign: 17, chain: 3 });
      const x = res.preview.athletes.find((a) => a.id === String(X()))!;
      expect(x.action).toBe('chain');
      expect(x.conflict).toMatchObject({ program_name: 'Plan anterior', count: 1 });
      expect(x.start_date).toBe(mondayPlus(today, 4));
      expect(await sql`select id from coach_assign_batches where coach_id = ${club.coachId}`).toHaveLength(
        batchesBefore.length,
      );
    });

    test('aplicar: 17 limpios, X encadenado, Y sustituido (lo hecho se queda), Z saltado', async () => {
      const policies = new Map<number, 'chain' | 'replace' | 'skip'>([
        [X(), 'chain'],
        [Y(), 'replace'],
        [Z(), 'skip'],
      ]);
      // Un envío por política (el coach elige una por envío); el resto va en el de «chain».
      const rest = club.athleteIds.filter((id) => !policies.has(id) || id === X());
      const main = await runAssign({ coach_id: club.coachId, input: input({ athlete_ids: rest.map(String) }), client: sql });
      expect(main.applied).toMatchObject({ assigned: 18, skipped: 0, failed: 0, replayed: false });

      const rep = await runAssign({
        coach_id: club.coachId,
        input: input({ athlete_ids: [String(Y())], on_conflict: 'replace' }),
        client: sql,
      });
      expect(rep.applied).toMatchObject({ assigned: 1, failed: 0 });
      const skp = await runAssign({
        coach_id: club.coachId,
        input: input({ athlete_ids: [String(Z())], on_conflict: 'skip' }),
        client: sql,
      });
      expect(skp.applied).toMatchObject({ assigned: 0, skipped: 1 });

      // Limpio: 12 entrenos en 4 semanas desde `start`, todas visibles.
      const clean = club.athleteIds[5]!;
      expect((await sessionsOf(clean)).length).toBe(12);
      expect((await weekRow(sql, clean, start))?.status ?? 'published').toBe('published');

      // X: P empieza el lunes siguiente al final de su plan.
      const xr = await receiptsOf(X());
      expect(xr.map((r) => r.start_date)).toEqual([start, mondayPlus(today, 4)]);

      // Y: su plan anterior acaba la víspera de `start`; P manda desde `start`;
      // el entreno hecho sigue ahí, con su id.
      const yr = await receiptsOf(Y());
      expect(yr[0]!.end_date < start).toBe(true);
      expect(yr[1]!.start_date).toBe(start);
      const ySessions = await sessionsOf(Y());
      expect(ySessions.find((s) => Number(s.id) === doneId)?.status).toBe('completed');

      // Z intacto.
      expect((await receiptsOf(Z())).map((r) => r.month_template_id)).toEqual([String(existing)]);

      // Deshacer el «sustituir» devuelve a Y exactamente como estaba.
      const undo = await undoAssignBatch({ coach_id: club.coachId, batch_id: Number(rep.applied!.batch_id), client: sql });
      expect(undo).toMatchObject({ undone: 1, failed: 0, already_undone: false });
      expect(await sessionsOf(Y())).toEqual(yBefore);
      expect(await receiptsOf(Y())).toEqual(yReceiptsBefore);
    });

    test('deshacer no deja sesiones huérfanas y un segundo deshacer no hace nada', async () => {
      const a = club.athleteIds[6]!;
      const before = await sessionsOf(a);
      const res = await runAssign({
        coach_id: club.coachId,
        input: input({ athlete_ids: [String(a)], start_date: mondayPlus(today, 8), delivery: 'auto' }),
        client: sql,
      });
      const batchId = Number(res.applied!.batch_id);
      expect((await sessionsOf(a)).length).toBe(before.length + 12);
      // Entrega automática: semanas lejanas en borrador que se abrirá solo.
      expect(await weekRow(sql, a, mondayPlus(today, 8))).toEqual({ status: 'draft', delivery_mode: 'scheduled' });

      const first = await undoAssignBatch({ coach_id: club.coachId, batch_id: batchId, client: sql });
      expect(first.undone).toBe(1);
      expect(await sessionsOf(a)).toEqual(before);
      const orphans = await sql`
        select 1 from microcycles mc
        where mc.athlete_id = ${a} and mc.start_date >= ${mondayPlus(today, 8)}::date
          and not exists (select 1 from workout_assignments wa where wa.microcycle_id = mc.id)
      `;
      expect(orphans).toHaveLength(0);
      expect(await weekRow(sql, a, mondayPlus(today, 8))).toBeNull();

      const second = await undoAssignBatch({ coach_id: club.coachId, batch_id: batchId, client: sql });
      expect(second.already_undone).toBe(true);
      expect(await sessionsOf(a)).toEqual(before);
    });

    test('deshacer no toca a quien ya entrenó algo del programa nuevo', async () => {
      const [a, b] = [club.athleteIds[7]!, club.athleteIds[8]!];
      const res = await runAssign({
        coach_id: club.coachId,
        input: input({ athlete_ids: [String(a), String(b)], start_date: mondayPlus(today, 12) }),
        client: sql,
      });
      const aSessions = await sessionsOf(a);
      const trained = aSessions[aSessions.length - 1]!;
      await sql`update workout_assignments set status = 'completed' where id = ${trained.id}`;

      const undo = await undoAssignBatch({ coach_id: club.coachId, batch_id: Number(res.applied!.batch_id), client: sql });
      const byId = new Map(undo.results.map((r) => [r.athlete_id, r]));
      expect(byId.get(String(a))?.status).toBe('failed');
      expect(byId.get(String(a))?.reason).toMatch(/Ya ha hecho 1 entreno/);
      expect(byId.get(String(b))?.status).toBe('undone');
      // A se queda exactamente como estaba antes de deshacer (con su entreno hecho).
      const expected = aSessions.map((s) => (s.id === trained.id ? { ...s, status: 'completed' } : s));
      expect(await sessionsOf(a)).toEqual(expected);
    });
  });

  test('doble envío: el segundo idéntico devuelve el mismo lote, no asigna dos veces', async () => {
    const a = club.athleteIds[9]!;
    const req = input({ athlete_ids: [String(a)], start_date: mondayPlus(today, 16) });
    const [one, two] = await Promise.all([
      runAssign({ coach_id: club.coachId, input: req, client: sql }),
      runAssign({ coach_id: club.coachId, input: req, client: sql }),
    ]);
    expect(one.applied!.batch_id).toBe(two.applied!.batch_id);
    expect([one.applied!.replayed, two.applied!.replayed].sort()).toEqual([false, true]);
    expect((await receiptsOf(a)).filter((r) => r.start_date === mondayPlus(today, 16))).toHaveLength(1);
  });

  test('un atleta de otro coach invalida el envío entero (404, nada escrito)', async () => {
    const before = await sql`select id from coach_assign_batches where coach_id = ${club.coachId}`;
    await expect(
      runAssign({
        coach_id: club.coachId,
        input: input({ athlete_ids: [String(club.athleteIds[10]), String(other.athleteIds[0])] }),
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'athlete_not_found', status: 404 });
    expect(await sql`select id from coach_assign_batches where coach_id = ${club.coachId}`).toHaveLength(before.length);
    // Tampoco puede asignar un programa de otro coach.
    await expect(
      runAssign({ coach_id: other.coachId, input: input({ athlete_ids: [String(other.athleteIds[0])] }), client: sql }),
    ).rejects.toBeInstanceOf(AssignManyError);
  });

  test('la ruta: lunes obligatorio, semana pasada no, y mensajes que dicen qué hacer', async () => {
    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(club.coachId), user_id: BigInt(club.fx.coachUserId) } as never);
    const post = (body: unknown) =>
      assignRoute.POST(new Request('http://localhost/api/coach/assign', { method: 'POST', body: JSON.stringify(body) }));

    const notMonday = await post({ ...input({ athlete_ids: [String(club.athleteIds[11])] }), start_date: '2026-10-01' });
    expect(notMonday.status).toBe(422);
    expect(((await notMonday.json()) as { error: { message: string } }).error.message).toMatch(/lunes/);

    const past = await post(input({ athlete_ids: [String(club.athleteIds[11])], start_date: mondayPlus(today, -3) }));
    expect(past.status).toBe(422);
    expect(((await past.json()) as { error: { message: string } }).error.message).toMatch(/lunes más temprano/);

    const nobody = await post({ program_id: String(program), start_date: start, delivery: 'auto', on_conflict: 'chain' });
    expect(nobody.status).toBe(422);
    expect(((await nobody.json()) as { error: { message: string } }).error.message).toMatch(/al menos un atleta/);

    const ok = await post(input({ athlete_ids: [String(club.athleteIds[11])], start_date: mondayPlus(today, 20), dry_run: true }));
    expect(ok.status).toBe(200);
  });
});
