import type { Sql } from '@/lib/db';
import { joinCoachOverride, mergedExerciseContent } from '@/lib/exercises/coach-override';
import {
  prescriptionToParams,
  safeParsePrescription,
  prescriptionTarget,
  setTarget,
  legacyToStructure,
  isRepeat,
  type Prescription,
  type Target,
  type RunStructure,
  type Segment as RunSegment,
  type Element as RunElement,
  type SegmentTarget,
} from '@fahybrid/shared/domain/prescription';
import {
  resolvePaceBandFromZones,
  formatResolvedPaceBand,
  type ResolvedZone,
} from '@fahybrid/shared/domain/methodology';
import {
  loadAthleteZoneProfilesForAthlete,
} from '@/lib/dashboard/v2/zone-profile';
import { loadOneRmMap, type OneRmEntry } from '@/lib/strength/strength-max';
import { loadSegmentActuals, type SegmentActual } from '@/lib/dashboard/coach/session-actuals';
import { formatExecutionScore } from '@/lib/dashboard/coach/athlete-session-adapter';
import {
  resolveDoblesStationSplit,
  type DoblesStationSplit,
} from '@/lib/athlete/dobles-station-split';
import {
  EXERCISE_TO_1RM_BENCHMARK,
  resolveRmLoad,
} from '@fahybrid/shared/domain/strength';
import type { AthleteZoneProfile } from '@fahybrid/shared/schema/methodology-system';

// A benchmark-slug → current-1RM lookup, built once per request from the
// athlete's strength maxes (+ onboarding-benchmark backfill). Empty when the
// athlete has no 1RM on file → %RM lines keep the % with no resolved kg.
export type OneRmLookup = Map<string, OneRmEntry>;

// =============================================================================
// Assignment-detail loader
//
// Powers GET /api/athlete/assignments/[id]/detail — the iOS pre-workout brief
// that needs series/reps/load/RPE/pace per item. The week endpoint only ships
// `{assignmentId, slot, title, modality, status}`; this loader fills in the
// rest.
//
// Shape: see `AssignmentDetailResponse` (mirrored by the Zod schema in
// shared/schema/workouts.ts). The exposed `workout` is `null` when the
// assignment has no template (defensive — DB column is currently NOT NULL,
// but the iOS contract preserves the rest-day fallback in case that
// constraint is relaxed in the future) OR when the template resolves to ZERO
// renderable blocks. A non-null `workout` with an empty `blocks` array is a
// pathological shape: each iOS surface gated it differently (brief → "Sin
// detalle", list → "Sin ejercicios", done-detail → rendered from execution),
// so the SAME day appeared to "load differently per view". Collapsing the
// empty case to `workout: null` makes EVERY surface show the one honest
// rest/empty state. There is no content to lose — zero blocks means zero
// segments.
// =============================================================================

export interface AssignmentDetailParams {
  sql: Sql;
  athlete_id: bigint;
  assignment_id: bigint;
  // The reading athlete's user id. Present on the athlete-facing endpoint (from
  // the bearer session); enables deriving the Dobles station split (reparto)
  // from dobles_simulations. Absent on the coach session-detail read → no
  // reparto is resolved (station_assignment stays null), which is correct: the
  // reparto is the READING athlete's half, and a coach view has no "self" side.
  self_user_id?: bigint;
}

export interface AssignmentDetailResponse {
  assignment: {
    id: string;
    athlete_id: string;
    scheduled_for: string;
    status: 'scheduled' | 'completed' | 'partial' | 'missed' | 'skipped';
    slot: string | null;
    template_id: string | null;
    template_version: number | null;
    completed_at: string | null;
    perceived_exertion: number | null;
    // C35 — partner-visibility flag from workout_assignments. iOS uses it to
    // render the "shared with partner" badge on the pre-workout brief.
    // 'shared' = visible to partner; 'self_only' = private to this athlete.
    partner_visibility: 'shared' | 'self_only';
    // Dobles HYROX reparto — the per-station split between the two partners for a
    // HYROX-simulation session, DERIVED at read from the coach's
    // dobles_simulations (single source of truth; the workout_assignments column
    // of the same name is legacy / never written — see migration 0091). Null for
    // individual athletes, non-simulation sessions, or when no simulation is
    // authored. iOS runs the omitted stations in full (honest).
    station_assignment: DoblesStationSplit | null;
    // Which side of the pair the reading user is ('a' | 'b'), == the
    // dobles_simulations athlete_a/b orientation. Lets iOS resolve `assigned_to`
    // / `self_share` deterministically. Null when there's no reparto.
    my_role: 'a' | 'b' | null;
    // #34 — the result(s) this session must CAPTURE when it's a calibration test,
    // derived from coach_test_results via the workout_assignments.calibration_test_id
    // FK. Each entry tells iOS what number to ask for and in what unit ("Tiempo 5K"
    // → seconds; "Sentadilla" → kg). Empty for a normal (non-test) session.
    store_results: AssignmentDetailStoreResult[];
  };
  workout: AssignmentDetailWorkout | null;
  // The athlete's REAL executed result, when the session has been done. Powers
  // the read-only post-workout detail the athlete reaches by tapping a finished
  // session (closing the loop: they see what they logged — tiempo / score / RPE /
  // per-segment splits). Null while the session is still pending (no execution).
  execution: AssignmentDetailExecution | null;
}

