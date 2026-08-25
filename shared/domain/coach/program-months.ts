import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';
import { withOwnOrAmbientTx } from '../sql-tx';
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

export const MICROCICLO_MIN_WEEKS = 1;

/**
 * Cuánto dura un microciclo es METODOLOGÍA DEL ENTRENADOR, no del sistema —
 * otro coach competente trabaja perfectamente en bloques de 10 (card 135,
 * migración 0206: `coaches.max_microcycle_weeks`). Por eso hay DOS números,
 * nunca uno:
 *
 *   · `MICROCICLO_DEFAULT_MAX_WEEKS` — el DEFECTO de la columna. Un coach que
 *     no toca nada se comporta exactamente igual que antes de esta migración.
 *   · `MICROCICLO_ABSOLUTE_MAX_WEEKS` — la barrera de cordura DEL SISTEMA (medio
 *     año no es un bloque). Es la única que puede vivir en un zod estático como
 *     éste: un esquema no sabe quién es el entrenador, así que no puede
 *     conocer SU tope real. El tope real de cada coach se comprueba donde SÍ
 *     se sabe quién es (`loadCoachMaxMicrocicloWeeks`, `web/lib/coach/microcycle-limits.ts`),
 *     justo antes de crear o alargar un tramo.
 */
export const MICROCICLO_DEFAULT_MAX_WEEKS = 8;
export const MICROCICLO_ABSOLUTE_MAX_WEEKS = 26;

/** Wire/DB values become a usable tope. Anything else is the column default. */
export function coerceCoachMaxMicrocycleWeeks(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return MICROCICLO_DEFAULT_MAX_WEEKS;
  }
  const weeks = Math.round(value);
  if (weeks < MICROCICLO_MIN_WEEKS) return MICROCICLO_DEFAULT_MAX_WEEKS;
  return Math.min(weeks, MICROCICLO_ABSOLUTE_MAX_WEEKS);
}

/**
 * Body validation for POST /api/coach/program-months/create — the AGNOSTIC
 * "create from scratch" flow. A microciclo's identity = name + level
 * (athlete_levels, level_id) + nº weeks. There is no phase entity — the ORDER of
 * microciclos in a sequence IS the periodization.
 *
 * El `.max()` aquí es el techo ABSOLUTO del sistema, no el del coach — ver el
 * comentario de `MICROCICLO_ABSOLUTE_MAX_WEEKS`. El tope real se comprueba en
 * el servicio que conoce al coach (`createMonthTemplateWithEmptyWeeks`).
 */
