import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { ProgramMonthUpdate, MonthRow } from '@fahybrid/shared/domain/coach/program-months';
import {
  ProgramMonthError,
  programMonthCreateSchema,
  programMonthScratchSchema,
  programMonthUpdateSchema,
  listMonthTemplates as _listMonthTemplates,
  getMonthTemplate as _getMonthTemplate,
  upsertMonthTemplate as _upsertMonthTemplate,
  duplicateMonthTemplate as _duplicateMonthTemplate,
  updateMonthTemplate as _updateMonthTemplate,
  deleteMonthTemplate as _deleteMonthTemplate,
  type ProgramMonthCreate,
  type ProgramMonthScratch,
  type MonthTemplateWeekFull,
  type MonthTemplateWithWeeks,
} from '@fahybrid/shared/domain/coach/program-months';
import { PROGRAM_LEVELS, type ProgramLevel } from '@fahybrid/shared/schema/program-templates';
import {
  emptyWeekSlots,
  normalizeWeekSlots,
  parseWeekSlotsFromDb,
} from './program-week-slots';
import { upsertWeekTemplate } from './program-weeks';

// Re-exports — shared CRUD core + schemas/types. Slot-serializing functions
// (createMonthTemplateWithEmptyWeeks / loadMonthTemplateWithWeeks) stay local
// because they depend on this app's normalizeWeekSlots / parseWeekSlotsFromDb,
// which serialize template_id/exercise_id differently per surface.
export {
  ProgramMonthError,
  programMonthCreateSchema,
  programMonthScratchSchema,
  programMonthUpdateSchema,
};
export type {
  ProgramMonthCreate,
  ProgramMonthScratch,
  ProgramMonthUpdate,
  MonthRow,
  MonthTemplateWeekFull,
  MonthTemplateWithWeeks,
};

export async function listMonthTemplates(params: {
  coach_id: number | bigint;
  level?: string;
  client?: Sql;
}) {
  return _listMonthTemplates({ ...params, client: params.client ?? defaultSql });
}

export async function listMonthTemplatesForCoach(coach_id: number | bigint) {
  return listMonthTemplates({ coach_id });
}

export async function getMonthTemplate(params: {
  coach_id: number | bigint;
  id: number | bigint;
  client?: Sql;
}) {
  return _getMonthTemplate({ ...params, client: params.client ?? defaultSql });
}

export async function upsertMonthTemplate(params: {
  coach_id: number | bigint;
  id?: number | bigint;
  payload: unknown;
  client?: Sql;
}) {
  return _upsertMonthTemplate({ ...params, client: params.client ?? defaultSql });
}

export async function duplicateMonthTemplate(params: {
  coach_id: number | bigint;
  id: number | bigint;
  client?: Sql;
}): Promise<string> {
  return _duplicateMonthTemplate({ ...params, client: params.client ?? defaultSql });
}

export async function updateMonthTemplate(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  patch: ProgramMonthUpdate;
  client?: Sql;
}): Promise<MonthRow> {
  return _updateMonthTemplate({ ...params, client: params.client ?? defaultSql });
}

export async function deleteMonthTemplate(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  client?: Sql;
}): Promise<void> {
  return _deleteMonthTemplate({ ...params, client: params.client ?? defaultSql });
}

/** Empty 7-day rest week, serialized for jsonb (bigint → number). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function emptyWeekSlotsJson(): any {
  return JSON.parse(
    JSON.stringify(normalizeWeekSlots(emptyWeekSlots()), (_, v) =>
      typeof v === 'bigint' ? Number(v) : v,
    ),
  );
}

/**
 * Maps a coach athlete_level (agnostic, by sort_order rank) onto a legacy
 * `program_level` enum value — purely for BACK-COMPAT. `level` is NOT NULL on the
 * template tables, but `level_id` is the real source of truth (displayed
 * everywhere via coalesce). This shim spreads the level's 0-based rank across the
 * four enum buckets so anything still reading the enum gets a sane value.
 * Transitional: drop once every microciclo reader keys on `level_id`.
 */
