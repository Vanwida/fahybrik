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

import { z } from 'zod';
import type { Sql, TransactionClient } from '@/lib/db';
import { REPS_STATUSES, RX_SCALED_VALUES, HR_SOURCES, type RepsStatus } from '@fahybrid/shared/schema';
import { normalizeFormat } from '@fahybrid/shared/domain/prescription/format';
import { SEGMENT_MODALITIES, type SegmentModality } from '@fahybrid/shared/domain/segment-modality';
import { ergSplitItemSchema } from '@/lib/execution/erg-splits';
import { SEGMENT_LEG_PHASES, SEGMENT_LEG_ROLES } from '@/lib/execution/segment-work';
import { isWorkingSet } from '@fahybrid/shared/domain/strength';
import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';
import {
  prescriptionHasRelativeTarget,
  type AthleteAnchors,
} from '@fahybrid/shared/domain/prescription/resolve-relative';
import { loadAthleteRelativeAnchors } from '@/lib/athlete/relative-anchors';
import { sealPrescriptionJson } from '@/lib/athlete/seal-prescription';

// Re-export the honest-logging vocabulary (single source lives in shared) so the
// sync layer's public surface stays self-contained for callers/tests.
export { REPS_STATUSES, RX_SCALED_VALUES, HR_SOURCES, type RepsStatus };

// Canonical modality vocabulary. The single source moved to `shared/domain` when
// the coach's note gained a zone chart with a modality filter: that write schema
// runs in the BROWSER and cannot import this module (it pulls in the database).
// Re-exported here so every existing caller keeps its import path.
export { SEGMENT_MODALITIES, type SegmentModality };

// Physiological bands for the two running signals (mig 0124), mirroring the DB
// CHECK constraints. The ingest layer range-gates device values to these bands
// BEFORE insert so a stray reading (a walking break's cadence, a glitch) can
// never make the CHECK reject a whole segment row — it lands as an honest null.
export const RUN_CADENCE_MIN_SPM = 100; // below this is walking, not a run cadence
export const RUN_CADENCE_MAX_SPM = 250; // generous sprint ceiling
export const INCLINE_MAX_PCT = 30; // treadmill tops ~15; headroom for steep trail
export const HR_MIN_BPM = 30; // below this is not a working pulse
export const HR_MAX_BPM = 260; // above this is an artifact, not a heart

/**
 * Gate a raw heart rate (bpm) to the stored band, rounding to the integer column.
 * Out-of-band or non-finite → null (honest "unknown", never a clamped fabrication).
 *
 * WHY THIS EXISTS AND THE SCHEMA NO LONGER ENFORCES THE BAND. A strap artifact —
 * a 300 bpm spike as the contact breaks — used to fail `segmentInputSchema`, and a
 * Zod failure rejects the WHOLE request: one bad number in one segment and the
 * athlete's entire 47-minute session came back 400 and was never stored. The band
 * belongs here, where an impossible reading costs its own field and nothing else,
 * exactly like cadence and incline above.
 */
export function sanitizeHrBpm(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= HR_MIN_BPM && r <= HR_MAX_BPM ? r : null;
}

/**
 * Gate a 0…1 confidence to its band. Out-of-band or non-finite → null. Same
 * reason as `sanitizeHrBpm`: a confidence is computed by the on-device sensor
 * pipeline, and an off-by-a-rounding value must cost its own field, never the
 * whole session.
 */
export function sanitizeConfidence(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v >= 0 && v <= 1 ? v : null;
}

/**
 * Gate a raw running cadence (steps/min) to the stored band, rounding to the
 * integer column. Out-of-band or non-finite → null (honest "unknown", never a
 * clamped fabrication). Shared by every ingest channel (iOS / vision / Garmin).
 */
export function sanitizeRunCadenceSpm(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= RUN_CADENCE_MIN_SPM && r <= RUN_CADENCE_MAX_SPM ? r : null;
}

