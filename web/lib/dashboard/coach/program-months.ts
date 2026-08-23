import 'server-only';

import type { Sql, TransactionClient } from '@/lib/db';
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
  removeWeekFromMonth as _removeWeekFromMonth,
  cloneWeekTemplateRow,
  type ProgramMonthCreate,
  type ProgramMonthScratch,
  type MonthTemplateWeekFull,
  type MonthTemplateWithWeeks,
} from '@fahybrid/shared/domain/coach/program-months';
import {
  emptyWeekSlots,
  normalizeWeekSlots,
  parseWeekSlotsFromDb,
} from './program-week-slots';
import { upsertWeekTemplate } from './program-weeks';
import { loadCoachMaxMicrocicloWeeks } from '@/lib/coach/microcycle-limits';

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
 * TRANSACCIÓN PROPIA O AJENA (bug encontrado con la prueba de la card 135).
 *
 * Esta función abría SIEMPRE su propia transacción con `client.begin(...)`,
 * pero `updatePersonalTramoMeta` la llama desde DENTRO de una transacción para
 * alargar o acortar un tramo personal — y postgres.js no anida `begin`: un `tx`
 * expone `savepoint`, no `begin`. O sea que **cambiar el número de semanas de un
 * tramo personal reventaba siempre**, con un `client.begin is not a function`.
 * Nadie lo había visto porque no había prueba que pasara por ahí.
 *
 * Se arregla con `withOwnOrAmbientTx`, que este mismo fichero ya usaba para
 * exactamente este caso: si le llega el pool abre su transacción, y si le llega
 * un `tx` se mete dentro del que ya hay.
 */
