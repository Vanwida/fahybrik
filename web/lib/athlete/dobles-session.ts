// =============================================================================
// Dobles "train together" session resolver
//
// Powers GET /api/athlete/dobles/session/[id] — the iOS dual-load table where
// ONE shared session is shown with PER-ATHLETE load. Each `percent_rm`
// prescription is resolved against THAT athlete's OWN 1RM (via the shared
// loadOneRmMap — strength system + onboarding-benchmark backfill), so the same
// "5×5 @ 80% RM" back squat reads "80% · 96kg" for one athlete and "80% · 120kg"
// for the other.
//
// Domain model (load resolution):
//   target kind      | resolution
//   -----------------+--------------------------------------------------------
//   percent_rm       | pct × athlete's own 1RM → "<pct>% · <kg>kg".
//                    | No benchmark for that athlete → "<pct>% · —" (honest:
//                    | the relative intensity is real, the kg is unknown — we
//                    | NEVER fabricate a kg from a missing 1RM).
//   kg (absolute)    | pass through identically for both athletes ("<kg>kg").
//   bodyweight       | "Peso corporal" for both.
//   other (rpe/rir/  | the prescribed target text, identical for both — a
//   pace/zone/…)     | dual-load table row that isn't load-bearing still shows
//                    | the honest objective rather than an empty cell.
//   no target        | "—" for both.
//
// The exercise-catalog slug (`back-squat`) is NOT the benchmark slug
// (`back_squat_1rm`). The mapping below is the single source of truth that
// bridges the two; it covers exactly the 1RMs the onboarding flow writes
// (see app/api/onboarding/submit benchmarksFromSnapshot). An exercise with no
// mapping (or a mapping with no recorded benchmark) degrades to the honest
// "<pct>% · —" path — never a guessed kg.
// =============================================================================