function legacyLevelForRank(rankIndex: number, total: number): ProgramLevel {
  if (total <= 1) return 'intermediate';
  const span = PROGRAM_LEVELS.length - 1;
  const b = Math.round((rankIndex / (total - 1)) * span);
  return PROGRAM_LEVELS[Math.min(Math.max(b, 0), span)]!;
}

/**
 * Crea un microciclo desde cero (AGNÓSTICO) + sus N semanas vacías + la junction
 * `program_month_weeks` (positions 0..N-1) en una transacción.
 *
 * `level_id` (athlete_levels) y `phase_id` opcional (methodology_phases) son DATO
 * DEL COACH — la fuente de verdad. El enum legacy `program_level` se DERIVA por
 * rango sólo para satisfacer la columna NOT NULL (back-compat); `atr_block_hint`
 * se deja NULL (la fase es agnóstica vía `phase_id`). Cada semana hereda
 * level/level_id/phase_id; nombre "{name} · Semana k"; `slots_json` = 7 días en
 * descanso. `week_count` lo elige el coach (1..8) — nunca un número fijo.
 *
 * Local (no shared): usa `normalizeWeekSlots` de este surface.
 */
export async function createMonthTemplateWithEmptyWeeks(params: {
  coach_id: number | bigint;
  payload: unknown;
  client?: Sql;
}): Promise<{ id: string; weeks: Array<{ id: string; week_index: number }> }> {
  const parsed = programMonthScratchSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new ProgramMonthError('invalid_payload', parsed.error.message, 400);
  }
  const body: ProgramMonthScratch = parsed.data;
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const slotsJson = emptyWeekSlotsJson();

  let monthId = '';
  const weeks: Array<{ id: string; week_index: number }> = [];

  await client.begin(async (tx) => {
    // Level must be one of THIS coach's athlete_levels; its rank derives the
    // legacy enum shim (level_id is the real value).
    const levels = await tx<Array<{ id: string }>>`
      select id::text from athlete_levels
      where coach_id = ${coach_id}
      order by sort_order asc, id asc
    `;
    const rank = levels.findIndex((l) => l.id === String(body.level_id));
    if (rank < 0) {
      throw new ProgramMonthError('invalid_level', 'El nivel no pertenece a este coach', 400);
    }
    const legacyLevel = legacyLevelForRank(rank, levels.length);

    // Phase (optional) must be one of THIS coach's methodology_phases.
    const phaseId = body.phase_id ?? null;
    if (phaseId != null) {
      const owned = await tx<Array<{ id: string }>>`
        select id::text from methodology_phases
        where id = ${phaseId} and coach_id = ${coach_id}
        limit 1
      `;
      if (!owned[0]) {
        throw new ProgramMonthError('invalid_phase', 'La fase no pertenece a este coach', 400);
      }
    }

    const monthRows = await tx<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name, level, level_id, phase_id, atr_block_hint)
      values (
        ${coach_id}, ${body.name}, ${legacyLevel}::program_level,
        ${body.level_id}, ${phaseId}, null
      )
      returning id::text
    `;
    monthId = monthRows[0]!.id;

    for (let i = 0; i < body.week_count; i++) {
      const weekName = `${body.name} · Semana ${i + 1}`;
      const weekRows = await tx<Array<{ id: string }>>`
        insert into program_week_templates (
          coach_id, name, level, level_id, phase_id, atr_block_hint, focus, slots_json
        )
        values (
          ${coach_id}, ${weekName}, ${legacyLevel}::program_level,
          ${body.level_id}, ${phaseId}, null, null, ${tx.json(slotsJson)}
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

/**
 * Añade UNA semana vacía al final del microciclo (la operación "+ Añadir semana"
 * del editor): inserta una `program_week_templates` nueva con `slots_json` de 7
 * días en descanso, heredando level/level_id/phase_id del microciclo, y la
 * engancha en la junction en la posición `max(position)+1`. Devuelve la nueva
 * semana + su `week_index`. Ownership del microciclo validado. Transacción.
 *
 * Es la ruta "duplicar" SIN clonar contenido — comparte el patrón de inserción
 * en la junction (posición siguiente), sólo que con una semana en blanco.
 */
export async function appendEmptyWeekToMonth(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  client?: Sql;
}): Promise<{ id: string; week_index: number }> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const month_id = Number(params.month_id);
  const slotsJson = emptyWeekSlotsJson();

  let newWeekId = '';
  let newPosition = 0;

  await client.begin(async (tx) => {
    const monthRows = await tx<
      Array<{ name: string; level: string; level_id: string | null; phase_id: string | null }>
    >`
      select name, level::text as level, level_id::text, phase_id::text
      from program_month_templates
      where id = ${month_id} and coach_id = ${coach_id}
      limit 1
    `;
    const month = monthRows[0];
    if (!month) {
      throw new ProgramMonthError('not_found', 'Microciclo no encontrado', 404);
    }

    const maxRows = await tx<Array<{ maxpos: number }>>`
      select coalesce(max(position), -1)::int as maxpos
      from program_month_weeks where month_template_id = ${month_id}
    `;
    newPosition = (maxRows[0]?.maxpos ?? -1) + 1;
    const weekName = `${month.name} · Semana ${newPosition + 1}`;

    const inserted = await tx<Array<{ id: string }>>`
      insert into program_week_templates (
        coach_id, name, level, level_id, phase_id, atr_block_hint, focus, slots_json
      )
      values (
        ${coach_id}, ${weekName}, ${month.level}::program_level,
        ${month.level_id ? Number(month.level_id) : null},
        ${month.phase_id ? Number(month.phase_id) : null},
        null, null, ${tx.json(slotsJson)}
      )
      returning id::text
    `;
    newWeekId = inserted[0]!.id;

    await tx`
      insert into program_month_weeks (month_template_id, week_template_id, position)
      values (${month_id}, ${Number(newWeekId)}, ${newPosition})
    `;
  });

  return { id: newWeekId, week_index: newPosition };
}