export async function removeWeekFromMonth(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  week_id: number | bigint;
  client?: Sql | TransactionClient;
}): Promise<void> {
  return _removeWeekFromMonth({ ...params, client: params.client ?? defaultSql });
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
 * Crea un microciclo desde cero (AGNÓSTICO) + sus N semanas vacías + la junction
 * `program_month_weeks` (positions 0..N-1) en una transacción.
 *
 * `level_id` (athlete_levels) es DATO DEL COACH — la identidad del microciclo es
 * nombre + nivel + nº semanas (el orden en una secuencia ES la periodización; no
 * hay entidad fase). Cada semana hereda el `level_id`; nombre "{name} · Semana k";
 * `slots_json` = 7 días en descanso. `week_count` lo elige el coach (1..8).
 *
 * Local (no shared): usa `normalizeWeekSlots` de este surface.
 */
/**
 * Corre `fn` en una transacción del pool, o DIRECTO si `client` ya es un `tx`
 * (postgres.js no tiene `begin` anidado: el callback de `sql.begin` expone
 * `savepoint`). Así el botón del panel sigue igual (pool → begin propio) y un
 * compositor (MCP, importador) puede meter el cascarón en SU transacción.
 */
async function withOwnOrAmbientTx<T>(
  client: Sql | TransactionClient,
  fn: (tx: Sql | TransactionClient) => Promise<T>,
): Promise<T> {
  if (typeof (client as Sql).begin === 'function') {
    return (client as Sql).begin((tx) => fn(tx)) as Promise<T>;
  }
  return fn(client);
}

export async function createMonthTemplateWithEmptyWeeks(params: {
  coach_id: number | bigint;
  payload: unknown;
  client?: Sql | TransactionClient;
}): Promise<{ id: string; weeks: Array<{ id: string; week_index: number }> }> {
  const parsed = programMonthScratchSchema.safeParse(params.payload);
  if (!parsed.success) {
    throw new ProgramMonthError('invalid_payload', parsed.error.message, 400);
  }
  const body: ProgramMonthScratch = parsed.data;
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const slotsJson = emptyWeekSlotsJson();

  return withOwnOrAmbientTx(client, async (tx) => {
    // Level must be one of THIS coach's athlete_levels (level_id is the value).
    const levels = await tx<Array<{ id: string }>>`
      select id::text from athlete_levels
      where coach_id = ${coach_id}
      order by sort_order asc, id asc
    `;
    const rank = levels.findIndex((l) => l.id === String(body.level_id));
    if (rank < 0) {
      throw new ProgramMonthError('invalid_level', 'El nivel no pertenece a este coach', 400);
    }

    // El zod de `programMonthScratchSchema` sólo aplica el techo ABSOLUTO del
    // sistema (26) — aquí SÍ sabemos quién es el coach, así que se comprueba
    // su tope real (`coaches.max_microcycle_weeks`, card 135).
    const maxWeeks = await loadCoachMaxMicrocicloWeeks({ coach_id, client: tx });
    if (body.week_count > maxWeeks) {
      throw new ProgramMonthError(
        'week_count_too_long',
        `Un bloque tuyo no pasa de ${maxWeeks} ${maxWeeks === 1 ? 'semana' : 'semanas'}.`,
        400,
      );
    }

    const monthRows = await tx<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name, level_id)
      values (
        ${coach_id}, ${body.name}, ${body.level_id}
      )
      returning id::text
    `;
    const monthId = monthRows[0]!.id;
    const weeks: Array<{ id: string; week_index: number }> = [];

    for (let i = 0; i < body.week_count; i++) {
      const weekName = `${body.name} · Semana ${i + 1}`;
      const weekRows = await tx<Array<{ id: string }>>`
        insert into program_week_templates (
          coach_id, name, level_id, focus, slots_json
        )
        values (
          ${coach_id}, ${weekName}, ${body.level_id}, null, ${tx.json(slotsJson)}
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

    return { id: monthId, weeks };
  });
}

/**
 * Añade UNA semana vacía al final del microciclo (la operación "+ Añadir semana"
 * del editor): inserta una `program_week_templates` nueva con `slots_json` de 7
 * días en descanso, heredando el level_id del microciclo, y la
 * engancha en la junction en la posición `max(position)+1`. Devuelve la nueva
 * semana + su `week_index`. Ownership del microciclo validado. Transacción.
 *
 * Es la ruta "duplicar" SIN clonar contenido — comparte el patrón de inserción
 * en la junction (posición siguiente), sólo que con una semana en blanco.
 */
/**
 * TRANSACCIÓN PROPIA O AJENA (bug encontrado con la prueba de la card 135).
 *
 * Esta función abría SIEMPRE su propia transacción con `client.begin(...)`,
 * pero `updatePersonalTramoMeta` la llama desde DENTRO de una transacción para
 * alargar o acortar un tramo personal — y postgres.js no anida `begin`: un `tx`
 * expone `savepoint`, no `begin`. O sea que **cambiar el número de semanas de un
 * tramo personal reventaba siempre**, con un `client.begin is not a function`.
 * Nadie lo había visto porque no había prueba que pasara por ahí.
 *
 * Se arregla con `withOwnOrAmbientTx`, que este mismo fichero ya usaba para
 * exactamente este caso: si le llega el pool abre su transacción, y si le llega
 * un `tx` se mete dentro del que ya hay.
 */
export async function appendEmptyWeekToMonth(params: {
  coach_id: number | bigint;
  month_id: number | bigint;
  client?: Sql | TransactionClient;
}): Promise<{ id: string; week_index: number }> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const month_id = Number(params.month_id);
  const slotsJson = emptyWeekSlotsJson();

  let newWeekId = '';
  let newPosition = 0;

  await withOwnOrAmbientTx(client, async (tx) => {
    const monthRows = await tx<
      Array<{ name: string; level_id: string | null }>
    >`
      select name, level_id::text
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
        coach_id, name, level_id, focus, slots_json
      )
      values (
        ${coach_id}, ${weekName},
        ${month.level_id ? Number(month.level_id) : null},
        null, ${tx.json(slotsJson)}
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
 * CLON PURO: NO ajusta cargas/%RM/ritmos ni añade fechas. `exercise_id` y
 * `level_id` se conservan. `slots_json` se copia VERBATIM (jsonb).
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

    // Canonical week clone (shared): copies ALL content columns incl. slots_json
    // verbatim, athlete_profile and week_number — one source of truth, so this
    // path can never drift from the month/cell copy column list.
    newWeekId = await cloneWeekTemplateRow({ tx, coach_id, week_id, nameSuffix: ' (copia)' });

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

/** Who a microciclo belongs to (0164): null/null = shared library. Set = a
 *  personal plan for exactly that athlete — the editor reads this to hide
 *  library-only actions ("Asignar a atleta" doesn't apply to a plan already
 *  tied to one person) and show whose plan it is instead. */
export type MonthTemplateOwner = {
  athlete_id: string | null;
  athlete_name: string | null;
};

export type MonthTemplateWithWeeksOwned = Omit<MonthTemplateWithWeeks, 'month'> & {
  month: MonthTemplateWithWeeks['month'] & MonthTemplateOwner;
};

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
  client?: Sql | TransactionClient;
}): Promise<MonthTemplateWithWeeksOwned | null> {
  const client = params.client ?? defaultSql;

  // Level is AGNOSTIC: the coach's athlete_levels.name (via level_id), '' when no
  // level is set. There is no phase entity — the order of microciclos IS the
  // periodization. athlete_id/athlete_name (0164) surface ownership so the editor
  // can tell a personal plan apart from a library microciclo.
  const monthRows = await client<
    Array<{
      id: string;
      name: string;
      level: string;
      athlete_id: string | null;
      athlete_name: string | null;
    }>
  >`
    select
      m.id::text,
      m.name,
      coalesce(al.name, '') as level,
      m.athlete_id::text as athlete_id,
      ath.full_name as athlete_name
    from program_month_templates m
    left join athlete_levels al on al.id = m.level_id
    left join athletes ath on ath.id = m.athlete_id
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
      slots_json: unknown;
    }>
  >`
    select
      w.id::text,
      mw.position,
      w.name,
      coalesce(alw.name, '') as level,
      w.focus,
      w.coach_notes,
      w.slots_json
    from program_month_weeks mw
    join program_week_templates w on w.id = mw.week_template_id
    left join athlete_levels alw on alw.id = w.level_id
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
    slots_json: parseWeekSlotsFromDb(row.slots_json),
  }));

  return { month, weeks };
}

export type DeliveredWeekCounts = {
  /** Total `workout_assignments` reales del atleta que caen bajo estas semanas. */
  total_assignments: number;
  /** De las semanas-plantilla dadas, cuántas tienen al menos una asignación real. */
  weeks_with_content: number;
};

/**
 * Cuenta lo ENTREGADO (workout_assignments reales, no plantilla) para un set de
 * semanas de un microciclo PERSONAL. Un plan personal puede divergir: la
 * plantilla (`program_week_templates.slots_json`) es lo que se ESCRIBIÓ para
 * entregar, pero el atleta ejecuta `workout_assignments`, que pueden haber
 * nacido sueltas en el editor de día sin volver nunca a tocar la plantilla.
 * `microcycles.source_week_template_id` (0158) es el único hilo que conecta una
 * semana ya entregada con la plantilla de la que salió — sin él no hay forma de
 * saber que el atleta ya tiene trabajo aunque la plantilla esté vacía.
 *
 * UNA consulta batch. Scoped a coach_id + athlete_id explícitos (join contra
 * `athletes.coach_id`) — nunca puede leer trabajo de otro atleta.
 */
export async function loadDeliveredCountsForWeeks(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  week_template_ids: Array<number | bigint>;
  client?: Sql;
}): Promise<DeliveredWeekCounts> {
  if (params.week_template_ids.length === 0) {
    return { total_assignments: 0, weeks_with_content: 0 };
  }
  const client = params.client ?? defaultSql;
  const weekTemplateIds = params.week_template_ids.map((id) => Number(id));

  const rows = await client<Array<{ source_week_template_id: string; n: number }>>`
    select mc.source_week_template_id::text as source_week_template_id, count(*)::int as n
    from microcycles mc
    join workout_assignments wa on wa.microcycle_id = mc.id
    join athletes a on a.id = mc.athlete_id
    where a.coach_id = ${Number(params.coach_id)}
      and mc.athlete_id = ${Number(params.athlete_id)}
      and mc.source_week_template_id = any(${weekTemplateIds}::bigint[])
    group by mc.source_week_template_id
  `;

  return {
    total_assignments: rows.reduce((sum, r) => sum + r.n, 0),
    weeks_with_content: rows.length,
  };
}
