import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, parseIsoDate, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { blockExerciseToItem, type BlockExerciseRow } from './blocks';
import { getMonthTemplate } from './program-months';
import { getWeekTemplate } from './program-weeks';
import { parseWeekSlotsFromDb } from './program-week-slots';
import type {
  WeekSlots,
  WeekSession,
  WeekDayPart,
  WeekDayPartItem,
} from '@fahybrid/shared/schema/program-templates';
import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import {
  applyProgression,
  safeParsePrescription,
  type ProgressionSpec,
} from '@fahybrid/shared/domain/prescription';
import {
  parseAvailability,
  parsePreferredWeek,
  remapWeekDaysToAvailability,
  type Availability,
  type PreferredWeek,
} from '@fahybrid/shared/domain/coach/intake-availability';

/**
 * Validate + wrap an item's structured prescription for the `prescription_json`
 * JSONB column. Returns `null` (column stays NULL → params_json fallback) when
 * absent or invalid; never persists a malformed shape.
 *
 * When `progression` is supplied (a repeated sequence loop), the parsed dose is
 * scaled by the coach's per-loop lever BEFORE persisting — scoped strictly to the
 * configured dimension (loads | volume | pace). A factor-1 spec (loops 0 / pct 0)
 * is a no-op, so the verbatim path stays byte-identical.
 */
function toSegmentPrescriptionJson(
  client: Sql,
  prescription: unknown,
  progression?: ProgressionSpec,
) {
  if (prescription == null) return null;
  const parsed = safeParsePrescription(prescription);
  if (!parsed.success) return null;
  const dose = progression ? applyProgression(parsed.data, progression) : parsed.data;
  return client.json(JSON.parse(JSON.stringify(dose)) as Parameters<typeof client.json>[0]);
}

/** template.format is NOT NULL; used when an inline session has no usable block format. */
const DEFAULT_TEMPLATE_FORMAT: TemplateFormat = 'circuit';
/** Block format → template format. Both share the template_format enum domain. */
const TEMPLATE_FORMATS: readonly TemplateFormat[] = [
  'amrap',
  'for_time',
  'emom',
  'intervals',
  'strength_block',
  'hyrox_sim',
  'tempo',
  'circuit',
];
/** templates.target_block enum domain. Microciclos no longer carry a block hint
 *  (identity = name + level + nº weeks; order = periodization), so materialized
 *  templates target 'any'. */
const TARGET_BLOCKS = ['ACC', 'TRANS', 'REAL', 'any'] as const;

/**
 * Etiqueta de slot a partir del índice de sesión del día. ÚNICA fuente de verdad
 * compartida por el materializador y el preview de publicación (mismo mapeo que
 * iOS espera vía `slotFromNotes`): idx 0 → 'am', idx 1 → 'pm', idx 2+ → 'slot:N'.
 */
export function slotLabelForSessionIndex(i: number): 'am' | 'pm' | `slot:${number}` {
  return i === 0 ? 'am' : i === 1 ? 'pm' : `slot:${i + 1}`;
}

export type InstantiateMonthResult = {
  month_assignment_id: string;
  assignment_count: number;
  start_date: string;
  end_date: string;
  microcycle_ids: string[];
};

export class InstantiateProgramError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'InstantiateProgramError';
  }
}

