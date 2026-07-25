import 'server-only';

// Resolución del entreno que viaja al RELOJ: sesión asignada → `WatchWorkout`.
//
// No reimplementa nada de la resolución que ya existe. Reutiliza, en este orden:
//   · `buildAthleteWeekPlan`   → cuál es la sesión de HOY (misma semana que ve la app)
//   · `loadAssignmentDetail`   → la sesión resuelta: bloques, líneas y estructura
//                                de carrera YA enriquecida con la banda del atleta
//   · `runStructureForSession` → esas estructuras fundidas en una sola
//   · `buildWatchWorkout`      → el modelo neutro que consume todo codificador
//
// Lo único propio de aquí son los BENCHMARKS de pulso: el mapeador compartido solo
// cubre los anclajes de ritmo (5k, 10k, 2k remo, 1k ski) porque son los que
// producen zonas de ritmo. Para resolver una zona de PULSO a ppm absolutos hace
// falta además la FCmáx medida y la edad, que viven en `athletes`.

import {
  athleteBenchmarksFromSlugRows,
  type AthleteBenchmarks,
  type CoachZone,
} from '@fahybrid/shared/domain/methodology';
import {
  buildWatchWorkout,
  type WatchWorkout,
} from '@fahybrid/shared/domain/wearables/watch-workout';
import { buildAthleteWeekPlan, type AthleteWeekDaySession } from '@/lib/athlete/week-plan';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { loadCoachZonesForUnit } from '@/lib/dashboard/v2/zone-derivation';
import { sql } from '@/lib/db';
import { runStructureForSession } from './run-structure-source';

/** Milisegundos de un año medio (incluye el cuarto de día de los bisiestos). */
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * La carrera es la ÚNICA modalidad que un reloj de fabricante sabe reproducir como
 * entreno estructurado. Fuerza, EMOM y AMRAP se ejecutan en nuestras apps.
 */
const WATCHABLE_MODALITY = 'run';

// ── Benchmarks ───────────────────────────────────────────────────────────────

interface AthleteHrRow {
  max_hr_bpm: number | null;
  dob: string | null;
  coach_id: string | null;
}

function ageYearsFrom(dob: string | null): number | null {
  if (!dob) return null;
  const born = new Date(dob).getTime();
  if (!Number.isFinite(born)) return null;
  return Math.floor((Date.now() - born) / MS_PER_YEAR);
}

interface AthleteZoneInputs {
  benchmarks: AthleteBenchmarks;
  coachZones: CoachZone[];
}

/**
 * Los anclajes con los que se resuelve cualquier zona que el detalle de asignación
 * no haya resuelto ya. Un atleta sin ningún anclaje devuelve el objeto vacío: las
 * zonas se quedan sin resolver y el tramo va abierto con la etiqueta en el nombre
 * — nunca se fabrica una banda.
 */
async function loadAthleteZoneInputs(athlete_id: bigint): Promise<AthleteZoneInputs> {
  const [benchRows, athleteRows] = await Promise.all([
    sql<Array<{ exercise_slug: string; value: number | null }>>`
      select exercise_slug, value::float8 as value
      from athlete_benchmarks
      where athlete_id = ${athlete_id as unknown as number}
    `,
    sql<AthleteHrRow[]>`
      select max_hr_bpm, to_char(dob, 'YYYY-MM-DD') as dob, coach_id::text as coach_id
      from athletes
      where id = ${athlete_id as unknown as number}
      limit 1
    `,
  ]);

  const athlete = athleteRows[0];
  const benchmarks: AthleteBenchmarks = {
    ...athleteBenchmarksFromSlugRows(benchRows),
    // FCmáx MEDIDA (0129). Null cuando nunca se midió: el resolvedor cae entonces a
    // la estimación por edad, y sin edad tampoco resuelve — que es lo correcto.
    max_hr_bpm: athlete?.max_hr_bpm ?? null,
    age_years: ageYearsFrom(athlete?.dob ?? null),
  };

  // El modelo de zonas es dato del COACH. Sin coach no hay modelo: se resuelve con
  // el estándar que el propio cargador aplica por defecto.
  const coachZones = athlete?.coach_id
    ? await loadCoachZonesForUnit(sql, Number(athlete.coach_id), 'per_km')
    : [];

  return { benchmarks, coachZones };
}

// ── Resolución de la sesión ──────────────────────────────────────────────────

