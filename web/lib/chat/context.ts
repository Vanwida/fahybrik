// EL rotulador de contexto de chat. Único punto que valida la PROPIEDAD del
// ancla que manda el cliente y deriva la ETIQUETA legible — nunca el cliente,
// nunca una segunda copia en otro sitio. Ver docs/DECISIONS.md, 2026-08-12
// "El chat aprende SOBRE QUÉ va el mensaje".
//
// Propiedad: el `ref` (y el `sub`, cuando lo hay) pertenece SIEMPRE al atleta
// dueño del hilo — nunca al remitente (el coach puede abrir el contexto de un
// entreno de SU atleta). El ejercicio de catálogo (`kind: 'exercise'`) es la
// única excepción: se valida contra el COACH del hilo (misma visibilidad que
// el resto del catálogo — `exercises.coach_id is null or = <coach>`).
//
// Inexistente y ajeno devuelven la MISMA respuesta: cada resolución es una
// única consulta con la propiedad DENTRO del WHERE (nunca un select previo +
// un check separado), así que "no existe" y "es de otro" colapsan al mismo
// cero filas — el patrón que ya fija docs/DECISIONS.md para ids que manda el
// cliente.

import type { Sql } from '@/lib/db';
import { joinCoachOverride, visibleToCoach } from '@/lib/exercises/coach-override';
import type { ChatContext, ChatContextInput } from './schema';

// -----------------------------------------------------------------------------
// Calendario (Europe/Madrid) — nunca "hoy"/"ayer": un mensaje releído la
// semana que viene mentiría. Las columnas de origen (`scheduled_for`,
// `race_date`) son `date` de Postgres servidas como texto 'YYYY-MM-DD': un
// calendario no tiene huso propio, así que se parsean a mano (Date.UTC) para
// que el día de la semana no dependa de en qué huso corre el proceso.
// -----------------------------------------------------------------------------

const WEEKDAY_ES_ABBR = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']; // getUTCDay()
const MONTH_ES_ABBR = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function parseDateOnly(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, day ?? 1));
}

/** "mar 12" — día de la semana + día del mes. Formato de un ENTRENO. */
function sessionDayLabel(scheduledFor: string): string {
  const dt = parseDateOnly(scheduledFor);
  return `${WEEKDAY_ES_ABBR[dt.getUTCDay()]} ${dt.getUTCDate()}`;
}

/** "4 oct" — día del mes + mes. Formato de una CARRERA (fecha lejana; el día
 *  de la semana no es lo que importa a esa distancia). Exportada: la
 *  previsualización VIVA de `context-preview.ts` la reutiliza para su propia
 *  línea de fecha — una sola grafía de fecha de carrera en todo el módulo. */
export function raceDayLabel(raceDate: string): string {
  const dt = parseDateOnly(raceDate);
  return `${dt.getUTCDate()} ${MONTH_ES_ABBR[dt.getUTCMonth()]}`;
}

// -----------------------------------------------------------------------------
// Un `ref`/`sub` que no es un entero positivo no puede ser ningún id real —
// se corta ANTES de tocar la base (y antes de un `::bigint` que reventaría en
// SQL) para que "mandaron basura" y "mandaron un id ajeno" acaben en el mismo
// sitio: ningún resultado.
// -----------------------------------------------------------------------------
function isPositiveIntText(s: string): boolean {
  return /^\d+$/.test(s);
}

type SessionRow = { workout_name: string; scheduled_for: string };
type SessionWithExerciseRow = SessionRow & { exercise_name: string };
type ExerciseRow = { exercise_name: string };
type RaceRow = { race_name: string; race_date: string };

async function resolveSession(
  sql: Sql,
  athleteId: bigint,
  coachId: bigint,
  ref: string,
  sub: string | undefined,
): Promise<ChatContext | null> {
  if (!isPositiveIntText(ref) || (sub !== undefined && !isPositiveIntText(sub))) return null;

  if (sub === undefined) {
    const rows = await sql<SessionRow[]>`
      select t.name as workout_name, wa.scheduled_for::text as scheduled_for
      from workout_assignments wa
      join templates t on t.id = wa.template_id
      where wa.id = ${ref}::bigint
        and wa.athlete_id = ${athleteId as unknown as number}
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      kind: 'session',
      ref,
      sub: null,
      label: `${row.workout_name} · ${sessionDayLabel(row.scheduled_for)}`,
    };
  }

  // El ejercicio tiene que pertenecer a la MISMA plantilla que la sesión
  // referenciada — join, no dos consultas — y el nombre se resuelve con la
  // misma fusión que ve el atleta (override del coach, si lo hay).
  const rows = await sql<SessionWithExerciseRow[]>`
    select t.name as workout_name, wa.scheduled_for::text as scheduled_for,
           coalesce(ceo.name, e.name) as exercise_name
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    join template_segments ts on ts.template_id = wa.template_id and ts.id = ${sub}::bigint
    join exercises e on e.id = ts.exercise_id
    ${joinCoachOverride(sql, coachId)}
    where wa.id = ${ref}::bigint
      and wa.athlete_id = ${athleteId as unknown as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    kind: 'session',
    ref,
    sub,
    label: `${row.exercise_name} · ${row.workout_name}, ${sessionDayLabel(row.scheduled_for)}`,
  };
}

async function resolveExercise(
  sql: Sql,
  coachId: bigint,
  ref: string,
): Promise<ChatContext | null> {
  if (!isPositiveIntText(ref)) return null;
  const rows = await sql<ExerciseRow[]>`
    select coalesce(ceo.name, e.name) as exercise_name
    from exercises e
    ${joinCoachOverride(sql, coachId)}
    where e.id = ${ref}::bigint
      and ${visibleToCoach(sql, coachId)}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { kind: 'exercise', ref, sub: null, label: row.exercise_name };
}

async function resolveRace(sql: Sql, athleteId: bigint, ref: string): Promise<ChatContext | null> {
  if (!isPositiveIntText(ref)) return null;
  const rows = await sql<RaceRow[]>`
    select name as race_name, race_date::text as race_date
    from races
    where id = ${ref}::bigint
      and athlete_id = ${athleteId as unknown as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    kind: 'race',
    ref,
    sub: null,
    label: `${row.race_name} · ${raceDayLabel(row.race_date)}`,
  };
}

/**
 * Resuelve el contexto entrante de un mensaje: valida la propiedad del ancla
 * y deriva su etiqueta. `athlete_id`/`coach_id` son SIEMPRE los del hilo (no
 * los del remitente — ver cabecera). `undefined` (sin contexto en el mensaje)
 * devuelve `null` sin tocar la base; un contexto CON referencia que no
 * resuelve (inexistente o ajena) también devuelve `null` — el llamante emite
 * el mismo 400 en los dos casos, así que la API nunca revela cuál de los dos
 * ocurrió.
 */
export async function resolveMessageContext(args: {
  sql: Sql;
  athlete_id: bigint;
  coach_id: bigint;
  input: ChatContextInput | undefined;
}): Promise<ChatContext | null> {
  const { sql, athlete_id, coach_id, input } = args;
  if (!input) return null;
  switch (input.kind) {
    case 'session':
      return resolveSession(sql, athlete_id, coach_id, input.ref, input.sub);
    case 'exercise':
      return resolveExercise(sql, coach_id, input.ref);
    case 'race':
      return resolveRace(sql, athlete_id, input.ref);
  }
}
