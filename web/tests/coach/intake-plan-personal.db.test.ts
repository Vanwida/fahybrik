// ALTA EN MODO «PLAN SOLO PARA ÉL» — el alta deja al atleta en un plan PERSONAL
// suyo, no en la periodización compartida.
//
// EL HUECO QUE ESTO CIERRA
// ------------------------
// Hasta ahora el paso «Estructura del bloque» del alta enseñaba una secuencia
// propuesta y nada más: ni renombrar, ni añadir, ni quitar. Y la pantalla nunca
// mandaba `month_template_id`, así que el commit caía SIEMPRE en
// `materializeFirstMicrocicloDraft`, que arranca desde la BIBLIOTECA del coach.
// Resultado: toda alta nacía en la periodización compartida, y llevar a alguien
// en plan personalizado obligaba a entrar después a su ficha y darle a
// «Personalizar». El servidor ya era agnóstico; quien imponía la matriz era la
// pantalla.
//
// Este test corre `commitIntake` DE VERDAD contra una rama Neon real (nada de
// clientes falsos: lo que hay que probar es qué filas quedan en la base) y fija
// las dos mitades del contrato: en modo `personal` NADA de la biblioteca acaba
// asignado, y en modo `shared` sigue pasando exactamente lo de siempre.

import { afterAll, expect, test } from 'vitest';
import { addDays, isoDateString, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { commitIntake } from '@/lib/coach/intake';
import type { IntakeCommitInput } from '@/lib/coach/intake-schema';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeMonthTemplate, makeTemplate, type Fixture } from '../utils/db-fixtures';

/** Alta mínima: sin bienvenida (no abre chat ni notificaciones, fuera de alcance)
 *  y sin tests programados. Lo que cambia entre casos es `plan_mode` y la lista
 *  de tramos, que es justo lo que este test mide. */
function intakePayload(
  plan_mode: IntakeCommitInput['plan_mode'],
  block_specs: IntakeCommitInput['block_specs'],
): IntakeCommitInput {
  return {
    target_event_id: 1,
    plan_mode,
    block_specs,
    level: 2,
    baseline_tests: [],
    welcome: { send: false, body: null },
    acknowledged_warnings: [],
    notes: null,
  };
}