/**
 * Gate a raw incline/grade percent to the stored band [0, INCLINE_MAX_PCT],
 * rounding to one decimal (the numeric(4,1) column). Out-of-band → null.
 */
export function sanitizeInclinePct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = Math.round(v * 10) / 10;
  return r >= 0 && r <= INCLINE_MAX_PCT ? r : null;
}

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
 * Derive the honest reps status when the client omits it (locked contract rule):
 *   actual == null                          → 'skipped'
 *   prescribed != null && actual != presc.  → 'scaled'
 *   else                                    → 'done'
 * A wire-supplied status always wins; this only fills the gap.
 */
export function deriveRepsStatus(
  actual: number | null | undefined,
  prescribed: number | null | undefined,
): RepsStatus {
  if (actual == null) return 'skipped';
  if (prescribed != null && actual !== prescribed) return 'scaled';
  return 'done';
}

/** `is_approach` del set i (1-based) en el snapshot de la prescripción, si viene. */
export function approachFromPrescription(snapshot: unknown, setIndex: number): boolean | undefined {
  if (snapshot == null || typeof snapshot !== 'object') return undefined;
  const sets = (snapshot as { sets?: unknown }).sets;
  if (!Array.isArray(sets)) return undefined;
  const raw = sets[setIndex - 1];
  if (raw == null || typeof raw !== 'object') return undefined;
  const v = (raw as { is_approach?: unknown }).is_approach;
  return typeof v === 'boolean' ? v : undefined;
}

/** Cable manda; si omite, se lee la prescripción. Ausente en las dos = trabajo. */
export function resolveIsApproach(wire: boolean | undefined, snapshot: unknown, setIndex: number): boolean {
  if (typeof wire === 'boolean') return wire;
  return approachFromPrescription(snapshot, setIndex) === true;
}

// One working set of a strength segment. All optional except `set_index`; a NULL
// `reps_actual` means the set was skipped (never a fabricated 0).
export const setInputSchema = z.object({
  set_index: z.number().int().min(1),
  reps_prescribed: z.number().int().min(0).nullable().optional(),
  reps_actual: z.number().int().min(0).nullable().optional(),
  load_prescribed_kg: z.number().nonnegative().nullable().optional(),
  load_actual_kg: z.number().nonnegative().nullable().optional(),
  rpe: z.number().min(0).max(10).nullable().optional(),
  rir: z.number().min(0).max(10).nullable().optional(),
  status: z.enum(REPS_STATUSES).optional(),
  confirmed: z.boolean().optional(),
  tempo: z.string().max(20).optional(),
  rest_s: z.number().int().min(0).optional(),
  // Card 155 / mig 0207. Optional: un cliente viejo no lo manda.
  is_approach: z.boolean().optional(),
  // Sensor fases 2–3 (mig 0175/0176). Optional: older clients omit.
  reps_source: z.enum(['athlete_tap', 'sensor', 'sensor_corrected']).nullish(),
  reps_confidence: z.number().nullish(),
  mean_velocity_first_m_s: z.number().nonnegative().nullish(),
  mean_velocity_last_m_s: z.number().nonnegative().nullish(),
  velocity_loss_pct: z.number().nonnegative().nullish(),
  rom_m: z.number().nonnegative().nullish(),
  velocity_confidence: z.number().nullish(),
});

export type SetInput = z.infer<typeof setInputSchema>;

