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
//   · CARRERA COMPROMETIDA — «lo que le cuesta correr cansado» (shared/
//     domain/running/compromised-pace.ts). Reusa `classifyEffort`
//     (shared/domain/race-transfer) — el mismo mecanismo fresco/fatigado que
//     ya usa el cruce carrera×entreno — para no tener dos criterios que
//     puedan divergir.
//
// CALIBRACIÓN Y HUELLA comparten la MISMA ventana y la MISMA fuente: el
// mockup las presenta bajo un único encabezado, «Cómo corre · últimas 4
// semanas» (§05), así que se recorren las sesiones UNA vez y se reparte lo
// que sale de cada una — no dos consultas preguntando lo mismo.
//
// CARRERA COMPROMETIDA recorre una ventana APARTE y más larga
// (`COMPROMISED_WINDOW_WEEKS`): busca parejas (misma banda, fresco Y
// fatigado) que son raras por construcción, así que necesita más historial
// para que se acumulen. Corrección de diseño (Alex/team-lead, 12-ago): la
// primera versión de este módulo declaraba esta tarjeta "no construida" por
// falta de parejas en la base — pero esa base es de demostración, y que un
// seed pobre no traiga parejas no dice nada sobre si el MECANISMO vale. La
// pregunta correcta era si el esquema permite responder la pregunta, y sí:
// `segment_executions.context_format`/`prior_work_s` (migración 0120) ya lo
// permiten, y `classifyEffort` ya lo resuelve para el cruce carrera×entreno.
// SIN VALIDAR TODAVÍA CONTRA CARRERAS REALES — ver docs/DECISIONS.md.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { loadSegmentActuals } from '@/lib/dashboard/coach/session-actuals';
import { buildRunCompliance } from '@/lib/dashboard/coach/run-compliance';
import { getLoadSummary } from '@/lib/training-load';
import { SEG_IS_WORK_EFFORT } from '@/lib/execution/segment-work';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
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
import {
  buildCompromisedPaceTrend,
  type CompromisedPaceTrend,
  type CompromisedRunObservation,
} from '@fahybrid/shared/domain/running/compromised-pace';
import { buildRunningLoadReading, type RunningLoadReading } from '@fahybrid/shared/domain/training-load/load-verdict';
import type { CoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';

/** Semanas hacia atrás para calibración + huella — «últimas 4 semanas»,
 *  literal del mockup (§05, ui-cap). No es método del coach: es cuánta
 *  sesión reciente entra en "cómo corre AHORA", no un umbral de juicio. */
export const RUNNING_ANALYTICS_DEFAULT_WINDOW_WEEKS = 4;

/** Semanas hacia atrás para "carrera comprometida" — busca parejas RARAS
 *  (misma banda, fresco y fatigado) y necesita más margen que calibración/
 *  huella para que se acumulen sin forzar nada. Tampoco es método del coach:
 *  es cuánto histórico se recorre para BUSCAR, no un umbral de juicio (ese
 *  es `min_pairs_for_compromised_trend`). */
export const COMPROMISED_WINDOW_WEEKS = 12;

export interface RunningAnalyticsPayload {
  athlete_id: string;
  generated_at_iso: string;
  /** La ventana que se recorrió para calibración + huella, en semanas. */
  window_weeks: number;
  calibration: RunCalibration;
  pacing_shape: PacingShapeSummary;
  volume: WeeklyRunVolumePayload;
  load: RunningLoadReading;
  /** «Lo que le cuesta correr cansado» — sin validar todavía contra
   *  carreras reales (docs/DECISIONS.md, 12-ago). Recorre
   *  `COMPROMISED_WINDOW_WEEKS`, no `window_weeks`. */
  compromised: CompromisedPaceTrend;
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

  const [thresholds, sessions, loadSummary, firstDayIso, volume, compromisedObservations] = await Promise.all([
    resolveEffectiveRunningThresholds(args.coach_id, client),
    loadQualifyingRunSessions(client, args.athlete_id, since, now),
    getLoadSummary({ athlete_id: args.athlete_id, on_date: now, client }),
    loadFirstActivityDate(client, args.athlete_id),
    loadWeeklyRunVolume({ athlete_id: args.athlete_id, weeks: args.volume_weeks, now, client }),
    loadCompromisedPaceObservations(client, args.athlete_id, now),
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

  const compromised = buildCompromisedPaceTrend(compromisedObservations, {
    min_pairs_for_trend: thresholds.min_pairs_for_compromised_trend,
  });

  return {
    athlete_id: String(args.athlete_id),
    generated_at_iso: now.toISOString(),
    window_weeks,
    calibration,
    pacing_shape,
    volume,
    load,
    compromised,
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

/**
 * Observaciones para "carrera comprometida": tramos de trabajo con banda de
 * RITMO real, con su semana, `context_format` y `prior_work_s` — lo mínimo
 * para que `classifyEffort` (race-transfer) los clasifique fresco/fatigado y
 * `buildCompromisedPaceTrend` los empareje por banda.
 *
 * Recorre `loadQualifyingRunSessions` con la ventana LARGA
 * (`COMPROMISED_WINDOW_WEEKS`), no la de calibración/huella — puede repetir
 * sesiones que YA pasaron por el bucle principal si caen dentro de las dos
 * ventanas; es aceptable (buildRunCompliance es puro y barato) a cambio de
 * no entrelazar esta lectura, todavía sin validar contra datos reales, con
 * la que ya está verificada.
 */
async function loadCompromisedPaceObservations(
  client: Sql,
  athlete_id: number,
  now: Date,
): Promise<CompromisedRunObservation[]> {
  const since = new Date(now.getTime() - COMPROMISED_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000);
  const sessions = await loadQualifyingRunSessions(client, athlete_id, since, now);
  if (sessions.length === 0) return [];

  // context_format/prior_work_s no viajan en SegmentActual (no todo
  // consumidor los necesita) — un único viaje aparte para toda la ventana,
  // como hace race-transfer.ts. SEG_IS_WORK_EFFORT importa aquí exactamente
  // por lo que documenta ese fichero: una recuperación llega, por
  // construcción, DESPUÉS de todo lo anterior — sin el filtro, el lado
  // "fatigado" se calcularía sobre trotes de vuelta y no sobre series.
  const executionIds = sessions.map((s) => Number(s.execution_id));
  const contextRows = await client<
    Array<{
      execution_id: string;
      position: number;
      context_format: string | null;
      prior_work_s: number | null;
      week_start: string;
    }>
  >`
    select
      se.execution_id::text as execution_id,
      se.position            as position,
      se.context_format      as context_format,
      se.prior_work_s        as prior_work_s,
      to_char(
        date_trunc(
          'week',
          coalesce(we.ended_at, we.started_at) at time zone
            coalesce((select a.timezone from athletes a where a.id = ${athlete_id}), ${BOX_TIMEZONE})
        )::date,
        'YYYY-MM-DD'
      ) as week_start
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    where se.execution_id = any(${executionIds}::bigint[])
      and se.modality = 'run'
      and ${SEG_IS_WORK_EFFORT(client)}
  `;
  const contextByKey = new Map(contextRows.map((r) => [`${r.execution_id}:${r.position}`, r]));

  const observations: CompromisedRunObservation[] = [];
  for (const s of sessions) {
    const detail = await loadAssignmentDetail({
      sql: client,
      athlete_id: BigInt(athlete_id),
      assignment_id: BigInt(s.assignment_id),
    });
    if (!detail) continue;
    const actuals = await loadSegmentActuals(client, Number(s.execution_id));
    const { tramos } = buildRunCompliance(detail.workout, actuals);
    const actualsByPosition = new Map(actuals.map((a) => [a.position, a]));

    for (const t of tramos) {
      // `fast_s` puede ser null en una banda abierta por el lado rápido (sin
      // techo de velocidad) — sin ese borde no hay "mismo objetivo" que
      // identificar, así que ese tramo no entra en la comparación (no es que
      // no tenga banda: es que la banda no fija bien qué se está comparando).
      if (t.band == null || t.band.axis !== 'pace' || t.band.fast_s == null || t.position == null) continue;
      const a = actualsByPosition.get(t.position);
      const pace = a?.avg_pace_s_per_km;
      if (pace == null || !Number.isFinite(pace)) continue;
      const ctx = contextByKey.get(`${s.execution_id}:${t.position}`);
      if (!ctx) continue; // sin context_format/prior_work_s no se puede clasificar honestamente
      observations.push({
        week_start: ctx.week_start,
        band_fast_s: t.band.fast_s,
        band_slow_s: t.band.slow_s,
        pace_s_per_km: pace,
        context_format: ctx.context_format,
        prior_work_s: ctx.prior_work_s,
        position: t.position,
      });
    }
  }
  return observations;
}
