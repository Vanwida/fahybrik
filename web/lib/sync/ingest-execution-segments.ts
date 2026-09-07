// Per-segment ingestion for a finished workout execution.
//
// iOS reports one entry per segment it tracked during the session (a run leg,
// an erg piece, a strength block). We persist each as a `segment_executions`
// row keyed by (execution_id, position) so the coach/athlete analytics can
// break work down by MODALITY (run vs row vs ski/bike vs strength) and by the
// modality-native intensity fields (run pace /km, erg pace /500m, power, SPM).
//
// Idempotent: re-sending the same payload UPSERTs by (execution_id, position),
// so a retried sync never duplicates segments. Mirrors the conflict strategy
// used for the parent workout_executions row.

import type { Sql, TransactionClient } from '@/lib/db';
import { REPS_STATUSES, RX_SCALED_VALUES, HR_SOURCES, type RepsStatus } from '@fahybrid/shared/schema';
import { normalizeFormat } from '@fahybrid/shared/domain/prescription/format';
import { SEGMENT_MODALITIES, type SegmentModality } from '@fahybrid/shared/domain/segment-modality';
import { ergSplitItemSchema } from '@/lib/execution/erg-splits';
import { coerceWireInstant } from '@/lib/sync/wire-instant';
import { deriveRepsStatus, persistSegmentSets } from '@/lib/sync/ingest-segment-sets';
import {
  CALORIES_MAX,
  clipText,
  DISTANCE_M_MAX,
  ERG_SPLITS_MAX,
  PACE_S_MAX,
  POWER_W_MAX,
  SCALED_NOTE_MAX,
  SEGMENTS_PER_EXECUTION_MAX,
  STROKE_SPM_MAX,
  WEIGHT_KG_MAX,
  sanitizeConfidence,
  sanitizeDurationSeconds,
  sanitizeHrBpm,
  sanitizeHrSource,
  sanitizeInclinePct,
  sanitizeLegPhase,
  sanitizeLegRole,
  sanitizeNonNegative,
  sanitizeNonNegativeInt,
  sanitizeNumericColumn,
  sanitizePositiveInt,
  sanitizeRepsSource,
  sanitizeRepsStatus,
  sanitizeRunCadenceSpm,
  sanitizeRxScaled,
  sanitizeSegmentSource,
} from '@/lib/sync/sanitize-measurement';
import { type SegmentInput } from '@/lib/sync/segment-input-schema';

// Re-export the honest-logging vocabulary (single source lives in shared) so the
// sync layer's public surface stays self-contained for callers/tests.
export { REPS_STATUSES, RX_SCALED_VALUES, HR_SOURCES, type RepsStatus };

// Canonical modality vocabulary. The single source moved to `shared/domain` when
// the coach's note gained a zone chart with a modality filter: that write schema
// runs in the BROWSER and cannot import this module (it pulls in the database).
// Re-exported here so every existing caller keeps its import path.
export { SEGMENT_MODALITIES, type SegmentModality };

export {
  HR_MAX_BPM,
  HR_MIN_BPM,
  INCLINE_MAX_PCT,
  RUN_CADENCE_MAX_SPM,
  RUN_CADENCE_MIN_SPM,
  sanitizeConfidence,
  sanitizeHrBpm,
  sanitizeInclinePct,
  sanitizeRunCadenceSpm,
} from '@/lib/sync/sanitize-measurement';

export {
  segmentInputSchema,
  setInputSchema,
  type SegmentInput,
  type SetInput,
} from '@/lib/sync/segment-input-schema';

export { deriveRepsStatus } from '@/lib/sync/ingest-segment-sets';

/** Normalise a free-ish modality string from the client to the canonical set. */
export function normalizeModality(raw: string | null | undefined): SegmentModality {
  if (!raw) return 'other';
  const v = raw.trim().toLowerCase();
  switch (v) {
    case 'run':
    case 'running':
      return 'run';
    case 'row':
    case 'rowing':
    case 'rowerg':
    case 'row-erg':
      return 'row';
    case 'ski':
    case 'skierg':
    case 'ski-erg':
      return 'ski';
    case 'bike':
    case 'bikeerg':
    case 'bike-erg':
    case 'cycling':
    case 'assault-bike':
      return 'bike';
    case 'strength':
    case 'lift':
    case 'weights':
      return 'strength';
    default:
      return 'other';
  }
}

/**
 * Honest per-segment duration in whole seconds: explicit `duration_seconds`
 * wins; else derive it from explicit started/ended timestamps; else UNKNOWN
 * (null) — we never invent a duration from the execution window.
 *
 * Exported because the execution recorder ranks the tramos by this SAME
 * duration to pick `totals_source` (the longest tramo owns the totals). One
 * rule, one place: a second definition would let the two disagree.
 */