// Exactly the shape iOS sends per segment on workout finish.
export const segmentInputSchema = z.object({
  template_segment_id: z.number().int().positive().optional(),
  position: z.number().int().min(0),
  modality: z.string().min(1).max(40),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  duration_seconds: z.number().int().min(0).optional(),
  distance_meters: z.number().nonnegative().optional(),
  avg_pace_s_per_500m: z.number().nonnegative().optional(),
  avg_pace_s_per_km: z.number().nonnegative().optional(),
  avg_power_w: z.number().nonnegative().optional(),
  stroke_rate_spm: z.number().nonnegative().optional(),
  // Running-native signals (mig 0124). run_cadence_spm = steps/min (a step is NOT
  // an erg stroke → its own column, never stroke_rate_spm); incline_pct = average
  // treadmill/uphill grade %. Both range-gated server-side (see sanitize*), so an
  // out-of-band device value lands as null instead of tripping the DB CHECK.
  // Tampoco se valida la banda de estos dos, por lo mismo. `incline_pct` además
  // llega CON SIGNO: el estándar FTMS manda la pendiente como entero con signo, así
  // que una cinta en bajada mandaba un negativo y el envío entero se caía. La
  // bajada se guarda como hueco (la columna sólo admite de 0 a 30), que es una
  // pérdida honesta y acotada — no un entreno perdido. Ver card 117.
  run_cadence_spm: z.number().optional(),
  incline_pct: z.number().optional(),
  // NO SE VALIDA LA BANDA AQUÍ, A PROPÓSITO. Rechazar en el esquema tira la
  // petición ENTERA: un pico de 300 ppm al despegarse la cinta del pecho borraba
  // los 47 minutos del atleta. La banda la aplica `sanitizeHrBpm` al insertar, así
  // que una lectura imposible se queda sin ese campo y no se lleva el entreno por
  // delante. Igual que la cadencia y la pendiente.
  avg_hr: z.number().optional(),
  max_hr: z.number().optional(),
  // Provenance of avg_hr/max_hr specifically (mig 0153) — which device measured
  // the pulse, resolved client-side by the live engine's HR-ownership latch.
  // Distinct from `source` below (the TRAMO's movement provenance). Nullish so a
  // segment with no HR, or a pre-0153 client, omits it cleanly.
  hr_source: z.enum(HR_SOURCES).nullish(),
  calories: z.number().nonnegative().optional(),
  // Legacy alias kept for back-compat: = ACTUAL reps (or null when skipped).
  // Ingest prefers `reps_actual` when present; never coalesces a skip to 0.
  reps_completed: z.number().int().min(0).optional(),
  weight_used_kg: z.number().nonnegative().optional(),
  // Honest-logging fields (all optional; see deriveRepsStatus for the fallback).
  reps_prescribed: z.number().int().min(0).nullable().optional(),
  // Canonical actual; NULL only when skipped.
  reps_actual: z.number().int().min(0).nullable().optional(),
  reps_status: z.enum(REPS_STATUSES).optional(),
  reps_confirmed: z.boolean().optional(),
  // Sensor fases 1–2 (mig 0174/0175).
  sensor_work_s: z.number().nonnegative().nullish(),
  sensor_rest_s: z.number().nonnegative().nullish(),
  sensor_timing_confidence: z.number().nullish(),
  reps_source: z.enum(['athlete_tap', 'sensor', 'sensor_corrected']).nullish(),
  reps_confidence: z.number().nullish(),
  is_structural: z.boolean().optional(),
  // EMOM completion (mig 0134). How many of the EMOM's intervals the athlete
  // completed the prescribed work in, and how many were prescribed — the honest
  // "X/Y rondas" the finish dialog promises. Both NULL for non-EMOM segments; an
  // EMOM interval is neither a rep nor a strength set, so it gets its own columns.
  emom_rounds_completed: z.number().int().min(0).nullable().optional(),
  emom_rounds_prescribed: z.number().int().min(0).nullable().optional(),
  rx_scaled: z.enum(RX_SCALED_VALUES).optional(),
  scaled_note: z.string().max(500).optional(),
  // Per-set strength detail; delete-then-insert by segment on re-sync.
  sets: z.array(setInputSchema).max(60).optional(),
  zone_seconds_json: z.unknown().optional(),
  // Concept2 PM5 erg detail (#33). NO new columns — these fold into the segment's
  // `raw_lap_data_json` (alongside zone_seconds). `avg_pace_s_per_500m` above
  // already carries the PM5's own average pace. Segment-level aggregates + the
  // monitor's per-interval splits; all optional (a non-erg segment omits them).
  drag_factor: z.number().finite().nonnegative().nullish(),
  avg_calories_per_hour: z.number().finite().nonnegative().nullish(),
  peak_drive_force_lbs: z.number().finite().nonnegative().nullish(),
  avg_drive_force_lbs: z.number().finite().nonnegative().nullish(),
  erg_splits: z.array(ergSplitItemSchema).max(200).nullish(),
  // Atribución por tramo de una carrera estructurada (mig 0146). Los tres van
  // JUNTOS o ninguno — describen un bout de la lista plana de tramos de la
  // prescripción, y media atribución no sirve para nada (ver `legAttribution`).
  // `leg_index` comparte espacio de índices con `flattenSegments()`, así que es la
  // clave con la que lo hecho casa con lo prescrito sin zipear por orden.
  leg_index: z.number().int().min(0).nullish(),
  leg_role: z.enum(SEGMENT_LEG_ROLES).nullish(),
  leg_phase: z.enum(SEGMENT_LEG_PHASES).nullish(),
  source: z.string().min(1).max(40).optional(),
});