// What the athlete ACTUALLY did — the executed reality for a finished session.
// Aggregate (duration / score / RPE / notes / provenance) + per-exercise actuals.
// Mirrors what the coach session-detail already returns, so both surfaces read the
// same execution numbers from ONE loader.
export interface AssignmentDetailExecution {
  execution_id: string | null;
  total_duration_seconds: number | null;
  perceived_exertion: number | null;
  // Metcon/HYROX headline result, pre-formatted ("42:15", "5 rondas + 8 reps").
  // Null for non-scored formats or when no score was recorded.
  score_label: string | null;
  notes: string | null;
  ended_at: string | null;
  // Provenance of the execution — 'manual' | 'healthkit' | 'garmin' | … (the
  // biometric_source enum). Lets the UI say "registrado a mano" vs synced.
  source: string | null;
  // Honest finish state, derived from the assignment status: 'completed' (ran to
  // the end → green ✓) or 'partial' (terminated early → amber ½).
  completeness: 'completed' | 'partial';
  // The outdoor run's GPS trace (#64) as an encoded polyline, or null when the
  // session was not outdoors — drives the athlete's executed-detail mini-map.
  route_polyline: string | null;
  // Per-exercise actuals (segment_executions) mapped to the prescribed item via
  // `item_uid`. Empty when the athlete logged only the aggregate — never fabricated.
  segments: SegmentActual[];
}

// #34 — one result a calibration-test session must capture. `measure`/`unit` are
// the coach_test_results columns (time→seconds, load→kg, distance→meters, …); iOS
// renders the matching input and POSTs the entered value back keyed by `slug`.
// `derives`/`modality` document what it calibrates (the bridge does the routing).
export interface AssignmentDetailStoreResult {
  slug: string;
  label: string;
  measure: string;
  unit: string;
  derives: string;
  modality: string | null;
  // #34 — an OPTIONAL result: iOS may auto-fill it (e.g. HRR from the HR stream) or let
  // the athlete skip it; it never blocks finishing the test. false = required.
  optional: boolean;
}

export interface AssignmentDetailWorkout {
  name: string;
  focus: string | null;
  coach_note: string | null;
  estimated_duration_minutes: number | null;
  blocks: AssignmentDetailBlock[];
}

export interface AssignmentDetailBlock {
  uid: string;
  title: string;
  format: string;
  block_position: number;
  coach_note: string | null;
  config_json: Record<string, unknown>;
  items: AssignmentDetailItem[];
}

export interface AssignmentDetailItem {
  uid: string;
  // The prescribed template_segments.id this line maps to. iOS echoes it back on
  // POST /api/sync/workout-execution so the coach's prescrito-vs-hecho view can
  // attribute each measured segment to its prescription (the `uid` already
  // encodes it as `segment-{id}`; this is the parsed integer form for the wire).
  template_segment_id: number;
  exercise_id: string;
  exercise_name: string;
  exercise_slug: string;
  exercise_category: string;
  exercise_video_url: string | null;
  cues: string | null;
  // Flat, iOS-ready targets. Derived from `prescription_json` (the unified
  // measure/target model) when present, else from the stored scalar params.
  params_json: AssignmentDetailParamsJson;
  // Structured per-set prescription, passed through verbatim when valid so
  // iOS can decode the rich form later (per-set pyramids, ranges, pace units).
  // Null/absent for legacy segments that only have scalar params.
  prescription_json: Prescription | null;
  // G1 — when the line targets a training ZONE (e.g. @Z4) AND this athlete has a
  // stored zone profile for the line's modality, the zone is resolved to the
  // ABSOLUTE pace band from the versioned profile (read, never recomputed). iOS
  // shows "Z4 · @4:15/km": the zone badge stays in params_json.hr_zone, this
  // field adds the resolved pace. Null when there's no zone target or no profile.
  resolved_intensity: ResolvedIntensity | null;
  // The strength analog of `resolved_intensity`: when the line targets a %RM AND
  // this athlete has a current 1RM for the lift, the % is resolved to the ABSOLUTE
  // kg they lift (read from athlete_strength_maxes, never recomputed). iOS shows
  // "65–80% → 52–64 kg": the % stays in params_json/prescription, this field adds
  // the resolved kg. Null when there's no %RM target, the exercise isn't a tracked
  // lift, or the athlete has no 1RM for it (then the % stands alone — never a
  // fabricated kg).
  resolved_load: ResolvedLoad | null;
  notes: string | null;
}

// A %RM target resolved to the athlete's ABSOLUTE load. `pct_label` is the source
// percentage ("80%", "65–80%"); `kg_label` is the ready-to-render kg ("64 kg",
// "52–64 kg"); the raw `min_kg`/`max_kg` (+ `one_rm_kg`) let iOS reformat. Present
// only when the line targets a %RM on a tracked lift AND the athlete has a 1RM.
export interface ResolvedLoad {
  pct_label: string;
  kg_label: string;
  min_kg: number;
  max_kg: number | null;
  one_rm_kg: number;
  // True when the 1RM feeding this load is from an UNCONFIRMED source (a strength
  // max pending the coach's review). The kg still resolves; iOS can mark it
  // "sin confirmar" until confirmed. Mirrors ResolvedIntensity.needs_review.
  needs_review: boolean;
}

// The athlete's zone target resolved to an absolute pace band. `zone_label` is
// the coach zone code (Z4, or "Z3–Z4" for a span); `range_label` is the ready-
// to-render pace string with its unit ("4:15–4:25/km", "> 2:17/500m"); the raw
// `fast_s`/`slow_s` (+ `pace_unit`) let iOS reformat if it wants its own style.
export interface ResolvedIntensity {
  zone_label: string;
  range_label: string;
  fast_s: number;
  slow_s: number | null;
  pace_unit: 'per_km' | 'per_500m';
  // True when the zones feeding this band come from an UNCONFIRMED auto profile
  // (derived from onboarding benchmarks, pending the coach's review). The band
  // still resolves (better the athlete's real zones than none); iOS can mark it
  // "sin confirmar" until the coach confirms.
  needs_review: boolean;
}