export function segmentDurationSeconds(seg: SegmentInput): number | null {
  const explicit = sanitizeDurationSeconds(seg.duration_seconds);
  if (explicit != null) return explicit;
  const started = coerceWireInstant(seg.started_at);
  const ended = coerceWireInstant(seg.ended_at);
  if (started && ended) {
    const d = (new Date(ended).getTime() - new Date(started).getTime()) / 1000;
    return Number.isFinite(d) && d >= 0 ? Math.round(d) : null;
  }
  return null;
}

/**
 * prior_work_s for one segment = summed duration of the payload segments that
 * come BEFORE it (lower position) — a fatigue proxy for analytics/prediction.
 * Honest-or-nothing: if ANY earlier segment has no measurable duration, prior
 * work is unknown → null (never a partial sum). The first segment has 0 prior
 * work — a fact, not a fabrication.
 */
function priorWorkSeconds(segments: SegmentInput[], current: SegmentInput): number | null {
  let sum = 0;
  for (const s of segments) {
    if (s.position >= current.position) continue;
    const d = segmentDurationSeconds(s);
    if (d == null) return null;
    sum += d;
  }
  return sanitizeNonNegativeInt(sum);
}

/**
 * La atribución de tramo de una carrera estructurada (mig 0146): índice plano +
 * rol + fase. TODO o NADA — el CHECK `segment_executions_leg_all_or_none_chk` lo
 * exige, y por una razón: media atribución no responde ninguna de las dos
 * preguntas para las que existe (¿contra qué tramo prescrito casa? ¿es una serie
 * o el trote de vuelta?). Un cliente que mande solo una parte aterriza como «esta
 * fila no es un bout de carrera», que es la respuesta honesta.
 */
function legAttribution(seg: SegmentInput): {
  index: number | null;
  role: string | null;
  phase: string | null;
} {
  const index = sanitizeNonNegativeInt(seg.leg_index);
  const role = sanitizeLegRole(seg.leg_role);
  const phase = sanitizeLegPhase(seg.leg_phase);
  if (index == null || role == null || phase == null) {
    return { index: null, role: null, phase: null };
  }
  return { index, role, phase };
}

/** The effort CONTEXT copied off a template_segment (see migration 0120). */
type SegmentContext = {
  block_format: string | null;
  scheme: string | null;
  exercise_id: number;
  prescription_json: unknown;
};

/**
 * Upsert one segment_executions row per input segment for a given execution.
 * Derives started/ended from explicit timestamps when present, else from the
 * execution window + duration so we always have a usable interval. Stores
 * zone_seconds_json inside raw_lap_data_json under a `zone_seconds` key.
 *
 * The effort CONTEXT (context_format / context_source / exercise_id /
 * prescription_snapshot / prior_work_s — migration 0120) is derived SERVER-SIDE,
 * never trusted from the client: a segment linked to a `template_segment_id`
 * takes its format + exercise + prescription straight from that block
 * (context_source='block'); an unlinked segment falls back to the whole
 * session's format (context_source='session'), passed in as `sessionFormat`.
 *
 * @returns number of segments written.
 */
