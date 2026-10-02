import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, parseIsoDate, mondayOfWeek } from '@fahybrid/shared/domain/dates';
import { scheduleWeek1Calibration } from '@/lib/coach/schedule-calibration';
import {
  resolveSessionsContent,
  sessionLabel,
  type DroppedSession,
} from './session-content';
import { getMonthTemplate } from './program-months';
import { getWeekTemplate } from './program-weeks';
import { parseWeekSlotsFromDb } from './program-week-slots';
import type {
  WeekSlots,
} from '@fahybrid/shared/schema/program-templates';
import type { ProgressionSpec } from '@fahybrid/shared/domain/prescription';
import { insertSlotAssignment, pruneRemovedSlotAssignments } from './program-slot-assignment';
import { resyncAssignedWeekTemplates } from './resync-program-week';
import {
  parseAvailability,
  parsePreferredWeek,
  remapWeekDaysToAvailability,
  type Availability,
  type PreferredWeek,
} from '@fahybrid/shared/domain/coach/intake-availability';

// El desglose de bloques de biblioteca vive con el veredicto de sesiones; se sigue
// exportando desde aquí porque es donde lo importan los demás.
export { hydrateBlockParts } from './session-content';

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
  /** Sesiones que no se han podido crear (o se han creado incompletas) y por qué. */
  dropped_sessions: DroppedSession[];
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

/** SQLSTATE 23P01 = exclusion_violation — the 0166 GiST constraint on
 *  athlete_month_assignments firing. Same inline-check style as the codebase's
 *  other Postgres-error translations (e.g. delete-exercise.ts's 23503 check). */
function isExclusionViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23P01';
}

