// Per-segment actuals — what the athlete ACTUALLY did, per exercise.
//
// On workout finish the athlete logs one `segment_executions` row per tracked
// segment (a run leg, an erg piece, a strength block), keyed by
// `template_segment_id` + ordinal `position`. The coach session-detail endpoint
// shows the prescription (template blocks) but, until now, only the AGGREGATE of
// the execution (total duration + session RPE). This module turns those segment
// rows into coach-facing `SegmentActual`s mapped to the prescribed item via its
// uid (`segment-{template_segment_id}`), so the session drawer can render
// prescrito → hecho side by side.
//
// Honest by construction: a segment with no `template_segment_id` maps to
// `item_uid = null` (surfaced as an unmatched lap, never invented against a
// prescription); a session with no segment rows yields `[]` (the UI falls back
// to the aggregate, no fabricated per-exercise numbers).
//
// `segment_executions` carries NO per-segment RPE column — perceived exertion is
// session-level only (`workout_executions.perceived_exertion`), so it is not part
// of this shape on purpose.

import type { Sql } from '@/lib/db';
import { SEGMENT_MODALITIES, type SegmentModality } from '@/lib/sync/ingest-execution-segments';
import { parseErgDetail, type ErgSplitItem } from '@/lib/execution/erg-splits';
import { groupRunSplits, type RunLegSplitItem } from '@/lib/execution/run-splits';
import { parseZoneSeconds, type ZoneSeconds } from '@/lib/execution/zone-seconds';
import {
  SEGMENT_LEG_PHASES,
  SEGMENT_LEG_ROLES,
  type SegmentLegPhase,
  type SegmentLegRole,
} from '@/lib/execution/segment-work';

/** One logged segment, mapped to its prescribed item. Numerics are real numbers. */
export interface SegmentActual {
  /** Ordinal of the logged segment within the execution. */
  position: number;
  /** uid of the prescribed item this maps to (`segment-{id}`); null when unmatched. */
  item_uid: string | null;
  modality: SegmentModality;
  /** Cuándo empezó ESTE tramo. Es lo que permite situarlo en el eje de la curva:
   *  `execution.started_at` da el cero de la señal, pero sin este no se sabe dónde
   *  cae cada serie dentro de ella — y sin eso no hay sombra de tramo, ni banda
   *  dibujada encima, ni número de repetición. El SQL siempre lo trajo; se
   *  consumía para derivar la duración y se tiraba antes de salir. */
  started_at: string | null;
  /** Derived from ended_at − started_at; null when either timestamp is missing. */
  duration_seconds: number | null;
  reps_completed: number | null;
  weight_used_kg: number | null;
  distance_meters: number | null;
  avg_pace_s_per_500m: number | null;
  avg_pace_s_per_km: number | null;
  avg_power_w: number | null;
  stroke_rate_spm: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  /** EMOM completion (mig 0134): intervals the athlete completed the work in vs
   * prescribed — the coach's "X/Y rondas hechas". Both null off an EMOM segment. */
  emom_rounds_completed: number | null;
  emom_rounds_prescribed: number | null;
  /** AVERAGE running metrics over the segment (#62, mig 0124). Null when the
   * source (treadmill / wearable) reported none — never fabricated. */
  incline_pct: number | null;
  /** Pendiente media del tramo (#71, mig 0185) — CAMBIO NETO de altitud sobre
   *  la distancia, nunca desnivel acumulado. La cinta (`incline_pct`) manda
   *  cuando la hay; si no, se deriva de la traza de altitud. Es la que decide
   *  si el veredicto de ritmo significa algo (≥3% lo retira, mockup
   *  carrera-en-el-panel.html §07/§08) — `incline_pct` sigue existiendo aparte
   *  porque "lo que declaró la cinta" es una pregunta más estrecha y sigue
   *  siendo información real por sí misma. Null = no se sabe, nunca cero
   *  (cero es "llano medido"). Se escribe una vez al llegar la traza
   *  (`measured-header.ts`), nunca al vuelo. */
  avg_gradient_pct: number | null;
  run_cadence_spm: number | null;
  /** Concept2 PM5 erg detail (#33), folded out of `raw_lap_data_json` — the
   * monitor's segment-level aggregates + per-interval splits. Null for non-erg /
   * older segments. Keys are the SAME snake_case iOS posts, echoed back verbatim so
   * the athlete detail (SegmentActualDTO) round-trips; see `erg-splits.ts`. */
  drag_factor: number | null;
  avg_calories_per_hour: number | null;
  peak_drive_force_lbs: number | null;
  avg_drive_force_lbs: number | null;
  erg_splits: ErgSplitItem[] | null;
  /** El equivalente de `erg_splits` para una carrera estructurada (#66) — mismo
   *  patrón, mismo nivel, misma forma, ver `run-splits.ts`. La diferencia es DE
   *  DÓNDE sale: el PM5 anida sus intervalos en UNA fila; una carrera de series
   *  graba CADA tramo como su propia fila (leg_index/leg_role/leg_phase, mig
   *  0146). Por eso esto no sale de `raw_lap_data_json` sino de agrupar las
   *  filas hermanas por `item_uid` — y por eso solo la fila `leg_index === 0`
   *  de cada grupo lo lleva (la "portadora"): las demás siguen siendo su propio
   *  `SegmentActual` de siempre, sin tocar. Null fuera de una carrera
   *  estructurada, o en cualquier fila que no sea la portadora de su grupo. */
  run_splits: RunLegSplitItem[] | null;
  /** WHICH APPARATUS measured THIS tramo — the raw `segment_executions.source`
   * token ('pm5', 'treadmill', 'gps', 'healthkit', 'manual', …). The execution's
   * own `source` is only the principal one, so a mixed session (erg + treadmill)
   * can only be told apart here. Null for tramos recorded before it was stamped. */
  source: string | null;
  /** Seconds in each HR zone over the tramo, folded out of `raw_lap_data_json`.
   * Null when no HR was measured — never a zero-filled band (see zone-seconds.ts). */
  zone_seconds: ZoneSeconds | null;
  // ── Atribución de tramo de una carrera estructurada (mig 0146) ─────────────
  //
  // Aquí NO se filtra: el detalle de una sesión debe enseñar lo que pasó, y el
  // trote entre series pasó. Lo que hace falta es que se pueda DISTINGUIR, que es
  // justo lo que faltaba. Quien agregue (medias, PRs, cuentas) filtra con
  // `isWorkEffort`; quien pinte, etiqueta.
  /** Índice 0-based en la lista PLANA de tramos de la prescripción (repeticiones
   *  desplegadas, fases en orden, recuperaciones incluidas). Mismo espacio de
   *  índices que `flattenSegments()`, así que casa lo hecho con lo prescrito sin
   *  zipear por orden de llegada. Null fuera de una carrera estructurada. */
  leg_index: number | null;
  /** 'work' | 'recovery'. El contraste que define una sesión de series. */
  leg_role: SegmentLegRole | null;
  /** 'warmup' | 'main' | 'cooldown'. Necesario además del rol: en la gramática un
   *  calentamiento es `kind: work`, así que sin la fase un trote de diez minutos
   *  se cuenta como una serie más. */
  leg_phase: SegmentLegPhase | null;
  /** Marcador de completado (mig 0088) — sin reps ni carga, no hay nada que
   *  puntuar. Se expone porque es el OTRO eje de «esto no es un intento», y
   *  tenerlo solo en la BD fue lo que dejó a 19 de 20 lectores sin filtrarlo. */
  is_structural: boolean;
}

