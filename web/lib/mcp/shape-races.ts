// Lo que el conector pone en el cable para LAS CARRERAS.
//
// Mapeo explícito, como en `shape.ts`. Dos decisiones propias de aquí:
//
//   1. LOS TIEMPOS VIAJAN DOBLADOS: los segundos crudos (para comparar) y el reloj
//      escrito (para decirlo). Un asistente al que solo le das 3540 dice «3540
//      segundos» o se equivoca al dividir; con «59:00» al lado lo cita bien.
//   2. LOS SPLITS DE HYROX NO VAN ENTEROS. Dieciséis parciales por carrera son
//      dieciséis números que el asistente no puede leer sin el mapa de estaciones;
//      lo que sí contesta preguntas es el AGREGADO que ya está calculado (total de
//      carrera a pie, roxzone, mejor vuelta) más cuántos parciales hay guardados,
//      por si hace falta ir a por ellos a otra superficie.
//
// PREDICHO VS REAL. Solo se evalúa la última carrera con resultado. La predicción
// es un snapshot congelado antes del evento (`race_predictions`), así que revisar
// diez carreras serían treinta consultas para contestar algo que nadie pregunta:
// lo que el coach quiere saber es si el modelo acertó la ÚLTIMA. Null cuando no
// había predicción congelada antes de esa fecha — no se sabe, y se dice.
//
// LAS GRAFÍAS SON LAS DEL PANEL (`race-labels.ts`): el reloj de un total
// (`formatRaceTime`), el de un parcial (`formatClock`) y la línea de categoría en
// castellano (`raceCategoryLineEs`). Si el conector escribiera las suyas, el coach
// leería un tiempo en el chat y otro en pantalla para la misma carrera.

import type { NextRace, RaceHistoryItem, UpcomingRace } from '@fahybrid/shared/schema';
import {
  formatClock,
  formatRaceTime,
  raceCategoryLineEs,
} from '@/lib/dashboard/coach/race-labels';
import type { PredictionReviewDTO } from '@/lib/athlete/prediction-review';

function upcoming(r: UpcomingRace | NextRace): Record<string, unknown> {
  return {
    ...('race_id' in r ? { race_id: r.race_id } : {}),
    name: r.name,
    race_date: r.race_date,
    days_until: r.days_until,
    /** target = la carrera a la que apunta el plan; el resto son de rodaje. */
    priority: r.priority,
    event_type: r.event_type,
    category: raceCategoryLineEs(r),
    age_group: r.age_group,
    location: r.location,
    goal_time_seconds: r.goal_time_seconds,
    goal_time: formatRaceTime(r.goal_time_seconds),
  };
}

function past(r: RaceHistoryItem): Record<string, unknown> {
  return {
    race_id: r.race_id,
    name: r.name,
    race_date: r.race_date,
    event_type: r.event_type,
    category: raceCategoryLineEs(r),
    location: r.location,
    result_time_seconds: r.result_time_seconds,
    result_time: formatRaceTime(r.result_time_seconds),
    /** Puesto y percentil (0 = el mejor), cuando la organización los publicó. */
    overall_rank: r.overall_rank,
    age_group_rank: r.age_group_rank,
    field_size: r.field_size,
    percentile: r.percentile,
    splits: {
      run_total: formatClock(r.run_total_seconds),
      roxzone: formatClock(r.roxzone_seconds),
      best_run_lap: formatClock(r.best_run_lap_seconds),
      run_lap_count: r.run_splits.length,
      station_count: r.station_splits.length,
    },
    /** En dobles y relevos los parciales y el puesto son del EQUIPO, no suyos. */
    is_team_result: r.is_team_result,
    partners: r.partners.map((p) => ({ name: p.name, nation: p.nation })),
    source: r.source,
    source_season: r.source_season,
  };
}

export function toRaces(params: {
  athlete_id: string;
  athlete_name: string;
  target_race: NextRace | null;
  upcoming: UpcomingRace[];
  past: RaceHistoryItem[];
  review: PredictionReviewDTO | null;
  reviewed_race: RaceHistoryItem | null;
}): Record<string, unknown> {
  return {
    athlete_id: params.athlete_id,
    athlete_name: params.athlete_name,
    /** La carrera a la que pica el plan. Null = no tiene objetivo puesto. */
    target_race: params.target_race ? upcoming(params.target_race) : null,
    upcoming: params.upcoming.map(upcoming),
    past: params.past.map(past),
    predicted_vs_real:
      params.review && params.review.availability === 'ok' && params.reviewed_race
        ? {
            race_id: params.reviewed_race.race_id,
            race_name: params.review.race_name,
            race_date: params.review.race_date,
            predicted: formatRaceTime(params.review.predicted_total_s),
            actual: formatRaceTime(params.review.actual_total_s),
            /** Cuánto acertó la predicción, con la palabra que le corresponde. */
            accuracy_pct: params.review.accuracy_pct,
            accuracy_label: params.review.accuracy_label_es,
            insight: params.review.insight_es,
            segments: params.review.segments.map((s) => ({
              label: s.label_es,
              predicted: formatClock(s.predicted_s),
              actual: formatClock(s.actual_s),
              delta_s: s.delta_s,
            })),
          }
        : null,
  };
}

export function racesResumen(params: {
  athlete_name: string;
  target_race: NextRace | null;
  upcoming_count: number;
  past: RaceHistoryItem[];
}): string {
  const { athlete_name, target_race, upcoming_count, past } = params;
  const parts: string[] = [];

  if (target_race) {
    const goal = formatRaceTime(target_race.goal_time_seconds);
    parts.push(
      goal
        ? `${target_race.name} en ${target_race.days_until} días con objetivo ${goal}`
        : `${target_race.name} en ${target_race.days_until} días, sin objetivo de tiempo`,
    );
  } else {
    parts.push('sin carrera objetivo');
  }

  const others = Math.max(0, upcoming_count - (target_race ? 1 : 0));
  if (others > 0) parts.push(`${others} más en el calendario`);

  const withResult = past.filter((r) => r.result_time_seconds != null);
  if (withResult.length > 0) {
    const best = withResult.reduce((a, b) =>
      (a.result_time_seconds ?? Infinity) <= (b.result_time_seconds ?? Infinity) ? a : b,
    );
    parts.push(
      `${withResult.length} ${withResult.length === 1 ? 'corrida' : 'corridas'} (mejor ${formatRaceTime(best.result_time_seconds)})`,
    );
  } else if (past.length > 0) {
    parts.push(`${past.length} en el historial sin resultado registrado`);
  }

  const body =
    parts.length <= 1
      ? (parts[0] ?? '')
      : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  return `${athlete_name}: ${body}.`;
}
