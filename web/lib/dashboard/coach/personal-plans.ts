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
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
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
      ) as is_current
    from program_month_templates m
    left join (
      select month_template_id, count(*)::int as cnt
      from program_month_weeks
      group by month_template_id
    ) w on w.month_template_id = m.id
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