// Raw DB row. pg returns `numeric` columns as strings, so the numeric fields are
// typed `string | number | null` and coerced once in `buildSegmentActuals`.
export interface SegmentActualRow {
  template_segment_id: string | null;
  position: number;
  modality: string | null;
  started_at: string | null;
  ended_at: string | null;
  reps_completed: number | null;
  weight_used_kg: string | number | null;
  distance_meters: string | number | null;
  avg_pace_s_per_500m: string | number | null;
  avg_pace_s_per_km: string | number | null;
  avg_power_w: string | number | null;
  stroke_rate_spm: string | number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: string | number | null;
  emom_rounds_completed: number | null;   // integer
  emom_rounds_prescribed: number | null;  // integer
  incline_pct: string | number | null;   // numeric(4,1) → string from pg
  avg_gradient_pct: string | number | null; // numeric(5,2) → string from pg
  run_cadence_spm: number | null;         // integer
  source: string | null;                  // free-text apparatus token
  leg_index: number | null;               // integer
  leg_role: string | null;                // 'work' | 'recovery' (CHECK en 0146)
  leg_phase: string | null;               // 'warmup' | 'main' | 'cooldown'
  is_structural: boolean | null;
  raw_lap_data_json: unknown;             // jsonb → parsed value (or null)
}

const MODALITY_SET = new Set<string>(SEGMENT_MODALITIES);

function toModality(raw: string | null): SegmentModality {
  return raw != null && MODALITY_SET.has(raw) ? (raw as SegmentModality) : 'other';
}

// El CHECK de 0146 ya garantiza el vocabulario en la BD; esto es la red por si la
// fila viene de una escritura futura que se lo salte. Un valor desconocido cae a
// null («no se sabe») en vez de colarse como si fuera trabajo.
const LEG_ROLE_SET = new Set<string>(SEGMENT_LEG_ROLES);
const LEG_PHASE_SET = new Set<string>(SEGMENT_LEG_PHASES);

function toLegRole(raw: string | null): SegmentLegRole | null {
  return raw != null && LEG_ROLE_SET.has(raw) ? (raw as SegmentLegRole) : null;
}

function toLegPhase(raw: string | null): SegmentLegPhase | null {
  return raw != null && LEG_PHASE_SET.has(raw) ? (raw as SegmentLegPhase) : null;
}

