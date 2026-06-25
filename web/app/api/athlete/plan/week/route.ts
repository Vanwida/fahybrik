import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildAthleteMacroSummary } from '@/lib/coach/macro-progress';
import { addDays, isoDateString, mondayOfWeek, startOfDayInBox } from '@fahybrid/shared/domain/atr/dates';
import { getNextRace, getTargetRace } from '@/lib/races/next-race';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const summary = await buildAthleteMacroSummary({ athlete_id: auth.athlete_id });
  const week = await buildAthleteWeekPlan(auth.athlete_id);
  const coach_name = await getCoachName(auth.athlete_id);

  // RACE countdown. `target_race` = the goal the plan peaks to; `next_race` =
  // the soonest race on the calendar (may be an intermediate tune_up). They can
  // be the same object when the target is also the soonest. Both null when the
  // athlete has no upcoming race. ADDITIVE — does not alter week/macro_summary.
  const [target_race, next_race] = await Promise.all([
    getTargetRace(auth.athlete_id),
    getNextRace(auth.athlete_id),
  ]);

  // ADDITIVE provenance fields. `coach_name` (the athlete's coach) and the
  // week's `microciclo_name` (the periodization phase the week belongs to) are
  // surfaced on the iOS "Tu semana" subtitle. `microciclo_name` lives on the
  // week object (it's a property of the published week), `coach_name` at the
  // top level (it's stable across weeks). Both null-safe: an athlete with no
  // coach / a week outside any microcycle simply omits the value.
  return jsonOk({ week, macro_summary: summary, coach_name, target_race, next_race });
}

// The athlete's coach display name (athletes.coach_id -> coaches.full_name).
// NULL when the athlete has no coach assigned (degrades to iOS fallback copy).
async function getCoachName(athlete_id: number | bigint): Promise<string | null> {
  const rows = await sql<{ full_name: string | null }[]>`
    select c.full_name
    from athletes a
    join coaches c on c.id = a.coach_id
    where a.id = ${athlete_id as number}
    limit 1
  `;
  return rows[0]?.full_name ?? null;
}