export async function instantiateMonthFromTemplate(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  month_template_id: number | bigint;
  start_date: string;
  /** Per-loop progressive-overload to scale doses by (repeated sequence loops). */
  progression?: ProgressionSpec;
  client?: Sql;
}): Promise<InstantiateMonthResult> {
  const client = params.client ?? defaultSql;

  const athleteRows = await client<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${params.athlete_id as number}
      and coach_id = ${params.coach_id as number}
    limit 1
  `;
  if (!athleteRows[0]) {
    throw new InstantiateProgramError('not_found', 'Athlete not found', 404);
  }

  const month = await getMonthTemplate({
    coach_id: params.coach_id,
    id: params.month_template_id,
    client,
  });
  if (!month) {
    throw new InstantiateProgramError('not_found', 'Month template not found', 404);
  }
  if (month.weeks.length === 0) {
    throw new InstantiateProgramError('empty_month', 'Month template has no weeks', 400);
  }

  const startMonday = mondayOfWeek(parseIsoDate(params.start_date));
  const startIso = isoDateString(startMonday);
  const weekCount = month.weeks.length;
  const endIso = isoDateString(addDays(startMonday, weekCount * 7 - 1));

  const macro = await ensureMacrocycleForMonthAssign({
    client,
    athlete_id: Number(params.athlete_id),
    startMonday,
    weekCount,
  });

  let assignmentCount = 0;
  const microcycleIds: string[] = [];
  let monthAssignmentId = '0';

  await client.begin(async (tx) => {
    if (macro.status === 'planned') {
      await tx`
        update atr_macrocycles set status = 'active', updated_at = now()
        where id = ${Number(macro.id)}
      `;
    }

    for (let wi = 0; wi < month.weeks.length; wi++) {
      const weekMeta = month.weeks[wi]!;
      const weekStart = addDays(startMonday, wi * 7);

      const weekRes = await instantiateWeekIntoMicrocycle({
        client: tx as unknown as Sql,
        coach_id: params.coach_id,
        athlete_id: params.athlete_id,
        macrocycle_id: macro.id,
        week_template_id: Number(weekMeta.week_template_id),
        week_start: weekStart,
        week_number: wi + 1,
        progression: params.progression,
      });
      microcycleIds.push(weekRes.microcycle_id);
      assignmentCount += weekRes.assignment_count;
    }

    const assignRows = await tx<Array<{ id: string }>>`
      insert into athlete_month_assignments (
        athlete_id,
        month_template_id,
        start_date,
        end_date,
        microcycle_ids,
        assignment_count,
        created_by_coach_id
      )
      values (
        ${params.athlete_id as number},
        ${params.month_template_id as number},
        ${startIso}::date,
        ${endIso}::date,
        ${microcycleIds.map(Number)}::bigint[],
        ${assignmentCount},
        ${params.coach_id as number}
      )
      returning id::text
    `;
    monthAssignmentId = assignRows[0]!.id;
  });

  return {
    month_assignment_id: monthAssignmentId,
    assignment_count: assignmentCount,
    start_date: startIso,
    end_date: endIso,
    microcycle_ids: microcycleIds,
  };
}

/**
 * Materializa UNA semana (un program_week_template) dentro de un microciclo del
 * atleta: resuelve/crea el microciclo bajo el bloque ATR que cubre la semana y
 * crea las `workout_assignments` (+ templates inline materializados) de esa
 * semana. ÚNICA fuente de verdad de la lógica por-semana — la usan tanto el
 * flujo por-mes (`instantiateMonthFromTemplate`) como el por-microciclo
 * (`instantiateWeekForAthlete`). Debe ejecutarse dentro de una transacción.
 */
export async function instantiateWeekIntoMicrocycle(params: {
  client: Sql;
  coach_id: number | bigint;
  athlete_id: number | bigint;
  macrocycle_id: string;
  week_template_id: number | bigint;
  /** Lunes de la semana destino. */
  week_start: Date;
  /** week_number del microciclo (1-based dentro del plan). */
  week_number: number;
  /** Per-loop progressive-overload to scale doses by (repeated sequence loops). */
  progression?: ProgressionSpec;
}): Promise<{ microcycle_id: string; assignment_count: number }> {
  const weekStart = params.week_start;
  const weekEnd = addDays(weekStart, 6);
  const weekStartIso = isoDateString(weekStart);
  const weekEndIso = isoDateString(weekEnd);

  const microId = await resolveOrCreateMicrocycle({
    client: params.client,
    athlete_id: params.athlete_id,
    macrocycle_id: params.macrocycle_id,
    week_start: weekStartIso,
    week_end: weekEndIso,
    week_number: params.week_number,
  });

  const weekTpl = await getWeekTemplate({
    coach_id: params.coach_id,
    id: Number(params.week_template_id),
    client: params.client,
  });
  if (!weekTpl) {
    throw new InstantiateProgramError(
      'week_not_found',
      `Week template ${params.week_template_id} missing`,
      400,
    );
  }

  const slots: WeekSlots =
    typeof weekTpl.slots_json === 'object' && weekTpl.slots_json !== null
      ? (weekTpl.slots_json as WeekSlots)
      : parseWeekSlotsFromDb(weekTpl.slots_json);

  const targetBlock: (typeof TARGET_BLOCKS)[number] = 'any';

  // Step 5/6 intake — place sessions only on the athlete's `program` days and
  // softly honour their preferred day-TYPE layout. No availability declared →
  // remap is a no-op (template lands on its authored weekdays).
  const prefs = await loadAthleteSchedulePrefs(params.client, params.athlete_id);
  const placedDays = remapWeekDaysToAvailability({
    days: slots.days,
    availability: prefs.availability,
    preferredWeek: prefs.preferredWeek,
  }).days;

  let assignmentCount = 0;
  for (const day of placedDays) {
    const dayDate = addDays(weekStart, day.day_of_week - 1);
    const dayIso = isoDateString(dayDate);
    for (let i = 0; i < day.sessions.length; i++) {
      const session = day.sessions[i]!;
      const slotLabel = slotLabelForSessionIndex(i);
      assignmentCount += await insertSlotAssignment({
        client: params.client,
        coach_id: params.coach_id,
        athlete_id: params.athlete_id,
        microcycle_id: microId,
        scheduled_for: dayIso,
        slot: slotLabel,
        session,
        target_block: targetBlock,
        template_name_base: weekTpl.name,
        progression: params.progression,
      });
    }
  }

  return { microcycle_id: microId, assignment_count: assignmentCount };
}

/**
 * Carga las preferencias de calendario del atleta (Step 5 disponibilidad +
 * Step 6 semana preferida) para condicionar EN QUÉ días caen las sesiones.
 * Defensiva: si las columnas vienen vacías/null devuelve objetos vacíos → el
 * remap es identidad (la plantilla cae en sus weekdays originales).
 */
async function loadAthleteSchedulePrefs(
  client: Sql,
  athlete_id: number | bigint,
): Promise<{ availability: Availability; preferredWeek: PreferredWeek }> {
  const rows = await client<Array<{ availability_json: unknown; preferred_week_json: unknown }>>`
    select availability_json, preferred_week_json
    from athletes
    where id = ${athlete_id as number}
    limit 1
  `;
  const r = rows[0];
  return {
    availability: parseAvailability(r?.availability_json),
    preferredWeek: parsePreferredWeek(r?.preferred_week_json),
  };
}

/** Crea macrociclo mínimo en primer assign si intake aún no lo materializó. */
async function ensureMacrocycleForMonthAssign(params: {
  client: Sql;
  athlete_id: number;
  startMonday: Date;
  weekCount: number;
}): Promise<{ id: string; status: string }> {
  const startIso = isoDateString(params.startMonday);
  const endIso = isoDateString(addDays(params.startMonday, params.weekCount * 7 - 1));

  const existing = await params.client<Array<{ id: string; status: string }>>`
    select id::text, status::text
    from atr_macrocycles
    where athlete_id = ${params.athlete_id}
      and status in ('planned', 'active')
    order by start_date desc
    limit 1
  `;
  if (existing[0]) {
    // Reusing the athlete's active macro for a SUBSEQUENT microciclo (the sequence
    // walk's next item, or a second assign-month). The macro + its blocks were sized
    // for the PRIOR window, so a forward window can fall past the last block — which
    // makes resolveOrCreateMicrocycle throw `no_block`. Extend the macro and its
    // latest block forward to cover the new window. Idempotent: greatest() never
    // shrinks an already-covering range, so the in-range case is a no-op.
    await params.client`
      update atr_macrocycles
      set end_date = greatest(end_date, ${endIso}::date), updated_at = now()
      where id = ${Number(existing[0].id)}
    `;
    await params.client`
      update atr_blocks
      set end_date = greatest(end_date, ${endIso}::date)
      where id = (
        select id from atr_blocks
        where macrocycle_id = ${Number(existing[0].id)}
        order by position desc, end_date desc
        limit 1
      )
    `;
    return existing[0];
  }

  const ins = await params.client<Array<{ id: string; status: string }>>`
    insert into atr_macrocycles (athlete_id, target_event_id, start_date, end_date, status)
    values (
      ${params.athlete_id},
      null,
      ${startIso}::date,
      ${endIso}::date,
      'active'
    )
    returning id::text, status::text
  `;
  const macroId = ins[0]!.id;

  await params.client`
    insert into atr_blocks (macrocycle_id, type, position, start_date, end_date, status)
    values (
      ${Number(macroId)},
      'ACC',
      0,
      ${startIso}::date,
      ${endIso}::date,
      'active'
    )
  `;

  return { id: macroId, status: 'active' };
}

async function resolveOrCreateMicrocycle(params: {
  client: Sql;
  athlete_id: number | bigint;
  macrocycle_id: string;
  week_start: string;
  week_end: string;
  week_number: number;
}): Promise<string> {
  const db = params.client as Sql;
  const existing = await db<Array<{ id: string }>>`
    select mc.id::text
    from microcycles mc
    join atr_blocks b on b.id = mc.block_id
    where b.macrocycle_id = ${Number(params.macrocycle_id)}
      and mc.start_date <= ${params.week_end}::date
      and mc.end_date >= ${params.week_start}::date
    order by mc.start_date asc
    limit 1
  `;
  if (existing[0]) return existing[0].id;

  const blockRows = await db<Array<{ id: string }>>`
    select b.id::text
    from atr_blocks b
    where b.macrocycle_id = ${Number(params.macrocycle_id)}
      and b.start_date <= ${params.week_end}::date
      and b.end_date >= ${params.week_start}::date
    order by b.position asc
    limit 1
  `;
  const blockId = blockRows[0]?.id;
  if (!blockId) {
    throw new InstantiateProgramError(
      'no_block',
      'No ATR block covers the assignment week range',
      400,
    );
  }

  // week_number is unique within a block (microcycles_week_unique). The caller
  // numbers weeks 1..N PER microciclo; when a block already holds microcycles from
  // a PRIOR microciclo (the sequence walk's earlier item, or a second assign-month
  // sharing the reused/extended block) that restart-at-1 collides. Use the passed
  // number when it's free, else continue past the block's current max — keeping the
  // intuitive 1..N for a fresh block (no change to the common case) while making
  // sequential microciclos in one block monotonic and collision-free.
  const taken = await db<Array<{ max_week: number | null }>>`
    select max(week_number)::int as max_week
    from microcycles
    where block_id = ${Number(blockId)}
  `;
  const maxWeek = taken[0]?.max_week ?? 0;
  const weekNumber = params.week_number > maxWeek ? params.week_number : maxWeek + 1;

  const ins = await db<Array<{ id: string }>>`
    insert into microcycles (block_id, week_number, start_date, end_date)
    values (
      ${Number(blockId)},
      ${weekNumber},
      ${params.week_start}::date,
      ${params.week_end}::date
    )
    returning id::text
  `;
  return ins[0]!.id;
}

async function insertSlotAssignment(params: {
  client: Sql;
  coach_id: number | bigint;
  athlete_id: number | bigint;
  microcycle_id: string;
  scheduled_for: string;
  slot: 'am' | 'pm' | `slot:${number}`;
  session: WeekSession;
  target_block: (typeof TARGET_BLOCKS)[number];
  template_name_base: string;
  progression?: ProgressionSpec;
}): Promise<number> {
  if (params.session.kind !== 'workout') return 0;

  // Dos formas de definir el workout de una sesión:
  //  1) `template_id` → referencia a un `templates` reutilizable existente.
  //  2) `blocks[]` inline → contenido editado en el week-studio sin template
  //     reutilizable; lo materializamos como un template (+ segments) propio
  //     de esta sesión para poder referenciarlo (workout_assignments.template_id
  //     es NOT NULL y GET /athlete/plan/week hace join contra `templates`).
  let templateId: number | null = null;
  let version = 1;

  if (params.session.template_id != null) {
    templateId = Number(params.session.template_id);
    const versionRows = await params.client<Array<{ version: number }>>`
      select coalesce(max(version), 1)::int as version
      from templates where id = ${templateId}
    `;
    version = versionRows[0]?.version ?? 1;
  } else {
    templateId = await materializeInlineSessionTemplate({
      client: params.client,
      coach_id: params.coach_id,
      target_block: params.target_block,
      session: params.session,
      name_base: params.template_name_base,
      progression: params.progression,
    });
    // Sesión sin template_id y sin bloques con ejercicios → nada que asignar.
    if (templateId == null) return 0;
  }

  await params.client`
    insert into workout_assignments (
      athlete_id,
      microcycle_id,
      scheduled_for,
      template_id,
      template_version,
      status,
      notes
    )
    values (
      ${params.athlete_id as number},
      ${Number(params.microcycle_id)},
      ${params.scheduled_for}::date,
      ${templateId},
      ${version},
      'scheduled',
      ${`slot:${params.slot}`}
    )
  `;
  return 1;
}

/**
 * Hidrata los parts de Biblioteca de Bloques con sus `block_exercises`.
 *
 * Para cada part con `source_block_id` y sin `items` propios, carga las filas
 * estructuradas de `block_exercises` (0038) y las convierte en `WeekDayPartItem`
 * (exercise_id + params_json canónicos + block_position espejado). Los parts que
 * ya traen items (a medida o ya hidratados) o sin `source_block_id` se devuelven
 * intactos. Un único query batch para todos los block_ids de la sesión.
 */
export async function hydrateBlockParts(
  client: Sql,
  parts: WeekDayPart[],
): Promise<WeekDayPart[]> {
  const blockIds = Array.from(
    new Set(
      parts
        .filter((p) => p.source_block_id != null && (p.items?.length ?? 0) === 0)
        .map((p) => Number(p.source_block_id)),
    ),
  );
  if (blockIds.length === 0) return parts;

  const rows = await client<BlockExerciseRow[]>`
    select be.block_id::text, be.position, be.block_position,
           be.exercise_id::text, e.name as exercise_name,
           be.params_json, be.prescription_json, be.notes
    from block_exercises be
    join exercises e on e.id = be.exercise_id
    where be.block_id = any(${blockIds}::bigint[])
    order by be.block_id, be.position
  `;

  // group exercises by block_id, preserving position order. Mapeo compartido
  // (blockExerciseToItem) con el endpoint GET /api/coach/blocks/[id] → mismo shape.
  const byBlock = new Map<number, WeekDayPartItem[]>();
  for (const r of rows) {
    const bid = Number(r.block_id);
    const list = byBlock.get(bid) ?? [];
    list.push(blockExerciseToItem(r));
    byBlock.set(bid, list);
  }

  return parts.map((p) => {
    if (p.source_block_id == null || (p.items?.length ?? 0) > 0) return p;
    const items = byBlock.get(Number(p.source_block_id));
    if (!items || items.length === 0) return p; // needs_review block → keep verbatim
    return { ...p, items };
  });
}

/**
 * Materializa los `blocks[]` inline de una sesión de week-template como un
 * `templates` row + `template_segments`, espejando el shape que produce el
 * week-studio (block_position/block_format/block_title por bloque, position
 * global por ejercicio). Devuelve el id del template creado, o null si la
 * sesión no tiene ningún ejercicio (no hay nada que asignar).
 */
async function materializeInlineSessionTemplate(params: {
  client: Sql;
  coach_id: number | bigint;
  target_block: (typeof TARGET_BLOCKS)[number];
  session: WeekSession;
  name_base: string;
  progression?: ProgressionSpec;
}): Promise<number | null> {
  const rawBlocks: WeekDayPart[] = params.session.blocks ?? [];
  // Hidrata los parts insertados desde la Biblioteca de Bloques (0037/0038):
  // un part con `source_block_id` y sin `items` propios materializa los
  // `block_exercises` estructurados del bloque (ejercicios reales del catálogo +
  // params canónicos). Si el bloque NO tiene estructura (needs_review), se queda
  // sin items y degrada a nota verbatim vía coach_note (comportamiento previo).
  const blocks = await hydrateBlockParts(params.client, rawBlocks);
  const totalItems = blocks.reduce((n, b) => n + (b.items?.length ?? 0), 0);
  if (totalItems === 0) return null;

  // template_segments.exercise_id es FK NOT NULL → un ejercicio fantasma
  // (id de un seed antiguo que ya no existe) reventaría toda la asignación.
  // Filtramos a los exercise_id que existen de verdad; si una sesión se queda
  // sin ninguno, la saltamos (return null) en vez de crear un template vacío.
  const referencedIds = Array.from(
    new Set(
      blocks.flatMap((b) => (b.items ?? []).map((it) => Number(it.exercise_id))),
    ),
  );
  const existingRows = await params.client<Array<{ id: string }>>`
    select id::text from exercises where id = any(${referencedIds}::bigint[])
  `;
  const existingExerciseIds = new Set(existingRows.map((r) => Number(r.id)));
  if (existingExerciseIds.size === 0) return null;

  // format del template = primer block format válido, o fallback.
  const firstFormat = blocks.find((b) =>
    (TEMPLATE_FORMATS as readonly string[]).includes(b.format),
  )?.format;
  const format = (firstFormat ?? DEFAULT_TEMPLATE_FORMAT) as TemplateFormat;

  const name = (params.session.focus?.trim() || params.name_base).slice(0, 200);
  const coachNotes = params.session.notes ?? null;

  const tplRows = await params.client<Array<{ id: string }>>`
    insert into templates (
      coach_id, name, format, target_block, is_draft, coach_notes
    )
    values (
      ${params.coach_id as number},
      ${name},
      ${format}::template_format,
      ${params.target_block}::target_block,
      false,
      ${coachNotes}
    )
    returning id::text
  `;
  const templateId = Number(tplRows[0]!.id);

  let position = 0;
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]!;
    const blockFormat = (TEMPLATE_FORMATS as readonly string[]).includes(block.format)
      ? block.format
      : null;
    for (const item of block.items ?? []) {
      if (!existingExerciseIds.has(Number(item.exercise_id))) continue;
      const paramsJson = JSON.parse(
        JSON.stringify(item.params_json ?? {}, (_, v) =>
          typeof v === 'bigint' ? Number(v) : v,
        ),
      );
      // 0043: carry the structured per-set prescription forward into the
      // materialized segment so the dosage survives materialization. We validate
      // defensively (a malformed shape is dropped, not persisted). params_json
      // remains as the scalar fallback alongside it.
      const prescriptionJson = toSegmentPrescriptionJson(
        params.client,
        item.prescription_json,
        params.progression,
      );
      await params.client`
        insert into template_segments (
          template_id, position, block_position, block_title, block_format,
          exercise_id, params_json, notes, prescription_json
        )
        values (
          ${templateId},
          ${position},
          ${bi},
          ${block.title ?? null},
          ${blockFormat},
          ${Number(item.exercise_id)},
          ${params.client.json(paramsJson)},
          ${item.notes ?? null},
          ${prescriptionJson}
        )
      `;
      position++;
    }
  }

  return templateId;
}