function num(v: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function durationSeconds(started: string | null, ended: string | null): number | null {
  if (!started || !ended) return null;
  const s = new Date(started).getTime();
  const e = new Date(ended).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  const d = Math.round((e - s) / 1000);
  return d > 0 ? d : null;
}

/** Pure mapper: DB rows → coach-facing actuals (testable without a DB). */
export function buildSegmentActuals(rows: SegmentActualRow[]): SegmentActual[] {
  const mapped: SegmentActual[] = rows.map((r) => ({
    position: r.position,
    item_uid: r.template_segment_id != null ? `segment-${r.template_segment_id}` : null,
    modality: toModality(r.modality),
    started_at: r.started_at,
    duration_seconds: durationSeconds(r.started_at, r.ended_at),
    reps_completed: r.reps_completed ?? null,
    weight_used_kg: num(r.weight_used_kg),
    distance_meters: num(r.distance_meters),
    avg_pace_s_per_500m: num(r.avg_pace_s_per_500m),
    avg_pace_s_per_km: num(r.avg_pace_s_per_km),
    avg_power_w: num(r.avg_power_w),
    stroke_rate_spm: num(r.stroke_rate_spm),
    avg_hr: r.avg_hr ?? null,
    max_hr: r.max_hr ?? null,
    calories: num(r.calories),
    emom_rounds_completed: r.emom_rounds_completed ?? null,
    emom_rounds_prescribed: r.emom_rounds_prescribed ?? null,
    incline_pct: num(r.incline_pct),
    avg_gradient_pct: num(r.avg_gradient_pct),
    run_cadence_spm: r.run_cadence_spm ?? null,
    source: r.source ?? null,
    zone_seconds: parseZoneSeconds(r.raw_lap_data_json),
    leg_index: r.leg_index ?? null,
    leg_role: toLegRole(r.leg_role),
    leg_phase: toLegPhase(r.leg_phase),
    is_structural: r.is_structural ?? false,
    run_splits: null,
    ...ergFields(r.raw_lap_data_json),
  }));

  // Segunda pasada, en memoria (sin consulta extra: las columnas ya están
  // todas en `mapped`) — agrupa los tramos de cada carrera estructurada y los
  // cuelga de su fila portadora (leg_index === 0). Ver run-splits.ts.
  const runSplitsByCarrierPosition = groupRunSplits(mapped);
  if (runSplitsByCarrierPosition.size === 0) return mapped;
  return mapped.map((m) => {
    const splits = runSplitsByCarrierPosition.get(m.position);
    return splits ? { ...m, run_splits: splits } : m;
  });
}

/** Fold the erg detail out of raw_lap_data_json into the flat SegmentActual erg
 *  fields (all null when the segment carries no erg detail). */
function ergFields(raw: unknown): Pick<
  SegmentActual,
  'drag_factor' | 'avg_calories_per_hour' | 'peak_drive_force_lbs' | 'avg_drive_force_lbs' | 'erg_splits'
> {
  const erg = parseErgDetail(raw);
  return {
    drag_factor: erg?.drag_factor ?? null,
    avg_calories_per_hour: erg?.avg_calories_per_hour ?? null,
    peak_drive_force_lbs: erg?.peak_drive_force_lbs ?? null,
    avg_drive_force_lbs: erg?.avg_drive_force_lbs ?? null,
    erg_splits: erg?.erg_splits ?? null,
  };
}

/** Load the per-segment actuals for ONE workout execution, ordered by position. */
export async function loadSegmentActuals(sql: Sql, executionId: number): Promise<SegmentActual[]> {
  const rows = await sql<SegmentActualRow[]>`
    select
      template_segment_id::text as template_segment_id,
      position                  as position,
      modality                  as modality,
      started_at::text          as started_at,
      ended_at::text            as ended_at,
      reps_completed            as reps_completed,
      weight_used_kg            as weight_used_kg,
      distance_meters           as distance_meters,
      avg_pace_s_per_500m       as avg_pace_s_per_500m,
      avg_pace_s_per_km         as avg_pace_s_per_km,
      avg_power_w               as avg_power_w,
      stroke_rate_spm           as stroke_rate_spm,
      avg_hr                    as avg_hr,
      max_hr                    as max_hr,
      calories                  as calories,
      emom_rounds_completed     as emom_rounds_completed,
      emom_rounds_prescribed    as emom_rounds_prescribed,
      incline_pct               as incline_pct,
      avg_gradient_pct          as avg_gradient_pct,
      run_cadence_spm           as run_cadence_spm,
      source                    as source,
      leg_index                 as leg_index,
      leg_role                  as leg_role,
      leg_phase                 as leg_phase,
      is_structural             as is_structural,
      raw_lap_data_json         as raw_lap_data_json
    from segment_executions
    where execution_id = ${executionId}
    order by position asc, id asc
  `;
  return buildSegmentActuals(rows);
}
