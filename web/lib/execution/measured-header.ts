import 'server-only';

// Las tres columnas huérfanas de la 0154 encuentran su motor — y desde el
// #71, también la pendiente media POR TRAMO (`segment_executions.avg_
// gradient_pct`, mig 0185).
//
// `workout_executions.decoupling_pct` / `elevation_gain_m` / `elevation_loss_m`
// / `hr_recovery_60_bpm` existen desde esa migración y hasta ahora no las
// llenaba nadie. Las cuatro exigen recorrer la traza ENTERA (docs/DECISIONS.md,
// "La carrera guarda su NEGATIVO": "hay cosas que sí se guardan ya calculadas:
// las que exigen recorrer la traza entera, porque la traza no cambia nunca"),
// así que este módulo vive al lado de `segment-zone-seconds.ts` — el mismo
// gesto (recalcular al llegar una traza), la misma forma.
//
// LA PENDIENTE ES DISTINTA: no es de la sesión, es de CADA TRAMO — la
// pregunta que contesta es «¿tiene sentido juzgar el ritmo AQUÍ?» (mockup
// carrera-en-el-panel.html §07/§08: ≥3% retira el veredicto de ritmo). Antes
// sólo se sabía por la cinta (`incline_pct`), que en calle es siempre null —
// un «8×200 en cuesta al 8%» corrido al aire libre no disparaba la regla
// nunca. Se resuelve aquí, no en el cliente (team-lead/Alex, 12-ago: sería un
// segundo motor sobre la misma señal de altitud), con la MISMA traza que ya
// se carga para desnivel/deriva/recuperación — un viaje, dos usos.
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
//
// La carga y el alineado de las señales (`hr`/`speed`/`altitude`, más
// `distance` que este módulo no usa) viven en `execution-traces.ts` — el
// mismo paso que necesita el camino de LECTURA (`session-trace.ts`), así que
// ninguno de los dos tiene su propia copia.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadExecutionTraces } from '@/lib/execution/execution-traces';
import { computeDecoupling, type EffortLeg } from '@fahybrid/shared/domain/running/decoupling';
import { computeElevation } from '@fahybrid/shared/domain/running/elevation';
import { computeHrRecovery60 } from '@fahybrid/shared/domain/running/hr-recovery';
import { netAltitudeChangeM, resolveSegmentGradientPct } from '@fahybrid/shared/domain/running/gradient';
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

  const traces = await loadExecutionTraces({ execution_id, started_at: execution.started_at, client });
  if (!traces.hasAnyTrace) return notWritten(execution_id);
  const { hr, speed, altitude } = traces;

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

  await writeSegmentGradients({ execution_id, anchorEpochS, altitude, client });

  return {
    execution_id,
    written: true,
    decoupling_pct,
    elevation_gain_m: elevation.elevation_gain_m,
    elevation_loss_m: elevation.elevation_loss_m,
    hr_recovery_60_bpm,
  };
}

/**
 * Pendiente media POR TRAMO (#71) — a diferencia de las cuatro de arriba,
 * ésta no es de la sesión, es de cada fila de `segment_executions`. Todos
 * los tramos de carrera con ventana real (`started_at`/`ended_at`), tenga o
 * no `leg_index` — un rodaje continuo (una sola fila, sin estructura) es
 * tan susceptible de subir una cuesta como una repetición.
 *
 * La precedencia (cinta > altitud derivada) y el "sin cobertura, null" viven
 * en `resolveSegmentGradientPct`/`netAltitudeChangeM` — este bucle sólo
 * reúne la ventana de cada tramo y escribe. Fila a fila (no una sola UPDATE
 * masiva): son pocos tramos por ejecución, y así cada fila se escribe con su
 * propio valor sin tener que montar un `unnest` para ganar nada medible.
 */
async function writeSegmentGradients(args: {
  execution_id: number;
  anchorEpochS: number;
  altitude: { offsets_s: readonly number[]; values: readonly number[] };
  client: Sql;
}): Promise<void> {
  const { execution_id, anchorEpochS, altitude, client } = args;

  const segments = await client<
    Array<{
      id: number;
      started_at: Date | null;
      ended_at: Date | null;
      distance_meters: string | number | null;
      incline_pct: string | number | null;
    }>
  >`
    select id, started_at, ended_at, distance_meters, incline_pct
    from segment_executions
    where execution_id = ${execution_id}
      and modality = 'run'
      and started_at is not null and ended_at is not null
  `;
  if (segments.length === 0) return;

  await client.begin(async (tx) => {
    for (const seg of segments) {
      if (!seg.started_at || !seg.ended_at) continue; // ya filtrado arriba; guarda de tipo
      const start_s = seg.started_at.getTime() / 1000 - anchorEpochS;
      const end_s = seg.ended_at.getTime() / 1000 - anchorEpochS;
      const distance_m = seg.distance_meters != null ? Number(seg.distance_meters) : null;
      const treadmill_incline_pct = seg.incline_pct != null ? Number(seg.incline_pct) : null;
      const altitude_delta_m = netAltitudeChangeM(altitude, start_s, end_s);
      const avg_gradient_pct = resolveSegmentGradientPct({
        treadmill_incline_pct,
        altitude_delta_m,
        distance_m,
      });
      await tx`
        update segment_executions
        set avg_gradient_pct = ${avg_gradient_pct}
        where id = ${seg.id}
      `;
    }
  });
}