export async function instantiateMonthFromTemplate(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  month_template_id: number | bigint;
  start_date: string;
  /** Semana del plan (1-based) por la que arranca este atleta. Por defecto 1
   *  (desde el principio). Un atleta que se incorpora a mitad de mesociclo
   *  puede entrar directamente en, p. ej., la semana 3 — solo se materializan
   *  las semanas desde esa en adelante, alineado con el resto del grupo. */
  start_week_number?: number;
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
  const totalWeeks = month.weeks.length;

  // #114: semana de entrada — por defecto la 1 (desde el principio). Validada
  // contra el nº real de semanas de la plantilla: no se puede entrar más allá
  // del final del plan.
  const entryWeekNumber = params.start_week_number ?? 1;
  if (entryWeekNumber > totalWeeks) {
    throw new InstantiateProgramError(
      'invalid_start_week',
      `Este plan tiene ${totalWeeks} semana${totalWeeks === 1 ? '' : 's'}; no se puede entrar en la semana ${entryWeekNumber}.`,
      400,
    );
  }
  const entryWeekIndex = entryWeekNumber - 1; // 0-based, índice en month.weeks
  const remainingWeeks = month.weeks.slice(entryWeekIndex);
  const weekCount = remainingWeeks.length;
  const endIso = isoDateString(addDays(startMonday, weekCount * 7 - 1));

  let assignmentCount = 0;
  const microcycleIds: string[] = [];
  const droppedSessions: DroppedSession[] = [];
  let monthAssignmentId = '0';

  try {
    await client.begin(async (tx) => {
      for (let i = 0; i < remainingWeeks.length; i++) {
        const weekMeta = remainingWeeks[i]!;
        const weekStart = addDays(startMonday, i * 7);

        const weekRes = await instantiateWeekIntoMicrocycle({
          client: tx as unknown as Sql,
          coach_id: params.coach_id,
          athlete_id: params.athlete_id,
          week_template_id: Number(weekMeta.week_template_id),
          week_start: weekStart,
          // week_number conserva la posición REAL dentro de la plantilla (p. ej.
          // entrar en la semana 3 de 6 sigue etiquetándose "3", no "1") — así el
          // atleta queda alineado con el resto del grupo que sí empezó en la 1.
          week_number: entryWeekIndex + i + 1,
          progression: params.progression,
        });
        microcycleIds.push(weekRes.microcycle_id);
        assignmentCount += weekRes.assignment_count;
        droppedSessions.push(...weekRes.dropped_sessions);
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
  } catch (err) {
    // 0166: the database refuses two athlete_month_assignments with overlapping
    // date windows for the same athlete (23P01 = exclusion_violation, the GiST
    // constraint added in that migration). EVERY caller that can end up here
    // (personalize, assign-month, assign-sequence initial/advance/loop/level-up)
    // funnels through this one INSERT, so catching it ONCE, here, protects all of
    // them uniformly — each already maps InstantiateProgramError through its own
    // error type (see assign-sequence.ts's materializeItem, personalize-plan.ts),
    // so this reaches the coach as a clean, readable message instead of a raw
    // Postgres error / 500.
    if (isExclusionViolation(err)) {
      throw new InstantiateProgramError(
        'overlapping_plan',
        'Este atleta ya tiene un plan asignado que se solapa con estas fechas.',
        409,
      );
    }
    throw err;
  }

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
    dropped_sessions: droppedSessions,
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
}): Promise<{ microcycle_id: string; assignment_count: number; dropped_sessions: DroppedSession[] }> {
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

  // Qué sesiones de esta semana llegan de verdad al atleta: UN veredicto por
  // semana, el mismo que enseña la previa de «Asignar» (session-content.ts).
  const workoutSessions = placedDays.flatMap((day) => day.sessions).filter((session) => session.kind === 'workout');
  const verdicts = await resolveSessionsContent(params.client, params.coach_id, workoutSessions);
  const contentOf = new Map(workoutSessions.map((session, i) => [session, verdicts[i]!]));

  let assignmentCount = 0;
  const droppedSessions: DroppedSession[] = [];
  const wantedByDate = new Map<string, string[]>();
  for (const day of placedDays) {
    const dayDate = addDays(weekStart, day.day_of_week - 1);
    const dayIso = isoDateString(dayDate);
    const wanted: string[] = [];
    for (let i = 0; i < day.sessions.length; i++) {
      const session = day.sessions[i]!;
      const slotLabel = slotLabelForSessionIndex(i);
      const placed = await insertSlotAssignment({
        client: params.client,
        coach_id: params.coach_id,
        athlete_id: params.athlete_id,
        microcycle_id: microId,
        scheduled_for: dayIso,
        slot: slotLabel,
        session,
        content: contentOf.get(session),
        template_name_base: weekTpl.name,
        progression: params.progression,
      });
      assignmentCount += placed.count;
      if (placed.drop) {
        droppedSessions.push({
          ...placed.drop,
          week_number: params.week_number,
          day_of_week: day.day_of_week,
          label: sessionLabel(session),
        });
      }
      if (session.kind === 'workout') wanted.push(`slot:${slotLabel}`);
    }
    wantedByDate.set(dayIso, wanted);
  }

  // Quitar un entreno de la plantilla tiene que quitarlo del atleta. Insertar
  // y reemplazar no basta: el hueco que ya no existe dejaba la asignación
  // scheduled colgada (el coach borraba, el atleta seguía viéndolo). Solo
  // `scheduled` + `slot:…` de ESTE microciclo: lo hecho, lo libre y un test
  // no se tocan.
  for (let i = 0; i < 7; i++) {
    const dayIso = isoDateString(addDays(weekStart, i));
    await pruneRemovedSlotAssignments({
      client: params.client,
      athlete_id: params.athlete_id,
      microcycle_id: microId,
      scheduled_for: dayIso,
      keep_notes: wantedByDate.get(dayIso) ?? [],
    });
  }

  return { microcycle_id: microId, assignment_count: assignmentCount, dropped_sessions: droppedSessions };
}

export type { ResyncWeekTemplateResult } from './resync-program-week';

/** Mantiene el punto de entrada histórico con el mismo motor de materialización. */
export async function resyncWeekTemplateAssignments(params: Parameters<typeof resyncAssignedWeekTemplates>[0]) {
  return resyncAssignedWeekTemplates(params, instantiateWeekIntoMicrocycle);
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