async function buildAthleteWeekPlan(athlete_id: number | bigint) {
  // "Today" must resolve in the box timezone (Europe/Madrid), not UTC —
  // otherwise between 00:00–02:00 BCN the athlete is shown yesterday's week.
  const today = startOfDayInBox(new Date());
  const weekStart = mondayOfWeek(today);
  const weekStartIso = isoDateString(weekStart);
  const weekEndIso = isoDateString(addDays(weekStart, 6));

  const rows = await sql<
    Array<{
      assignment_id: string;
      iso_date: string;
      template_id: string | null;
      microcycle_id: string | null;
      template_name: string | null;
      template_format: string | null;
      template_day_position: string | null;
      is_test: boolean;
      status: string;
      notes: string | null;
      partner_visibility: 'shared' | 'self_only';
    }>
  >`
    select
      wa.id::text as assignment_id,
      to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso_date,
      wa.template_id::text as template_id,
      wa.microcycle_id::text as microcycle_id,
      t.name as template_name,
      t.format::text as template_format,
      t.day_position as template_day_position,
      -- is_test: a session is a TEST when its template STORES measurable results
      -- (meta_json.store_results is a non-empty array) — i.e. its purpose is to
      -- measure and feed the athlete's profile/resolver, not to train. This is
      -- coach-agnostic and data-driven; the methodology group (running, race-sim…)
      -- does NOT identify a test (a VDOT track test and regular intervals share
      -- group 4; a HYROX EMOM and the HYROX competition share group 7).
      (
        jsonb_typeof(t.meta_json -> 'store_results') = 'array'
        and jsonb_array_length(t.meta_json -> 'store_results') > 0
      ) as is_test,
      wa.status::text as status,
      wa.notes,
      wa.partner_visibility as partner_visibility
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.athlete_id = ${athlete_id as number}
      and wa.scheduled_for >= ${weekStartIso}::date
      and wa.scheduled_for <= ${weekEndIso}::date
      -- PUBLISH GATE: hide assignments whose week is still a coach DRAFT.
      -- All rows here belong to one week (weekStartIso = Monday in box tz), so a
      -- single weekly_plans lookup gates the whole result. Backward-compatible:
      -- existing data + /hoy's live-approve create NO draft row, so NOT EXISTS is
      -- true and everything stays visible exactly as before. Only weeks the coach
      -- explicitly saved as 'draft' (future create-in-draft flow) are hidden;
      -- 'published' and 'archived' weeks are shown.
      and not exists (
        select 1 from weekly_plans wp
        where wp.athlete_id = ${athlete_id as number}
          and wp.week_start = ${weekStartIso}::date
          and wp.status = 'draft'
      )
    order by wa.scheduled_for asc, wa.id asc
  `;

  // Per-session DERIVED metadata (est_duration / blocks_count / short_prescription).
  // Source of truth is the materialized template content (template_segments),
  // NOT program_week_templates.slots_json — once a week is materialized into
  // workout_assignments the per-session blocks live in templates/template_segments.
  // One batched lookup keyed by the week's distinct template_ids; sessions whose
  // template carries no segments simply get null fields (honest fallback on iOS).
  const templateIds = Array.from(
    new Set(rows.map((r) => r.template_id).filter((id): id is string => !!id)),
  );
  const summaries = await loadTemplateSummaries(templateIds);

  // The week's microcycle name (periodization phase). All assignments in a week
  // share one microcycle; we resolve the first non-null microcycle_id.
  const microcycleId = rows.find((r) => r.microcycle_id)?.microcycle_id ?? null;
  const microciclo_name = await resolveMicrocicloName(microcycleId);

  // C35 — partner_visibility is exposed as-is. The DB filter by athlete_id
  // already isolates each user's sessions, so the only rows here belong to
  // the caller. iOS uses this field to render the "shared with partner"
  // badge. No additional server-side filtering needed.
  const days = [1, 2, 3, 4, 5, 6, 7].map((dow) => {
    const dayDate = isoDateString(addDays(weekStart, dow - 1));
    const daySessions = rows.filter((r) => r.iso_date === dayDate);
    return {
      day_of_week: dow,
      iso_date: dayDate,
      sessions: daySessions.map((s) => {
        const summary = s.template_id ? summaries.get(s.template_id) : undefined;
        return {
          assignment_id: s.assignment_id,
          slot: slotFromNotes(s.notes, s.template_day_position),
          title: s.template_name ?? 'Sesión',
          // G5 — the REAL training modality (run/row/ski/bike/strength/functional/
          // core/mobility/other), derived from the template's segments (each
          // line's exercise modality is the single source of truth; a per-line
          // prescription override wins when present). This is what colors the iOS
          // dot. Falls back to the workout FORMAT (amrap/emom/…) only when the
          // template has no readable segments, so the field is never empty.
          modality: summary?.modality ?? s.template_format,
          status: s.status,
          partner_visibility: s.partner_visibility,
          // DERIVED, additive. Null when the template has no segments to read.
          est_duration_minutes: summary?.est_duration_minutes ?? null,
          blocks_count: summary?.blocks_count ?? null,
          short_prescription: summary?.short_prescription ?? null,
          // A session is a TEST when its template stores measurable results
          // (computed in SQL above) — its purpose is to measure, not to train.
          is_test: s.is_test,
        };
      }),
      is_rest: daySessions.length === 0,
    };
  });

  return {
    week_start: weekStartIso,
    week_end: weekEndIso,
    today_iso: isoDateString(today),
    microciclo_name,
    days,
  };
}

// Honest defaults for estimating session duration from template segments when
// the prescription is rep-based (no explicit time). Conservative averages so we
// never over-promise a duration. Tunable as Pablo's data accrues.
const SECONDS_PER_REP = 4; // ~4s per controlled rep (concentric + eccentric + reset)
const DEFAULT_SET_REST_SECONDS = 60; // assumed inter-set rest when none prescribed