// Spec-normalized params (DB columns differ — `weight_kg`/`weight_pct_1rm`/
// `time_seconds` map to `load_kg`/`load_pct`/`duration_seconds`). Other
// non-canonical keys are pass-through if present on the source jsonb.
export interface AssignmentDetailParamsJson {
  sets?: number;
  reps?: number;
  load_kg?: number;
  load_pct?: number;
  rpe?: number;
  rest_seconds?: number;
  duration_seconds?: number;
  distance_km?: number;
  distance_meters?: number;
  pace_sec_per_km?: number;
  cadence_spm?: number;
  calories?: number;
  calories_per_min?: number;
  hr_zone?: number;
  /** Erg POWER target in watts (#erg-3). Surfaced from a `{ kind: 'watts' }`
   * prescription target so iOS's scalar path can render it; the structured
   * prescription_json.target carries the same value as the primary source. */
  watts?: number;
}

// =============================================================================
// Internal row shapes
// =============================================================================

interface AssignmentRow {
  id: string;
  athlete_id: string;
  scheduled_for: string;
  status: 'scheduled' | 'completed' | 'partial' | 'missed' | 'skipped';
  notes: string | null;
  template_id: string | null;
  template_version: number | null;
  partner_visibility: 'shared' | 'self_only';
}

interface ExecutionRow {
  ended_at: string | null;
  perceived_exertion: number | null;
  // Extended actuals for the read-only executed-session view. Optional so the
  // pure builder's existing tests (which only supply ended_at + RPE) keep typing.
  execution_id?: string | null;
  total_duration_seconds?: number | null;
  score_time_s?: number | null;
  score_rounds?: number | null;
  score_reps?: number | null;
  notes?: string | null;
  source?: string | null;
  // #64 — the outdoor GPS trace (encoded polyline), joined from workout_routes.
  route_polyline?: string | null;
}

interface TemplateRow {
  id: string;
  name: string;
  format: string;
  warmup: string | null;
  cooldown: string | null;
  coach_notes: string | null;
  meta_json: Record<string, unknown> | null;
}

interface SegmentRow {
  id: string;
  position: number;
  block_position: number;
  block_format: string | null;
  block_title: string | null;
  params_json: Record<string, unknown> | null;
  prescription_json: unknown;
  notes: string | null;
  exercise_id: string;
  exercise_name: string;
  exercise_slug: string;
  exercise_category: string;
  exercise_video_url: string | null;
  exercise_cues: string | null;
}

// =============================================================================
// Public API
// =============================================================================

