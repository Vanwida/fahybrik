import 'server-only';

// PLANES PERSONALES (0164) — a microciclo built for exactly ONE athlete, never
// the shared library, never the level×días periodization matrix. Two ways one
// comes to exist:
//   · forked from the athlete's current plan (the primary flow) → see
//     `personalize-plan.ts`.
//   · built from scratch (empty container, N weeks the coach fills in) → the
//     `createPersonalMonthTemplateFromScratch` below.
// Both land in the SAME place afterwards: `program_month_templates.athlete_id`
// set, listed here, opened in the SAME /microciclos/[id] editor every other
// microciclo uses.

import { z } from 'zod';
import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { startOfDayInBox, isoDateString } from '@fahybrid/shared/domain/dates';
import { emptyWeekSlots, normalizeWeekSlots } from './program-week-slots';
import { ProgramMonthError } from '@fahybrid/shared/domain/coach/program-months';

export { ProgramMonthError };

const MICROCICLO_MIN_WEEKS = 1;
const MICROCICLO_MAX_WEEKS = 20;

/** Body validation for POST /api/coach/athletes/[id]/microciclo — no `level_id`:
 *  a plan built for one person has no level to pair against (0164). */
export const programMonthPersonalScratchSchema = z.object({
  name: z.string().min(1).max(200),
  week_count: z.coerce.number().int().min(MICROCICLO_MIN_WEEKS).max(MICROCICLO_MAX_WEEKS),
});
export type ProgramMonthPersonalScratch = z.infer<typeof programMonthPersonalScratchSchema>;

export interface PersonalPlanListItem {
  id: string;
  name: string;
  week_count: number;
  updated_at: string;
  /** True when THIS template is the athlete's live plan right now (an
   *  athlete_month_assignments window that contains today points at it). */
  is_current: boolean;
  /** Sessions still `scheduled` (or missed/skipped — never actually performed) —
   *  what "Borrar" / "Volver a la periodización" would remove. */
  pending_count: number;
  /** Sessions the athlete already performed (status `completed`, or a real
   *  `workout_executions` row) — what deleting or reverting always PRESERVES.
   *  Surfaced so the confirm dialog can say exactly what survives, in numbers,
   *  before the coach commits (see retirePersonalPlan). */
  completed_count: number;
}

/**
 * Every personal plan of ONE athlete (coach-scoped), newest-edited first. Feeds
 * the "Planes personales" panel on the athlete's ficha.
 */