type TemplateSummary = {
  est_duration_minutes: number | null;
  blocks_count: number | null;
  short_prescription: string | null;
  // G5 — the session's REAL modality (the colorable run/row/ski/bike/strength/…),
  // derived from its segments. Null when no segment carries a modality.
  modality: string | null;
};

type SegmentRow = {
  template_id: string;
  block_position: number | null;
  block_title: string | null;
  position: number;
  params_json: Record<string, unknown> | null;
  // exercises.modality is the single source of truth (migration 0053, NOT NULL);
  // a per-line prescription_json.modality override wins when set on the segment.
  exercise_modality: string | null;
  prescription_modality: string | null;
};

// Batched per-template segment aggregation. Returns a map template_id ->
// derived summary. A template with zero segments is absent from the map (its
// sessions get null fields). NOTE: `block_position` groups segments into blocks
// (warmup / metcon / cooldown …); `block_title` names them.
async function loadTemplateSummaries(
  templateIds: string[],
): Promise<Map<string, TemplateSummary>> {
  const out = new Map<string, TemplateSummary>();
  if (templateIds.length === 0) return out;

  const segs = await sql<SegmentRow[]>`
    select
      ts.template_id::text as template_id,
      ts.block_position as block_position,
      ts.block_title as block_title,
      ts.position as position,
      ts.params_json as params_json,
      e.modality as exercise_modality,
      ts.prescription_json->>'modality' as prescription_modality
    from template_segments ts
    left join exercises e on e.id = ts.exercise_id
    where ts.template_id = any(${templateIds}::bigint[])
    order by ts.template_id, ts.block_position nulls first, ts.position
  `;

  // Group rows per template, then derive blocks_count / short_prescription /
  // est_duration_minutes in one pass.
  const byTemplate = new Map<string, SegmentRow[]>();
  for (const row of segs) {
    const list = byTemplate.get(row.template_id) ?? [];
    list.push(row);
    byTemplate.set(row.template_id, list);
  }

  for (const [templateId, list] of byTemplate) {
    // Distinct blocks: prefer block_position grouping; fall back to one block
    // when no segment carries a position (legacy flat templates).
    const positions = new Set(
      list.map((r) => (r.block_position == null ? '_flat' : String(r.block_position))),
    );
    const blocks_count = positions.size > 0 ? positions.size : null;

    // Ordered, de-duplicated block titles for the one-line summary.
    const titles: string[] = [];
    const seenTitles = new Set<string>();
    for (const r of list) {
      const title = r.block_title?.trim();
      if (title && !seenTitles.has(title)) {
        seenTitles.add(title);
        titles.push(title);
      }
    }
    const short_prescription = buildShortPrescription(titles, blocks_count);

    const est_duration_minutes = estimateDurationMinutes(list.map((r) => r.params_json));

    const modality = dominantModality(list);

    out.set(templateId, { est_duration_minutes, blocks_count, short_prescription, modality });
  }

  return out;
}

// Per-segment modality: a deliberate per-line prescription override wins, else
// the exercise's intrinsic modality (the NOT-NULL single source of truth set by
// migration 0053). Null only when neither is present (orphan/legacy segment).
function segmentModality(r: SegmentRow): string | null {
  return r.prescription_modality ?? r.exercise_modality ?? null;
}

// The session's REAL modality for the weekly card (G5). A session can mix
// modalities (a HYROX sim, a compromised block); the card shows ONE colorable
// dot, so we pick the DOMINANT modality by segment count. Tie-break is
// deterministic: the first modality to reach the max count in segment order
// (block_position, position — the query's ORDER BY), so the result is stable.
// Returns null when no segment carries a modality (caller falls back to format).
function dominantModality(segments: SegmentRow[]): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;
  for (const seg of segments) {
    const m = segmentModality(seg);
    if (!m) continue;
    const next = (counts.get(m) ?? 0) + 1;
    counts.set(m, next);
    if (next > bestCount) {
      bestCount = next;
      best = m;
    }
  }
  return best;
}