export async function loadAssignmentDetail(
  params: AssignmentDetailParams,
): Promise<AssignmentDetailResponse | null> {
  const { sql, athlete_id, assignment_id } = params;

  // Ownership-scoped lookup. If the assignment doesn't belong to the calling
  // athlete OR doesn't exist, we return null → 404.
  // Widen the row with the athlete's owning coach (athletes.coach_id) — used only
  // by the loader for the per-coach exercise-override merge. The pure builder
  // (buildAssignmentDetail) doesn't read it, so it stays off AssignmentRow.
  const assignmentRows = await sql<
    (AssignmentRow & { coach_id: string | null; calibration_test_id: string | null })[]
  >`
    select
      wa.id::text                                    as id,
      wa.athlete_id::text                            as athlete_id,
      to_char(wa.scheduled_for, 'YYYY-MM-DD')        as scheduled_for,
      wa.status::text                                as status,
      wa.notes                                       as notes,
      wa.template_id::text                           as template_id,
      wa.template_version                            as template_version,
      wa.partner_visibility                          as partner_visibility,
      wa.calibration_test_id::text                   as calibration_test_id,
      a.coach_id::text                               as coach_id
    from workout_assignments wa
    join athletes a on a.id = wa.athlete_id
    where wa.id = ${assignment_id as unknown as number}
      and wa.athlete_id = ${athlete_id as unknown as number}
    limit 1
  `;
  const assignment = assignmentRows[0];
  if (!assignment) return null;

  // #34 — the calibration contract this session must capture, derived from
  // coach_test_results via the FK (the coach's live contract, not the frozen clone
  // meta_json). Empty for a normal session (calibration_test_id null).
  const storeResults = assignment.calibration_test_id
    ? await sql<AssignmentDetailStoreResult[]>`
        select slug, label, measure::text as measure, unit::text as unit,
               derives::text as derives, modality, optional
        from coach_test_results
        where test_id = ${Number(assignment.calibration_test_id)}
        order by sort_order asc, id asc
      `
    : [];

  // The athlete's coach drives the per-coach exercise-override merge (0085): a
  // segment's cues/video are coalesce(coach override, global default).
  const coachId = assignment.coach_id ? BigInt(assignment.coach_id) : null;

  // G1 — the athlete's stored zone profiles (one current row per modality),
  // derived coach-scoped from athletes.coach_id inside the loader. Used to
  // resolve any @Zn target on a line into its absolute pace band. Empty (no test
  // yet) → items simply carry the zone badge with no resolved pace.
  const zoneProfiles = await loadAthleteZoneProfilesForAthlete({
    athlete_id,
    client: sql,
  });

  // The athlete's current 1RM per lift (strength maxes + onboarding backfill),
  // used to resolve any %RM target on a line into its absolute kg. Empty (no 1RM
  // yet) → %RM lines keep the percentage with no resolved kg.
  const oneRms = await loadOneRmMap({ athlete_id, client: sql });

  // Execution (1:1 with assignment, may not exist yet if scheduled). We pull the
  // full executed aggregate (id / duration / score / notes / source) so the
  // read-only athlete summary renders real numbers, not just completed_at + RPE.
  const executionRows = await sql<ExecutionRow[]>`
    select
      we.id::text                as execution_id,
      we.ended_at::text          as ended_at,
      we.perceived_exertion      as perceived_exertion,
      we.total_duration_seconds  as total_duration_seconds,
      we.score_time_s            as score_time_s,
      we.score_rounds            as score_rounds,
      we.score_reps              as score_reps,
      we.notes                   as notes,
      we.source::text            as source,
      wr.polyline                as route_polyline
    from workout_executions we
    left join workout_routes wr on wr.execution_id = we.id
    where we.assignment_id = ${assignment_id as unknown as number}
    limit 1
  `;
  const execution = executionRows[0] ?? null;

  // Per-exercise actuals (segment_executions) for the executed view — only when
  // there's a real execution to attribute them to. Empty otherwise (no fabrication).
  const executionSegments =
    execution?.execution_id != null
      ? await loadSegmentActuals(sql, Number(execution.execution_id))
      : [];

  // Template + segments. Archived templates still resolve — the athlete
  // already has the assignment, we don't strip it out.
  let template: TemplateRow | null = null;
  let segments: SegmentRow[] = [];

  if (assignment.template_id) {
    const tplRows = await sql<TemplateRow[]>`
      select
        id::text                  as id,
        name                      as name,
        format::text              as format,
        warmup                    as warmup,
        cooldown                  as cooldown,
        coach_notes               as coach_notes,
        meta_json                 as meta_json
      from templates
      where id = ${assignment.template_id}::bigint
      limit 1
    `;
    template = tplRows[0] ?? null;

    if (template) {
      segments = await sql<SegmentRow[]>`
        select
          s.id::text                                  as id,
          s.position                                  as position,
          coalesce(s.block_position, 0)               as block_position,
          s.block_format                              as block_format,
          s.block_title                               as block_title,
          s.params_json                               as params_json,
          s.prescription_json                         as prescription_json,
          s.notes                                     as notes,
          e.id::text                                  as exercise_id,
          e.slug                                      as exercise_slug,
          e.category::text                            as exercise_category,
          -- exercise_name/cues/description/video_url all come from the merge below
          -- (coach override wins, else base) — do NOT also select e.name here, it
          -- would emit a duplicate exercise_name column.
          ${mergedExerciseContent(sql, 'exercise_')}
        from template_segments s
        join exercises e on e.id = s.exercise_id
        ${joinCoachOverride(sql, coachId)}
        where s.template_id = ${assignment.template_id}::bigint
        order by s.block_position asc, s.position asc, s.id asc
      `;
    }
  }

  // Dobles HYROX reparto — derived at read from the coach's dobles_simulations.
  // Only attempted for the athlete-facing read (self_user_id present) and gated
  // internally on format='hyrox_sim' + a linked partner + an authored simulation;
  // null in every other case. The segments feed the station↔segment mapping.
  const stationSplit =
    params.self_user_id != null
      ? await resolveDoblesStationSplit({
          sql,
          self_user_id: params.self_user_id,
          self_athlete_id: athlete_id,
          assignment: {
            template_format: template?.format ?? null,
            partner_visibility: assignment.partner_visibility,
            segments: segments.map((s) => ({
              id: Number(s.id),
              exercise_slug: s.exercise_slug,
              exercise_name: s.exercise_name,
            })),
          },
        })
      : null;

  return buildAssignmentDetail({
    assignment,
    execution,
    template,
    segments,
    zoneProfiles,
    oneRms,
    executionSegments,
    stationSplit,
    storeResults,
  });
}

// A modality → resolved-zone-bands lookup, built once per request from the
// athlete's stored profiles. The plan target carries a modality (run/row/ski/
// bike); we index the matching profile's snapshot bands by it. `bike` and `ski`
// share the per_500m unit but are SEPARATE profiles (separate tests), so the key
// is the profile modality verbatim — no collapsing.
export type ZoneLookup = Partial<
  Record<AthleteZoneProfile['modality'], { bands: ResolvedZone[]; needs_review: boolean }>
>;

function buildZoneLookup(profiles: AthleteZoneProfile[]): ZoneLookup {
  const out: ZoneLookup = {};
  for (const p of profiles) {
    // zones_json already holds the resolved absolute bands (snapshot). Adapt the
    // stored snapshot shape to the domain ResolvedZone shape the resolver reads.
    out[p.modality] = {
      bands: p.zones_json.map((z) => ({
        code: z.code,
        label: z.label,
        color: z.color,
        role: z.role,
        sort_order: z.sort_order,
        fast_s: z.fast_s,
        slow_s: z.slow_s,
      })),
      needs_review: p.needs_review,
    };
  }
  return out;
}

