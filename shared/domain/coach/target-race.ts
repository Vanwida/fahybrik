import type { Sql } from 'postgres';
import { isoDateString, parseIsoDate, startOfDayInBox } from '../dates';
import { loadAthleteLocalDay } from '../db/athlete-timezone';
import type {
  RaceEventType,
  RaceFormat,
  RaceDivision,
  RaceGender,
  RacePriority,
} from '../../schema/races';

// ─────────────────────────────────────────────────────────────────────────────
// TARGET RACE — the single source of truth for "días a carrera objetivo".
//
// The athlete's target is the soonest UPCOMING race with priority='target'
// (status planned/registered) on the unified `races` spine — NOT a separate
// catalog pin. This replaces the legacy event-pin (athlete target) reads at
// priority 'A', which were dead: nothing wrote that table on the web/onboarding path
// (the real objective is created in `races`), so every "días a carrera A" metric
// resolved null.
//
// Predicate is identical to web `getTargetRace` (lib/races/next-race.ts) — that
// function now delegates here so the countdown and the metric share ONE query.
// "today" is the ATHLETE's day (`athletes.timezone`): a race is his, so it is
// counted in his calendar (docs/DECISIONS.md 2026-09-23, «Qué día es en cada
// sitio») — resolved here when no `on_date` is given; a caller that passes one
// passes that day already resolved. `days_until` = race_date - today (0 = today,
// never negative since we filter to upcoming).
// ─────────────────────────────────────────────────────────────────────────────

export type TargetRaceRow = {
  /** races.id of the target race. */
  race_id: number;
  name: string;
  /** races.event_id → shared catalog link (null until linked, phase 2). */
  event_id: number | null;
  event_type: RaceEventType;
  format: RaceFormat;
  division: RaceDivision;
  gender_category: RaceGender;
  priority: RacePriority;
  age_group: string | null;
  /** YYYY-MM-DD — always present (countdown requires a confirmed date). */
  race_date: string;
  location: string | null;
  goal_time_seconds: number | null;
  /** race_date - today (>= 0). */
  days_until: number;
};

/**
 * The athlete's soonest UPCOMING target race, or null when none is scheduled.
 * Single-row form used by every per-athlete reader (microciclo, macro-progress,
 * IA context, deep-dive, resumen, intake, profile shell). Batch/cohort readers
 * inline the same predicate over many athletes (a DISTINCT ON shape that doesn't
 * fit a single-row call).
 */
export async function getTargetRaceRow(
  athlete_id: number | bigint,
  client: Sql,
  on_date?: Date,
): Promise<TargetRaceRow | null> {
  // Sin fecha dada, el hoy del ATLETA (su huso), como el resto de lectores de
  // carreras (lib/races). Quien pasa `on_date` ya resolvió su día: un día a
  // medianoche UTC (`parseIsoDate`), no un instante — un instante se leería en el
  // día del defecto, que no es el del atleta.
  const todayIso = on_date ? isoDateString(startOfDayInBox(on_date)) : await loadAthleteLocalDay({ athlete_id, client });

  const rows = await client<
    Array<{
      race_id: number;
      name: string;
      event_id: number | null;
      event_type: RaceEventType;
      format: RaceFormat;
      division: RaceDivision;
      gender_category: RaceGender;
      priority: RacePriority;
      age_group: string | null;
      race_date: string;
      location: string | null;
      goal_time_seconds: number | null;
      days_until: number;
    }>
  >`
    select
      r.id::int                                as race_id,
      r.name                                   as name,
      r.event_id::int                          as event_id,
      r.event_type::text                       as event_type,
      r.format::text                           as format,
      r.division::text                         as division,
      r.gender_category::text                  as gender_category,
      r.priority::text                         as priority,
      r.age_group                              as age_group,
      to_char(r.race_date, 'YYYY-MM-DD')       as race_date,
      r.location                               as location,
      r.goal_time_seconds                      as goal_time_seconds,
      (r.race_date - ${todayIso}::date)::int   as days_until
    from races r
    where r.athlete_id = ${athlete_id as number}
      and r.race_date is not null
      and r.race_date >= ${todayIso}::date
      and r.status in ('planned', 'registered')
      and r.priority = 'target'
    order by r.race_date asc nulls last, r.id asc
    limit 1
  `;

  return rows[0] ?? null;
}

/**
 * Desde qué día se cuenta la cuenta atrás a la carrera objetivo. La carrera es
 * del ATLETA y se cuenta en SU día (DECISIONS 2026-09-23, «Qué día es en cada
 * sitio»); la posición en el plan, en cambio, va en el `on_date` que pasa quien
 * llama (el día del club para el coach). Con `now` (o sin `on_date`), el día del
 * atleta en ese instante; con solo `on_date`, ese día tal cual — quien lee un día
 * fijo (una semana ya evaluada) cuenta desde él.
 */
export async function raceCountdownDay(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  now?: Date;
  client: Sql;
}): Promise<Date> {
  if (params.on_date && !params.now) return startOfDayInBox(params.on_date);
  return parseIsoDate(
    await loadAthleteLocalDay({ athlete_id: params.athlete_id, now: params.now ?? new Date(), client: params.client }),
  );
}