// One-line human summary of a session's structure. Prefers the named blocks
// (e.g. "Calentamiento · Series · Vuelta a la calma"), capped at 3 to stay one
// line; falls back to a block count. Null when there's nothing to say.
function buildShortPrescription(titles: string[], blocksCount: number | null): string | null {
  if (titles.length > 0) {
    const shown = titles.slice(0, 3);
    const suffix = titles.length > shown.length ? ` +${titles.length - shown.length}` : '';
    return shown.join(' · ') + suffix;
  }
  if (blocksCount && blocksCount > 0) {
    return `${blocksCount} ${blocksCount === 1 ? 'bloque' : 'bloques'}`;
  }
  return null;
}

// Honest duration estimate (minutes) from a template's segment params. Sums
// per-segment work + rest, scaled by sets/rounds. Work time is taken from
// explicit time fields when present, else estimated from reps. Returns null
// when nothing is estimable (so iOS keeps its honest "no duration" fallback).
function estimateDurationMinutes(paramsList: Array<Record<string, unknown> | null>): number | null {
  let totalSeconds = 0;
  let sawSomething = false;

  for (const params of paramsList) {
    if (!params) continue;
    const num = (key: string): number | null => {
      const v = params[key];
      return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
    };

    const sets = num('sets') ?? num('rounds') ?? 1;

    // Per-set/round work seconds: explicit time, else duration, else rep-derived.
    const timeSeconds = num('time_seconds') ?? num('duration_seconds');
    const reps = num('reps');
    let workPerSet: number | null = null;
    if (timeSeconds != null) {
      workPerSet = timeSeconds;
    } else if (reps != null) {
      workPerSet = reps * SECONDS_PER_REP;
    }

    const restSeconds = num('rest_seconds');

    if (workPerSet != null) {
      sawSomething = true;
      // Rest happens between sets (sets - 1 gaps), defaulting when unspecified.
      const restPerGap = restSeconds ?? (sets > 1 ? DEFAULT_SET_REST_SECONDS : 0);
      totalSeconds += workPerSet * sets + restPerGap * Math.max(0, sets - 1);
    } else if (restSeconds != null) {
      // Pure rest/recovery block (e.g. "Recuperación 10'").
      sawSomething = true;
      totalSeconds += restSeconds;
    }
  }

  if (!sawSomething || totalSeconds <= 0) return null;
  return Math.max(1, Math.round(totalSeconds / 60));
}

// Resolve the periodization-phase name for the week's microcycle:
//   microcycle -> atr_block -> methodology_phase.label
// Falls back to a label derived from atr_blocks.type when phase_id IS NULL
// (or no methodology_phase row matched). Returns null when there's no
// microcycle (free-planned week). The LEFT JOIN to methodology_phases degrades
// gracefully even if the agnostic-phase system (0052) isn't populated.
async function resolveMicrocicloName(microcycleId: string | null): Promise<string | null> {
  if (!microcycleId) return null;
  const rows = await sql<
    Array<{ phase_label: string | null; block_type: string | null }>
  >`
    select
      mp.label as phase_label,
      b.type::text as block_type
    from microcycles mc
    join atr_blocks b on b.id = mc.block_id
    left join methodology_phases mp on mp.id = b.phase_id
    where mc.id = ${microcycleId}::bigint
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  if (row.phase_label && row.phase_label.trim().length > 0) return row.phase_label;
  return atrTypeLabel(row.block_type);
}

// Fallback label for the legacy ATR block enum (ACC / TRANS / REAL). Mirrors the
// iOS `atrPhaseLabel` mapping (Shared/ATRPhase.swift) so the athlete reads the
// same pedagogical word on both surfaces. Unknown codes are returned as-is.
function atrTypeLabel(type: string | null): string | null {
  switch (type?.trim().toUpperCase()) {
    case 'ACC':
      return 'Acumulación';
    case 'TRANS':
      return 'Intensificación';
    case 'REAL':
      return 'Tapering';
    default:
      return type ?? null;
  }
}

function slotFromNotes(notes: string | null, dayPos: string | null): 'am' | 'pm' {
  if (notes?.includes('pm')) return 'pm';
  if (notes?.includes('am')) return 'am';
  if (dayPos?.toUpperCase().includes('PM')) return 'pm';
  return 'am';
}