// Assemble the read-only executed block for a finished session. Returns null when
// there's no execution AND the session isn't marked done — a still-pending session
// has nothing to show. A done session with no execution row (legacy / edge) still
// yields a block so the UI can render the "hecho" state honestly with no numbers.
function buildExecutionBlock(
  status: AssignmentRow['status'],
  execution: ExecutionRow | null,
  segments: SegmentActual[],
): AssignmentDetailExecution | null {
  const isDone = status === 'completed' || status === 'partial';
  if (!execution && !isDone) return null;

  return {
    execution_id: execution?.execution_id ?? null,
    total_duration_seconds: execution?.total_duration_seconds ?? null,
    perceived_exertion: execution?.perceived_exertion ?? null,
    score_label: execution
      ? formatExecutionScore({
          score_time_s: execution.score_time_s ?? null,
          score_rounds: execution.score_rounds ?? null,
          score_reps: execution.score_reps ?? null,
        })
      : null,
    notes: execution?.notes ?? null,
    ended_at: execution?.ended_at ?? null,
    source: execution?.source ?? null,
    completeness: status === 'partial' ? 'partial' : 'completed',
    route_polyline: execution?.route_polyline ?? null,
    segments,
  };
}

// =============================================================================
// Pure builder (testable without a DB)
// =============================================================================

export function buildAssignmentDetail(input: {
  assignment: AssignmentRow;
  execution: ExecutionRow | null;
  template: TemplateRow | null;
  segments: SegmentRow[];
  // The athlete's stored zone profiles (G1). Default [] keeps the pure builder
  // testable without zones — items then carry the zone badge but no resolved pace.
  zoneProfiles?: AthleteZoneProfile[];
  // The athlete's current 1RM per benchmark slug. Default empty keeps the pure
  // builder testable without 1RMs — %RM items then carry the % but no kg.
  oneRms?: OneRmLookup;
  // Per-exercise actuals for the executed view. Default [] keeps the pure builder
  // testable without a DB — a finished session then shows the aggregate alone.
  executionSegments?: SegmentActual[];
  // Dobles HYROX reparto, pre-resolved by loadAssignmentDetail (needs a DB). The
  // pure builder just carries it onto the payload. Default null → individual /
  // non-simulation session with no per-station split.
  stationSplit?: DoblesStationSplit | null;
  // #34 — the calibration results to capture (from coach_test_results via the FK),
  // pre-resolved by loadAssignmentDetail. Default [] → a normal, non-test session.
  storeResults?: AssignmentDetailStoreResult[];
}): AssignmentDetailResponse {
  const { assignment, execution, template, segments } = input;
  const stationSplit = input.stationSplit ?? null;
  const zoneLookup = buildZoneLookup(input.zoneProfiles ?? []);
  const oneRms = input.oneRms ?? new Map();

  const slot = slotFromNotes(assignment.notes);

  const base: AssignmentDetailResponse = {
    assignment: {
      id: assignment.id,
      athlete_id: assignment.athlete_id,
      scheduled_for: assignment.scheduled_for,
      status: assignment.status,
      slot,
      template_id: assignment.template_id,
      template_version: assignment.template_version,
      completed_at: execution?.ended_at ?? null,
      perceived_exertion: execution?.perceived_exertion ?? null,
      partner_visibility: assignment.partner_visibility,
      station_assignment: stationSplit,
      my_role: stationSplit?.my_role ?? null,
      store_results: input.storeResults ?? [],
    },
    workout: null,
    execution: buildExecutionBlock(assignment.status, execution, input.executionSegments ?? []),
  };

  // The executed block is independent of the template (a "marcar como hecha" log
  // has an execution but the same template), so it's set on `base` above and
  // survives the rest-day early return.
  if (!template) return base;

  const blocks = buildBlocks(template, segments, zoneLookup, oneRms);

  // A template that resolves to ZERO renderable blocks (no segments) is NOT a
  // previewable / runnable / listable workout — it is the rest/empty state. We
  // must NEVER emit `workout = { …, blocks: [] }`: that pathological shape is the
  // single root cause of the cross-view inconsistency (see the file header).
  // Keep `workout = null` so every iOS surface collapses to the same honest
  // state. The execution (set on `base`) still drives the done-detail.
  if (blocks.length === 0) return base;

  base.workout = {
    name: template.name,
    // No first-class `focus` column on templates today. Leave null — iOS
    // already handles null defensively.
    focus: null,
    coach_note: template.coach_notes,
    estimated_duration_minutes: null,
    blocks,
  };

  return base;
}