export async function listPersonalPlansForAthlete(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<PersonalPlanListItem[]> {
  const client = params.client ?? defaultSql;
  const rows = await client<
    Array<{
      id: string;
      name: string;
      week_count: number;
      updated_at: string;
      is_current: boolean;
      pending_count: number;
      completed_count: number;
    }>
  >`
    select
      m.id::text,
      m.name,
      coalesce(w.cnt, 0)::int as week_count,
      m.updated_at::text,
      exists (
        select 1 from athlete_month_assignments ama
        where ama.month_template_id = m.id
          and ama.athlete_id = ${params.athlete_id as number}
          and current_date between ama.start_date and ama.end_date
      ) as is_current,
      coalesce(counts.pending, 0)::int as pending_count,
      coalesce(counts.completed, 0)::int as completed_count
    from program_month_templates m
    left join (
      select month_template_id, count(*)::int as cnt
      from program_month_weeks
      group by month_template_id
    ) w on w.month_template_id = m.id
    left join lateral (
      select
        count(*) filter (
          where wa.status <> 'completed' and we.assignment_id is null
        ) as pending,
        count(*) filter (
          where wa.status = 'completed' or we.assignment_id is not null
        ) as completed
      from athlete_month_assignments ama
      cross join lateral unnest(ama.microcycle_ids) as mc(id)
      join workout_assignments wa on wa.microcycle_id = mc.id
      left join workout_executions we on we.assignment_id = wa.id
      where ama.month_template_id = m.id and ama.athlete_id = ${params.athlete_id as number}
    ) counts on true
    where m.coach_id = ${params.coach_id as number}
      and m.athlete_id = ${params.athlete_id as number}
    order by m.updated_at desc
  `;
  return rows;
}

/** Empty 7-day rest week, serialized for jsonb (bigint → number) — mirrors the
 *  library "create from scratch" helper in program-months.ts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function emptyWeekSlotsJson(): any {
  return JSON.parse(
    JSON.stringify(normalizeWeekSlots(emptyWeekSlots()), (_, v) =>
      typeof v === 'bigint' ? Number(v) : v,
    ),
  );
}

/**
 * Crea un plan personal DESDE CERO (camino secundario, 0164): un
 * `program_month_templates` con `athlete_id` puesto + N semanas vacías, en una
 * transacción. Sin `level_id` — un plan para una persona no se empareja por
 * nivel. Nunca toca la biblioteca ni la matriz de secuencias (ninguna de las dos
 * lo lista, `listMonthTemplates`/`saveCoachSequence` filtran `athlete_id is null`).
 *
 * Devuelve el id; el llamador navega al editor existente (`/microciclos/[id]`),
 * que ya sabe editar días sin cambios.
 */
export async function createPersonalMonthTemplateFromScratch(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  payload: unknown;
  client?: Sql;
}): Promise<{ id: string; weeks: Array<{ id: string; week_index: number }> }> {
  const parsed = programMonthPersonalScratchSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new ProgramMonthError('invalid_payload', parsed.error.message, 400);
  }
  const body = parsed.data;
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = Number(params.athlete_id);
  const slotsJson = emptyWeekSlotsJson();

  let monthId = '';
  const weeks: Array<{ id: string; week_index: number }> = [];

  await client.begin(async (tx) => {
    // Ownership guard: the athlete must belong to this coach.
    const owned = await tx<Array<{ id: string }>>`
      select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id} limit 1
    `;
    if (!owned[0]) {
      throw new ProgramMonthError('not_found', 'Atleta no encontrado', 404);
    }

    const monthRows = await tx<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name, athlete_id)
      values (${coach_id}, ${body.name}, ${athlete_id})
      returning id::text
    `;
    monthId = monthRows[0]!.id;

    for (let i = 0; i < body.week_count; i++) {
      const weekName = `${body.name} · Semana ${i + 1}`;
      const weekRows = await tx<Array<{ id: string }>>`
        insert into program_week_templates (
          coach_id, name, athlete_id, focus, slots_json
        )
        values (
          ${coach_id}, ${weekName}, ${athlete_id}, null, ${tx.json(slotsJson)}
        )
        returning id::text
      `;
      const weekId = weekRows[0]!.id;
      weeks.push({ id: weekId, week_index: i });

      await tx`
        insert into program_month_weeks (month_template_id, week_template_id, position)
        values (${Number(monthId)}, ${Number(weekId)}, ${i})
      `;
    }
  });

  return { id: monthId, weeks };
}

// =============================================================================
// BORRAR UN PLAN PERSONAL — hasta 0166 no existía ninguna forma de hacerlo. Un
// plan personal no es una fila: es un recibo (athlete_month_assignments), unas
// semanas propias (program_week_templates con athlete_id puesto) y el contenedor
// (program_month_templates). Borrar "bien" respeta UNA regla dura, sin
// excepciones: **nunca se borra una sesión ya ejecutada**. `retirePersonalPlan`
// es el mecanismo compartido — lo usa tanto "Borrar" (este archivo) como "Volver
// a la periodización" (revert-personal-plan.ts), porque las dos acciones
// terminan haciendo EXACTAMENTE lo mismo con el plan que se retira: lo pendiente
// desaparece, lo ejecutado se queda como historial (ya no colgado de ningún plan
// vivo, pero intacto — el historial del atleta se lee por fecha, no a través de
// un plan). Nunca se niega el borrado por tener sesiones completadas: negarlo
// dejaría al coach sin forma de limpiar un plan para siempre; en vez de eso se
// LIMITA a lo pendiente (ver DECISIONS / la entrega de #<id> para el porqué).
// =============================================================================

export type RetirePersonalPlanResult = {
  /** Sesiones pendientes borradas (scheduled/missed/skipped — nunca ejecutadas). */
  deleted_sessions: number;
  /** Sesiones YA ejecutadas (completed, o con workout_executions real) que
   *  sobreviven — huérfanas de plan, pero intactas en el historial del atleta. */
  preserved_sessions: number;
  /** Microciclos que se quedaron sin ninguna sesión tras el borrado, y por
   *  tanto se retiraron también (nunca uno con historial superviviente). */
  deleted_microcycles: number;
  /** True si este plan era el que el atleta ve HOY (su ventana contenía la
   *  fecha de hoy) — así el caller puede avisar "esto es lo que tiene AHORA". */
  was_current: boolean;
};

/**
 * Retira un plan personal COMPLETO de un atleta: sus sesiones pendientes, los
 * microciclos que se quedan vacíos, el/los recibo(s) (athlete_month_assignments
 * — normalmente uno, pero se procesan todos por si acaso) y la plantilla +
 * semanas propias. Debe correr DENTRO de una transacción ya abierta por el
 * caller (que también es quien toma el advisory lock por atleta — ver
 * `deletePersonalPlanForAthlete` / `revertPersonalPlanForAthlete`, el mismo
 * namespace `hashtext('athlete_plan_mutation')` que usa personalize-plan.ts,
 * así que las tres operaciones se serializan entre sí para el mismo atleta).
 *
 * Nunca toca `program_month_templates` cuyo `athlete_id` sea NULL (biblioteca)
 * — ownership check explícito abajo, no asumido.
 */
export async function retirePersonalPlan(params: {
  tx: TransactionClient;
  coach_id: number;
  athlete_id: number;
  month_template_id: number;
}): Promise<RetirePersonalPlanResult> {
  const { tx, coach_id, athlete_id, month_template_id } = params;

  const owned = await tx<Array<{ id: string }>>`
    select id::text from program_month_templates
    where id = ${month_template_id} and coach_id = ${coach_id} and athlete_id = ${athlete_id}
    limit 1
  `;
  if (!owned[0]) {
    throw new ProgramMonthError(
      'not_found',
      'Este plan personal no existe, no es tuyo, o no es de este atleta',
      404,
    );
  }

  const todayIso = isoDateString(startOfDayInBox(new Date()));

  // Normalmente hay 0 (nunca activado) o 1 recibo, pero se procesan todos por
  // si un estado histórico dejó más de uno.
  const assignments = await tx<
    Array<{ id: string; microcycle_ids: string[]; start_date: string; end_date: string }>
  >`
    select id::text, microcycle_ids, to_char(start_date, 'YYYY-MM-DD') as start_date,
           to_char(end_date, 'YYYY-MM-DD') as end_date
    from athlete_month_assignments
    where athlete_id = ${athlete_id} and month_template_id = ${month_template_id}
  `;
  const wasCurrent = assignments.some((a) => a.start_date <= todayIso && a.end_date >= todayIso);
  const microcycleIds = Array.from(
    new Set(assignments.flatMap((a) => (a.microcycle_ids ?? []).map(Number))),
  );

  let deletedSessions = 0;
  let preservedSessions = 0;
  let deletedMicrocycles = 0;

  if (microcycleIds.length > 0) {
    // La regla dura: completed, O con una ejecución real asociada, sobrevive
    // SIEMPRE — sin excepción, sin importar cuántas sean.
    const sessions = await tx<Array<{ id: string; preserve: boolean }>>`
      select wa.id::text,
        (
          wa.status = 'completed'
          or exists (select 1 from workout_executions we where we.assignment_id = wa.id)
        ) as preserve
      from workout_assignments wa
      where wa.microcycle_id = any(${microcycleIds}::bigint[])
    `;
    const toDelete = sessions.filter((s) => !s.preserve).map((s) => Number(s.id));
    preservedSessions = sessions.length - toDelete.length;
    if (toDelete.length > 0) {
      await tx`delete from workout_assignments where id = any(${toDelete}::bigint[])`;
      deletedSessions = toDelete.length;
    }

    // Microciclos que se quedaron sin NINGUNA sesión (ni siquiera preservada) —
    // los que sí conservan una completada se dejan en pie, como historial.
    const emptied = await tx<Array<{ id: string }>>`
      select mc.id::text from microcycles mc
      where mc.id = any(${microcycleIds}::bigint[])
        and not exists (select 1 from workout_assignments wa where wa.microcycle_id = mc.id)
    `;
    if (emptied.length > 0) {
      const emptiedIds = emptied.map((r) => Number(r.id));
      await tx`delete from microcycles where id = any(${emptiedIds}::bigint[])`;
      deletedMicrocycles = emptiedIds.length;
    }
  }

  // El/los recibo(s) desaparecen SIEMPRE, haya o no historial superviviente —
  // un recibo es un puntero (microcycle_ids es un array, no una FK), nunca un
  // contenedor: borrarlo no toca nada de lo de arriba.
  if (assignments.length > 0) {
    const assignmentIds = assignments.map((a) => Number(a.id));
    await tx`delete from athlete_month_assignments where id = any(${assignmentIds}::bigint[])`;
  }

  // La plantilla + sus semanas propias — misma cascada que deleteMonthTemplate
  // usa para la biblioteca (program-months.ts): month_template_id → cascade a
  // program_month_weeks (0014) → limpieza explícita de las program_week_templates
  // que se quedan huérfanas (RESTRICT hasta que su junction desaparece).
  const weekIds = await tx<Array<{ week_template_id: string }>>`
    select week_template_id::text from program_month_weeks
    where month_template_id = ${month_template_id}
  `;
  await tx`delete from program_month_weeks where month_template_id = ${month_template_id}`;
  if (weekIds.length > 0) {
    const ids = weekIds.map((r) => Number(r.week_template_id));
    await tx`
      delete from program_week_templates
      where id = any(${ids}::bigint[]) and coach_id = ${coach_id}
    `;
  }
  await tx`delete from program_month_templates where id = ${month_template_id} and coach_id = ${coach_id}`;

  return {
    deleted_sessions: deletedSessions,
    preserved_sessions: preservedSessions,
    deleted_microcycles: deletedMicrocycles,
    was_current: wasCurrent,
  };
}

/**
 * Borra un plan personal por completo (endpoint DELETE
 * /api/coach/athletes/[id]/microciclo/[monthId]). Advisory-lock scoped al
 * atleta — el mismo namespace que personalize-plan.ts y
 * revert-personal-plan.ts — así que no puede correr a la vez que un
 * "Personalizar"/"Volver a la periodización" a medio hacer del mismo atleta.
 */
export async function deletePersonalPlanForAthlete(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  month_template_id: number | bigint;
  client?: Sql;
}): Promise<RetirePersonalPlanResult> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = Number(params.athlete_id);
  const month_template_id = Number(params.month_template_id);

  return client.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('athlete_plan_mutation'), ${athlete_id}::int)`;
    return retirePersonalPlan({
      tx: tx as unknown as TransactionClient,
      coach_id,
      athlete_id,
      month_template_id,
    });
  });
}
