import 'server-only';

// EL CARGADOR COMPARTIDO — una fila por sesión de carrera (ejecución), con sus
// agregados YA calculados, para las tres puertas de la pastilla Carrera
// (docs/superpowers/plans/2026-08-13-carrera-hub-ios.md): historial y
// tendencias corren la MISMA consulta base y agrupan distinto (por semana con
// filas, por semana/mes con buckets). No hay una segunda tubería que pueda
// contar los kilómetros de otra manera.
//
// INCLUYE LAS IMPORTADAS. Una ejecución sin `assignment_id` (mig 0191 —
// Apple Salud sin hueco del plan, o un FIT importado, mig 0192) es una fila
// más: el `LEFT JOIN template_segments` ya la deja pasar con `scheme`/
// `prescription_json` en null, que es justo el estado honesto para una
// sesión que nadie prescribió.
//
// DOS CIFRAS DE METROS, A PROPÓSITO (mig 0146 — ver `segment-work.ts`): `km`
// cuenta TODO lo corrido (recuperaciones incluidas, `SEG_COUNTS_AS_VOLUME`);
// `pace_s_per_km`/`hr_avg`/`cadence_spm` se ponderan SOLO sobre el esfuerzo de
// trabajo (`SEG_IS_WORK_EFFORT`) — un trote de vuelta no puede arrastrar el
// ritmo de una serie hacia abajo.
//
// `seconds` es `workout_executions.total_duration_seconds`, no la suma de los
// tramos: es el dato que ya guarda cuánto duró la sesión de verdad (incluye
// transiciones que un tramo no captura), y es la MISMA columna que usa el
// resto del código para "cuánto duró esto".

import type { Sql } from '@/lib/db';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { SEG_COUNTS_AS_VOLUME, isWorkEffort } from '@/lib/execution/segment-work';

export interface RunSessionRow {
  execution_id: string;
  assignment_id: string | null;
  /** ISO `YYYY-MM-DD`, día LOCAL del atleta. */
  day: string;
  /** ISO `YYYY-MM-DD` — el lunes de la semana LOCAL del atleta. */
  week_monday: string;
  /** ISO `YYYY-MM-DD` — el día 1 del mes LOCAL del atleta. */
  month_start: string;
  /** Todos los metros de carrera de la sesión, recuperaciones incluidas. */
  km: number;
  /** Solo los kilómetros de TRABAJO — el peso correcto para ponderar ritmo/FC/
   *  cadencia entre varias sesiones (tendencias). */
  work_km: number;
  /** Segundos totales de la sesión (`workout_executions.total_duration_seconds`). */
  seconds: number;
  /** Ponderado sobre metros de TRABAJO. Null sin ningún tramo de trabajo con ritmo. */
  pace_s_per_km: number | null;
  /** Media de FC ponderada por metros de trabajo. Null sin lecturas. */
  hr_avg: number | null;
  /** `workout_executions.elevation_gain_m` — ya calculado, nunca derivado aquí. */
  elevation_gain_m: number | null;
  /** Cadencia ponderada por metros de trabajo. Null sin lecturas. */
  cadence_spm: number | null;
  /** `live`/`manual` → 'app' (se corrió con el motor); `imported` → 'imported'. */
  origen: 'app' | 'imported';
  /** Calle salvo que ALGÚN tramo de trabajo se midiera con la cinta (source='treadmill'). */
  contexto: 'street' | 'treadmill';
  /** `template_segments.prescription_json` del primer tramo con uno — para que
   *  el historial derive tipo/dosis sin una segunda consulta. Null si la sesión
   *  no cuelga de ninguna prescripción (libre o importada). */
  prescription_json: Record<string, unknown> | null;
}

interface SegRow {
  execution_id: string;
  assignment_id: string | null;
  day: string;
  week_monday: string;
  month_start: string;
  total_duration_seconds: number | null;
  elevation_gain_m: string | null;
  recorded_via: string | null;
  distance_meters: string | null;
  pace_s_per_km: string | null;
  avg_hr: number | null;
  run_cadence_spm: number | null;
  source: string | null;
  leg_role: string | null;
  is_structural: boolean;
  prescription_json: Record<string, unknown> | null;
  counts_as_volume: boolean;
}

/**
 * Todas las sesiones de carrera del atleta entre `since` y `until` (ambos
 * inclusive), colapsadas a una fila por ejecución. `since === null` = sin
 * suelo (el histórico entero).
 */
