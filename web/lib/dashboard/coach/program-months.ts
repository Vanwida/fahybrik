import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { ProgramMonthUpdate, MonthRow } from '@fahybrid/shared/domain/coach/program-months';
import {
  ProgramMonthError,
  programMonthCreateSchema,
  programMonthUpdateSchema,
  listMonthTemplates as _listMonthTemplates,
  getMonthTemplate as _getMonthTemplate,
  upsertMonthTemplate as _upsertMonthTemplate,
  duplicateMonthTemplate as _duplicateMonthTemplate,
  updateMonthTemplate as _updateMonthTemplate,
  deleteMonthTemplate as _deleteMonthTemplate,
  type ProgramMonthCreate,
  type MonthTemplateWeekFull,
  type MonthTemplateWithWeeks,
} from '@fahybrid/shared/domain/coach/program-months';
import {
  emptyWeekSlots,
  normalizeWeekSlots,
  parseWeekSlotsFromDb,
} from './program-week-slots';

// Re-exports — shared CRUD core + schemas/types. Slot-serializing functions
// (createMonthTemplateWithEmptyWeeks / loadMonthTemplateWithWeeks) stay local
// because they depend on this app's normalizeWeekSlots / parseWeekSlotsFromDb,
// which serialize template_id/exercise_id differently per surface.
export {
  ProgramMonthError,
  programMonthCreateSchema,
  programMonthUpdateSchema,
};
export type {
  ProgramMonthCreate,
  ProgramMonthUpdate,
  MonthRow,
  MonthTemplateWeekFull,
  MonthTemplateWithWeeks,
};

const WEEK_LABELS = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4 (deload)'] as const;

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

/**
 * Crea un microciclo (mes ≈ 4 semanas) + sus 4 semanas vacías + entradas en la
 * junction `program_month_weeks` (positions 0-3) dentro de una transacción.
 *
 * Las 4 semanas heredan `level` y `atr_block_hint` del microciclo; nombres
 * "{name} · Semana N"; cada una con `slots_json` de 7 días en rest
 * (helper `emptyWeekSlots()`). El `focus` opcional se propaga a cada semana.
 *
 * Local (no shared): usa `normalizeWeekSlots` de este surface.
 */
export async function createMonthTemplateWithEmptyWeeks(params: {
  coach_id: number | bigint;
  payload: unknown;
  client?: Sql;
}): Promise<{ id: string; weeks: Array<{ id: string; week_index: number }> }> {
  const parsed = programMonthCreateSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new ProgramMonthError('invalid_payload', parsed.error.message, 400);
  }
  const body: ProgramMonthCreate = parsed.data;
  const client = params.client ?? defaultSql;

  const slotsJson = JSON.parse(
    JSON.stringify(normalizeWeekSlots(emptyWeekSlots()), (_, v) =>
      typeof v === 'bigint' ? Number(v) : v,
    ),
  );

  let monthId = '';
  const weeks: Array<{ id: string; week_index: number }> = [];

  await client.begin(async (tx) => {
    const monthRows = await tx<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name, level, atr_block_hint)
      values (
        ${Number(params.coach_id)},
        ${body.name},
        ${body.level}::program_level,
        ${body.atr_block_hint ?? null}
      )
      returning id::text
    `;
    monthId = monthRows[0]!.id;

    for (let i = 0; i < 4; i++) {
      const label = WEEK_LABELS[i]!;
      const weekName = `${body.name} · ${label}`;
      const weekRows = await tx<Array<{ id: string }>>`
        insert into program_week_templates (
          coach_id, name, level, atr_block_hint, focus, slots_json
        )
        values (
          ${Number(params.coach_id)},
          ${weekName},
          ${body.level}::program_level,
          ${body.atr_block_hint ?? null},
          ${body.focus ?? null},
          ${tx.json(slotsJson)}
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
 * DUPLICA una semana DENTRO de su microciclo: clona la `program_week_templates`
 * (incluido su `slots_json` ENTERO — días/sesiones/bloques/ítems + prescripciones,
 * config_json, coach_note, uids, exercise_id) en una semana NUEVA y la engancha
 * en la junction justo DESPUÉS de la semana origen (posición origen + 1),
 * desplazando las posteriores. Devuelve la nueva semana + su `week_index`.
 *
 * CLON PURO (decisión D2): NO ajusta cargas/%RM/ritmos (la progresión es la
 * metodología del coach, no nuestra tecnología). NO añade fechas (las plantillas
 * no las llevan; sólo existen al asignar a un atleta). El `exercise_id` se
 * conserva (referencia al catálogo — no se clonan ejercicios). El `slots_json`
 * se copia VERBATIM a nivel jsonb, así que no hay pérdida ni texto libre.
 *
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
    // Ownership del microciclo.
    const owned = await tx<Array<{ id: string }>>`
      select id::text from program_month_templates
      where id = ${month_id} and coach_id = ${coach_id}
      limit 1
    `;
    if (!owned[0]) {
      throw new ProgramMonthError('not_found', 'Microciclo no encontrado', 404);
    }

    // La semana debe pertenecer a este microciclo → posición origen P.
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

    // Clon VERBATIM de la semana (slots_json incluido) como fila nueva.
    const cloned = await tx<Array<{ id: string }>>`
      insert into program_week_templates (
        coach_id, name, level, atr_block_hint, focus, coach_notes, slots_json
      )
      select
        coach_id,
        name || ' (copia)',
        level,
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

    // Hueco en la posición P+1: desplaza las posteriores en DESC para respetar
    // la PK (month_template_id, position) sin colisión transitoria.
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

  const monthRows = await client<
    Array<{
      id: string;
      name: string;
      level: string;
      atr_block_hint: string | null;
    }>
  >`
    select id::text, name, level::text, atr_block_hint::text
    from program_month_templates
    where id = ${Number(params.month_id)} and coach_id = ${Number(params.coach_id)}
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
