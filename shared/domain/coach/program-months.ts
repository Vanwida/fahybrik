import type { Sql } from 'postgres';
import { z } from 'zod';
import {
  programMonthUpsertSchema,
  type ProgramMonthUpsert,
  type WeekSlots,
} from '../../schema/program-templates';

/**
 * Núcleo compartido CRUD de microciclos (mes-plantilla), behavior-agnostic.
 *
 * IMPORTANTE: las funciones que serializan `slots_json` (crear semanas vacías,
 * cargar semanas con slots parseados) NO viven aquí — dependen del
 * `normalizeWeekSlots`/`parseWeekSlotsFromDb` de cada app, que divergen a
 * propósito (web → string ids; coach → number ids). Cada wrapper define esas
 * funciones encima de este núcleo.
 */

/** Body validation for POST /api/coach/program-months/create. */
export const programMonthCreateSchema = z.object({
  name: z.string().min(1).max(200),
  focus: z.string().max(200).nullable().optional(),
});
export type ProgramMonthCreate = z.infer<typeof programMonthCreateSchema>;

/** Sane bounds for a microciclo created from scratch (coach picks 1..8 weeks). */
export const MICROCICLO_MIN_WEEKS = 1;
export const MICROCICLO_MAX_WEEKS = 8;

/**
 * Body validation for POST /api/coach/program-months/create — the AGNOSTIC
 * "create from scratch" flow. A microciclo's identity = name + level
 * (athlete_levels, level_id) + nº weeks. There is no phase entity — the ORDER of
 * microciclos in a sequence IS the periodization.
 */
export const programMonthScratchSchema = z.object({
  name: z.string().min(1).max(200),
  level_id: z.coerce.number().int().positive(),
  week_count: z.coerce.number().int().min(MICROCICLO_MIN_WEEKS).max(MICROCICLO_MAX_WEEKS),
});
export type ProgramMonthScratch = z.infer<typeof programMonthScratchSchema>;

/**
 * Body validation for PUT /api/coach/program-months/[id].
 * Partial update — all fields optional, but at least one must be present.
 */
export const programMonthUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    focus: z.string().max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Debes enviar al menos un campo para actualizar',
  });
export type ProgramMonthUpdate = z.infer<typeof programMonthUpdateSchema>;

/** Shape returned by PUT /api/coach/program-months/[id]. */
export type MonthRow = {
  id: string;
  name: string;
  level: string;
  focus: string | null;
  updated_at: string;
};

export type MonthTemplateWeekFull = {
  id: string;
  week_index: number;
  name: string;
  level: string;
  focus: string | null;
  coach_notes: string | null;
  slots_json: WeekSlots;
};

export type MonthTemplateWithWeeks = {
  month: {
    id: string;
    name: string;
    /** Agnostic level name (athlete_levels.name); '' when no level set. */
    level: string;
  };
  weeks: MonthTemplateWeekFull[];
};

export async function listMonthTemplates(params: {
  coach_id: number | bigint;
  client: Sql;
}) {
  const client = params.client;
  return client<
    Array<{
      id: string;
      name: string;
      level: string;
      focus: string | null;
      week_count: number;
      updated_at: string;
    }>
  >`
    select
      m.id::text,
      m.name,
      coalesce(al.name, '') as level,
      fw.focus as focus,
      coalesce(w.cnt, 0)::int as week_count,
      m.updated_at::text
    from program_month_templates m
    left join athlete_levels al on al.id = m.level_id
    left join (
      select month_template_id, count(*)::int as cnt
      from program_month_weeks
      group by month_template_id
    ) w on w.month_template_id = m.id
    left join lateral (
      select wt.focus
      from program_month_weeks mw
      join program_week_templates wt on wt.id = mw.week_template_id
      where mw.month_template_id = m.id
      order by mw.position asc
      limit 1
    ) fw on true
    where m.coach_id = ${params.coach_id as number}
    order by m.updated_at desc
  `;
}

/**
 * Convenience alias used by the /programacion page (microcycles hub).
 * Returns the same shape as `listMonthTemplates` but with a more explicit name.
 */
export async function listMonthTemplatesForCoach(coach_id: number | bigint, client: Sql) {
  return listMonthTemplates({ coach_id, client });
}

export async function getMonthTemplate(params: {
  coach_id: number | bigint;
  id: number | bigint;
  client: Sql;
}) {
  const client = params.client;
  const rows = await client<
    Array<{
      id: string;
      name: string;
      level: string;
    }>
  >`
    select m.id::text, m.name, coalesce(al.name, '') as level
    from program_month_templates m
    left join athlete_levels al on al.id = m.level_id
    where m.id = ${params.id as number} and m.coach_id = ${params.coach_id as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  const weeks = await client<
    Array<{ position: number; week_template_id: string; week_name: string; week_focus: string | null }>
  >`
    select
      mw.position,
      mw.week_template_id::text,
      w.name as week_name,
      w.focus as week_focus
    from program_month_weeks mw
    join program_week_templates w on w.id = mw.week_template_id
    where mw.month_template_id = ${params.id as number}
    order by mw.position
  `;

  return { ...row, weeks };
}

export async function upsertMonthTemplate(params: {
  coach_id: number | bigint;
  id?: number | bigint;
  payload: unknown;
  client: Sql;
}) {
  const parsed = programMonthUpsertSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new ProgramMonthError('invalid_payload', parsed.error.message, 400);
  }
  const body: ProgramMonthUpsert = parsed.data;
  const client = params.client;

  let monthId: string;
  if (params.id) {
    const rows = await client<Array<{ id: string }>>`
      update program_month_templates
      set
        name = ${body.name},
        updated_at = now()
      where id = ${params.id as number} and coach_id = ${params.coach_id as number}
      returning id::text
    `;
    if (!rows[0]) throw new ProgramMonthError('not_found', 'Month template not found', 404);
    monthId = rows[0].id;
    await client`
      delete from program_month_weeks where month_template_id = ${params.id as number}
    `;
  } else {
    const rows = await client<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name)
      values (
        ${params.coach_id as number},
        ${body.name}
      )
      returning id::text
    `;
    monthId = rows[0]!.id;
  }

  for (let i = 0; i < body.week_template_ids.length; i++) {
    const weekId = body.week_template_ids[i]!;
    await client`
      insert into program_month_weeks (month_template_id, week_template_id, position)
      values (${Number(monthId)}, ${Number(weekId)}, ${i})
    `;
  }

  return monthId;
}

