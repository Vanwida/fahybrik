import type { Sql } from '@/lib/db';
import {
  prescriptionToParams,
  safeParsePrescription,
  prescriptionTarget,
  setTarget,
  type Prescription,
  type Target,
} from '@fahybrid/shared/domain/prescription';
import {
  resolvePaceBandFromZones,
  formatResolvedPaceBand,
  type ResolvedZone,
} from '@fahybrid/shared/domain/methodology';
import {
  loadAthleteZoneProfilesForAthlete,
} from '@/lib/dashboard/v2/zone-profile';
import type { AthleteZoneProfile } from '@fahybrid/shared/schema/methodology-system';

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
// constraint is relaxed in the future).
// =============================================================================

export interface AssignmentDetailParams {
  sql: Sql;
  athlete_id: bigint;
  assignment_id: bigint;
}

export interface AssignmentDetailResponse {
  assignment: {
    id: string;
    athlete_id: string;
    scheduled_for: string;
    status: 'scheduled' | 'completed' | 'missed' | 'skipped';
    slot: string | null;
    template_id: string | null;
    template_version: number | null;
    completed_at: string | null;
    perceived_exertion: number | null;
    // C35 — partner-visibility flag from workout_assignments. iOS uses it to
    // render the "shared with partner" badge on the pre-workout brief.
    // 'shared' = visible to partner; 'self_only' = private to this athlete.
    partner_visibility: 'shared' | 'self_only';
  };
  workout: AssignmentDetailWorkout | null;
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
  notes: string | null;
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
}

// =============================================================================
// Internal row shapes
// =============================================================================

interface AssignmentRow {
  id: string;
  athlete_id: string;
  scheduled_for: string;
  status: 'scheduled' | 'completed' | 'missed' | 'skipped';
  notes: string | null;
  template_id: string | null;
  template_version: number | null;
  partner_visibility: 'shared' | 'self_only';
}

interface ExecutionRow {
  ended_at: string | null;
  perceived_exertion: number | null;
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
  const assignmentRows = await sql<AssignmentRow[]>`
    select
      wa.id::text                                    as id,
      wa.athlete_id::text                            as athlete_id,
      to_char(wa.scheduled_for, 'YYYY-MM-DD')        as scheduled_for,
      wa.status::text                                as status,
      wa.notes                                       as notes,
      wa.template_id::text                           as template_id,
      wa.template_version                            as template_version,
      wa.partner_visibility                          as partner_visibility
    from workout_assignments wa
    where wa.id = ${assignment_id as unknown as number}
      and wa.athlete_id = ${athlete_id as unknown as number}
    limit 1
  `;
  const assignment = assignmentRows[0];
  if (!assignment) return null;

  // G1 — the athlete's stored zone profiles (one current row per modality),
  // derived coach-scoped from athletes.coach_id inside the loader. Used to
  // resolve any @Zn target on a line into its absolute pace band. Empty (no test
  // yet) → items simply carry the zone badge with no resolved pace.
  const zoneProfiles = await loadAthleteZoneProfilesForAthlete({
    athlete_id,
    client: sql,
  });

  // Execution (1:1 with assignment, may not exist yet if scheduled).
  const executionRows = await sql<ExecutionRow[]>`
    select
      ended_at::text          as ended_at,
      perceived_exertion      as perceived_exertion
    from workout_executions
    where assignment_id = ${assignment_id as unknown as number}
    limit 1
  `;
  const execution = executionRows[0] ?? null;

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
          e.name                                      as exercise_name,
          e.slug                                      as exercise_slug,
          e.category::text                            as exercise_category,
          e.video_url                                 as exercise_video_url,
          e.cues                                      as exercise_cues
        from template_segments s
        join exercises e on e.id = s.exercise_id
        where s.template_id = ${assignment.template_id}::bigint
        order by s.block_position asc, s.position asc, s.id asc
      `;
    }
  }

  return buildAssignmentDetail({ assignment, execution, template, segments, zoneProfiles });
}

// A modality → resolved-zone-bands lookup, built once per request from the
// athlete's stored profiles. The plan target carries a modality (run/row/ski/
// bike); we index the matching profile's snapshot bands by it. `bike` and `ski`
// share the per_500m unit but are SEPARATE profiles (separate tests), so the key
// is the profile modality verbatim — no collapsing.
export type ZoneLookup = Partial<Record<AthleteZoneProfile['modality'], ResolvedZone[]>>;

function buildZoneLookup(profiles: AthleteZoneProfile[]): ZoneLookup {
  const out: ZoneLookup = {};
  for (const p of profiles) {
    // zones_json already holds the resolved absolute bands (snapshot). Adapt the
    // stored snapshot shape to the domain ResolvedZone shape the resolver reads.
    out[p.modality] = p.zones_json.map((z) => ({
      code: z.code,
      label: z.label,
      color: z.color,
      role: z.role,
      sort_order: z.sort_order,
      fast_s: z.fast_s,
      slow_s: z.slow_s,
    }));
  }
  return out;
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
}): AssignmentDetailResponse {
  const { assignment, execution, template, segments } = input;
  const zoneLookup = buildZoneLookup(input.zoneProfiles ?? []);

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
    },
    workout: null,
  };

  if (!template) return base;

  base.workout = {
    name: template.name,
    // No first-class `focus` column on templates today. Leave null — iOS
    // already handles null defensively.
    focus: null,
    coach_note: template.coach_notes,
    estimated_duration_minutes: null,
    blocks: buildBlocks(template, segments, zoneLookup),
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
      items: m.segs.map((seg) => buildItem(seg, zoneLookup)),
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

function buildItem(seg: SegmentRow, zoneLookup: ZoneLookup): AssignmentDetailItem {
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

  return {
    uid: `segment-${seg.id}`,
    exercise_id: seg.exercise_id,
    exercise_name: seg.exercise_name,
    exercise_slug: seg.exercise_slug,
    exercise_category: category,
    exercise_video_url: seg.exercise_video_url,
    cues: seg.exercise_cues,
    params_json: normalizeParams(source),
    prescription_json: prescription,
    resolved_intensity: resolveIntensityForItem(prescription, modality, zoneLookup),
    notes: seg.notes,
  };
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

  const bands = zoneLookup[modality];
  if (!bands || bands.length === 0) return null;

  const band = resolvePaceBandFromZones(
    bands,
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
  };
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
