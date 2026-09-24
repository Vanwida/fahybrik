// Recolocar la cadena personal escribe los recibos en un ORDEN — «se libera
// antes de ocupar» (personal-plan-chain-reflow.ts). La 0166 no deja que dos
// recibos del atleta compartan un día ni un instante, y cada tramo que se
// mueve se retira y se vuelve a materializar en commits sueltos: en el orden
// equivocado choca, o un tramo se queda con los microciclos de otro. Aquí van
// los casos que dependen del orden (bajar, subir en una cadena de tres,
// alargar con dos detrás, alargar el último, acortar con dos detrás) y los que
// se niegan ANTES de tocar nada.

import { afterAll, expect, test } from 'vitest';
import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import {
  instantiateMonthFromTemplate,
  resyncWeekTemplateAssignments,
} from '@/lib/dashboard/coach/instantiate-program';
import {
  addPersonalTramoToChain,
  movePersonalTramoInChain,
  updatePersonalTramoMeta,
} from '@/lib/dashboard/coach/personal-plan-chain-mutations';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeMonthTemplate,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';
import { coachActor, type Actor } from '@/lib/audit/record-edit';

type Tramo = { month_template_id: string; name: string; start_date: string; end_date: string };

const shift = (iso: string, days: number) => isoDateString(addDays(parseIsoDate(iso), days));