// Assemble the workout into LOGICAL blocks.
//
// Domain rule (Alex, 2026-06-05): a continuous workout — a HYROX simulation, a
// metcon/AMRAP/EMOM/for-time, an interval set, a strength session — is ONE block
// with its movements as items, not one block per movement. Several library /
// HYROX templates were seeded one-block-per-segment (each segment its own
// `block_position`), which fragmented a single HYROX sim into 16 redundant
// "HYROX SIM" blocks. We repair that here:
//   1. Group by authored `block_position` (respects real multi-block days).
//   2. Collapse RUNS of consecutive single-segment blocks that share a format
//      into one block. A block with >1 segment is a hard boundary and never
//      merges — so genuinely multi-movement authored blocks are untouched.
function buildBlocks(
  template: TemplateRow,
  segments: SegmentRow[],
  zoneLookup: ZoneLookup,
  oneRms: OneRmLookup,
): AssignmentDetailBlock[] {
  if (segments.length === 0) return [];

  // 1. Group by authored block_position, preserving order.
  const groups = new Map<number, SegmentRow[]>();
  for (const seg of segments) {
    const list = groups.get(seg.block_position) ?? [];
    list.push(seg);
    groups.set(seg.block_position, list);
  }
  const positions = Array.from(groups.keys()).sort((a, b) => a - b);

  type RawBlock = { pos: number; format: string; segs: SegmentRow[]; fromFragments: boolean };
  const raw: RawBlock[] = positions.map((pos) => {
    const segs = groups.get(pos) ?? [];
    return {
      pos,
      format: segs[0]?.block_format?.trim() || template.format,
      segs,
      fromFragments: false,
    };
  });

  // 2. Collapse consecutive single-segment, same-format blocks. `mergeOpen`
  // tracks whether the current accumulator originated from single-segment
  // fragments (and can keep absorbing more). A multi-segment authored block
  // closes the accumulator and starts a hard boundary.
  const merged: RawBlock[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    const rSingle = r.segs.length === 1;
    const lastMergeOpen = last ? last.fromFragments || last.segs.length === 1 : false;
    if (last && rSingle && lastMergeOpen && last.format === r.format) {
      last.segs.push(...r.segs);
      last.fromFragments = true;
    } else {
      merged.push({ ...r, segs: [...r.segs] });
    }
  }

  const isSingleBlock = merged.length === 1;

  return merged.map((m, idx) => {
    const first = m.segs[0];
    // Title precedence: the whole workout is one block → the workout name;
    // a block collapsed from fragments → a clean format label (the per-segment
    // titles like "Run 1" / "Estación 1" are positional noise); otherwise the
    // authored block title, then "Bloque N".
    const title = isSingleBlock
      ? template.name
      : m.fromFragments
        ? blockTitleForFormat(m.format)
        : first?.block_title?.trim() || `Bloque ${idx + 1}`;

    return {
      uid: `block-${m.pos}`,
      title,
      format: m.format,
      block_position: m.pos,
      // No per-block coach note column yet; iOS treats null as absent.
      coach_note: null,
      // Reserved for AMRAP rounds / time_cap_seconds / EMOM work/rest etc.
      // Coach studio doesn't persist per-block config separately today, so
      // this is an empty object until the studio adds it.
      config_json: {},
      items: m.segs.map((seg) => buildItem(seg, zoneLookup, oneRms)),
    };
  });
}

// Human label for a block whose per-segment titles are positional noise (a
// collapsed continuous workout). Mirrors the iOS `formatLabel` vocabulary.
function blockTitleForFormat(format: string): string {
  switch (format.toLowerCase()) {
    case 'hyrox_sim':      return 'Simulación HYROX';
    case 'simulation':     return 'Simulación';
    case 'amrap':          return 'AMRAP';
    case 'emom':           return 'EMOM';
    case 'for_time':       return 'For Time';
    case 'intervals':      return 'Intervalos';
    case 'circuit':        return 'Circuito';
    case 'tempo':          return 'Tempo';
    case 'strength_block': return 'Fuerza';
    default:               return format.replace(/_/g, ' ').toUpperCase();
  }
}

// Display category for an item, preferring the PRESCRIPTION modality over the
// generic exercise-catalog category. A "Run" exercise is catalogued as `cardio`,
// which routes the iOS param formatter into the strength path → it shows a
// useless "1 sets" and buries the real target (1 km · 3:40/km). The prescribed
// modality (run/ski/row/bike/strength/functional…) is the truthful signal, so
// we surface it as the category iOS formats + tags by. Falls back to the catalog
// category for legacy items with no structured prescription.
function displayCategoryForModality(modality: string | null | undefined): string | null {
  switch (modality) {
    case 'run':        return 'running';
    case 'ski':        return 'ski_erg';
    case 'row':        return 'rowing';
    case 'bike':       return 'bike_erg';
    case 'strength':   return 'strength';
    case 'functional': return 'functional';
    case 'core':       return 'functional';
    case 'mobility':   return 'mobility';
    default:           return null;
  }
}

function buildItem(seg: SegmentRow, zoneLookup: ZoneLookup, oneRms: OneRmLookup): AssignmentDetailItem {
  // ROOT-CAUSE FIX: the rich targets (reps/load/zone/pace/distance/calories)
  // live in `prescription_json` (the unified measure/target model), not in the
  // thin `params_json` (which can be as bare as `{sets:4}`). When a valid
  // structured prescription is present we DERIVE the scalar params from it via
  // the shared `prescriptionToParams` helper (single source of truth — no
  // re-derivation here) and feed that through normalization. Legacy segments
  // with no prescription fall back to the stored scalar params.
  const prescription = parsePrescriptionJson(seg.prescription_json);
  const source: Record<string, unknown> = prescription
    ? (prescriptionToParams(prescription) as Record<string, unknown>)
    : (seg.params_json ?? {});

  // Prefer the prescribed modality over the generic catalog category so the
  // iOS formatter surfaces the real modality-native target (run pace /km, erg
  // pace /500m) instead of a hollow "1 sets".
  const modality = (prescription as { modality?: string } | null)?.modality;
  const category = displayCategoryForModality(modality) ?? seg.exercise_category;

  // #61 — for a run block, emit the STRUCTURED grammar (stored or seeded from the
  // legacy shape) with each zone bout enriched by the athlete's resolved band, so
  // the app executes it natively. Additive: the legacy scalar fields still ride
  // along, so a legacy client is unaffected.
  const isRun = modality === 'run' || category === 'running';
  const wireStructure = runWireStructure(prescription, isRun, zoneLookup);
  const emittedPrescription: Prescription | null =
    wireStructure && prescription ? { ...prescription, structure: wireStructure } : prescription;

  return {
    uid: `segment-${seg.id}`,
    template_segment_id: Number(seg.id),
    exercise_id: seg.exercise_id,
    exercise_name: seg.exercise_name,
    exercise_slug: seg.exercise_slug,
    exercise_category: category,
    exercise_video_url: seg.exercise_video_url,
    cues: seg.exercise_cues,
    params_json: normalizeParams(source),
    prescription_json: emittedPrescription,
    resolved_intensity: resolveIntensityForItem(prescription, modality, zoneLookup),
    resolved_load: resolveLoadForItem(prescription, seg.exercise_slug, oneRms),
    notes: seg.notes,
  };
}