/**
 * DUPLICA una semana DENTRO de su microciclo: clona la `program_week_templates`
 * (incluido su `slots_json` ENTERO) en una semana NUEVA y la engancha en la
 * junction justo DESPUÉS de la semana origen (posición origen + 1), desplazando
 * las posteriores. Devuelve la nueva semana + su `week_index`.
 *
 * CLON PURO: NO ajusta cargas/%RM/ritmos ni añade fechas. `exercise_id`,
 * `level_id` y `phase_id` se conservan. `slots_json` se copia VERBATIM (jsonb).
 * La PK `(month_template_id, position)` obliga a desplazar las posiciones >= P+1
 * en orden DESCENDENTE para no colisionar. Todo en una transacción.
 */
export async function duplicateWeekIntoMonth(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  week_id: number | bigint;
  client?: Sql;
}): Promise<{ id: string; week_index: number }> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const month_id = Number(params.month_id);
  const week_id = Number(params.week_id);

  let newWeekId = '';
  let newPosition = 0;

  await client.begin(async (tx) => {
    const owned = await tx<Array<{ id: string }>>`
      select id::text from program_month_templates
      where id = ${month_id} and coach_id = ${coach_id}
      limit 1
    `;
    if (!owned[0]) {
      throw new ProgramMonthError('not_found', 'Microciclo no encontrado', 404);
    }

    const junction = await tx<Array<{ position: number }>>`
      select mw.position
      from program_month_weeks mw
      join program_week_templates w on w.id = mw.week_template_id
      where mw.month_template_id = ${month_id}
        and mw.week_template_id = ${week_id}
        and w.coach_id = ${coach_id}
      limit 1
    `;
    const srcPosition = junction[0]?.position;
    if (srcPosition === undefined) {
      throw new ProgramMonthError('not_found', 'Semana no encontrada en este microciclo', 404);
    }
    newPosition = srcPosition + 1;

    const cloned = await tx<Array<{ id: string }>>`
      insert into program_week_templates (
        coach_id, name, level, level_id, phase_id, atr_block_hint, focus, coach_notes, slots_json
      )
      select
        coach_id,
        name || ' (copia)',
        level,
        level_id,
        phase_id,
        atr_block_hint,
        focus,
        coach_notes,
        slots_json
      from program_week_templates
      where id = ${week_id} and coach_id = ${coach_id}
      returning id::text
    `;
    if (!cloned[0]) {
      throw new ProgramMonthError('not_found', 'Semana no encontrada', 404);
    }
    newWeekId = cloned[0].id;

    const toShift = await tx<Array<{ position: number }>>`
      select position from program_month_weeks
      where month_template_id = ${month_id} and position >= ${newPosition}
      order by position desc
    `;
    for (const { position } of toShift) {
      await tx`
        update program_month_weeks
        set position = ${position + 1}
        where month_template_id = ${month_id} and position = ${position}
      `;
    }

    await tx`
      insert into program_month_weeks (month_template_id, week_template_id, position)
      values (${month_id}, ${Number(newWeekId)}, ${newPosition})
    `;
  });

  return { id: newWeekId, week_index: newPosition };
}