export const programMonthScratchSchema = z.object({
  name: z.string().min(1).max(200),
  // EL NIVEL ES UNA ETIQUETA OPCIONAL, NO LA IDENTIDAD DEL MICROCICLO (card 137).
  //
  // Esto era obligatorio y no debía serlo. La columna `level_id` es NULLABLE
  // desde siempre, y 3 de los 11 microciclos que existen no tienen nivel: la
  // base ya decía que era opcional y el código lo exigía igual. Ese desacuerdo
  // fue lo que tumbó la primera importación de un ciclo real por el asistente —
  // no la programación, que pasó entera: el papeleo.
  //
  // Y de fondo hay algo peor: los niveles son una forma de organizarse que
  // usan ALGUNOS entrenadores. Cinco de los seis que hay tienen los mismos
  // `N1..N5` que les pusimos nosotros al darlos de alta; sólo uno los ha
  // tocado. Obligar a colgar cada bloque de un nivel es imponerle nuestra
  // manera a quien no la usa, que es justo lo que este producto no hace.
  //
  // Quien SÍ organiza por niveles lo sigue haciendo igual, y la matriz
  // nivel × días los sigue exigiendo: para estar en la matriz hace falta un
  // nivel (`program_sequences.level_id` es NOT NULL, y está bien que lo sea).
  // Un bloque sin nivel simplemente vive en la biblioteca y en las cadenas
  // personales, que es donde vive la mayoría.
  level_id: z.coerce.number().int().positive().nullish(),
  week_count: z.coerce.number().int().min(MICROCICLO_MIN_WEEKS).max(MICROCICLO_ABSOLUTE_MAX_WEEKS),
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

/**
 * The coach's LIBRARY microciclos — reusable, matched by level, the picker
 * source for Biblioteca and the Secuencias (nivel×días) matrix.
 *
 * `athlete_id is null` (0164) is load-bearing, not defensive: without it a
 * personal plan forked for one athlete would appear as a pickable microciclo
 * for every OTHER athlete of the coach — inside the shared library AND
 * addable to the level×días periodization. Every caller of this function
 * (biblioteca, secuencias, the generic `/api/coach/program-months` list) wants
 * ONLY the reusable set; a personal plan is read through its own athlete-scoped
 * path (`listPersonalPlansForAthlete`), never through here.
 */
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
        and wt.coach_id = m.coach_id
      where mw.month_template_id = m.id
      order by mw.position asc
      limit 1
    ) fw on true
    where m.coach_id = ${params.coach_id as number}
      and m.athlete_id is null
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
      and w.coach_id = ${params.coach_id as number}
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

  // Ownership guard (same pattern as sequences.ts saveSequence): every week
  // template id the CLIENT sends must belong to this coach — otherwise a crafted
  // body could mount another club's week inside this coach's microciclo.
  const weekIds = [...new Set(body.week_template_ids.map((id) => Number(id)))];
  if (weekIds.length > 0) {
    const ownedWeeks = await client<Array<{ id: string }>>`
      select id::text from program_week_templates
      where coach_id = ${params.coach_id as number} and id = any(${weekIds}::bigint[])
    `;
    const ownedSet = new Set(ownedWeeks.map((r) => Number(r.id)));
    const missing = weekIds.filter((id) => !ownedSet.has(id));
    if (missing.length > 0) {
      throw new ProgramMonthError('not_found', 'Semana no encontrada', 404);
    }
  }

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

/**
 * Canonical clone of ONE `program_week_templates` row into a NEW row of the same
 * coach, inside transaction `tx`. SINGLE SOURCE of the week-clone column list for
 * EVERY duplication path (duplicate a week inside a microciclo, deep-clone a whole
 * microciclo, copy a matrix cell, fork a personal plan) so no path silently drops
 * a column.
 *
 * Pure clone: `slots_json` copied VERBATIM via insert…select (an independent jsonb
 * document, never a shared ref); `exercise_id`, `level_id`, `athlete_profile` and
 * `week_number` preserved; NO dates, NO load/%RM adjustment. `nameSuffix` is
 * concatenated to the name ('' = identical name).
 *
 * `athleteIdOverride` (0164) decides who owns the clone:
 *   · undefined (default) → PRESERVE the source row's `athlete_id`. This is the
 *     correct default for every existing "duplicate" path — a library week clones
 *     into another library week (athlete_id stays null), a personal week clones
 *     into another week for the SAME athlete. Without this the clone would
 *     silently drop athlete_id (not in a bare column list) and a "Duplicar" on a
 *     personal plan would leak its content into the shared library.
 *   · a value (including `null`) → RETARGET explicitly. Personalizing a plan uses
 *     this to fork a LIBRARY week (athlete_id null) onto one athlete.
 *
 * Content columns = every column that is NOT the identity `id` / `created_at` /
 * `updated_at`, per the live schema (infra/migrations 0014 → 0015 → 0044 → 0063 →
 * 0064 → 0164): coach_id, name, level_id, focus, coach_notes, athlete_profile,
 * week_number, slots_json, athlete_id.
 */
export async function cloneWeekTemplateRow(params: {
  tx: TransactionSql;
  coach_id: number | bigint;
  week_id: number | bigint;
  nameSuffix?: string;
  athleteIdOverride?: number | bigint | null;
}): Promise<string> {
  const { tx } = params;
  const coach_id = Number(params.coach_id);
  const week_id = Number(params.week_id);
  const suffix = params.nameSuffix ?? '';
  const overrideGiven = params.athleteIdOverride !== undefined;
  const overrideValue =
    params.athleteIdOverride == null ? null : Number(params.athleteIdOverride);

  const cloned = overrideGiven
    ? await tx<Array<{ id: string }>>`
        insert into program_week_templates (
          coach_id, name, level_id, focus, coach_notes, athlete_profile, week_number, slots_json, athlete_id
        )
        select
          coach_id,
          name || ${suffix},
          level_id,
          focus,
          coach_notes,
          athlete_profile,
          week_number,
          slots_json,
          ${overrideValue}
        from program_week_templates
        where id = ${week_id} and coach_id = ${coach_id}
        returning id::text
      `
    : await tx<Array<{ id: string }>>`
        insert into program_week_templates (
          coach_id, name, level_id, focus, coach_notes, athlete_profile, week_number, slots_json, athlete_id
        )
        select
          coach_id,
          name || ${suffix},
          level_id,
          focus,
          coach_notes,
          athlete_profile,
          week_number,
          slots_json,
          athlete_id
        from program_week_templates
        where id = ${week_id} and coach_id = ${coach_id}
        returning id::text
      `;
  if (!cloned[0]) {
    throw new ProgramMonthError('not_found', 'Semana no encontrada', 404);
  }
  return cloned[0].id;
}

/**
 * Deep-clones ONE microciclo (`program_month_templates`) inside transaction `tx`:
 * a NEW month row + a fresh clone of EVERY source week (via `cloneWeekTemplateRow`)
 * + junction rows (`program_month_weeks`) preserving positions. The clones are
 * fully independent documents — editing a cloned week NEVER mutates the source.
 *
 * `nameSuffix` is concatenated to the month name (week names stay identical).
 * `levelIdOverride`, when provided, sets the clone's `level_id` (the cell copy uses
 * it to retarget the microciclo to another `athlete_level`); otherwise the source
 * `level_id` is preserved. Source ownership is enforced here (coach-scoped select).
 */
export async function cloneMonthTemplateDeep(params: {
  tx: TransactionSql;
  coach_id: number | bigint;
  source_month_id: number | bigint;
  nameSuffix?: string;
  levelIdOverride?: number | bigint;
}): Promise<string> {
  const { tx } = params;
  const coach_id = Number(params.coach_id);
  const source_month_id = Number(params.source_month_id);
  const suffix = params.nameSuffix ?? '';

  const srcRows = await tx<
    Array<{ name: string; level_id: string | null; athlete_id: string | null }>
  >`
    select name, level_id::text, athlete_id::text
    from program_month_templates
    where id = ${source_month_id} and coach_id = ${coach_id}
    limit 1
  `;
  const src = srcRows[0];
  if (!src) throw new ProgramMonthError('not_found', 'Microciclo no encontrado', 404);

  const targetLevelId =
    params.levelIdOverride !== undefined
      ? Number(params.levelIdOverride)
      : src.level_id !== null
        ? Number(src.level_id)
        : null;

  // Source weeks in position order — each becomes a NEW, independent row.
  const weeks = await tx<Array<{ week_template_id: string; position: number }>>`
    select mw.week_template_id::text, mw.position
    from program_month_weeks mw
    join program_week_templates w on w.id = mw.week_template_id
    where mw.month_template_id = ${source_month_id} and w.coach_id = ${coach_id}
    order by mw.position
  `;

  // athlete_id is PRESERVED from the source (0164): duplicating a library
  // microciclo (athlete_id null) stays library; duplicating a personal plan
  // (unreachable from the UI today, but never leaked if it ever is) stays
  // personal to the SAME athlete — it never becomes a library row by accident.
  const sourceAthleteId = src.athlete_id !== null ? Number(src.athlete_id) : null;
  const monthRows = await tx<Array<{ id: string }>>`
    insert into program_month_templates (coach_id, name, level_id, athlete_id)
    values (${coach_id}, ${`${src.name}${suffix}`}, ${targetLevelId}, ${sourceAthleteId})
    returning id::text
  `;
  const newMonthId = monthRows[0]!.id;

  for (const wk of weeks) {
    const clonedWeekId = await cloneWeekTemplateRow({
      tx,
      coach_id,
      week_id: Number(wk.week_template_id),
    });
    await tx`
      insert into program_month_weeks (month_template_id, week_template_id, position)
      values (${Number(newMonthId)}, ${Number(clonedWeekId)}, ${wk.position})
    `;
  }

  return newMonthId;
}

/**
 * Duplicates a microciclo as an INDEPENDENT DEEP COPY: a new month named
 * `${src.name} (copia)` whose weeks are fresh clones of the source weeks (content
 * verbatim, positions preserved). Editing the copy NEVER mutates the original.
 * Source `level_id` is preserved. One transaction. Coach ownership enforced.
 */
export async function duplicateMonthTemplate(params: {
  coach_id: number | bigint;
  id: number | bigint;
  client: Sql | TransactionSql;
}): Promise<string> {
  let newMonthId = '';
  await withOwnOrAmbientTx(params.client, async (tx) => {
    newMonthId = await cloneMonthTemplateDeep({
      tx: tx as TransactionSql,
      coach_id: params.coach_id,
      source_month_id: params.id,
      nameSuffix: ' (copia)',
    });
  });
  return newMonthId;
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
  client: Sql | TransactionSql;
}): Promise<MonthRow> {
  const parsed = programMonthUpdateSchema.safeParse(params.patch);
  if (!parsed.success) {
    throw new ProgramMonthError('invalid_payload', parsed.error.message, 400);
  }
  const patch = parsed.data;
  const client = params.client;
  const coach_id = Number(params.coach_id);
  const month_id = Number(params.month_id);

  await withOwnOrAmbientTx(client, async (tx) => {
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
        and wt.coach_id = m.coach_id
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
 *
 * NO seguro si el microciclo es un ITEM de una secuencia (matriz nivel×días):
 * `program_sequence_items.month_template_id` lleva `ON DELETE RESTRICT` a
 * propósito — nunca se debe poder tirar en silencio un microciclo que una
 * secuencia activa sigue usando. El DELETE de más abajo viola esa FK y
 * postgres lo rechaza con SQLSTATE 23503; se traduce aquí a un error que el
 * coach puede entender y accionar, en vez del genérico "no se pudo borrar".
 */
export async function deleteMonthTemplate(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  client: Sql | TransactionSql;
}): Promise<void> {
  const { coach_id, month_id, client } = params;
  try {
    // Transacción propia o ajena, igual que `removeWeekFromMonth`: el botón del
    // panel llega con el pool y abre la suya; el asistente llega ya dentro de una
    // (borrado + registro de auditoría tienen que caer juntos o no caer), y
    // postgres.js no anida `begin`.
    await withOwnOrAmbientTx(client, async (tx) => {
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
  } catch (err) {
    if (err instanceof ProgramMonthError) throw err;
    if (isForeignKeyViolation(err, 'program_sequence_items_month_template_id_fkey')) {
      throw new ProgramMonthError(
        'in_sequence',
        'Este microciclo forma parte de una secuencia (nivel × días). Quítalo de la secuencia antes de borrarlo.',
        409,
      );
    }
    throw err;
  }
}

/** SQLSTATE 23503 = foreign_key_violation; opcionalmente por constraint concreta. */
function isForeignKeyViolation(err: unknown, constraintName?: string): boolean {
  const e = err as { code?: string; constraint_name?: string } | null;
  if (!e || e.code !== '23503') return false;
  return constraintName === undefined || e.constraint_name === constraintName;
}

/**
 * Quita UNA semana de un microciclo: desengancha la junction
 * `program_month_weeks` y compacta las posiciones siguientes (sin huecos), y
 * borra la `program_week_templates` que quedó huérfana — dentro de la
 * relación mes↔semanas cada fila de semana pertenece a UN único microciclo
 * (nunca se comparte entre dos: `appendEmptyWeekToMonth` y
 * `duplicateWeekIntoMonth`/`cloneWeekTemplateRow` siempre crean una fila
 * nueva), así que no hay riesgo de borrar una semana que otro microciclo
 * todavía usa — verificado igualmente antes de borrar, nunca asumido.
 *
 * Reordena por POSICIÓN ASCENDENTE (al revés que `duplicateWeekIntoMonth`,
 * que inserta y desplaza en descendente): al COMPACTAR un hueco hay que
 * mover primero la posición más baja que queda por encima del hueco, o dos
 * filas colisionarían en la misma posición a mitad de la operación.
 */
export async function removeWeekFromMonth(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  week_id: number | bigint;
  client: Sql | TransactionSql;
}): Promise<void> {
  const { coach_id, month_id, week_id, client } = params;
  // TRANSACCIÓN PROPIA O AJENA (bug encontrado con la prueba de la card 135).
  //
  // Esto abría SIEMPRE su propia transacción, pero `updatePersonalTramoMeta` la
  // llama desde DENTRO de una para acortar un tramo personal — y postgres.js no
  // anida `begin`: un `tx` expone `savepoint`, no `begin`. O sea que **cambiar
  // el número de semanas de un tramo personal reventaba siempre**, con un
  // `client.begin is not a function`. Nadie lo había visto porque ninguna prueba
  // pasaba por ahí.
  //
  // Con el pool abre su transacción, como siempre; con un `tx` se mete dentro
  // del que ya hay. Es el mismo patrón que `withOwnOrAmbientTx` en el surface
  // del panel — mismo problema, misma respuesta.
  const run = async (tx: Sql | TransactionSql) => {
    const owned = await tx<Array<{ id: string }>>`
      select id::text from program_month_templates
      where id = ${month_id as number} and coach_id = ${coach_id as number}
      limit 1
    `;
    if (!owned[0]) {
      throw new ProgramMonthError('not_found', 'Microciclo no encontrado', 404);
    }

    const junction = await tx<Array<{ position: number }>>`
      select mw.position
      from program_month_weeks mw
      join program_week_templates w on w.id = mw.week_template_id
      where mw.month_template_id = ${month_id as number}
        and mw.week_template_id = ${week_id as number}
        and w.coach_id = ${coach_id as number}
      limit 1
    `;
    const removedPosition = junction[0]?.position;
    if (removedPosition === undefined) {
      throw new ProgramMonthError('not_found', 'Semana no encontrada en este microciclo', 404);
    }

    await tx`
      delete from program_month_weeks
      where month_template_id = ${month_id as number} and week_template_id = ${week_id as number}
    `;

    const toShift = await tx<Array<{ position: number }>>`
      select position from program_month_weeks
      where month_template_id = ${month_id as number} and position > ${removedPosition}
      order by position asc
    `;
    for (const { position } of toShift) {
      await tx`
        update program_month_weeks
        set position = ${position - 1}
        where month_template_id = ${month_id as number} and position = ${position}
      `;
    }

    // Defensivo, no asumido: comprobar que ninguna OTRA junction sigue
    // apuntando a esta semana antes de borrar la fila de verdad.
    const stillReferenced = await tx<Array<{ n: string }>>`
      select count(*)::text as n from program_month_weeks where week_template_id = ${week_id as number}
    `;
    if (Number(stillReferenced[0]?.n ?? '0') === 0) {
      await tx`
        delete from program_week_templates
        where id = ${week_id as number} and coach_id = ${coach_id as number}
      `;
    }
  };

  await withOwnOrAmbientTx(client, run);
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