// Resolve a line's %RM target to the athlete's ABSOLUTE kg from their current
// 1RM. The strength analog of resolveIntensityForItem. Returns null when: there's
// no structured prescription, the line's target isn't a %RM (it's a zone / pace /
// RPE / kg / …), the exercise isn't a tracked 1RM lift (EXERCISE_TO_1RM_BENCHMARK),
// or the athlete has no 1RM for that lift — in every null case the % stands alone,
// honestly, with NO fabricated kg.
function resolveLoadForItem(
  prescription: Prescription | null,
  exerciseSlug: string,
  oneRms: OneRmLookup,
): ResolvedLoad | null {
  if (!prescription) return null;

  const target = lineTarget(prescription);
  if (!target || target.kind !== 'percent_rm') return null;

  const benchmarkSlug = EXERCISE_TO_1RM_BENCHMARK[exerciseSlug];
  if (!benchmarkSlug) return null;

  const entry = oneRms.get(benchmarkSlug);
  if (!entry) return null;

  const resolved = resolveRmLoad(
    { value: target.value, min: target.min, max: target.max },
    entry.one_rm_kg,
  );
  if (!resolved) return null;

  return { ...resolved, needs_review: entry.needs_review };
}

// Profile modalities that have a pace-zone profile (run = /km; row/ski/bike =
// /500m). A prescription modality outside this set (strength, functional, core,
// mobility, other) never carries a pace zone, so we don't resolve one.
const PROFILE_MODALITIES = new Set<AthleteZoneProfile['modality']>(['run', 'row', 'ski', 'bike']);

function isProfileModality(m: string | null | undefined): m is AthleteZoneProfile['modality'] {
  return m != null && PROFILE_MODALITIES.has(m as AthleteZoneProfile['modality']);
}

// G1 — resolve a line's zone target to an absolute pace band from the athlete's
// stored profile for that modality. Returns null when: there's no structured
// prescription, the line's target isn't a zone (it's %RM / pace / RPE / …), the
// modality has no pace profile, or the athlete hasn't tested that modality.
function resolveIntensityForItem(
  prescription: Prescription | null,
  modality: string | null | undefined,
  zoneLookup: ZoneLookup,
): ResolvedIntensity | null {
  if (!prescription) return null;
  if (!isProfileModality(modality)) return null;

  // The line's intensity target: block-level wins, else the first set that
  // carries one (the representative target, mirroring prescriptionToParams).
  const target = lineTarget(prescription);
  if (!target || target.kind !== 'hr_zone') return null;

  const profile = zoneLookup[modality];
  if (!profile || profile.bands.length === 0) return null;

  const band = resolvePaceBandFromZones(
    profile.bands,
    { value: target.value, min: target.min, max: target.max },
    modality === 'run' ? 'per_km' : 'per_500m',
  );
  if (!band) return null;

  // Zone label: a single code (Z4) or a span (Z3–Z4) read back from the band.
  const zone_label =
    band.zone_codes.length > 1 ? band.zone_codes.join('–') : (band.zone_codes[0] ?? '');

  return {
    zone_label,
    range_label: formatResolvedPaceBand(band),
    fast_s: band.fast_s,
    slow_s: band.slow_s,
    pace_unit: band.pace_unit,
    needs_review: profile.needs_review,
  };
}

// ── #61 · structured-run wire enrichment ─────────────────────────────────────
// The athlete wire ships the STRUCTURED running grammar per run block so the app
// executes it natively (per-bout distance / target / incline). We emit the STORED
// `structure` when the coach authored one, else seed it from the legacy scalar
// prescription via `legacyToStructure` (a uniform / pyramid series, a steady bout)
// when it converts — non-convertible run blocks stay legacy-only. Each zone-target
// segment is then enriched with the athlete's RESOLVED pace band, reusing the SAME
// zone machinery as `resolveIntensityForItem`, so the per-bout objetivo the athlete
// EXECUTES matches the item-level band they already SEE.

// Resolve ONE structure segment's zone target to the athlete's pace band. Null for
// a pace/rpe/null target (no zone to resolve) or an un-tested athlete — the segment
// then carries no band and the app shows the zone label, never a fabricated pace.
function resolveSegmentBand(
  target: SegmentTarget | null,
  profile: { bands: ResolvedZone[]; needs_review: boolean } | undefined,
): ResolvedIntensity | null {
  if (!target || (target.type !== 'pace_zone' && target.type !== 'hr_zone')) return null;
  if (!profile || profile.bands.length === 0) return null;
  // Structure is run-only → the band is always per-km (mirrors resolveIntensityForItem).
  const band = resolvePaceBandFromZones(profile.bands, { value: target.zone }, 'per_km');
  if (!band) return null;
  const zone_label =
    band.zone_codes.length > 1 ? band.zone_codes.join('–') : (band.zone_codes[0] ?? '');
  return {
    zone_label,
    range_label: formatResolvedPaceBand(band),
    fast_s: band.fast_s,
    slow_s: band.slow_s,
    pace_unit: band.pace_unit,
    needs_review: profile.needs_review,
  };
}