/** Una semana "tiene contenido" si ALGÚN día lleva al menos una sesión. */
function weekHasContent(slots: { days?: Array<{ sessions?: unknown[] }> } | null | undefined): boolean {
  return (slots?.days ?? []).some(
    (d) => Array.isArray(d?.sessions) && d.sessions.length > 0,
  );
}

/**
 * Copia el CONTENIDO de una semana origen sobre una o varias semanas DESTINO que
 * ya existen en el microciclo (la operación cross-week clave: "monto la semana 1
 * y la estampo en la 2/3/4"). SOBRESCRIBE el `slots_json` de cada destino con un
 * clon profundo del de origen (días/sesiones/bloques/ítems + prescripciones,
 * `exercise_id` preservado). Cada destino CONSERVA su identidad (name/level/focus/
 * coach_notes) — sólo se reemplaza el CONTENIDO.
 *
 * CLON PURO (decisión D2): NO ajusta cargas/%RM/ritmos (la progresión es la
 * metodología del coach, no nuestra tecnología) ni añade fechas (las plantillas
 * no las llevan). El clon profundo se hace por destino (`structuredClone`) para
 * que cada semana sea un documento independiente, sin referencias compartidas.
 *
 * Gate de sobrescritura: si algún destino ya tiene contenido y `overwrite` no es
 * true → 409 (el cliente confirma antes). Valida ownership del microciclo y que
 * origen + destinos pertenezcan a ESTE microciclo. Todo en una transacción.
 */