export type SegmentInput = z.infer<typeof segmentInputSchema>;

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
  if (seg.duration_seconds != null) return seg.duration_seconds;
  if (seg.started_at && seg.ended_at) {
    const d = (new Date(seg.ended_at).getTime() - new Date(seg.started_at).getTime()) / 1000;
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
  return sum;
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
  const index = seg.leg_index ?? null;
  const role = seg.leg_role ?? null;
  const phase = seg.leg_phase ?? null;
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
  /**
   * Card 130 — si viene, un relativo se SELLA al snapshot (número ya
   * resuelto). Sin él, el snapshot copia la plantilla (tests y caminos
   * viejos). No toca `is_approach` ni el resto del guardado.
   */
  athleteId?: number;
}): Promise<number> {
  const { sql, executionId, executionStartedAt, segments, sessionFormat } = args;
  if (segments.length === 0) return 0;

  // Session-format fallback, canonicalized ONCE through the shared catalog.
  const sessionCanonicalFormat = normalizeFormat(sessionFormat) ?? null;

  // Batched context lookup for every linked segment (no N+1): one query resolves
  // block format / exercise / prescription for all `template_segment_id`s.
  const templateSegmentIds = Array.from(
    new Set(segments.map((s) => s.template_segment_id).filter((x): x is number => x != null)),
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

  // Card 130 — sello: si el atleta está y alguna plantilla es relativa,
  // resolvemos UNA vez y el snapshot guarda el número, no la frase. Sin
  // athleteId el snapshot sigue siendo la plantilla (tests y caminos viejos).
  let anchors: AthleteAnchors | null = null;
  if (args.athleteId != null) {
    const anyRelative = [...contextById.values()].some((c) => {
      const parsed = safeParsePrescription(c.prescription_json);
      return parsed.success && prescriptionHasRelativeTarget(parsed.data);
    });
    if (anyRelative) {
      anchors = await loadAthleteRelativeAnchors({
        sql,
        athlete_id: args.athleteId,
      });
    }
  }

  let written = 0;
  for (const seg of segments) {
    const startedAt = seg.started_at ?? executionStartedAt;
    // If no explicit end, derive from start + duration so analytics that read
    // (ended_at - started_at) still work.
    const endedAt =
      seg.ended_at ??
      (seg.duration_seconds != null
        ? new Date(new Date(startedAt).getTime() + seg.duration_seconds * 1000).toISOString()
        : startedAt);

    const modality = normalizeModality(seg.modality);
    // raw_lap_data_json holds every jsonb-only signal for the segment: the HR
    // zone-seconds AND the erg detail (#33, PM5 aggregates + interval splits).
    // Only present keys are written (honest-null: an absent metric is an absent
    // key, never a null-filled one). Passed through sql.json so the column stores
    // an OBJECT — NOT a double-encoded JSON string scalar — so it reads back as an
    // object for analytics and echoes verbatim on the coach/athlete detail.
    const lap: Record<string, unknown> = {};
    if (seg.zone_seconds_json !== undefined) lap.zone_seconds = seg.zone_seconds_json;
    if (seg.drag_factor != null) lap.drag_factor = seg.drag_factor;
    if (seg.avg_calories_per_hour != null) lap.avg_calories_per_hour = seg.avg_calories_per_hour;
    if (seg.peak_drive_force_lbs != null) lap.peak_drive_force_lbs = seg.peak_drive_force_lbs;
    if (seg.avg_drive_force_lbs != null) lap.avg_drive_force_lbs = seg.avg_drive_force_lbs;
    if (seg.erg_splits != null && seg.erg_splits.length > 0) lap.erg_splits = seg.erg_splits;
    if (seg.duration_seconds != null) lap.work_s = seg.duration_seconds;
    const rawLap =
      Object.keys(lap).length > 0 ? sql.json(lap as Parameters<typeof sql.json>[0]) : null;

    // Honest reps state. `reps_actual` is canonical; `reps_completed` is the
    // legacy alias for the SAME value. NULL means skipped — NEVER fabricate a 0.
    const repsActual =
      seg.reps_actual !== undefined ? seg.reps_actual : (seg.reps_completed ?? null);
    const repsPrescribed = seg.reps_prescribed ?? null;
    // Only rep-bearing segments carry a status — a pure run/erg leg (no reps at
    // all) must NOT be stamped 'skipped'. Derive only when the client omits it
    // AND the segment actually involves reps.
    const hasRepSignal =
      seg.reps_actual !== undefined ||
      seg.reps_completed !== undefined ||
      repsPrescribed != null ||
      seg.reps_status !== undefined;
    const repsStatus =
      seg.reps_status ?? (hasRepSignal ? deriveRepsStatus(repsActual, repsPrescribed) : null);
    const repsConfirmed = seg.reps_confirmed ?? false;
    const isStructural = seg.is_structural ?? false;

    // Effort CONTEXT (migration 0120), derived server-side. A live template link
    // → 'block' (format/exercise/prescription from that block); otherwise fall
    // back to the session format → 'session'.
    const ctx = seg.template_segment_id != null ? contextById.get(seg.template_segment_id) : undefined;
    const contextSource: 'block' | 'session' = ctx ? 'block' : 'session';
    const contextFormat = ctx
      ? (normalizeFormat(ctx.block_format ?? ctx.scheme) ?? null)
      : sessionCanonicalFormat;
    const exerciseId = ctx ? ctx.exercise_id : null;
    const prescriptionSnapshot =
      ctx && ctx.prescription_json != null
        ? sql.json(
            sealPrescriptionJson(ctx.prescription_json, anchors) as Parameters<
              typeof sql.json
            >[0],
          )
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
        ${seg.template_segment_id ?? null},
        ${seg.position},
        ${startedAt}::timestamptz,
        ${endedAt}::timestamptz,
        ${modality},
        ${seg.distance_meters ?? null},
        ${seg.avg_pace_s_per_500m ?? null},
        ${seg.avg_pace_s_per_km ?? null},
        ${seg.avg_power_w ?? null},
        ${seg.stroke_rate_spm ?? null},
        ${sanitizeRunCadenceSpm(seg.run_cadence_spm)},
        ${sanitizeInclinePct(seg.incline_pct)},
        ${sanitizeHrBpm(seg.avg_hr)},
        ${sanitizeHrBpm(seg.max_hr)},
        ${seg.hr_source ?? null},
        ${seg.calories ?? null},
        ${repsActual},
        ${seg.weight_used_kg ?? null},
        ${repsPrescribed},
        ${repsStatus},
        ${repsConfirmed},
        ${isStructural},
        ${seg.rx_scaled ?? null},
        ${seg.scaled_note ?? null},
        ${seg.emom_rounds_completed ?? null},
        ${seg.emom_rounds_prescribed ?? null},
        ${leg.index},
        ${leg.role},
        ${leg.phase},
        ${seg.sensor_work_s ?? null},
        ${seg.sensor_rest_s ?? null},
        ${sanitizeConfidence(seg.sensor_timing_confidence)},
        ${seg.reps_source ?? null},
        ${sanitizeConfidence(seg.reps_confidence)},
        ${rawLap},
        ${seg.source ?? null},
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

    // Per-set strength detail. Delete-then-insert keyed on the parent segment so
    // a retried sync replaces cleanly (no orphan/dupe sets). Only touched when
    // the client sends a `sets` array for this segment.
    if (seg.sets && seg.sets.length > 0) {
      const segmentExecutionId = Number(rows[0]?.id);
      if (Number.isFinite(segmentExecutionId)) {
        await sql`delete from set_executions where segment_execution_id = ${segmentExecutionId}`;
        const writtenSets: Array<{
          status: string;
          is_approach: boolean;
          reps_actual: number | null;
          load_actual_kg: number | null;
        }> = [];
        for (const s of seg.sets) {
          const setActual = s.reps_actual ?? null;
          const setPrescribed = s.reps_prescribed ?? null;
          const setStatus = s.status ?? deriveRepsStatus(setActual, setPrescribed);
          const isApproach = resolveIsApproach(s.is_approach, ctx?.prescription_json, s.set_index);
          writtenSets.push({
            status: setStatus,
            is_approach: isApproach,
            reps_actual: setActual,
            load_actual_kg: s.load_actual_kg ?? null,
          });
          await sql`
            insert into set_executions (
              segment_execution_id, set_index,
              reps_prescribed, reps_actual,
              load_prescribed_kg, load_actual_kg,
              rpe, rir, status, confirmed, tempo, rest_s,
              is_approach,
              reps_source, reps_confidence,
              mean_velocity_first_m_s, mean_velocity_last_m_s,
              velocity_loss_pct, rom_m, velocity_confidence
            ) values (
              ${segmentExecutionId}::bigint,
              ${s.set_index},
              ${setPrescribed},
              ${setActual},
              ${s.load_prescribed_kg ?? null},
              ${s.load_actual_kg ?? null},
              ${s.rpe ?? null},
              ${s.rir ?? null},
              ${setStatus},
              ${s.confirmed ?? false},
              ${s.tempo ?? null},
              ${s.rest_s ?? null},
              ${isApproach},
              ${s.reps_source ?? null},
              ${sanitizeConfidence(s.reps_confidence)},
              ${s.mean_velocity_first_m_s ?? null},
              ${s.mean_velocity_last_m_s ?? null},
              ${s.velocity_loss_pct ?? null},
              ${s.rom_m ?? null},
              ${sanitizeConfidence(s.velocity_confidence)}
            )
          `;
        }
        // El agregado del tramo lo leen dobles, el deep-dive y la lectura de
        // sesión (reps × carga). Si cuenta las aproximaciones, el volumen miente
        // aunque set_executions ya lleve la marca. Se reescribe aquí, en el
        // mismo escritor, no en un segundo camino.
        const working = writtenSets.filter((s) => isWorkingSet(s));
        const repsCompleted = working.reduce<number | null>((acc, s) => {
          if (s.reps_actual == null) return acc;
          return (acc ?? 0) + s.reps_actual;
        }, null);
        const workingLoads = working
          .map((s) => s.load_actual_kg)
          .filter((v): v is number => v != null);
        const weightUsedKg = workingLoads.length > 0 ? Math.max(...workingLoads) : null;
        await sql`
          update segment_executions
          set reps_completed = ${repsCompleted},
              weight_used_kg = ${weightUsedKg},
              updated_at = now()
          where id = ${segmentExecutionId}
        `;
      }
    }
  }
  return written;
}