// The athlete-wire structure for a run block (stored, else legacyToStructure), with
// each zone segment enriched with the resolved band. Null for non-run / non-
// convertible blocks (they stay legacy-only on the wire).
function runWireStructure(
  prescription: Prescription | null,
  isRun: boolean,
  zoneLookup: ZoneLookup,
): RunStructure | null {
  // `structure` is a RUNNING concept (pace per km, inclinación) — run blocks only.
  // `legacyToStructure`'s scheme-driven steady path does NOT itself reject a non-run
  // modality, so gating on run-ness here is what keeps an erg steady out.
  if (!prescription || !isRun) return null;
  const structure = prescription.structure ?? legacyToStructure(prescription);
  if (!structure || structure.length === 0) return null;

  const profile = zoneLookup.run;
  if (!profile) return structure; // no tested profile → the raw structure, no bands

  const enrichSeg = (seg: RunSegment): RunSegment => {
    const resolved = resolveSegmentBand(seg.target, profile);
    return resolved ? { ...seg, resolved } : seg;
  };
  const enrichEls = (els: RunElement[]): RunElement[] =>
    els.map((el) => (isRepeat(el) ? { ...el, elements: enrichEls(el.elements) } : enrichSeg(el)));
  return structure.map((phase) => ({ ...phase, elements: enrichEls(phase.elements) }));
}

// The representative intensity target for a line: the block-level target, else
// the first per-set target. Mirrors `prescriptionToParams`'s precedence so the
// resolved zone matches the scalar the rest of the item already exposes.
function lineTarget(p: Prescription): Target | undefined {
  const block = prescriptionTarget(p);
  if (block) return block;
  for (const s of p.sets ?? []) {
    const t = setTarget(s);
    if (t) return t;
  }
  return undefined;
}

// Validate-or-drop the structured prescription. A malformed JSONB is simply
// ignored (item degrades to scalar params) — never throws, never fabricates.
function parsePrescriptionJson(raw: unknown): Prescription | null {
  if (raw == null) return null;
  const parsed = safeParsePrescription(raw);
  return parsed.success ? (parsed.data as Prescription) : null;
}

// Map a scalar param bag → spec-normalized shape. The source is either the
// prescription-derived params (`prescriptionToParams`, the primary path) or the
// stored segment params (legacy fallback). DB uses `weight_kg` /
// `weight_pct_1rm` / `time_seconds` / `distance_m`; the spec exposes `load_kg` /
// `load_pct` / `duration_seconds` / `distance_meters`. Only the strict numeric
// keys iOS decodes are emitted; string hints (reps_scheme, *_range, pace_unit)
// are intentionally dropped here.
function normalizeParams(raw: Record<string, unknown> | null): AssignmentDetailParamsJson {
  const out: AssignmentDetailParamsJson = {};
  if (!raw) return out;

  const num = (k: string): number | undefined => {
    const v = raw[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };

  const sets = num('sets');
  if (sets !== undefined) out.sets = sets;

  const reps = num('reps');
  if (reps !== undefined) out.reps = reps;

  // load_kg ← weight_kg (DB) | load_kg (already-normalized)
  const loadKg = num('load_kg') ?? num('weight_kg');
  if (loadKg !== undefined) out.load_kg = loadKg;

  // load_pct ← weight_pct_1rm (DB) | load_pct (already-normalized)
  const loadPct = num('load_pct') ?? num('weight_pct_1rm');
  if (loadPct !== undefined) out.load_pct = loadPct;

  const rpe = num('rpe');
  if (rpe !== undefined) out.rpe = rpe;

  const restSeconds = num('rest_seconds');
  if (restSeconds !== undefined) out.rest_seconds = restSeconds;

  // duration_seconds ← time_seconds (DB) | duration_seconds
  const durationSeconds = num('duration_seconds') ?? num('time_seconds');
  if (durationSeconds !== undefined) out.duration_seconds = durationSeconds;

  // distance_meters direct + derived distance_km.
  // Accept the legacy `distance_m` alias too: some stored params_json (and the
  // seed/library rows) carry `distance_m`, but the iOS consumer reads
  // `distance_meters` — without this fallback the distance silently dropped.
  const distanceMeters = num('distance_meters') ?? num('distance_m');
  if (distanceMeters !== undefined) {
    out.distance_meters = distanceMeters;
    out.distance_km = Math.round((distanceMeters / 1000) * 1000) / 1000;
  }
  const distanceKm = num('distance_km');
  if (distanceKm !== undefined) {
    out.distance_km = distanceKm;
    if (out.distance_meters === undefined) {
      out.distance_meters = Math.round(distanceKm * 1000);
    }
  }

  const paceSecPerKm = num('pace_sec_per_km');
  if (paceSecPerKm !== undefined) out.pace_sec_per_km = paceSecPerKm;

  const cadenceSpm = num('cadence_spm');
  if (cadenceSpm !== undefined) out.cadence_spm = cadenceSpm;

  const calories = num('calories');
  if (calories !== undefined) out.calories = calories;

  const caloriesPerMin = num('calories_per_min');
  if (caloriesPerMin !== undefined) out.calories_per_min = caloriesPerMin;

  const hrZone = num('hr_zone');
  if (hrZone !== undefined) out.hr_zone = hrZone;

  // #erg-3: the erg watts target (prescriptionToParams emits `watts`); whitelisted
  // here so it survives to iOS instead of being stripped with the unknown keys.
  const watts = num('watts');
  if (watts !== undefined) out.watts = watts;

  return out;
}

// Mirror of the inline helper in `/api/athlete/plan/week` — `notes` carries an
// "am"/"pm" hint for double-session days. Returns `null` when absent so the
// client treats it as a single-session day.
function slotFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  if (notes.includes('pm')) return 'pm';
  if (notes.includes('am')) return 'am';
  return null;
}