describeWithDb('commitIntake · plan_mode (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];
  const auditedMonthIds: number[] = [];

  afterAll(async () => {
    if (auditedMonthIds.length > 0) {
      await sql`
        delete from audit_log
        where entity_type = 'program_month_templates'
          and entity_id = any(${auditedMonthIds}::bigint[])
      `;
    }
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
    // El teardown de tres altas completas son decenas de DELETE serializados
    // contra una rama Neon recién despertada: no cabe en los 10 s por defecto.
  }, 120000);

  /** Registra para teardown los ids REALES de semana de un mes personal: los crea
   *  `insertEmptyPersonalMonthTemplate` por dentro, así que se releen del junction. */
  async function trackForCleanup(fx: Fixture, monthId: number) {
    const rows = await sql<Array<{ id: string }>>`
      select week_template_id::text as id from program_month_weeks where month_template_id = ${monthId}
    `;
    fx.monthTemplates.push({ monthId, weekIds: rows.map((r) => Number(r.id)) });
    auditedMonthIds.push(monthId);
  }

  /** Coach con UNA plantilla de biblioteca (la que el modo compartido usaría) y
   *  un atleta suyo sin intake completado. */
  async function coachWithLibrary(): Promise<{ fx: Fixture; libraryMonthId: number }> {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    const workoutTemplateId = await makeTemplate({ fx, name: 'Sesión de biblioteca' });
    const { monthId } = await makeMonthTemplate({
      fx,
      weekCount: 1,
      workoutDays: [1],
      workoutTemplateId,
    });
    return { fx, libraryMonthId: monthId };
  }

  test('modo personal: la cadena es SUYA y la biblioteca no se toca', async () => {
    const { fx, libraryMonthId } = await coachWithLibrary();

    const result = await commitIntake({
      athlete_id: fx.athleteId,
      coach_id: fx.coachId,
      coach_user_id: fx.coachUserId,
      payload: intakePayload('personal', [
        { type: 'Arranque', weeks: 2 },
        { type: 'Descarga', weeks: 1 },
        { type: 'Subida', weeks: 3 },
      ]),
      client: sql,
    });

    expect(result.personal_plan).not.toBeNull();
    const tramos = result.personal_plan!.tramos;
    for (const t of tramos) await trackForCleanup(fx, Number(t.month_template_id));

    // 1) Los tres tramos, con SUS nombres y SUS semanas, en el orden escrito.
    expect(tramos.map((t) => t.name)).toEqual(['Arranque', 'Descarga', 'Subida']);
    expect(tramos.map((t) => t.week_count)).toEqual([2, 1, 3]);

    // 2) Encadenados sin hueco desde el lunes de esta semana.
    const thisMonday = mondayOfWeek(new Date());
    expect(tramos[0]!.start_date).toBe(isoDateString(thisMonday));
    const firstEnd = addDays(thisMonday, 2 * 7 - 1);
    expect(tramos[0]!.end_date).toBe(isoDateString(firstEnd));
    expect(tramos[1]!.start_date).toBe(isoDateString(addDays(firstEnd, 1)));
    const secondEnd = addDays(addDays(firstEnd, 1), 1 * 7 - 1);
    expect(tramos[2]!.start_date).toBe(isoDateString(addDays(secondEnd, 1)));

    // 3) LO QUE IMPORTA: todo lo que el atleta tiene asignado apunta a un
    //    contenedor PROPIO suyo. Ni un recibo hacia la biblioteca.
    const assigned = await sql<Array<{ month_template_id: string; template_athlete_id: string | null }>>`
      select ama.month_template_id::text, m.athlete_id::text as template_athlete_id
      from athlete_month_assignments ama
      join program_month_templates m on m.id = ama.month_template_id
      where ama.athlete_id = ${fx.athleteId}
      order by ama.start_date asc
    `;
    expect(assigned).toHaveLength(3);
    for (const row of assigned) {
      expect(Number(row.template_athlete_id)).toBe(fx.athleteId);
      expect(Number(row.month_template_id)).not.toBe(libraryMonthId);
    }

    // 4) Nada de esto entra en la biblioteca: `athlete_id is null` la define, y
    //    la única fila así del coach sigue siendo la que ya tenía.
    const library = await sql<Array<{ id: string }>>`
      select id::text from program_month_templates
      where coach_id = ${fx.coachId} and athlete_id is null
    `;
    expect(library.map((r) => Number(r.id))).toEqual([libraryMonthId]);

    // 5) Las seis semanas quedan en BORRADOR PRIVADO: el contenedor nace vacío y
    //    el cron de publicación no puede soltárselo solo al atleta.
    const weeks = await sql<Array<{ week_start: string; status: string; delivery_mode: string }>>`
      select to_char(week_start, 'YYYY-MM-DD') as week_start, status, delivery_mode
      from weekly_plans where athlete_id = ${fx.athleteId} order by week_start asc
    `;
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.status === 'draft' && w.delivery_mode === 'manual')).toBe(true);
    expect(weeks[0]!.week_start).toBe(isoDateString(thisMonday));

    // 6) Rastro de auditoría real: un 'create' por tramo, firmado por el coach.
    const audit = await sql<Array<{ n: string }>>`
      select count(*)::text as n from audit_log
      where entity_type = 'program_month_templates'
        and action = 'create'
        and actor_kind = 'coach'
        and actor_user_id = ${fx.coachUserId}
        and entity_id = any(${tramos.map((t) => Number(t.month_template_id))}::bigint[])
    `;
    expect(Number(audit[0]!.n)).toBe(3);

    // 7) El alta queda firmada y el modo elegido guardado con ella.
    const snapshot = await sql<Array<{ plan_mode: string | null; completed: string | null }>>`
      select intake_notes_json ->> 'plan_mode' as plan_mode,
             intake_completed_at::text as completed
      from athletes where id = ${fx.athleteId}
    `;
    expect(snapshot[0]!.plan_mode).toBe('personal');
    expect(snapshot[0]!.completed).not.toBeNull();
  }, 120000);

  test('modo compartido (defecto): sigue naciendo de la biblioteca, sin plan personal', async () => {
    const { fx, libraryMonthId } = await coachWithLibrary();

    const result = await commitIntake({
      athlete_id: fx.athleteId,
      coach_id: fx.coachId,
      coach_user_id: fx.coachUserId,
      // Sin `plan_mode`: es exactamente lo que mandaba la pantalla antes de que
      // existiera la elección, y tiene que comportarse igual que entonces.
      payload: intakePayload(undefined, [{ type: 'Microciclo 1', weeks: 4 }]),
      client: sql,
    });

    expect(result.personal_plan).toBeNull();
    expect(result.first_block_draft).not.toBeNull();

    const assigned = await sql<Array<{ month_template_id: string; template_athlete_id: string | null }>>`
      select ama.month_template_id::text, m.athlete_id::text as template_athlete_id
      from athlete_month_assignments ama
      join program_month_templates m on m.id = ama.month_template_id
      where ama.athlete_id = ${fx.athleteId}
    `;
    expect(assigned).toHaveLength(1);
    expect(Number(assigned[0]!.month_template_id)).toBe(libraryMonthId);
    expect(assigned[0]!.template_athlete_id).toBeNull();

    // Ni un solo contenedor personal creado por este camino.
    const personal = await sql<Array<{ n: string }>>`
      select count(*)::text as n from program_month_templates
      where coach_id = ${fx.coachId} and athlete_id = ${fx.athleteId}
    `;
    expect(Number(personal[0]!.n)).toBe(0);

    const snapshot = await sql<Array<{ plan_mode: string | null }>>`
      select intake_notes_json ->> 'plan_mode' as plan_mode from athletes where id = ${fx.athleteId}
    `;
    expect(snapshot[0]!.plan_mode).toBe('shared');
  }, 120000);

  test('un plan personal no se puede pedir desde una plantilla de la biblioteca', async () => {
    const { fx, libraryMonthId } = await coachWithLibrary();

    await expect(
      commitIntake({
        athlete_id: fx.athleteId,
        coach_id: fx.coachId,
        coach_user_id: fx.coachUserId,
        payload: {
          ...intakePayload('personal', [{ type: 'Arranque', weeks: 2 }]),
          month_template_id: libraryMonthId,
          month_start_date: isoDateString(mondayOfWeek(new Date())),
        },
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'invalid_payload' });

    // Y el alta NO queda firmada: el rechazo es antes de tocar nada.
    const rows = await sql<Array<{ completed: string | null }>>`
      select intake_completed_at::text as completed from athletes where id = ${fx.athleteId}
    `;
    expect(rows[0]!.completed).toBeNull();
  }, 120000);
});
