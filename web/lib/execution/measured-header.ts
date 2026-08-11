import 'server-only';

// Las tres columnas huérfanas de la 0154 encuentran su motor.
//
// `workout_executions.decoupling_pct` / `elevation_gain_m` / `elevation_loss_m`
// / `hr_recovery_60_bpm` existen desde esa migración y hasta ahora no las
// llenaba nadie. Las cuatro exigen recorrer la traza ENTERA (docs/DECISIONS.md,
// "La carrera guarda su NEGATIVO": "hay cosas que sí se guardan ya calculadas:
// las que exigen recorrer la traza entera, porque la traza no cambia nunca"),
// así que este módulo vive al lado de `segment-zone-seconds.ts` — el mismo
// gesto (recalcular al llegar una traza), la misma forma.
//
// EL EJE COMÚN. `hr`/`speed` llegan cada una con su propio `started_at` (pueden
// diferir en milisegundos entre señales); los tramos de `segment_executions`
// llevan timestamps absolutos. Antes de pasarlos a las funciones puras de
// `shared/domain/running`, todo se re-expresa en segundos desde
// `workout_executions.started_at` — un único cero, para que un tramo y una
// muestra de pulso hablen del mismo instante.
//
// SIN TRAZA, SIN NÚMERO. Una ejecución sin `hr`/`speed`/`altitude` en
// `workout_traces` (todo lo grabado antes de esta tanda, o sin el motor en vivo
// emitiendo trazas todavía) simplemente no gana estos campos — nunca se
// rellenan retroactivamente ni se inventan.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { bestHrTrace, type TraceRow } from '@/lib/zones/segment-zone-seconds';
import { computeDecoupling, type EffortLeg } from '@fahybrid/shared/domain/running/decoupling';
import { computeElevation } from '@fahybrid/shared/domain/running/elevation';
import { computeHrRecovery60 } from '@fahybrid/shared/domain/running/hr-recovery';
import { SEGMENT_LEG_PHASES, SEGMENT_LEG_ROLES } from '@/lib/execution/segment-work';

export interface MeasuredHeaderResult {
  execution_id: number;
  written: boolean;
  decoupling_pct: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  hr_recovery_60_bpm: number | null;
}

function notWritten(execution_id: number): MeasuredHeaderResult {
  return {
    execution_id,
    written: false,
    decoupling_pct: null,
    elevation_gain_m: null,
    elevation_loss_m: null,
    hr_recovery_60_bpm: null,
  };
}

const LEG_ROLE_SET = new Set<string>(SEGMENT_LEG_ROLES);
const LEG_PHASE_SET = new Set<string>(SEGMENT_LEG_PHASES);

/** Serie en segundos absolutos (epoch), antes de re-anclar a `started_at`. */
function toEpochSeries(trace: TraceRow): { offsets_s: number[]; values: number[] } {
  const base = trace.started_at.getTime() / 1000;
  const n = Math.min(trace.offsets_s.length, trace.values.length);
  const offsets_s: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const offset = trace.offsets_s[i];
    const value = trace.values[i];
    if (offset == null || value == null) continue;
    offsets_s.push(base + offset);
    values.push(value);
  }
  return { offsets_s, values };
}

/** Re-ancla una serie en epoch-seconds a segundos desde `anchorEpochS`. */
function reanchor(series: { offsets_s: number[]; values: number[] }, anchorEpochS: number) {
  return { offsets_s: series.offsets_s.map((t) => t - anchorEpochS), values: series.values };
}

/**
 * Recalcula y reescribe la cabecera medida (deriva aeróbica, desnivel,
 * recuperación de pulso) de una ejecución, a partir de sus trazas y de la
 * atribución de tramo de `segment_executions`. Idempotente: recorrer la misma
 * traza da la misma cabecera. `written: false` cuando la ejecución no tiene
 * `started_at` o ninguna traza relevante — nada que recalcular, nada que tocar.
 */