import type { Sql } from '@/lib/db';
import {
  prescriptionTarget,
  safeParsePrescription,
  setTarget,
  type Prescription,
  type PrescriptionSet,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import { EXERCISE_TO_1RM_BENCHMARK, resolvePercentRmToKg } from '@fahybrid/shared/domain/strength';
import { loadOneRmMap, type OneRmEntry } from '@/lib/strength/strength-max';
import { joinCoachOverride, mergedExerciseContent } from '@/lib/exercises/coach-override';

// ── Wire shape (snake_case; iOS decodes via convertFromSnakeCase) ────────────
export interface DoblesExerciseRow {
  id: string;
  exercise: string;
  /** Pre-formatted sets×reps, e.g. "5×5" or "10/8/6". */
  sets_reps: string | null;
  /** Self athlete's resolved load, e.g. "80% · 96kg" / "24kg" / "Peso corporal". */
  self_load: string | null;
  /** Partner's resolved load, same format. */
  partner_load: string | null;
}

export interface DoblesTrainTogetherSession {
  title: string | null;
  subtitle: string | null;
  self_name: string | null;
  partner_name: string | null;
  /** Pre-formatted reference 1RM line, e.g. "SQ 1RM 110". Null if no 1RMs. */
  self_one_rm: string | null;
  partner_one_rm: string | null;
  /**
   * The assignment's sharing choice. 'self_only' means the athlete kept this
   * session private → iOS hides the "Hacerla juntos" joint CTA (the joint-log
   * endpoint also rejects self_only with 409 session_private as the safety net;
   * this is the UI gate so the button never shows for a private session).
   */
  partner_visibility: 'shared' | 'self_only';
  exercises: DoblesExerciseRow[];
}

// EXERCISE_TO_1RM_BENCHMARK (exercise-catalog slug → 1RM benchmark slug) is the
// single source of truth in @fahybrid/shared/domain/strength — imported above so
// the web + iOS contract never diverge on which lift trains which 1RM.

// Short reference-line abbreviations for the per-athlete 1RM chip, e.g.
// "SQ 1RM 110 · DL 1RM 180". Order is fixed (most-programmed first).
const BENCHMARK_ABBREV: ReadonlyArray<[string, string]> = [
  ['back_squat_1rm', 'SQ'],
  ['deadlift_1rm', 'DL'],
  ['bench_press_1rm', 'BP'],
  ['ohp_1rm', 'OHP'],
  ['clean_1rm', 'CL'],
  ['snatch_1rm', 'SN'],
];

// ── Internal row shapes ──────────────────────────────────────────────────────
interface SegmentRow {
  id: string;
  position: number;
  block_position: number;
  params_json: Record<string, unknown> | null;
  prescription_json: unknown;
  exercise_name: string;
  exercise_slug: string;
}

interface AssignmentMeta {
  template_id: string | null;
  template_name: string | null;
  template_format: string | null;
  partner_visibility: 'shared' | 'self_only';
}

export interface DoblesSessionInput {
  sql: Sql;
  /** The calling (self) athlete. */
  self_athlete_id: bigint;
  self_name: string | null;
  /** The shared workout assignment to resolve. */
  assignment_id: bigint;
  /** The linked partner — required (caller returns honest-empty when absent). */
  partner_athlete_id: bigint;
  partner_name: string | null;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Resolve a train-together session for a Dobles pair. Returns null when the
 * assignment doesn't belong to the self athlete (or doesn't exist) — the route
 * maps that to 404 to avoid leaking existence.
 */
export async function loadDoblesSession(
  input: DoblesSessionInput,
): Promise<DoblesTrainTogetherSession | null> {
  const { sql, self_athlete_id, assignment_id, partner_athlete_id } = input;

  // Ownership-scoped: the assignment must belong to the SELF athlete.
  const metaRows = await sql<AssignmentMeta[]>`
    select
      wa.template_id::text  as template_id,
      t.name                as template_name,
      t.format::text        as template_format,
      wa.partner_visibility as partner_visibility
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.id = ${assignment_id as unknown as number}
      and wa.athlete_id = ${self_athlete_id as unknown as number}
    limit 1
  `;
  const meta = metaRows[0];
  if (!meta) return null;

  // The self athlete's owning coach drives the per-coach exercise-override merge
  // (mirrors assignment-detail.ts / station-detail.ts) — without this, this
  // surface showed the BASE exercise name while assignment-detail showed the
  // coach's renamed one for the SAME session (a pre-existing inconsistency).
  const coachRows = await sql<{ coach_id: string | null }[]>`
    select coach_id::text as coach_id from athletes where id = ${self_athlete_id as unknown as number} limit 1
  `;
  const coachId = coachRows[0]?.coach_id ? BigInt(coachRows[0].coach_id) : null;

  // Segments of the shared template (exercise + structured prescription). This
  // is a hydration join (the exercise id arrives by FK from an already-scoped
  // template_segments row) — no visibility filter, only the override JOIN for
  // the merged display name.
  let segments: SegmentRow[] = [];
  if (meta.template_id) {
    segments = await sql<SegmentRow[]>`
      select
        s.id::text                    as id,
        s.position                    as position,
        coalesce(s.block_position, 0) as block_position,
        s.params_json                 as params_json,
        s.prescription_json           as prescription_json,
        e.slug                        as exercise_slug,
        ${mergedExerciseContent(sql, 'exercise_')}
      from template_segments s
      join exercises e on e.id = s.exercise_id
      ${joinCoachOverride(sql, coachId)}
      where s.template_id = ${meta.template_id}::bigint
      order by s.block_position asc, s.position asc, s.id asc
    `;
  }

  // Current 1RM per benchmark slug for each athlete (shared loader — same source
  // the individual brief resolves loads from, so the two surfaces never diverge).
  const [selfBenchmarks, partnerBenchmarks] = await Promise.all([
    loadOneRmMap({ athlete_id: self_athlete_id, client: sql }),
    loadOneRmMap({ athlete_id: partner_athlete_id, client: sql }),
  ]);

  const exercises = segments.map((seg) =>
    buildExerciseRow(seg, selfBenchmarks, partnerBenchmarks),
  );

  return {
    title: meta.template_name,
    subtitle: null,
    self_name: input.self_name,
    partner_name: input.partner_name,
    self_one_rm: formatOneRmLine(selfBenchmarks),
    partner_one_rm: formatOneRmLine(partnerBenchmarks),
    partner_visibility: meta.partner_visibility,
    exercises,
  };
}

// =============================================================================
// Load resolution (pure, testable without a DB)
// =============================================================================

export function buildExerciseRow(
  seg: SegmentRow,
  selfBenchmarks: Map<string, OneRmEntry>,
  partnerBenchmarks: Map<string, OneRmEntry>,
): DoblesExerciseRow {
  const prescription = parsePrescription(seg.prescription_json);
  const target = prescription ? resolveTarget(prescription) : undefined;
  const benchmarkSlug = EXERCISE_TO_1RM_BENCHMARK[seg.exercise_slug] ?? null;

  return {
    id: `segment-${seg.id}`,
    exercise: seg.exercise_name,
    sets_reps: formatSetsReps(prescription, seg.params_json),
    self_load: formatLoad(target, benchmarkSlug, selfBenchmarks),
    partner_load: formatLoad(target, benchmarkSlug, partnerBenchmarks),
  };
}

// The representative intensity of the line: the first per-set target, else the
// block-level target. Mirrors the resolution order analytics/summary use.
function resolveTarget(p: Prescription): Target | undefined {
  const sets: PrescriptionSet[] = p.sets ?? [];
  for (const s of sets) {
    const t = setTarget(s);
    if (t) return t;
  }
  return prescriptionTarget(p);
}

// Resolve ONE athlete's load string for a target. percent_rm is resolved over
// THAT athlete's 1RM (via the benchmark map); kg / bodyweight pass through;
// every other target shows its honest objective text. Returns null when the
// line carries no intensity target at all.
function formatLoad(
  target: Target | undefined,
  benchmarkSlug: string | null,
  benchmarks: Map<string, OneRmEntry>,
): string | null {
  if (!target) return null;

  switch (target.kind) {
    case 'percent_rm': {
      const pct = scalarOf(target);
      if (pct === undefined) return null;
      const oneRm = benchmarkSlug ? benchmarks.get(benchmarkSlug)?.one_rm_kg : undefined;
      // Honest: no 1RM on file → show the relative intensity, never a fake kg.
      if (oneRm === undefined) return `${formatPct(pct)}% · —`;
      return `${formatPct(pct)}% · ${resolvePercentRmToKg(pct, oneRm)}kg`;
    }
    case 'kg': {
      const kg = scalarOf(target);
      return kg === undefined ? null : `${roundKg(kg)}kg`;
    }
    case 'bodyweight':
      return 'Peso corporal';
    case 'rpe': {
      const v = scalarOf(target);
      return v === undefined ? null : `RPE ${formatPct(v)}`;
    }
    case 'rir': {
      const v = scalarOf(target);
      return v === undefined ? null : `RIR ${formatPct(v)}`;
    }
    default:
      // pace / hr_zone / hr_bpm / calories — not a barbell load. The line is
      // still real, so surface its objective rather than an empty cell.
      return formatNonLoadTarget(target);
  }
}

function formatNonLoadTarget(target: Target): string | null {
  switch (target.kind) {
    case 'hr_zone': {
      const v = scalarOf(target);
      return v === undefined ? null : `Z${formatPct(v)}`;
    }
    case 'calories': {
      const v = scalarOf(target);
      return v === undefined ? null : `${Math.round(v)} cal`;
    }
    default:
      return null;
  }
}

// A single representative scalar from a scalar target (value, else range floor).
function scalarOf(target: Target): number | undefined {
  if ('value' in target && target.value !== undefined) return target.value;
  if ('min' in target && target.min !== undefined) return target.min;
  if ('max' in target && target.max !== undefined) return target.max;
  return undefined;
}

// Percentages/RPE may be whole or fractional; drop a trailing ".0".
function formatPct(n: number): string {
  return Number.isInteger(n) ? `${n}` : `${Math.round(n * 10) / 10}`;
}

function roundKg(kg: number): string {
  // Keep half-kg plates readable; collapse "100.0" → "100".
  const r = Math.round(kg * 2) / 2;
  return Number.isInteger(r) ? `${r}` : `${r}`;
}

// ── sets×reps ────────────────────────────────────────────────────────────────
// Compact "5×5" (uniform) or "10/8/6" (varied) from the structured
// prescription, falling back to scalar params when no structured form exists.
function formatSetsReps(
  prescription: Prescription | null,
  params: Record<string, unknown> | null,
): string | null {
  if (prescription?.sets && prescription.sets.length > 0) {
    const reps = prescription.sets.map(repsOf);
    const known = reps.filter((r): r is number => r !== undefined);
    const count = prescription.sets.length;
    if (known.length === 0) return count > 1 ? `${count}×` : null;
    const uniform = known.length === count && new Set(known).size === 1;
    if (uniform) return `${count}×${known[0]}`;
    if (known.length === count) return known.join('/');
    return `${count}×${known[0]}`;
  }

  // Scalar fallback.
  const sets = numParam(params, 'sets');
  const repsScheme = strParam(params, 'reps_scheme');
  const reps = numParam(params, 'reps');
  if (repsScheme) return sets ? `${sets} · ${repsScheme}` : repsScheme;
  if (sets !== undefined && reps !== undefined) return `${sets}×${reps}`;
  if (sets !== undefined) return `${sets}×`;
  if (reps !== undefined) return `${reps}`;
  return null;
}

function repsOf(s: PrescriptionSet): number | undefined {
  if (s.measure?.kind === 'reps') return s.measure.value;
  if (s.reps !== undefined) return s.reps;
  return undefined;
}

function numParam(params: Record<string, unknown> | null, key: string): number | undefined {
  const v = params?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function strParam(params: Record<string, unknown> | null, key: string): string | undefined {
  const v = params?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

// ── 1RM reference line ───────────────────────────────────────────────────────
function formatOneRmLine(benchmarks: Map<string, OneRmEntry>): string | null {
  const parts: string[] = [];
  for (const [slug, abbrev] of BENCHMARK_ABBREV) {
    const v = benchmarks.get(slug)?.one_rm_kg;
    if (v !== undefined) parts.push(`${abbrev} 1RM ${roundKg(v)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

// ── parse helpers ────────────────────────────────────────────────────────────
function parsePrescription(raw: unknown): Prescription | null {
  if (raw == null) return null;
  const parsed = safeParsePrescription(raw);
  return parsed.success ? (parsed.data as Prescription) : null;
}