export type RunWatchWorkoutResult =
  | { ok: true; workout: WatchWorkout; assignment_id: string; iso_date: string; title: string }
  /** Hoy no hay ninguna sesión asignada (día de descanso o semana sin publicar). */
  | { ok: false; reason: 'no_session_today' }
  /** La asignación pedida no existe o no es de este atleta. */
  | { ok: false; reason: 'not_found' }
  /** La sesión existe pero no es de carrera estructurada: no viaja a un reloj. */
  | { ok: false; reason: 'not_a_run_session'; assignment_id: string; title: string };

/** La sesión de hoy del atleta. Null cuando el día no tiene ninguna. */
async function todaySession(
  athlete_id: bigint,
): Promise<{ session: AthleteWeekDaySession; iso_date: string } | null> {
  const week = await buildAthleteWeekPlan(athlete_id);
  const today = week.days.find((d) => d.iso_date === week.today_iso);
  if (!today) return null;
  // Con varias sesiones el mismo día (am/pm), la de carrera es la que puede viajar
  // al reloj; si ninguna lo es se coge la primera y el resultado será un 409 honesto
  // en vez de un silencio.
  const session =
    today.sessions.find((s) => s.modality === WATCHABLE_MODALITY) ?? today.sessions[0];
  return session ? { session, iso_date: today.iso_date } : null;
}

/**
 * El entreno de carrera que hay que mandar al reloj. Sin `assignment_id` resuelve
 * el de HOY; con él, esa asignación concreta (la propiedad la valida el cargador
 * de detalle, que devuelve null si no es del atleta).
 */
export async function loadRunWatchWorkout(params: {
  athlete_id: bigint;
  user_id: bigint;
  assignment_id?: bigint;
}): Promise<RunWatchWorkoutResult> {
  let assignment_id = params.assignment_id;
  let iso_date: string | null = null;
  let cardTitle = '';

  if (assignment_id === undefined) {
    const today = await todaySession(params.athlete_id);
    if (!today) return { ok: false, reason: 'no_session_today' };
    assignment_id = BigInt(today.session.assignment_id);
    iso_date = today.iso_date;
    cardTitle = today.session.title;
  }

  const detail = await loadAssignmentDetail({
    sql,
    athlete_id: params.athlete_id,
    assignment_id,
    self_user_id: params.user_id,
  });
  if (!detail) return { ok: false, reason: 'not_found' };

  const id = String(detail.assignment.id);
  const title = detail.workout?.name || cardTitle || 'Entreno';

  const structure = runStructureForSession(detail.workout);
  if (!structure) return { ok: false, reason: 'not_a_run_session', assignment_id: id, title };

  const { benchmarks, coachZones } = await loadAthleteZoneInputs(params.athlete_id);
  const workout = buildWatchWorkout(structure, benchmarks, { name: title, coachZones });

  return {
    ok: true,
    workout,
    assignment_id: id,
    iso_date: iso_date ?? detail.assignment.scheduled_for,
    title,
  };
}

// ── Listado ──────────────────────────────────────────────────────────────────

export interface UpcomingRunSession {
  assignment_id: string;
  iso_date: string;
  title: string;
  is_today: boolean;
}

/**
 * Las sesiones de CARRERA de la semana en curso más la siguiente (la que el atleta
 * puede espiar), de hoy en adelante. Se filtra por la modalidad que ya deriva el
 * plan semanal — no se re-resuelve nada. Es una LISTA, no una promesa: la autoridad
 * sobre si una sesión puede reproducirse en el reloj es el propio endpoint del
 * fichero, que responde 409 si la sesión no trae estructura de carrera.
 */
export async function listUpcomingRunSessions(athlete_id: bigint): Promise<UpcomingRunSession[]> {
  const [thisWeek, nextWeek] = await Promise.all([
    buildAthleteWeekPlan(athlete_id, 0),
    buildAthleteWeekPlan(athlete_id, 1),
  ]);
  const today_iso = thisWeek.today_iso;

  const out: UpcomingRunSession[] = [];
  for (const week of [thisWeek, nextWeek]) {
    for (const day of week.days) {
      if (day.iso_date < today_iso) continue;
      for (const session of day.sessions) {
        if (session.modality !== WATCHABLE_MODALITY) continue;
        out.push({
          assignment_id: session.assignment_id,
          iso_date: day.iso_date,
          title: session.title,
          is_today: day.iso_date === today_iso,
        });
      }
    }
  }
  return out;
}