export async function ingestExecutionSegments(args: {
  sql: Sql | TransactionClient;
  executionId: number;
  executionStartedAt: string;
  segments: SegmentInput[];
  /**
   * The session's format (the assignment's `templates.format`), used as the
   * context fallback for segments with no live template link. Raw or canonical
   * — normalized here through the shared catalog (single source). Null when the
   * caller has no session format.
   */
  sessionFormat?: string | null;
}): Promise<number> {
  const { sql, executionId, executionStartedAt, sessionFormat } = args;
  const segments = args.segments.slice(0, SEGMENTS_PER_EXECUTION_MAX);
  if (segments.length === 0) return 0;

  // Session-format fallback, canonicalized ONCE through the shared catalog.
  const sessionCanonicalFormat = normalizeFormat(sessionFormat) ?? null;

  // Batched context lookup for every linked segment (no N+1): one query resolves
  // block format / exercise / prescription for all `template_segment_id`s.
  const templateSegmentIds = Array.from(
    new Set(
      segments
        .map((s) => sanitizePositiveInt(s.template_segment_id))
        .filter((x): x is number => x != null),
    ),
  );
  const contextById = new Map<number, SegmentContext>();
  if (templateSegmentIds.length > 0) {
    const rows = await sql<
      Array<{
        id: string;
        block_format: string | null;
        scheme: string | null;
        exercise_id: string;
        prescription_json: unknown;
      }>
    >`
      select
        id::text,
        block_format,
        prescription_json->>'scheme' as scheme,
        exercise_id::text as exercise_id,
        prescription_json
      from template_segments
      where id in ${sql(templateSegmentIds)}
    `;
    for (const r of rows) {
      contextById.set(Number(r.id), {
        block_format: r.block_format,
        scheme: r.scheme,
        exercise_id: Number(r.exercise_id),
        prescription_json: r.prescription_json,
      });
    }
  }

  let written = 0;
  for (const seg of segments) {
    const position = sanitizeNonNegativeInt(seg.position);
    if (position == null) continue;

    const durationSeconds = sanitizeDurationSeconds(seg.duration_seconds);
    const startedAt = coerceWireInstant(seg.started_at) ?? executionStartedAt;
    // If no explicit end, derive from start + duration so analytics that read
    // (ended_at - started_at) still work.
    const endedAt =
      coerceWireInstant(seg.ended_at) ??
      (durationSeconds != null
        ? new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString()
        : startedAt);

    const modality = normalizeModality(seg.modality);
    // Only persist a template link the lookup actually found. A stale / unknown
    // id is not identity of the save — the FK used to 500 the whole POST.
    const rawTemplateId = sanitizePositiveInt(seg.template_segment_id);
    const templateSegmentId =
      rawTemplateId != null && contextById.has(rawTemplateId) ? rawTemplateId : null;
    // raw_lap_data_json holds every jsonb-only signal for the segment: the HR
    // zone-seconds AND the erg detail (#33, PM5 aggregates + interval splits).
    // Only present keys are written (honest-null: an absent metric is an absent
    // key, never a null-filled one). Passed through sql.json so the column stores
    // an OBJECT — NOT a double-encoded JSON string scalar — so it reads back as an
    // object for analytics and echoes verbatim on the coach/athlete detail.
    // A split that fails its own schema is dropped (costs the split, not the session).
    const ergSplits = (seg.erg_splits ?? [])
      .map((item) => ergSplitItemSchema.safeParse(item))
      .filter((p) => p.success)
      .map((p) => p.data)
      .slice(0, ERG_SPLITS_MAX);
    const dragFactor = sanitizeNonNegative(seg.drag_factor);
    const avgCalH = sanitizeNonNegative(seg.avg_calories_per_hour);
    const peakForce = sanitizeNonNegative(seg.peak_drive_force_lbs);
    const avgForce = sanitizeNonNegative(seg.avg_drive_force_lbs);
    const lap: Record<string, unknown> = {};
    if (seg.zone_seconds_json !== undefined) lap.zone_seconds = seg.zone_seconds_json;
    if (dragFactor != null) lap.drag_factor = dragFactor;
    if (avgCalH != null) lap.avg_calories_per_hour = avgCalH;
    if (peakForce != null) lap.peak_drive_force_lbs = peakForce;
    if (avgForce != null) lap.avg_drive_force_lbs = avgForce;
    if (ergSplits.length > 0) lap.erg_splits = ergSplits;
    const rawLap =
      Object.keys(lap).length > 0 ? sql.json(lap as Parameters<typeof sql.json>[0]) : null;

    // Honest reps state. `reps_actual` is canonical; `reps_completed` is the
    // legacy alias for the SAME value. NULL means skipped — NEVER fabricate a 0.
    const repsActual =
      seg.reps_actual !== undefined
        ? sanitizeNonNegativeInt(seg.reps_actual)
        : sanitizeNonNegativeInt(seg.reps_completed);
    const repsPrescribed = sanitizeNonNegativeInt(seg.reps_prescribed);
    // Only rep-bearing segments carry a status — a pure run/erg leg (no reps at
    // all) must NOT be stamped 'skipped'. Derive only when the client omits it
    // AND the segment actually involves reps.
    const hasRepSignal =
      seg.reps_actual !== undefined ||
      seg.reps_completed !== undefined ||
      repsPrescribed != null ||
      seg.reps_status != null;
    const repsStatus =
      sanitizeRepsStatus(seg.reps_status) ??
      (hasRepSignal ? deriveRepsStatus(repsActual, repsPrescribed) : null);
    const repsConfirmed = seg.reps_confirmed ?? false;
    const isStructural = seg.is_structural ?? false;

    // Effort CONTEXT (migration 0120), derived server-side. A live template link
    // → 'block' (format/exercise/prescription from that block); otherwise fall
    // back to the session format → 'session'.
    const ctx = templateSegmentId != null ? contextById.get(templateSegmentId) : undefined;
    const contextSource: 'block' | 'session' = ctx ? 'block' : 'session';
    const contextFormat = ctx
      ? (normalizeFormat(ctx.block_format ?? ctx.scheme) ?? null)
      : sessionCanonicalFormat;
    const exerciseId = ctx ? ctx.exercise_id : null;
    const prescriptionSnapshot =
      ctx && ctx.prescription_json != null
        ? sql.json(ctx.prescription_json as Parameters<typeof sql.json>[0])
        : null;
    const priorWorkS = priorWorkSeconds(segments, seg);
    // Atribución de tramo: TODO o NADA (lo exige también el CHECK de 0146). Una
    // fila con rol pero sin índice no se puede casar con la prescripción, y una con
    // índice pero sin rol no se distingue de su recuperación — que son los dos
    // agujeros que 0146 cierra. Un payload a medias aterriza como «no es un bout»,
    // que es la respuesta honesta, en vez de como media verdad.
    const leg = legAttribution(seg);

    const rows = await sql<Array<{ id: string }>>`
      insert into segment_executions (
        execution_id, template_segment_id, position,
        started_at, ended_at,
        modality, distance_meters,
        avg_pace_s_per_500m, avg_pace_s_per_km, avg_power_w, stroke_rate_spm,
        run_cadence_spm, incline_pct,
        avg_hr, max_hr, hr_source, calories, reps_completed, weight_used_kg,
        reps_prescribed, reps_status, reps_confirmed, is_structural, rx_scaled, scaled_note,
        emom_rounds_completed, emom_rounds_prescribed,
        leg_index, leg_role, leg_phase,
        sensor_work_s, sensor_rest_s, sensor_timing_confidence,
        reps_source, reps_confidence,
        raw_lap_data_json, source,
        context_format, context_source, exercise_id, prescription_snapshot, prior_work_s
      ) values (
        ${executionId}::bigint,
        ${templateSegmentId},
        ${position},
        ${startedAt}::timestamptz,
        ${endedAt}::timestamptz,
        ${modality},
        ${sanitizeNumericColumn(seg.distance_meters, DISTANCE_M_MAX)},
        ${sanitizeNumericColumn(seg.avg_pace_s_per_500m, PACE_S_MAX)},
        ${sanitizeNumericColumn(seg.avg_pace_s_per_km, PACE_S_MAX)},
        ${sanitizeNumericColumn(seg.avg_power_w, POWER_W_MAX)},
        ${sanitizeNumericColumn(seg.stroke_rate_spm, STROKE_SPM_MAX)},
        ${sanitizeRunCadenceSpm(seg.run_cadence_spm)},
        ${sanitizeInclinePct(seg.incline_pct)},
        ${sanitizeHrBpm(seg.avg_hr)},
        ${sanitizeHrBpm(seg.max_hr)},
        ${sanitizeHrSource(seg.hr_source)},
        ${sanitizeNumericColumn(seg.calories, CALORIES_MAX)},
        ${repsActual},
        ${sanitizeNumericColumn(seg.weight_used_kg, WEIGHT_KG_MAX)},
        ${repsPrescribed},
        ${repsStatus},
        ${repsConfirmed},
        ${isStructural},
        ${sanitizeRxScaled(seg.rx_scaled)},
        ${clipText(seg.scaled_note, SCALED_NOTE_MAX)},
        ${sanitizeNonNegativeInt(seg.emom_rounds_completed)},
        ${sanitizeNonNegativeInt(seg.emom_rounds_prescribed)},
        ${leg.index},
        ${leg.role},
        ${leg.phase},
        ${sanitizeNonNegative(seg.sensor_work_s)},
        ${sanitizeNonNegative(seg.sensor_rest_s)},
        ${sanitizeConfidence(seg.sensor_timing_confidence)},
        ${sanitizeRepsSource(seg.reps_source)},
        ${sanitizeConfidence(seg.reps_confidence)},
        ${rawLap},
        ${sanitizeSegmentSource(seg.source)},
        ${contextFormat},
        ${contextSource},
        ${exerciseId},
        ${prescriptionSnapshot},
        ${priorWorkS}
      )
      -- El destino del ON CONFLICT tiene que ESPEJAR EXACTAMENTE el unique vivo.
      -- La migración 0155 lo amplió a (execution_id, position, round_index) para
      -- que un circuito por rondas quepa, y este target se quedó con dos columnas:
      -- Postgres no busca "un unique que empiece por estas", exige uno que coincida,
      -- así que TODO insert de tramo reventaba con "there is no unique or exclusion
      -- constraint matching the ON CONFLICT specification" — no solo los de rondas.
      -- Si algún día vuelve a cambiar ese unique, esta línea cambia con él.
      on conflict (execution_id, position, round_index) do update set
        template_segment_id = coalesce(excluded.template_segment_id, segment_executions.template_segment_id),
        started_at          = excluded.started_at,
        ended_at            = excluded.ended_at,
        modality            = excluded.modality,
        distance_meters     = coalesce(excluded.distance_meters, segment_executions.distance_meters),
        avg_pace_s_per_500m = coalesce(excluded.avg_pace_s_per_500m, segment_executions.avg_pace_s_per_500m),
        avg_pace_s_per_km   = coalesce(excluded.avg_pace_s_per_km, segment_executions.avg_pace_s_per_km),
        avg_power_w         = coalesce(excluded.avg_power_w, segment_executions.avg_power_w),
        stroke_rate_spm     = coalesce(excluded.stroke_rate_spm, segment_executions.stroke_rate_spm),
        run_cadence_spm     = coalesce(excluded.run_cadence_spm, segment_executions.run_cadence_spm),
        incline_pct         = coalesce(excluded.incline_pct, segment_executions.incline_pct),
        avg_hr              = coalesce(excluded.avg_hr, segment_executions.avg_hr),
        max_hr              = coalesce(excluded.max_hr, segment_executions.max_hr),
        -- Same merge as avg_hr/max_hr above: this column is THEIR provenance, so
        -- it must never disagree with which sync actually wrote them.
        hr_source           = coalesce(excluded.hr_source, segment_executions.hr_source),
        calories            = coalesce(excluded.calories, segment_executions.calories),
        weight_used_kg      = coalesce(excluded.weight_used_kg, segment_executions.weight_used_kg),
        -- Honest-logging fields are a COHERENT group: the latest payload is the
        -- athlete's declared truth, so we OVERWRITE (a skip's NULL stays NULL —
        -- never coalesced to an old value or a fabricated 0).
        reps_completed      = excluded.reps_completed,
        reps_prescribed     = excluded.reps_prescribed,
        reps_status         = excluded.reps_status,
        reps_confirmed      = excluded.reps_confirmed,
        sensor_work_s              = excluded.sensor_work_s,
        sensor_rest_s              = excluded.sensor_rest_s,
        sensor_timing_confidence   = excluded.sensor_timing_confidence,
        reps_source                = excluded.reps_source,
        reps_confidence            = excluded.reps_confidence,
        is_structural       = excluded.is_structural,
        rx_scaled           = excluded.rx_scaled,
        scaled_note         = excluded.scaled_note,
        -- EMOM completion is the athlete's declared truth for THIS payload → overwrite
        -- (a re-sync of a non-EMOM segment carries NULLs, restoring the honest absence).
        emom_rounds_completed  = excluded.emom_rounds_completed,
        emom_rounds_prescribed = excluded.emom_rounds_prescribed,
        -- La atribución de tramo describe QUÉ ES la fila, y el último payload es el
        -- que lo sabe → se SOBRESCRIBE en bloque (los tres a la vez, igual que los
        -- escribe legAttribution). Con coalesce, un re-sync desde una versión vieja
        -- del cliente dejaría una recuperación disfrazada de trabajo.
        leg_index              = excluded.leg_index,
        leg_role               = excluded.leg_role,
        leg_phase              = excluded.leg_phase,
        raw_lap_data_json   = coalesce(excluded.raw_lap_data_json, segment_executions.raw_lap_data_json),
        source              = coalesce(excluded.source, segment_executions.source),
        -- Effort context is server-DERIVED, so a re-sync recomputes it: the
        -- newly-derived format/source/prior-work OVERWRITE. exercise_id and the
        -- prescription snapshot are immutable history — keep the existing value
        -- when a later payload can't resolve them (coalesce, never clobber to NULL).
        context_format        = excluded.context_format,
        context_source        = excluded.context_source,
        prior_work_s          = excluded.prior_work_s,
        exercise_id           = coalesce(excluded.exercise_id, segment_executions.exercise_id),
        prescription_snapshot = coalesce(excluded.prescription_snapshot, segment_executions.prescription_snapshot),
        updated_at          = now()
      returning id::text
    `;
    written += 1;

    if (seg.sets && seg.sets.length > 0) {
      const segmentExecutionId = Number(rows[0]?.id);
      if (Number.isFinite(segmentExecutionId)) {
        await persistSegmentSets({ sql, segmentExecutionId, sets: seg.sets });
      }
    }
  }
  return written;
}