export async function duplicateMonthTemplate(params: {
  coach_id: number | bigint;
  id: number | bigint;
  client: Sql;
}): Promise<string> {
  const src = await getMonthTemplate(params);
  if (!src) throw new ProgramMonthError('not_found', 'Month template not found', 404);

  return upsertMonthTemplate({
    coach_id: params.coach_id,
    payload: {
      name: `${src.name} (copia)`,
      week_template_ids: src.weeks.map((w) => w.week_template_id),
    },
    client: params.client,
  });
}

/**
 * Actualiza la metadata de un microciclo (partial update).
 *
 * - `name` → updatea `program_month_templates`.
 * - `focus` no vive en `program_month_templates`; si llega, se propaga a las
 *   semanas hijas (`program_week_templates.focus`), igual que hace `create`.
 *
 * Devuelve `MonthRow`: el row actualizado, con `focus` derivado de la primera
 * semana (misma forma que usa `listMonthTemplates`).
 */
export async function updateMonthTemplate(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  patch: ProgramMonthUpdate;
  client: Sql;
}): Promise<MonthRow> {
  const parsed = programMonthUpdateSchema.safeParse(params.patch);
  if (!parsed.success) {
    throw new ProgramMonthError('invalid_payload', parsed.error.message, 400);
  }
  const patch = parsed.data;
  const client = params.client;
  const coach_id = Number(params.coach_id);
  const month_id = Number(params.month_id);

  await client.begin(async (tx) => {
    const owned = await tx<Array<{ id: string }>>`
      select id::text from program_month_templates
      where id = ${month_id} and coach_id = ${coach_id}
      limit 1
    `;
    if (!owned[0]) {
      throw new ProgramMonthError('not_found', 'Microciclo no encontrado', 404);
    }

    // Updates parciales separados — cada campo se updatea sólo si vino en el patch.
    // Evita CASE con booleanos parametrizados (más portable con `postgres`).
    if (patch.name !== undefined) {
      await tx`
        update program_month_templates
        set name = ${patch.name}, updated_at = now()
        where id = ${month_id} and coach_id = ${coach_id}
      `;
    }
    if (patch.focus !== undefined) {
      // `focus` no vive en `program_month_templates`; sólo en las semanas hijas.
      await tx`
        update program_week_templates w
        set focus = ${patch.focus}, updated_at = now()
        from program_month_weeks mw
        where mw.week_template_id = w.id
          and mw.month_template_id = ${month_id}
          and w.coach_id = ${coach_id}
      `;
    }
  });

  // Re-leemos en la misma forma que `listMonthTemplates` para devolver MonthRow.
  const rows = await client<Array<MonthRow>>`
    select
      m.id::text,
      m.name,
      coalesce(al.name, '') as level,
      fw.focus as focus,
      m.updated_at::text
    from program_month_templates m
    left join athlete_levels al on al.id = m.level_id
    left join lateral (
      select wt.focus
      from program_month_weeks mw
      join program_week_templates wt on wt.id = mw.week_template_id
      where mw.month_template_id = m.id
      order by mw.position asc
      limit 1
    ) fw on true
    where m.id = ${month_id} and m.coach_id = ${coach_id}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new ProgramMonthError('not_found', 'Microciclo no encontrado', 404);
  }
  return row;
}

/**
 * Borra un microciclo del coach + sus 4 semanas plantilla hijas.
 *
 * Seguro respecto a atletas asignados: `workout_assignments.template_id`
 * referencia entrenos individuales (`templates`), no `program_week_templates`.
 * Al hacer `assign-month` el plan se materializa en assignments con template_id
 * de entrenos, por lo que borrar plantillas semana no rompe historial alguno.
 */
export async function deleteMonthTemplate(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  client: Sql;
}): Promise<void> {
  const { coach_id, month_id, client } = params;
  await client.begin(async (tx) => {
    const owned = await tx<Array<{ id: string }>>`
      select id::text from program_month_templates
      where id = ${month_id as number} and coach_id = ${coach_id as number}
      limit 1
    `;
    if (!owned[0]) {
      throw new ProgramMonthError('not_found', 'Microciclo no encontrado', 404);
    }
    const weekIds = await tx<Array<{ week_template_id: string }>>`
      select week_template_id::text from program_month_weeks
      where month_template_id = ${month_id as number}
    `;
    await tx`delete from program_month_weeks where month_template_id = ${month_id as number}`;
    if (weekIds.length > 0) {
      const ids = weekIds.map((r: { week_template_id: string }) => Number(r.week_template_id));
      await tx`delete from program_week_templates where id = any(${ids}::bigint[]) and coach_id = ${coach_id as number}`;
    }
    await tx`delete from program_month_templates where id = ${month_id as number} and coach_id = ${coach_id as number}`;
  });
}

export class ProgramMonthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ProgramMonthError';
  }
}
