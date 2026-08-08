import 'server-only';

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, parseIsoDate, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { scheduleWeek1Calibration } from '@/lib/coach/schedule-calibration';
import { blockExerciseToItem, type BlockExerciseRow } from './blocks';
import { cloneTemplateAsInstance } from './template-instance';
import { getMonthTemplate } from './program-months';
import { getWeekTemplate } from './program-weeks';
import { parseWeekSlotsFromDb } from './program-week-slots';
import type {
  WeekSlots,
  WeekSession,
  WeekDayPart,
  WeekDayPartItem,
} from '@fahybrid/shared/schema/program-templates';
import type { CircuitConfig } from '@fahybrid/shared/schema/program-templates';
import { templateFormat, type TemplateFormat } from '@fahybrid/shared/schema/_primitives';
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
import { joinCoachOverride, visibleToCoach } from '@/lib/exercises/coach-override';

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
/** Every value the `template_format` enum accepts — the single shared source
 *  (canonical catalog ∪ legacy DB members). Block + template formats share it. */
const TEMPLATE_FORMATS: readonly TemplateFormat[] = templateFormat.options;
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

  // #34: is this the athlete's FIRST plan? If so, the week-1 calibration battery
  // is injected after materialization (checked BEFORE the receipt row is written).
  const priorPlans = await client<{ n: number }[]>`
    select count(*)::int as n from athlete_month_assignments
    where athlete_id = ${params.athlete_id as number}
  `;
  const isFirstPlan = (priorPlans[0]?.n ?? 0) === 0;

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

  let assignmentCount = 0;
  const microcycleIds: string[] = [];
  let monthAssignmentId = '0';

  await client.begin(async (tx) => {
    for (let wi = 0; wi < month.weeks.length; wi++) {
      const weekMeta = month.weeks[wi]!;
      const weekStart = addDays(startMonday, wi * 7);

      const weekRes = await instantiateWeekIntoMicrocycle({
        client: tx as unknown as Sql,
        coach_id: params.coach_id,
        athlete_id: params.athlete_id,
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

  // #34: on the athlete's FIRST plan, auto-schedule the week-1 calibration battery
  // (Fork A: auto + coach override). Best-effort — a battery hiccup must never fail
  // plan creation; idempotent so a re-materialize never double-injects.
  if (isFirstPlan && microcycleIds[0]) {
    try {
      await scheduleWeek1Calibration({
        client,
        coach_id: params.coach_id,
        athlete_id: params.athlete_id,
        week1_monday: startMonday,
        microcycle_id: microcycleIds[0],
      });
    } catch {
      // best-effort; the plan is the contract, the battery is additive.
    }
  }

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
 * atleta: resuelve/crea el microciclo (agnóstico — por `athlete_id` + solape de
 * fechas, SIN bloque/periodización) que cubre la semana y crea las
 * `workout_assignments` (+ templates inline materializados) de esa semana. ÚNICA
 * fuente de verdad de la lógica por-semana — la usan tanto el flujo por-mes
 * (`instantiateMonthFromTemplate`) como el por-microciclo. Debe ejecutarse dentro
 * de una transacción.
 */
export async function instantiateWeekIntoMicrocycle(params: {
  client: Sql;
  coach_id: number | bigint;
  athlete_id: number | bigint;
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
    week_start: weekStartIso,
    week_end: weekEndIso,
    week_number: params.week_number,
    week_template_id: params.week_template_id,
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

  // Step 5/6 intake — place sessions only on the athlete's `program` days and
  // softly honour their preferred day-TYPE layout. No availability declared →
  // remap is a no-op (template lands on its authored weekdays).
  //
  // #47 REPARTO A FUTURAS — este es EL punto de enganche: leemos la disponibilidad
  // FRESCA del atleta en cada materialización. Si el atleta edita su horario
  // (PATCH /api/athlete/availability), el cambio se aplica automáticamente a las
  // semanas que se materialicen a partir de ese momento. Las semanas ya
  // materializadas NO se re-reparten (sus filas workout_assignments quedan fijas).
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
        template_name_base: weekTpl.name,
        progression: params.progression,
      });
    }
  }

  return { microcycle_id: microId, assignment_count: assignmentCount };
}

export type ResyncWeekTemplateResult = {
  microcycles_checked: number;
  assignments_resynced: number;
};

/**
 * Resincroniza los microciclos YA ASIGNADOS que vinieron de esta plantilla de
 * semana (linaje de 0158) — se llama tras cada guardado del editor de día para
 * que una edición posterior de verdad llegue al atleta. Antes de esto, editar
 * una semana ya asignada se guardaba bien en la plantilla y nunca salía de
 * ahí: no había ni rastro de qué microciclos avisar (Alex, 7-ago: escribió una
 * nota para un ejercicio ya asignado y no llegó nunca al atleta).
 *
 * Reusa el MISMO motor que la asignación inicial — `instantiateWeekIntoMicrocycle`
 * vuelve a recorrer días/sesiones con el contenido fresco, y `insertSlotAssignment`
 * decide por slot: 'scheduled' → reemplaza el contenido materializado; cualquier
 * otro estado ('completed'/'partial'/'skipped'/'missed') → se deja intacto, el
 * atleta ya actuó sobre esa fila. Nunca inventa asignaciones nuevas fuera de las
 * que ya existían — resincroniza, no vuelve a repartir.
 *
 * Best-effort por microciclo, en su propia transacción: un atleta con un fallo
 * no debe bloquear a los demás ni el guardado del día que disparó esto.
 */
export async function resyncWeekTemplateAssignments(params: {
  coach_id: number | bigint;
  week_template_id: number | bigint;
  progression?: ProgressionSpec;
  client?: Sql;
}): Promise<ResyncWeekTemplateResult> {
  const client = params.client ?? defaultSql;

  const microcycles = await client<
    Array<{ id: string; athlete_id: string; start_date: string; week_number: number }>
  >`
    select id::text, athlete_id::text, start_date::text, week_number
    from microcycles
    where source_week_template_id = ${Number(params.week_template_id)}
  `;

  let assignments_resynced = 0;
  for (const mc of microcycles) {
    try {
      const result = await client.begin(async (tx) => {
        return instantiateWeekIntoMicrocycle({
          client: tx as unknown as Sql,
          coach_id: params.coach_id,
          athlete_id: Number(mc.athlete_id),
          week_template_id: params.week_template_id,
          week_start: parseIsoDate(mc.start_date),
          week_number: mc.week_number,
          progression: params.progression,
        });
      });
      assignments_resynced += result.assignment_count;
    } catch {
      // best-effort — ver comentario de la función.
    }
  }

  return { microcycles_checked: microcycles.length, assignments_resynced };
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

/**
 * Resuelve/crea el microciclo (semana) del atleta — AGNÓSTICO: el microciclo cuelga
 * directamente del `athlete_id` (sin bloque/macrociclo/periodización). Reusa el que
 * solapa con la ventana de la semana; si no existe, lo crea. `week_number` es un
 * contador monótono por atleta (la etiqueta "semana N de M" la deriva el receipt
 * `athlete_month_assignments`, no este número), así que un nuevo plan que reinicia en
 * 1 continúa pasado el máximo del atleta para evitar colisiones con el unique
 * `(athlete_id, week_number)`.
 *
 * `week_template_id` (0158) se escribe SIEMPRE que se conoce, tanto al crear como
 * al reusar uno existente — es el linaje que la resincronización usa para
 * encontrar qué microciclos avisar cuando el coach edita la plantilla después de
 * asignarla. `undefined` (entreno libre/import legacy sin plantilla detrás) deja
 * la columna como estaba, nunca la borra.
 */
async function resolveOrCreateMicrocycle(params: {
  client: Sql;
  athlete_id: number | bigint;
  week_start: string;
  week_end: string;
  week_number: number;
  week_template_id?: number | bigint;
}): Promise<string> {
  const db = params.client as Sql;
  const existing = await db<Array<{ id: string }>>`
    select mc.id::text
    from microcycles mc
    where mc.athlete_id = ${params.athlete_id as number}
      and mc.start_date <= ${params.week_end}::date
      and mc.end_date >= ${params.week_start}::date
    order by mc.start_date asc
    limit 1
  `;
  if (existing[0]) {
    if (params.week_template_id != null) {
      await db`
        update microcycles set source_week_template_id = ${Number(params.week_template_id)}
        where id = ${Number(existing[0].id)}
      `;
    }
    return existing[0].id;
  }

  const taken = await db<Array<{ max_week: number | null }>>`
    select max(week_number)::int as max_week
    from microcycles
    where athlete_id = ${params.athlete_id as number}
  `;
  const maxWeek = taken[0]?.max_week ?? 0;
  const weekNumber = params.week_number > maxWeek ? params.week_number : maxWeek + 1;

  const ins = await db<Array<{ id: string }>>`
    insert into microcycles (athlete_id, week_number, start_date, end_date, source_week_template_id)
    values (
      ${params.athlete_id as number},
      ${weekNumber},
      ${params.week_start}::date,
      ${params.week_end}::date,
      ${params.week_template_id != null ? Number(params.week_template_id) : null}
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
  template_name_base: string;
  progression?: ProgressionSpec;
}): Promise<number> {
  if (params.session.kind !== 'workout') return 0;

  // Dos formas de definir el workout de una sesión — en AMBAS la asignación
  // recibe un INSTANCE per-atleta (fork), nunca una referencia compartida a la
  // biblioteca (per-athlete plan bifurcation):
  //  1) `template_id` → referencia a un `templates` reutilizable: lo CLONAMOS en
  //     un instance per-atleta (cloneTemplateAsInstance) y apuntamos la
  //     asignación al clon → editar la biblioteca no propaga al atleta, y editar
  //     el atleta no toca la biblioteca ni a otros atletas.
  //  2) `blocks[]` inline → contenido editado en el week-studio: lo
  //     materializamos como un template propio de esta sesión, ya etiquetado
  //     como instance del atleta. (workout_assignments.template_id es NOT NULL y
  //     GET /athlete/plan/week hace join contra `templates`.)
  let templateId: number | null = null;
  let version = 1;

  if (params.session.template_id != null) {
    const instance = await cloneTemplateAsInstance({
      client: params.client,
      source_template_id: Number(params.session.template_id),
      athlete_id: params.athlete_id,
    });
    // Plantilla de origen desaparecida → nada que asignar.
    if (instance == null) return 0;
    templateId = instance.template_id;
    version = instance.version;
  } else {
    templateId = await materializeInlineSessionTemplate({
      client: params.client,
      coach_id: params.coach_id,
      athlete_id: params.athlete_id,
      session: params.session,
      name_base: params.template_name_base,
      progression: params.progression,
    });
    // Sesión sin template_id y sin bloques con ejercicios → nada que asignar.
    if (templateId == null) return 0;
  }

  // GUARDA DE DOBLE RESERVA. Materializar dos veces (dos clics del coach, o dos
  // vías distintas sobre el mismo atleta) insertaba un SEGUNDO juego completo de
  // sesiones en las mismas fechas, colgando del mismo microciclo y por tanto
  // indistinguible del bueno. No había ni unique en la tabla ni comprobación
  // aquí; las guardas existentes viven una capa por encima y ninguna mira la
  // fecha (`assign-sequence.ts` lo documentaba: «instantiateMonthFromTemplate
  // has NO dedup guard»).
  //
  // La identidad de una sesión materializada es (atleta, fecha, slot): el slot
  // vive en `notes` como `slot:am` / `slot:pm` / `slot:3`… (ver
  // `slotLabelForSessionIndex`), que es lo que este mismo insert escribe. Un
  // entreno LIBRE del atleta (origin 'self') o un test de calibración no llevan
  // ese `notes`, así que nunca bloquean — solo se deduplica contra otra
  // materialización del mismo hueco.
  //
  // `on conflict` no sirve: la tabla no tiene índice único que lo soporte y
  // añadirlo retroactivamente rompería los días con varias sesiones legítimas.
  //
  // El `status` decide qué hacer con el duplicado, no solo si lo hay. Mientras
  // sigue 'scheduled' el atleta no ha tocado nada — es seguro REEMPLAZAR su
  // contenido por el recién materializado (resincronizar una edición posterior
  // del coach, 0158). En cualquier otro estado ('completed'/'partial'/'skipped'/
  // 'missed') el atleta ya actuó sobre esa fila: se deja intacta, siempre — la
  // misma guarda que usa `markAssignmentDoneFromDevice` (lib/sync/assignment-status.ts).
  const dup = await params.client<Array<{ id: string; status: string }>>`
    select id::text, status::text from workout_assignments
    where athlete_id = ${params.athlete_id as number}
      and scheduled_for = ${params.scheduled_for}::date
      and notes = ${`slot:${params.slot}`}
    limit 1
  `;
  if (dup.length > 0) {
    if (dup[0]!.status !== 'scheduled') return 0;
    await params.client`
      update workout_assignments
      set template_id = ${templateId}, template_version = ${version}, updated_at = now()
      where id = ${Number(dup[0]!.id)}
    `;
    return 1;
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
 *
 * ⚠️ NO ES CÓDIGO MUERTO — ES EL LECTOR DE LOS DATOS VIEJOS. NO LO BORRES.
 *
 * Ninguna vía NUEVA depende de esto: al insertar un bloque desde la Biblioteca en
 * el editor de día se COPIA la estructura (items ya vienen llenos, ver
 * `library-block-to-editor.ts`), así que aquí esos parts pasan de largo. Pero en
 * `slots_json` de las semanas YA ESCRITAS viven **39 parts** con `source_block_id`
 * y `items: []` (verificado contra prod, jul-2026: 39 de 379 parts, y los 39
 * tienen items vacío) — esos SIGUEN resolviéndose aquí, al asignar. Si esto se
 * "limpia" por no encontrarle llamadores nuevos, esas 39 piezas se materializan
 * VACÍAS y el atleta recibe un entreno sin ejercicios.
 *
 * Lo mismo aplica al `items: []` de `createPartFromLibraryBlock` (block-to-part.ts):
 * es la otra mitad de este contrato, no un olvido.
 *
 * `coachId` — el nombre de cada ejercicio hidratado es el MERGED (override del
 * coach si renombró la base, si no la base, 0132). El `source_block_id` llega
 * aquí por FK desde un part ya scoped a este coach; el join es solo para el
 * nombre — NUNCA le añadas un filtro de visibilidad.
 */
export async function hydrateBlockParts(
  client: Sql,
  coachId: number | bigint,
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
           be.exercise_id::text, coalesce(ceo.name, e.name) as exercise_name,
           be.params_json, be.prescription_json, be.notes
    from block_exercises be
    join exercises e on e.id = be.exercise_id
    ${joinCoachOverride(client, coachId)}
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
  /** Owner of the per-athlete instance this inline session materializes into. */
  athlete_id: number | bigint;
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
  const blocks = await hydrateBlockParts(params.client, params.coach_id, rawBlocks);
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
  // Filters out both non-existent ids AND ids belonging to another coach — a
  // referenced id here arrives verbatim from the session's own JSON blocks,
  // not by FK from an already-scoped row, so it must be resolved through the
  // same visibility every enumeration/resolver uses (mig 0132).
  const existingRows = await params.client<Array<{ id: string }>>`
    select e.id::text from exercises e
    where e.id = any(${referencedIds}::bigint[])
      and ${visibleToCoach(params.client, params.coach_id)}
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

  // Materialized inline content is per-athlete by construction → tag it as that
  // athlete's instance (instance_athlete_id) so it's a fork from birth and the
  // coach library (which filters instance_athlete_id IS NULL) never lists it.
  // No `instance_of_template_id`: inline content has no library source template.
  const tplRows = await params.client<Array<{ id: string }>>`
    insert into templates (
      coach_id, name, format, is_draft, coach_notes,
      instance_athlete_id
    )
    values (
      ${params.coach_id as number},
      ${name},
      ${format}::template_format,
      false,
      ${coachNotes},
      ${params.athlete_id as number}
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
    let itemsInBlock = 0;
    for (const item of block.items ?? []) {
      if (!existingExerciseIds.has(Number(item.exercise_id))) continue;
      itemsInBlock++;
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

    // Circuito (docs/DECISIONS.md, 2026-08-08): copia la config del bloque a
    // template_blocks — solo si sobrevivió al menos un item real (si el bloque
    // se quedó sin ejercicios existentes, no hay a qué block_position apuntar).
    if (block.circuit && itemsInBlock > 0) {
      await insertTemplateBlockCircuit(params.client, templateId, bi, block.circuit);
    }
  }

  return templateId;
}

// Circuito (docs/DECISIONS.md, 2026-08-08): una fila por (template_id,
// block_position) — nunca duplicado por item, esa duplicación era el bug que la
// decisión original corrigió del otro lado. Usada por cada materializador que
// copia un WeekDayPart a template_segments (hoy solo el inline; el de la
// Biblioteca de sesiones no pasa por bloques de día).
export async function insertTemplateBlockCircuit(
  client: Sql | TransactionClient,
  templateId: number,
  blockPosition: number,
  circuit: CircuitConfig,
): Promise<void> {
  const workSeconds = circuit.pacing.kind === 'por_reloj' ? circuit.pacing.work_seconds : null;
  await client`
    insert into template_blocks (
      template_id, block_position, rounds, pacing, work_seconds,
      rest_between_stations_seconds, rest_between_rounds_seconds
    )
    values (
      ${templateId}, ${blockPosition}, ${circuit.rounds}, ${circuit.pacing.kind}, ${workSeconds},
      ${circuit.rest_between_stations_seconds ?? null}, ${circuit.rest_between_rounds_seconds ?? null}
    )
    on conflict (template_id, block_position) do update set
      rounds = excluded.rounds,
      pacing = excluded.pacing,
      work_seconds = excluded.work_seconds,
      rest_between_stations_seconds = excluded.rest_between_stations_seconds,
      rest_between_rounds_seconds = excluded.rest_between_rounds_seconds,
      updated_at = now()
  `;
}