export async function computeMeasuredHeader(args: {
  execution_id: number;
  client?: Sql;
}): Promise<MeasuredHeaderResult> {
  const client = args.client ?? defaultSql;
  const { execution_id } = args;

  const executions = await client<Array<{ started_at: Date | null; ended_at: Date | null }>>`
    select started_at, ended_at from workout_executions where id = ${execution_id} limit 1
  `;
  const execution = executions[0];
  if (!execution?.started_at) return notWritten(execution_id);
  const anchorEpochS = execution.started_at.getTime() / 1000;

  const hrTrace = await bestHrTrace(client, execution_id);
  const speedRows = await client<TraceRow[]>`
    select source, started_at, offsets_s, values
    from workout_traces
    where execution_id = ${execution_id} and signal = 'speed'
    order by id desc limit 1
  `;
  const altitudeRows = await client<TraceRow[]>`
    select source, started_at, offsets_s, values
    from workout_traces
    where execution_id = ${execution_id} and signal = 'altitude'
    order by id desc limit 1
  `;
  const speedTrace = speedRows[0] ?? null;
  const altitudeTrace = altitudeRows[0] ?? null;
  if (!hrTrace && !speedTrace && !altitudeTrace) return notWritten(execution_id);

  const hr = hrTrace ? reanchor(toEpochSeries(hrTrace), anchorEpochS) : { offsets_s: [], values: [] };
  const speed = speedTrace ? reanchor(toEpochSeries(speedTrace), anchorEpochS) : { offsets_s: [], values: [] };
  const altitude = altitudeTrace
    ? reanchor(toEpochSeries(altitudeTrace), anchorEpochS)
    : { offsets_s: [], values: [] };

  // Tramos con atribución completa (mig 0146) — el mismo predicado all-or-none
  // que ya garantiza la base. Vacío = sesión sin estructura de tramos.
  const legRows = await client<
    Array<{ leg_role: string | null; leg_phase: string | null; started_at: Date | null; ended_at: Date | null }>
  >`
    select leg_role, leg_phase, started_at, ended_at
    from segment_executions
    where execution_id = ${execution_id}
      and leg_index is not null and leg_role is not null and leg_phase is not null
      and started_at is not null and ended_at is not null
    order by leg_index asc
  `;
  const legs: EffortLeg[] = [];
  let lastWorkEndEpochS: number | null = null;
  for (const row of legRows) {
    if (!row.leg_role || !row.leg_phase || !row.started_at || !row.ended_at) continue;
    if (!LEG_ROLE_SET.has(row.leg_role) || !LEG_PHASE_SET.has(row.leg_phase)) continue;
    const start_s = row.started_at.getTime() / 1000 - anchorEpochS;
    const end_s = row.ended_at.getTime() / 1000 - anchorEpochS;
    legs.push({
      role: row.leg_role as EffortLeg['role'],
      phase: row.leg_phase as EffortLeg['phase'],
      start_s,
      end_s,
    });
    if (row.leg_role === 'work') {
      const endEpochS = row.ended_at.getTime() / 1000;
      if (lastWorkEndEpochS == null || endEpochS > lastWorkEndEpochS) lastWorkEndEpochS = endEpochS;
    }
  }

  // El ancla de "fin del esfuerzo" para la recuperación de pulso: el final del
  // último tramo de TRABAJO (así una vuelta a la calma grabada después no
  // adelanta el reloj de la ventana de recuperación). Sin tramos, el final de
  // la propia ejecución — la mejor aproximación disponible, y honesta: si la
  // grabación paró justo al terminar el esfuerzo, no habrá cobertura a los
  // 58 s y `computeHrRecovery60` devolverá null por sí solo.
  const effortEndEpochS = lastWorkEndEpochS ?? (execution.ended_at ? execution.ended_at.getTime() / 1000 : null);

  const elevation = computeElevation({ altitude });
  const decoupling_pct = computeDecoupling({ hr, speed, legs });
  const hr_recovery_60_bpm =
    effortEndEpochS != null && hr.offsets_s.length > 0
      ? computeHrRecovery60({ hr, effort_end_s: effortEndEpochS - anchorEpochS })
      : null;

  await client`
    update workout_executions
    set
      decoupling_pct = ${decoupling_pct},
      elevation_gain_m = ${elevation.elevation_gain_m},
      elevation_loss_m = ${elevation.elevation_loss_m},
      hr_recovery_60_bpm = ${hr_recovery_60_bpm},
      updated_at = now()
    where id = ${execution_id}
  `;

  return {
    execution_id,
    written: true,
    decoupling_pct,
    elevation_gain_m: elevation.elevation_gain_m,
    elevation_loss_m: elevation.elevation_loss_m,
    hr_recovery_60_bpm,
  };
}