export async function loadRunSessionRows(
  client: Sql,
  athlete_id: number,
  since: Date | null,
  until: Date,
): Promise<RunSessionRow[]> {
  const rows = await client<SegRow[]>`
    with athlete_tz as (
      select coalesce((select a.timezone from athletes a where a.id = ${athlete_id}), ${BOX_TIMEZONE}) as tz
    )
    select
      we.id::text as execution_id,
      we.assignment_id::text as assignment_id,
      to_char(coalesce(we.ended_at, we.started_at) at time zone (select tz from athlete_tz), 'YYYY-MM-DD') as day,
      to_char(date_trunc('week', coalesce(we.ended_at, we.started_at) at time zone (select tz from athlete_tz)), 'YYYY-MM-DD') as week_monday,
      to_char(date_trunc('month', coalesce(we.ended_at, we.started_at) at time zone (select tz from athlete_tz)), 'YYYY-MM-DD') as month_start,
      we.total_duration_seconds as total_duration_seconds,
      we.elevation_gain_m::text as elevation_gain_m,
      we.recorded_via::text as recorded_via,
      se.distance_meters::text as distance_meters,
      coalesce(
        se.avg_pace_s_per_km::float,
        case when se.distance_meters > 0 and se.started_at is not null and se.ended_at is not null
          then extract(epoch from (se.ended_at - se.started_at))::float / (se.distance_meters::float / 1000.0)
          else null end
      )::text as pace_s_per_km,
      se.avg_hr,
      se.run_cadence_spm,
      se.source,
      se.leg_role,
      coalesce(se.is_structural, false) as is_structural,
      ts.prescription_json,
      ${SEG_COUNTS_AS_VOLUME(client)} as counts_as_volume
    from segment_executions se
    join workout_executions we on we.id = se.execution_id
    left join template_segments ts on ts.id = se.template_segment_id
    where we.athlete_id = ${athlete_id}
      and se.modality = 'run'
      and coalesce(we.ended_at, we.started_at) <= ${until.toISOString()}::timestamptz
      ${since ? client`and coalesce(we.ended_at, we.started_at) >= ${since.toISOString()}::timestamptz` : client``}
    order by we.started_at desc, se.position asc
  `;

  const byExec = new Map<
    string,
    {
      base: Omit<RunSessionRow, 'km' | 'work_km' | 'pace_s_per_km' | 'hr_avg' | 'cadence_spm' | 'prescription_json'>;
      km: number;
      workKm: number;
      paceWeighted: number;
      hrSum: number;
      hrCount: number;
      cadenceWeighted: number;
      cadenceKm: number;
      treadmill: boolean;
      prescription_json: Record<string, unknown> | null;
    }
  >();

  for (const r of rows) {
    const dist = numOrNull(r.distance_meters) ?? 0;
    if (dist <= 0) continue;
    const work = isWorkEffort(r);

    let e = byExec.get(r.execution_id);
    if (!e) {
      e = {
        base: {
          execution_id: r.execution_id,
          assignment_id: r.assignment_id,
          day: r.day,
          week_monday: r.week_monday,
          month_start: r.month_start,
          seconds: r.total_duration_seconds ?? 0,
          elevation_gain_m: numOrNull(r.elevation_gain_m),
          origen: r.recorded_via === 'imported' ? 'imported' : 'app',
          contexto: 'street',
        },
        km: 0,
        workKm: 0,
        paceWeighted: 0,
        hrSum: 0,
        hrCount: 0,
        cadenceWeighted: 0,
        cadenceKm: 0,
        treadmill: false,
        prescription_json: null,
      };
      byExec.set(r.execution_id, e);
    }

    if (r.counts_as_volume) e.km += dist / 1000;
    if (work) {
      const pace = numOrNull(r.pace_s_per_km);
      e.workKm += dist / 1000;
      if (pace != null) e.paceWeighted += pace * (dist / 1000);
      if (r.avg_hr != null) {
        e.hrSum += r.avg_hr;
        e.hrCount += 1;
      }
      if (r.run_cadence_spm != null && dist > 0) {
        e.cadenceWeighted += r.run_cadence_spm * dist;
        e.cadenceKm += dist;
      }
      if (r.source === 'treadmill') e.treadmill = true;
    }
    if (!e.prescription_json && r.prescription_json) e.prescription_json = r.prescription_json;
  }

  return [...byExec.values()].map((e) => ({
    ...e.base,
    contexto: e.treadmill ? 'treadmill' : 'street',
    km: Math.round(e.km * 100) / 100,
    work_km: Math.round(e.workKm * 100) / 100,
    pace_s_per_km: e.workKm > 0 ? e.paceWeighted / e.workKm : null,
    hr_avg: e.hrCount > 0 ? Math.round(e.hrSum / e.hrCount) : null,
    cadence_spm: e.cadenceKm > 0 ? Math.round(e.cadenceWeighted / e.cadenceKm) : null,
    prescription_json: e.prescription_json,
  }));
}

function numOrNull(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