export async function copyWeekContentInto(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  source_week_id: number | bigint;
  target_week_ids: Array<number | bigint>;
  overwrite: boolean;
  client?: Sql;
}): Promise<{ copied_week_ids: string[] }> {
  const client = params.client ?? defaultSql;
  const sourceId = String(params.source_week_id);
  const targetIds = params.target_week_ids.map((id) => String(id));

  const data = await loadMonthTemplateWithWeeks({
    coach_id: params.coach_id,
    month_id: params.month_id,
    client,
  });
  if (!data) {
    throw new ProgramMonthError('not_found', 'Microciclo no encontrado', 404);
  }

  const weeksById = new Map(data.weeks.map((w) => [w.id, w]));
  const source = weeksById.get(sourceId);
  if (!source) {
    throw new ProgramMonthError('not_found', 'Semana origen no encontrada en este microciclo', 404);
  }

  // Destinos: deben pertenecer a este microciclo, ser distintos del origen y no
  // repetirse. Cualquier id inválido aborta la operación entera (sin copias a medias).
  const seen = new Set<string>();
  const targets: MonthTemplateWeekFull[] = [];
  for (const id of targetIds) {
    if (id === sourceId) {
      throw new ProgramMonthError('invalid_target', 'El origen no puede ser también destino', 400);
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const target = weeksById.get(id);
    if (!target) {
      throw new ProgramMonthError('not_found', 'Semana destino no encontrada en este microciclo', 404);
    }
    targets.push(target);
  }
  if (targets.length === 0) {
    throw new ProgramMonthError('invalid_target', 'No hay semanas destino válidas', 400);
  }

  // Gate de sobrescritura: ningún destino con contenido se pisa sin confirmar.
  if (!params.overwrite) {
    const nonEmpty = targets.filter((t) => weekHasContent(t.slots_json));
    if (nonEmpty.length > 0) {
      throw new ProgramMonthError(
        'weeks_not_empty',
        `${nonEmpty.length} semana(s) destino ya tienen contenido`,
        409,
      );
    }
  }

  await client.begin(async (tx) => {
    for (const target of targets) {
      // Clon profundo independiente por destino (sin referencias compartidas).
      const clonedSlots = structuredClone(source.slots_json);
      await upsertWeekTemplate({
        coach_id: params.coach_id,
        id: Number(target.id),
        payload: {
          // Conserva la identidad del destino; sólo reemplaza el contenido.
          name: target.name,
          level: target.level,
          atr_block_hint: target.atr_block_hint,
          focus: target.focus,
          coach_notes: target.coach_notes,
          slots_json: clonedSlots,
        },
        client: tx,
      });
    }
  });

  return { copied_week_ids: targets.map((t) => t.id) };
}

/**
 * Carga un microciclo (mes) + sus 4 (o N) semanas con `slots_json` parseado,
 * validando ownership por coach. Devuelve `null` si el mes no existe o no
 * pertenece al coach.
 *
 * Local (no shared): usa `parseWeekSlotsFromDb` de este surface.
 */
export async function loadMonthTemplateWithWeeks(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  client?: Sql;
}): Promise<MonthTemplateWithWeeks | null> {
  const client = params.client ?? defaultSql;

  // Level + phase are AGNOSTIC: prefer the coach's athlete_levels.name /
  // methodology_phases.label (level_id/phase_id), falling back to the legacy enum
  // for pre-0063 rows that never carried an FK. The display layer never sees the
  // raw program_level enum when a coach level is set.
  const monthRows = await client<
    Array<{
      id: string;
      name: string;
      level: string;
      atr_block_hint: string | null;
      phase_label: string | null;
    }>
  >`
    select
      m.id::text,
      m.name,
      coalesce(al.name, m.level::text) as level,
      m.atr_block_hint::text,
      mp.label as phase_label
    from program_month_templates m
    left join athlete_levels al on al.id = m.level_id
    left join methodology_phases mp on mp.id = m.phase_id
    where m.id = ${Number(params.month_id)} and m.coach_id = ${Number(params.coach_id)}
    limit 1
  `;
  const month = monthRows[0];
  if (!month) return null;

  const weekRows = await client<
    Array<{
      id: string;
      position: number;
      name: string;
      level: string;
      focus: string | null;
      coach_notes: string | null;
      atr_block_hint: string | null;
      slots_json: unknown;
    }>
  >`
    select
      w.id::text,
      mw.position,
      w.name,
      w.level::text,
      w.focus,
      w.coach_notes,
      w.atr_block_hint::text,
      w.slots_json
    from program_month_weeks mw
    join program_week_templates w on w.id = mw.week_template_id
    where mw.month_template_id = ${Number(params.month_id)}
      and w.coach_id = ${Number(params.coach_id)}
    order by mw.position
  `;

  const weeks: MonthTemplateWeekFull[] = weekRows.map((row) => ({
    id: row.id,
    week_index: row.position,
    name: row.name,
    level: row.level,
    focus: row.focus,
    coach_notes: row.coach_notes,
    atr_block_hint: row.atr_block_hint,
    slots_json: parseWeekSlotsFromDb(row.slots_json),
  }));

  return { month, weeks };
}
