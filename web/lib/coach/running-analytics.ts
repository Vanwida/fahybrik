import 'server-only';

// LOS AGREGADOS DEL ENTRENADOR: CALIBRACIÓN, VOLUMEN Y CARGA (#71, mockup
// carrera-en-el-panel.html §05/§06). El wire que junta:
//
//   · CALIBRACIÓN — «¿le estoy poniendo bien los ritmos?» (shared/domain/
//     running/calibration.ts): hacia dónde falla + dónde se rompe dentro de
//     la serie. Sólo tramos de RITMO (`band_axis === 'pace'`) de sesiones de
//     series con objetivo explícito — nunca rodajes ni RPE.
//   · HUELLA — «cómo reparte el esfuerzo» (shared/domain/running/pacing-
//     shape.ts): el mismo veredicto que ya ve el atleta al terminar,
//     agregado por sesión.
//   · VOLUMEN — kilómetros por semana (`./running-volume.ts`, ya construido).
//   · CARGA — fondo/reciente/frescura con el veredicto delante (shared/
//     domain/training-load/load-verdict.ts).
//
// CALIBRACIÓN Y HUELLA comparten la MISMA ventana y la MISMA fuente: el
// mockup las presenta bajo un único encabezado, «Cómo corre · últimas 4
// semanas» (§05), así que se recorren las sesiones UNA vez y se reparte lo
// que sale de cada una — no dos consultas preguntando lo mismo.
//
// "CARRERA COMPROMETIDA" (mockup §05, tercera tarjeta) NO se construye en
// este lote: verificado contra producción (10-ago-2026) que sólo existe UNA
// ejecución con trabajo previo a una serie de carrera, y esa fila ni
// siquiera tiene ritmo medio — muy por debajo del propio mínimo del mockup
// (4 parejas). Ver docs/DECISIONS.md.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { loadSegmentActuals } from '@/lib/dashboard/coach/session-actuals';
import { buildRunCompliance } from '@/lib/dashboard/coach/run-compliance';
import { getLoadSummary } from '@/lib/training-load';
import { CTL_DECAY_DAYS } from '@fahybrid/shared/domain/training-load/banister';
import { resolveEffectiveRunningThresholds } from './running-thresholds';
import { loadWeeklyRunVolume, type WeeklyRunVolumePayload } from './running-volume';
import {
  buildRunCalibration,
  type CalibrationObservation,
  type RunCalibration,
} from '@fahybrid/shared/domain/running/calibration';
import {
  sessionPacingShape,
  summarizePacingShape,
  type PacingShapeLeg,
  type PacingShapeSummary,
  type PacingShapeVerdict,
} from '@fahybrid/shared/domain/running/pacing-shape';
import { buildRunningLoadReading, type RunningLoadReading } from '@fahybrid/shared/domain/training-load/load-verdict';
import type { CoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';

/** Semanas hacia atrás para calibración + huella — «últimas 4 semanas»,
 *  literal del mockup (§05, ui-cap). No es método del coach: es cuánta
 *  sesión reciente entra en "cómo corre AHORA", no un umbral de juicio. */
export const RUNNING_ANALYTICS_DEFAULT_WINDOW_WEEKS = 4;

export interface RunningAnalyticsPayload {
  athlete_id: string;
  generated_at_iso: string;
  /** La ventana que se recorrió para calibración + huella, en semanas. */
  window_weeks: number;
  calibration: RunCalibration;
  pacing_shape: PacingShapeSummary;
  volume: WeeklyRunVolumePayload;
  load: RunningLoadReading;
  /** Los umbrales del coach REALMENTE usados para calcular `calibration` y
   *  `load.is_alert` — para que la pantalla pueda decir "método: 20 series"
   *  sin volver a resolverlos. */
  thresholds: CoachRunningThresholds;
}

export async function buildRunningAnalytics(args: {
  coach_id: number | bigint;
  athlete_id: number;
  now?: Date;
  window_weeks?: number;
  volume_weeks?: number;
  client?: Sql;
}): Promise<RunningAnalyticsPayload> {
  const client = args.client ?? defaultSql;
  const now = args.now ?? new Date();
  const window_weeks = Math.max(1, Math.trunc(args.window_weeks ?? RUNNING_ANALYTICS_DEFAULT_WINDOW_WEEKS));
  const since = new Date(now.getTime() - window_weeks * 7 * 24 * 60 * 60 * 1000);

  const [thresholds, sessions, loadSummary, firstDayIso, volume] = await Promise.all([
    resolveEffectiveRunningThresholds(args.coach_id, client),
    loadQualifyingRunSessions(client, args.athlete_id, since, now),
    getLoadSummary({ athlete_id: args.athlete_id, on_date: now, client }),
    loadFirstActivityDate(client, args.athlete_id),
    loadWeeklyRunVolume({ athlete_id: args.athlete_id, weeks: args.volume_weeks, now, client }),
  ]);

  const calibrationObservations: CalibrationObservation[] = [];
  const pacingVerdicts: PacingShapeVerdict[] = [];

  for (const s of sessions) {
    const detail = await loadAssignmentDetail({
      sql: client,
      athlete_id: BigInt(args.athlete_id),
      assignment_id: BigInt(s.assignment_id),
    });
    if (!detail) continue; // asignación borrada entre la consulta y la carga: se salta, no se rompe
    const actuals = await loadSegmentActuals(client, Number(s.execution_id));
    const { tramos } = buildRunCompliance(detail.workout, actuals);

    const actualsByPosition = new Map(actuals.map((a) => [a.position, a]));
    const legs: PacingShapeLeg[] = [];
    for (const t of tramos) {
      // Calibración: SÓLO tramos de ritmo — un tramo de HR o RPE respondería
      // otra pregunta bajo el mismo porcentaje.
      if (t.band_axis === 'pace' && t.rep_ordinal != null) {
        calibrationObservations.push({ rep_ordinal: t.rep_ordinal, verdict: t.verdict });
      }
      // Huella: cualquier tramo de trabajo numerado, con su distancia/tiempo
      // real (no su veredicto) — el reparto del esfuerzo es geometría, no
      // cumplimiento.
      if (t.rep_ordinal != null && t.position != null) {
        const a = actualsByPosition.get(t.position);
        if (a?.duration_seconds != null && a.distance_meters != null) {
          legs.push({ rep_ordinal: t.rep_ordinal, duration_s: a.duration_seconds, distance_m: a.distance_meters });
        }
      }
    }
    const verdict = sessionPacingShape(legs);
    if (verdict != null) pacingVerdicts.push(verdict);
  }

  const calibration = buildRunCalibration(calibrationObservations, {
    min_series_for_calibration: thresholds.min_series_for_calibration,
    min_reps_per_position: thresholds.min_reps_per_position,
  });
  const pacing_shape = summarizePacingShape(pacingVerdicts);

  const days_of_history =
    firstDayIso != null ? Math.floor((now.getTime() - new Date(firstDayIso).getTime()) / 86_400_000) : null;
  const load = buildRunningLoadReading({
    summary: loadSummary,
    days_of_history,
    ctl_window_days: CTL_DECAY_DAYS,
    freshness_alert_tsb: thresholds.freshness_alert_tsb,
  });

  return {
    athlete_id: String(args.athlete_id),
    generated_at_iso: now.toISOString(),
    window_weeks,
    calibration,
    pacing_shape,
    volume,
    load,
    thresholds,
  };
}

/**
 * Sesiones con al menos un tramo de carrera ESTRUCTURADO (`leg_index` no
 * nulo — mig 0146) en la ventana: el resto (rodajes continuos, sesiones sin
 * ejecutar) no aporta ni a la calibración ni a la huella, y no merece cargar
 * su detalle completo.
 */
async function loadQualifyingRunSessions(
  client: Sql,
  athlete_id: number,
  since: Date,
  until: Date,
): Promise<Array<{ assignment_id: string; execution_id: string }>> {
  return client<Array<{ assignment_id: string; execution_id: string }>>`
    select a.id::text as assignment_id, e.id::text as execution_id
    from workout_assignments a
    join workout_executions e on e.assignment_id = a.id
    join segment_executions s on s.execution_id = e.id
    where a.athlete_id = ${athlete_id}
      and s.modality = 'run'
      and s.leg_index is not null
      and coalesce(e.ended_at, e.started_at) >= ${since.toISOString()}::timestamptz
      and coalesce(e.ended_at, e.started_at) <= ${until.toISOString()}::timestamptz
    group by a.id, e.id
    order by a.id
  `;
}

/** Fecha (ISO) de la primera sesión ejecutada del atleta — la ventana de
 *  arranque en frío la mide desde aquí. Null cuando no ha ejecutado nada. */
async function loadFirstActivityDate(client: Sql, athlete_id: number): Promise<string | null> {
  const rows = await client<Array<{ first_day: string | null }>>`
    select min(coalesce(we.ended_at, we.started_at, we.created_at))::text as first_day
    from workout_executions we
    where we.athlete_id = ${athlete_id}
  `;
  return rows[0]?.first_day ?? null;
}