describeWithDb('cadena personal — el orden al recolocar (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  async function trackForCleanup(fx: Fixture, monthId: number) {
    const rows = await sql<Array<{ id: string }>>`
      select week_template_id::text as id from program_month_weeks where month_template_id = ${monthId}
    `;
    fx.monthTemplates.push({ monthId, weekIds: rows.map((r) => Number(r.id)) });
  }

  /** Un mes de biblioteca de 1 semana, asignado al atleta desde `startIso`. */
  async function assignLibraryMonth(fx: Fixture, workoutTemplateId: number, startIso: string) {
    const { monthId } = await makeMonthTemplate({ fx, weekCount: 1, workoutDays: [1], workoutTemplateId });
    await instantiateMonthFromTemplate({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: monthId,
      start_date: startIso,
      client: sql,
    });
  }

  async function addTramo(fx: Fixture, actor: Actor, name: string, weeks: number): Promise<Tramo> {
    const tramo = await addPersonalTramoToChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      payload: { name, week_count: weeks },
      actor,
      client: sql,
    });
    await trackForCleanup(fx, Number(tramo.month_template_id));
    return tramo;
  }

  /** Un ancla de biblioteca esta semana y, detrás, los tramos personales pedidos. */
  async function seed(tramos: Array<[string, number]>) {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const actor = coachActor({ user_id: BigInt(fx.coachUserId) });
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión' });
    await assignLibraryMonth(fx, workoutTemplateId, isoDateString(mondayOfWeek(new Date())));
    const added: Tramo[] = [];
    for (const [name, weeks] of tramos) added.push(await addTramo(fx, actor, name, weeks));
    return { fx, actor, workoutTemplateId, tramos: added };
  }

  /** Un entreno el lunes de la semana `position` del tramo, y que llegue al
   *  atleta — lo mismo que guardar la semana en su editor (plantilla + resync). */
  async function giveWorkout(fx: Fixture, tramo: Tramo, position: number, workoutTemplateId: number) {
    const rows = await sql<Array<{ id: string }>>`
      select week_template_id::text as id from program_month_weeks
      where month_template_id = ${Number(tramo.month_template_id)} and position = ${position}
    `;
    const weekId = Number(rows[0]!.id);
    const slots = { days: [{ day_of_week: 1, sessions: [{ kind: 'workout', template_id: workoutTemplateId }] }] };
    await sql`
      update program_week_templates
      set slots_json = ${sql.json(slots as Parameters<typeof sql.json>[0])}
      where id = ${weekId}
    `;
    await resyncWeekTemplateAssignments({ coach_id: fx.coachId, week_template_id: weekId, client: sql });
  }

  async function receiptOf(tramo: Tramo) {
    const rows = await sql<
      Array<{ id: string; start_date: string; end_date: string; microcycle_ids: string[] | null }>
    >`
      select id::text, to_char(start_date, 'YYYY-MM-DD') as start_date,
             to_char(end_date, 'YYYY-MM-DD') as end_date, microcycle_ids
      from athlete_month_assignments where month_template_id = ${Number(tramo.month_template_id)}
    `;
    const r = rows[0];
    if (!r) return null;
    return { ...r, microcycle_ids: (r.microcycle_ids ?? []).map(Number) };
  }

  /** Las fechas de las sesiones que cuelgan HOY del recibo del tramo. */
  async function sessionsOf(tramo: Tramo): Promise<string[]> {
    const rows = await sql<Array<{ d: string }>>`
      select to_char(wa.scheduled_for, 'YYYY-MM-DD') as d
      from athlete_month_assignments ama
      cross join lateral unnest(ama.microcycle_ids) as mc(id)
      join workout_assignments wa on wa.microcycle_id = mc.id
      where ama.month_template_id = ${Number(tramo.month_template_id)}
      order by 1
    `;
    return rows.map((r) => r.d);
  }

  async function templateWeekCount(tramo: Tramo): Promise<number> {
    const rows = await sql<Array<{ n: number }>>`
      select count(*)::int as n from program_month_weeks
      where month_template_id = ${Number(tramo.month_template_id)}
    `;
    return rows[0]!.n;
  }

  /** Lo que la 0166 garantiza (ningún solape entre recibos) y lo que NO mira
   *  pero un orden malo rompería: que ningún microciclo sea de dos recibos y que
   *  cada uno caiga dentro de la ventana del suyo. */
  async function expectCleanChain(fx: Fixture) {
    const rows = await sql<Array<{ overlaps: number; shared: number; stray: number }>>`
      select
        (select count(*)::int
           from athlete_month_assignments a1
           join athlete_month_assignments a2
             on a2.athlete_id = a1.athlete_id and a2.id > a1.id
            and daterange(a2.start_date, a2.end_date, '[]') && daterange(a1.start_date, a1.end_date, '[]')
          where a1.athlete_id = ${fx.athleteId}) as overlaps,
        (select count(*)::int from (
           select mc.id
             from athlete_month_assignments ama
             cross join lateral unnest(ama.microcycle_ids) as mc(id)
            where ama.athlete_id = ${fx.athleteId}
            group by mc.id having count(*) > 1) s) as shared,
        (select count(*)::int
           from athlete_month_assignments ama
           cross join lateral unnest(ama.microcycle_ids) as u(id)
           join microcycles mc on mc.id = u.id
          where ama.athlete_id = ${fx.athleteId}
            and (mc.start_date < ama.start_date or mc.end_date > ama.end_date)) as stray
    `;
    expect(rows[0]).toEqual({ overlaps: 0, shared: 0, stray: 0 });
  }

  test('bajar "Base": se intercambia con "Build" y cada uno se lleva su contenido a su fecha nueva', async () => {
    const { fx, actor, workoutTemplateId, tramos } = await seed([
      ['Base', 2],
      ['Build', 3],
    ]);
    const [base, build] = tramos as [Tramo, Tramo];
    await giveWorkout(fx, base, 0, workoutTemplateId);
    await giveWorkout(fx, build, 0, workoutTemplateId);
    expect(await sessionsOf(base)).toEqual([base.start_date]);
    expect(await sessionsOf(build)).toEqual([build.start_date]);

    const result = await movePersonalTramoInChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(base.month_template_id),
      payload: { direction: 'down' },
      actor,
      client: sql,
    });
    expect(result.moved.map((m) => m.name)).toEqual(['Build', 'Base']);

    const buildNow = (await receiptOf(build))!;
    const baseNow = (await receiptOf(base))!;
    expect(buildNow.start_date).toBe(base.start_date);
    expect(buildNow.end_date).toBe(shift(base.start_date, 3 * 7 - 1));
    expect(baseNow.start_date).toBe(shift(buildNow.end_date, 1));
    expect(baseNow.end_date).toBe(build.end_date);
    expect(await sessionsOf(build)).toEqual([buildNow.start_date]);
    expect(await sessionsOf(base)).toEqual([baseNow.start_date]);
    const orphans = await sql<Array<{ n: number }>>`
      select count(*)::int as n from workout_assignments
      where athlete_id = ${fx.athleteId} and scheduled_for >= ${base.start_date}::date
    `;
    expect(orphans[0]!.n).toBe(2); // las dos que viajaron; ninguna olvidada en su fecha vieja.
    await expectCleanChain(fx);
  }, 30000);

  test('en una cadena de tres, bajar "Build" sólo toca el par: "Base" ni se re-materializa', async () => {
    const { fx, actor, tramos } = await seed([
      ['Base', 2],
      ['Build', 3],
      ['Peak', 1],
    ]);
    const [base, build, peak] = tramos as [Tramo, Tramo, Tramo];
    const baseBefore = await receiptOf(base);

    const result = await movePersonalTramoInChain({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(build.month_template_id),
      payload: { direction: 'down' },
      actor,
      client: sql,
    });
    expect(result.moved.map((m) => m.name)).toEqual(['Peak', 'Build']);

    expect(await receiptOf(base)).toEqual(baseBefore); // mismo recibo, mismos microciclos.
    const peakNow = (await receiptOf(peak))!;
    const buildNow = (await receiptOf(build))!;
    expect(peakNow.start_date).toBe(build.start_date);
    expect(buildNow.start_date).toBe(shift(peakNow.end_date, 1));
    expect(buildNow.end_date).toBe(peak.end_date);
    await expectCleanChain(fx);
  }, 30000);

  test('alargar el primero de tres empuja a los dos de detrás, que se llevan su contenido', async () => {
    const { fx, actor, workoutTemplateId, tramos } = await seed([
      ['Base', 2],
      ['Build', 2],
      ['Peak', 1],
    ]);
    const [base, build, peak] = tramos as [Tramo, Tramo, Tramo];
    await giveWorkout(fx, build, 0, workoutTemplateId);
    await giveWorkout(fx, peak, 0, workoutTemplateId);
    const baseBefore = (await receiptOf(base))!;

    const result = await updatePersonalTramoMeta({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(base.month_template_id),
      payload: { week_count: 4 },
      actor,
      client: sql,
    });
    expect(result.end_date).toBe(shift(base.start_date, 4 * 7 - 1));
    expect(result.reflowed.map((r) => [r.name, r.start_date])).toEqual([
      ['Build', shift(build.start_date, 14)],
      ['Peak', shift(peak.start_date, 14)],
    ]);

    // "Base" creció sobre semanas que "Build" ya había soltado: sus dos
    // microciclos de siempre más dos nuevos, sin las sesiones de nadie.
    const baseNow = (await receiptOf(base))!;
    expect(baseNow.microcycle_ids).toHaveLength(4);
    expect(baseNow.microcycle_ids.slice(0, 2)).toEqual(baseBefore.microcycle_ids);
    expect(await sessionsOf(base)).toEqual([]);
    expect(await sessionsOf(build)).toEqual([shift(build.start_date, 14)]);
    expect(await sessionsOf(peak)).toEqual([shift(peak.start_date, 14)]);
    await expectCleanChain(fx);
  }, 30000);

  test('alargar el ÚLTIMO no recoloca nada y el de delante ni se toca', async () => {
    const { fx, actor, tramos } = await seed([
      ['Base', 2],
      ['Build', 2],
    ]);
    const [base, build] = tramos as [Tramo, Tramo];
    const baseBefore = await receiptOf(base);

    const result = await updatePersonalTramoMeta({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(build.month_template_id),
      payload: { week_count: 3 },
      actor,
      client: sql,
    });
    expect(result.reflowed).toEqual([]);
    expect(result.start_date).toBe(build.start_date);
    expect(result.end_date).toBe(shift(build.start_date, 3 * 7 - 1));
    expect((await receiptOf(build))!.microcycle_ids).toHaveLength(3);
    expect(await receiptOf(base)).toEqual(baseBefore);
    await expectCleanChain(fx);
  }, 30000);

  test('acortar el primero de tres adelanta a los dos de detrás, con su contenido', async () => {
    const { fx, actor, workoutTemplateId, tramos } = await seed([
      ['Base', 3],
      ['Build', 2],
      ['Peak', 1],
    ]);
    const [base, build, peak] = tramos as [Tramo, Tramo, Tramo];
    await giveWorkout(fx, peak, 0, workoutTemplateId);

    const result = await updatePersonalTramoMeta({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      month_template_id: Number(base.month_template_id),
      payload: { week_count: 1 },
      actor,
      client: sql,
    });
    expect(result.end_date).toBe(shift(base.start_date, 6));
    expect(result.reflowed.map((r) => [r.name, r.start_date])).toEqual([
      ['Build', shift(build.start_date, -14)],
      ['Peak', shift(peak.start_date, -14)],
    ]);
    expect(await sessionsOf(peak)).toEqual([shift(peak.start_date, -14)]);
    await expectCleanChain(fx);
  }, 30000);

  test('alargar con una sesión hecha en el de detrás se niega ANTES de tocar nada — ni la plantilla', async () => {
    const { fx, actor, workoutTemplateId, tramos } = await seed([
      ['Base', 2],
      ['Build', 2],
    ]);
    const [base, build] = tramos as [Tramo, Tramo];
    await makeAssignment({
      fx,
      templateId: workoutTemplateId,
      scheduledForIso: build.start_date,
      status: 'completed',
      microcycleId: (await receiptOf(build))!.microcycle_ids[0]!,
    });
    const baseBefore = await receiptOf(base);
    const buildBefore = await receiptOf(build);

    await expect(
      updatePersonalTramoMeta({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        month_template_id: Number(base.month_template_id),
        payload: { week_count: 3 },
        actor,
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'has_executed_sessions', message: expect.stringContaining('«Build»') });

    expect(await receiptOf(base)).toEqual(baseBefore);
    expect(await receiptOf(build)).toEqual(buildBefore);
    expect(await templateWeekCount(base)).toBe(2);
  }, 30000);

  test('alargar el último encima de un mes de biblioteca asignado detrás se niega limpio y no cambia nada', async () => {
    const { fx, actor, workoutTemplateId, tramos } = await seed([['Base', 2]]);
    const [base] = tramos as [Tramo];
    await assignLibraryMonth(fx, workoutTemplateId, shift(base.end_date, 1));
    const baseBefore = await receiptOf(base);

    await expect(
      updatePersonalTramoMeta({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        month_template_id: Number(base.month_template_id),
        payload: { week_count: 3 },
        actor,
        client: sql,
      }),
    ).rejects.toMatchObject({
      code: 'overlapping_plan',
      status: 409,
      message: expect.stringContaining('«Base» chocaría con «Test month»'),
    });

    expect(await receiptOf(base)).toEqual(baseBefore);
    expect(await templateWeekCount(base)).toBe(2);
    await expectCleanChain(fx);
  }, 30000);

  test('subir un tramo por encima de un mes de biblioteca se niega limpio: ningún recibo se retira', async () => {
    const { fx, actor, workoutTemplateId, tramos } = await seed([['Base', 2]]);
    const [base] = tramos as [Tramo];
    await assignLibraryMonth(fx, workoutTemplateId, shift(base.end_date, 1));
    const build = await addTramo(fx, actor, 'Build', 2); // encadenado DETRÁS del mes de biblioteca.
    const before = [await receiptOf(base), await receiptOf(build)];

    await expect(
      movePersonalTramoInChain({
        coach_id: fx.coachId,
        athlete_id: fx.athleteId,
        month_template_id: Number(build.month_template_id),
        payload: { direction: 'up' },
        actor,
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'overlapping_plan', status: 409, message: expect.stringContaining('«Test month»') });

    expect([await receiptOf(base), await receiptOf(build)]).toEqual(before);
    await expectCleanChain(fx);
  }, 30000);
});
