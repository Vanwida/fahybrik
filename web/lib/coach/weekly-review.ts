// Weekly review service. Produces the snapshot Pablo sees Sunday morning,
// loads the current draft (or starts a fresh one), persists drafts, commits
// approvals, and exposes history.
//
// Design principles:
//   * snapshot is computed fresh on first open and frozen after — once a review
//     is approved, the snapshot reflects the cohort state Pablo actually saw,
//     not the current state. This is critical for "review hace 4 semanas, ¿qué
//     decidí entonces?" — the rationale must remain legible.
//   * attention / transition / mass-adjustment lists are derived from the live
//     cohort while the review is open (draft) and frozen on approval.
//   * the route layer is thin — input validation + auth, but the heavy lifting
//     (cohort math, opportunity detection) lives here.

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { coerceJson } from '@/lib/json-column';
import { buildCohort } from './cohort';
import type { CohortRow } from '@fahybrid/shared/domain/coach/types';
import {
  aggregatePolarization,
  polarizationDrift as computePolarizationDrift,
  TARGET_POLARIZATION,
} from '@fahybrid/shared/domain/coach/polarization';
import {
  type CoachWeeklyReview,
  type CohortPlanDay,
  type CohortPlanWeek,
  type MassAdjustmentOpportunity,
  type WeeklyAttentionItem,
  type WeeklyReviewDecision,
  type WeeklyReviewHistoryItem,
  type WeeklyReviewNote,
  type WeeklyReviewPlanEdit,
  type WeeklyReviewSnapshot,
  type WeeklyTransitionItem,
  weeklyReviewDecisionSchema,
  weeklyReviewNoteSchema,
  weeklyReviewPlanEditSchema,
  weeklyReviewSnapshotSchema,
} from './weekly-review-schema';

const POLARIZATION_DRIFT_THRESHOLD = 6;
const ATTENTION_HRV_DROP_MS = 8;
const MASS_ADJUSTMENT_MIN_AFFECTED = 3;
// Weeks into the current microciclo before a transition recommendation is
// surfaced. Agnostic (no fixed phase length): a single floor across the cohort.
const TRANSITION_WEEK_THRESHOLD = 3;

// =============================================================================
// Public API
// =============================================================================

export interface CurrentReviewResult {
  review: CoachWeeklyReview;
  attention: WeeklyAttentionItem[];
  transitions: WeeklyTransitionItem[];
  mass_adjustments: MassAdjustmentOpportunity[];
  plan: CohortPlanWeek[];
  is_new: boolean;
}

export async function getCurrentReview(params: {
  coach_id: bigint | number;
  now?: Date;
  client?: Sql;
}): Promise<CurrentReviewResult> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const weekStart = isoWeekStart(now);

  const cohort = await buildCohort({ coach_id: params.coach_id, now, client });

  const existing = await loadDraft(client, params.coach_id, weekStart);

  let review: CoachWeeklyReview;
  let isNew = false;

  if (existing) {
    review = existing;
  } else {
    isNew = true;
    const snapshot = computeSnapshot(cohort, now);
    review = {
      id: null,
      coach_id: BigInt(params.coach_id as number),
      iso_week_start: weekStart,
      status: 'draft',
      snapshot,
      decisions: [],
      notes: [],
      plan_edits: [],
      duration_ms: null,
      opened_at: now.toISOString(),
      approved_at: null,
      deferred_until: null,
    };
  }

  return {
    review,
    attention: computeAttention(cohort),
    transitions: computeTransitions(cohort),
    mass_adjustments: computeMassAdjustments(cohort),
    plan: computePlan(now),
    is_new: isNew,
  };
}

export interface SaveReviewParams {
  coach_id: bigint | number;
  iso_week_start: string;
  action: 'save_draft' | 'approve' | 'defer';
  decisions?: WeeklyReviewDecision[];
  notes?: WeeklyReviewNote[];
  plan_edits?: WeeklyReviewPlanEdit[];
  duration_ms?: number;
  now?: Date;
  client?: Sql;
}

export async function saveReview(
  params: SaveReviewParams,
): Promise<CoachWeeklyReview> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const cohort = await buildCohort({ coach_id: params.coach_id, now, client });
  const snapshot = computeSnapshot(cohort, now);

  const decisionsJson = JSON.stringify(
    z.array(weeklyReviewDecisionSchema).parse(params.decisions ?? []),
  );
  const notesJson = JSON.stringify(
    z.array(weeklyReviewNoteSchema).parse(params.notes ?? []),
  );
  const planEditsJson = JSON.stringify(
    z.array(weeklyReviewPlanEditSchema).parse(params.plan_edits ?? []),
  );

  const status: 'draft' | 'approved' | 'deferred' =
    params.action === 'approve' ? 'approved' : params.action === 'defer' ? 'deferred' : 'draft';

  const approvedAt = status === 'approved' ? now.toISOString() : null;
  const deferredUntil =
    status === 'deferred' ? new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10) : null;

  const existing = await loadDraft(client, params.coach_id, params.iso_week_start);

  if (existing && existing.id != null) {
    // Update path. If we're approving, snapshot stays as-is (the draft already
    // froze it on first open); if we're saving a draft, refresh the snapshot
    // so Pablo sees current numbers if cohort changed since he opened.
    const snapshotJson = status === 'approved'
      ? JSON.stringify(weeklyReviewSnapshotSchema.parse(existing.snapshot))
      : JSON.stringify(snapshot);

    const rows = await client<DbRow[]>`
      update coach_weekly_reviews
      set status         = ${status}::coach_weekly_review_status,
          snapshot_json  = ${snapshotJson}::jsonb,
          decisions_json = ${decisionsJson}::jsonb,
          notes_json     = ${notesJson}::jsonb,
          plan_edits_json= ${planEditsJson}::jsonb,
          duration_ms    = ${params.duration_ms ?? existing.duration_ms ?? null},
          approved_at    = ${approvedAt}::timestamptz,
          deferred_until = ${deferredUntil}::date
      where id = ${existing.id as unknown as number}
        and coach_id = ${params.coach_id as number}
      returning
        id::text                              as id,
        coach_id::text                        as coach_id,
        to_char(iso_week_start, 'YYYY-MM-DD') as iso_week_start,
        status::text                          as status,
        snapshot_json,
        decisions_json,
        notes_json,
        plan_edits_json,
        duration_ms,
        opened_at,
        approved_at,
        to_char(deferred_until, 'YYYY-MM-DD') as deferred_until
    `;
    return rowToReview(rows[0]);
  }

  // Insert path.
  const snapshotJson = JSON.stringify(snapshot);
  const rows = await client<DbRow[]>`
    insert into coach_weekly_reviews (
      coach_id, iso_week_start, status, snapshot_json,
      decisions_json, notes_json, plan_edits_json,
      duration_ms, approved_at, deferred_until
    )
    values (
      ${params.coach_id as number},
      ${params.iso_week_start}::date,
      ${status}::coach_weekly_review_status,
      ${snapshotJson}::jsonb,
      ${decisionsJson}::jsonb,
      ${notesJson}::jsonb,
      ${planEditsJson}::jsonb,
      ${params.duration_ms ?? null},
      ${approvedAt}::timestamptz,
      ${deferredUntil}::date
    )
    returning
      id::text                              as id,
      coach_id::text                        as coach_id,
      to_char(iso_week_start, 'YYYY-MM-DD') as iso_week_start,
      status::text                          as status,
      snapshot_json,
      decisions_json,
      notes_json,
      plan_edits_json,
      duration_ms,
      opened_at,
      approved_at,
      to_char(deferred_until, 'YYYY-MM-DD') as deferred_until
  `;
  return rowToReview(rows[0]);
}

export async function listHistory(params: {
  coach_id: bigint | number;
  limit?: number;
  client?: Sql;
}): Promise<WeeklyReviewHistoryItem[]> {
  const client = params.client ?? defaultSql;
  const limit = Math.min(Math.max(params.limit ?? 26, 1), 104);

  const rows = await client<HistoryRow[]>`
    select
      id::text                       as id,
      to_char(iso_week_start, 'YYYY-MM-DD') as iso_week_start,
      status::text                   as status,
      approved_at,
      duration_ms,
      jsonb_array_length(decisions_json)         as decisions_count,
      jsonb_array_length(notes_json)             as notes_count,
      coalesce((snapshot_json ->> 'active_athlete_count')::int, 0) as active_athlete_count,
      nullif((snapshot_json ->> 'compliance_pct'), '')::float    as compliance_pct
    from coach_weekly_reviews
    where coach_id = ${params.coach_id as number}
      and status <> 'draft'
    order by iso_week_start desc
    limit ${limit}
  `;

  return rows.map((r) => ({
    id: r.id,
    iso_week_start: r.iso_week_start,
    status: r.status as WeeklyReviewHistoryItem['status'],
    approved_at: r.approved_at?.toISOString() ?? null,
    duration_ms: r.duration_ms ?? null,
    decisions_count: r.decisions_count ?? 0,
    notes_count: r.notes_count ?? 0,
    active_athlete_count: r.active_athlete_count ?? 0,
    compliance_pct: r.compliance_pct ?? null,
  }));
}

export async function getReviewById(params: {
  coach_id: bigint | number;
  review_id: string;
  client?: Sql;
}): Promise<CoachWeeklyReview | null> {
  const client = params.client ?? defaultSql;
  const idNum = Number(params.review_id);
  if (!Number.isInteger(idNum) || idNum <= 0) return null;

  const rows = await client<DbRow[]>`
    select
      id::text                              as id,
      coach_id::text                        as coach_id,
      to_char(iso_week_start, 'YYYY-MM-DD') as iso_week_start,
      status::text                          as status,
      snapshot_json,
      decisions_json,
      notes_json,
      plan_edits_json,
      duration_ms,
      opened_at,
      approved_at,
      to_char(deferred_until, 'YYYY-MM-DD') as deferred_until
    from coach_weekly_reviews
    where id = ${idNum}
      and coach_id = ${params.coach_id as number}
    limit 1
  `;
  const row = rows[0];
  return row ? rowToReview(row) : null;
}

// =============================================================================
// Snapshot + derived lists (pure)
// =============================================================================

export function computeSnapshot(cohort: CohortRow[], now: Date): WeeklyReviewSnapshot {
  const weekStart = isoWeekStart(now);
  const weekEnd = isoDateAddDays(weekStart, 6);

  const compliances = cohort
    .map((r) => r.compliance_pct)
    .filter((v): v is number => v != null);
  const compliance = compliances.length > 0
    ? Math.round(compliances.reduce((s, v) => s + v, 0) / compliances.length)
    : null;

  // Only the athletes whose volume is actually known are summed, and the total is
  // null when none is: adding an unknown as 0 h understates the cohort's week and
  // reads as a measured total. Same shape as the compliance mean above.
  const volumes = cohort.map((r) => r.volume_7d_h).filter((v): v is number => v != null);
  const totalVolume = volumes.length > 0 ? round1(volumes.reduce((s, v) => s + v, 0)) : null;

  const polarization = aggregatePolarization(cohort);
  const polarizationDrift = polarization ? computePolarizationDrift(polarization) : null;

  const hrvDeltas = cohort
    .map((r) => r.hrv_delta_ms)
    .filter((v): v is number => v != null);
  const hrvAvg = hrvDeltas.length > 0
    ? hrvDeltas.reduce((s, v) => s + v, 0) / hrvDeltas.length
    : null;
  const hrvTrend: 'up' | 'down' | 'flat' | null = hrvAvg == null
    ? null
    : hrvAvg >= 2
      ? 'up'
      : hrvAvg <= -2
        ? 'down'
        : 'flat';

  const sleeps = cohort
    .map((r) => r.sleep_avg_7d_h)
    .filter((v): v is number => v != null);
  const sleepAvg = sleeps.length > 0
    ? round1(sleeps.reduce((s, v) => s + v, 0) / sleeps.length)
    : null;

  // Injury / quejas heuristic: HRV crash + RPE high + missed sessions in last
  // 7d count as the "injuries / quejas" line in the spec.
  const injuries = cohort.filter((r) =>
    r.alerts.some((a) => a.kind === 'hrv_crash' || a.kind === 'rpe_high' || a.kind === 'missed_sessions'),
  );

  return {
    iso_week_start: weekStart,
    iso_week_end: weekEnd,
    week_number: isoWeekNumber(now),
    active_athlete_count: cohort.length,
    compliance_pct: compliance,
    // Live cohort row doesn't currently surface "vs last week" deltas — leave
    // null until the briefing layer is plumbed in. Pablo gets the snapshot;
    // future work can enrich.
    compliance_pct_delta_vs_lw: null,
    total_volume_hours: totalVolume,
    total_volume_pct_delta_vs_lw: null,
    polarization,
    polarization_drift: polarizationDrift,
    prs_count: 0,
    prs_athletes: 0,
    injuries_count: injuries.length,
    injuries_summary: injuries.length === 0
      ? null
      : injuries.slice(0, 3).map((r) => r.full_name).join(', '),
    hrv_trend: hrvTrend,
    sleep_avg_h: sleepAvg,
    sleep_avg_delta_min: null,
  };
}

export function computeAttention(cohort: CohortRow[]): WeeklyAttentionItem[] {
  const items: WeeklyAttentionItem[] = [];

  for (const row of cohort) {
    const signals: string[] = [];
    let severity: 'critical' | 'warning' = 'warning';

    if (row.compliance_pct != null && row.compliance_pct < 75) {
      signals.push(`Compliance ${row.compliance_pct}%`);
      if (row.compliance_pct < 60) severity = 'critical';
    }

    if (row.hrv_delta_ms != null && row.hrv_delta_ms <= -ATTENTION_HRV_DROP_MS) {
      signals.push(`HRV ▼ ${Math.abs(row.hrv_delta_ms).toFixed(0)} ms`);
      if (row.hrv_delta_ms <= -10) severity = 'critical';
    }

    if (row.alerts.some((a) => a.kind === 'rpe_high')) {
      signals.push('RPE elevado en últimas sesiones');
    }

    if (row.alerts.some((a) => a.kind === 'missed_sessions')) {
      signals.push('Sesiones perdidas en últimos 7d');
    }

    if (row.alerts.some((a) => a.kind === 'no_sync')) {
      signals.push('Sin sincronizar wearable');
    }

    // Sobreesfuerzo survives a partial reading, on purpose: the work we DID
    // price already crosses the line, and the sessions we could not price only
    // added stimulus on top. Erring toward "look at this athlete" is the safe
    // direction; the claims that get withheld below are the ones that ADD load.
    if (row.tsb != null && row.tsb < -25) {
      signals.push(`TSB ${row.tsb.toFixed(0)} (sobreesfuerzo)`);
      severity = 'critical';
    }

    if (signals.length === 0) continue;

    // The gap ANNOTATES an athlete already in the queue; it does not summon one.
    // Whether "no está valorando sus sesiones" deserves its own attention item is
    // a call about Pablo's inbox, not about honesty — and honesty only requires
    // that the load signals above never read as solid when they are not.
    if (row.load_coverage.state === 'partial' && row.load_coverage.badge_es) {
      signals.push(`Carga ${row.load_coverage.badge_es}`);
    }

    const recommendation = recommendationFor(row, severity);

    items.push({
      athlete_id: row.athlete_id,
      full_name: row.full_name,
      block_type: row.block_type,
      block_week: row.block_week,
      severity,
      signals: signals.slice(0, 6),
      recommendation,
    });
  }

  // Sort: critical first, then by signal count descending.
  items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return b.signals.length - a.signals.length;
  });
  return items;
}

export function computeTransitions(cohort: CohortRow[]): WeeklyTransitionItem[] {
  const out: WeeklyTransitionItem[] = [];
  for (const row of cohort) {
    if (row.block_type == null || row.block_week == null) continue;

    // Heuristic: once an athlete is deep enough into their current microciclo,
    // surface a readiness signal for the cohort pulse. The deep-dive page calls
    // the canonical progress-readiness reader for the per-athlete truth.
    if (row.block_week < TRANSITION_WEEK_THRESHOLD) continue;

    // Adherence is NULL when nothing was due yet in the microciclo. Reading that
    // as 0 was the exact mirror of the `null → 1 → advance` bug: it printed
    // "Compliance 0%" and pushed the athlete into `regress` with medium
    // confidence — a training verdict, and a number, both invented out of an
    // athlete nobody had scheduled. Unknown adherence supports NEITHER verdict.
    const compliance = row.compliance_pct;
    const hrvOk = row.hrv_delta_ms == null || row.hrv_delta_ms >= -3;
    // "Fresco enough to progress" is a claim about the ABSENCE of accumulated
    // fatigue, and it is exactly the claim a hole in the window cannot support:
    // a missing recent session makes TSB read fresher than the athlete is. So
    // freshness has to be POSITIVELY known — no `?? 0` standing in for a TSB
    // nobody computed, and no verdict on a partial reading.
    const freshEnough =
      row.tsb != null && row.tsb >= -5 && row.load_coverage.allows_verdict;

    let recommendation: 'advance' | 'hold' | 'regress' = 'hold';
    let confidence: 'high' | 'medium' | 'low' = 'low';

    if (compliance != null && compliance >= 90 && freshEnough && hrvOk) {
      recommendation = 'advance';
      confidence = compliance >= 95 ? 'high' : 'medium';
    } else if (
      (compliance != null && compliance < 70) ||
      (row.hrv_delta_ms != null && row.hrv_delta_ms <= -10)
    ) {
      recommendation = 'regress';
      confidence = 'medium';
    }

    const signals: string[] = [];
    // The gap is stated, not filled: "Compliance 0%" is a reading, and there
    // isn't one to report.
    signals.push(
      compliance != null ? `Compliance ${compliance}%` : 'Adherencia sin datos todavía',
    );
    if (row.hrv_delta_ms != null) {
      signals.push(`HRV ${row.hrv_delta_ms >= 0 ? '+' : ''}${row.hrv_delta_ms.toFixed(0)} ms`);
    }
    if (row.tsb != null) signals.push(`TSB ${row.tsb >= 0 ? '+' : ''}${row.tsb.toFixed(0)}`);
    if (row.load_coverage.state === 'partial' && row.load_coverage.badge_es) {
      signals.push(`Carga ${row.load_coverage.badge_es}`);
    }

    out.push({
      athlete_id: row.athlete_id,
      full_name: row.full_name,
      current_block: row.block_type,
      current_week: row.block_week,
      // Agnostic model: no fixed "next phase" — the coach's next microciclo is
      // an authoring decision, not derivable from the current one.
      next_block: null,
      signals,
      recommendation,
      confidence,
    });
  }

  // Surface advance recommendations first (high confidence first), then holds.
  out.sort((a, b) => {
    const aRank = transitionRank(a);
    const bRank = transitionRank(b);
    return aRank - bRank;
  });
  return out;
}

export function computeMassAdjustments(cohort: CohortRow[]): MassAdjustmentOpportunity[] {
  const opportunities: MassAdjustmentOpportunity[] = [];

  // Pattern 1: fresh group early in their microciclo (w2-3) → load increase.
  //
  // This one PUTS MORE LOAD on several athletes at once, so it is the strictest
  // gate in the file. An athlete only qualifies if his freshness is actually
  // known: a TSB computed over a holed window reads fresher than he is when the
  // missing sessions are recent, and `?? 0` used to let an athlete with NO tsb
  // at all fall through as if he had one. Both are now excluded — a mass "+5 %"
  // is the last place a plausible default belongs.
  const transFresh = cohort.filter(
    (r) =>
      r.block_week != null && r.block_week >= 2 && r.block_week <= 3 &&
      (r.compliance_pct ?? 0) >= 90 &&
      r.tsb != null && r.tsb >= 5 &&
      r.load_coverage.allows_verdict,
  );
  if (transFresh.length >= MASS_ADJUSTMENT_MIN_AFFECTED) {
    opportunities.push({
      id: 'mass-load-increase',
      kind: 'load_increase',
      affected_count: transFresh.length,
      affected_athlete_ids: transFresh.map((r) => r.athlete_id),
      rationale: `${transFresh.length} atletas en w2-3 del microciclo con compliance ≥90% y TSB ≥+5`,
      suggestion: 'Aumentar carga +5% próxima semana',
      cta_label: `aplicar +5% load · ${transFresh.length} atletas`,
    });
  }

  // Pattern 2: Z3 drift across cohort → refactor to Z2
  if (cohort.length >= 5) {
    const polar = aggregatePolarization(cohort);
    if (polar && polar.mid - TARGET_POLARIZATION.mid >= POLARIZATION_DRIFT_THRESHOLD) {
      const driftAthletes = cohort.filter((r) => r.compliance_pct != null);
      opportunities.push({
        id: 'mass-z3-to-z2',
        kind: 'z3_to_z2_refactor',
        affected_count: driftAthletes.length,
        affected_athlete_ids: driftAthletes.map((r) => r.athlete_id),
        rationale: `Polarización atletas ${polar.low}/${polar.mid}/${polar.high} — deriva Z3 +${polar.mid - TARGET_POLARIZATION.mid}%`,
        suggestion: 'Refactorizar runs Z3 a Z2 en próximo microciclo',
        cta_label: `aplicar refactor · ${driftAthletes.length} atletas`,
      });
    }
  }

  // Pattern 3: Cohort-wide overreaching → recovery microcycle. Not gated on
  // coverage, unlike Pattern 1: this one REMOVES load, and the work we could not
  // price only pushes the athlete further into the state it is detecting.
  const overreached = cohort.filter((r) => r.tsb != null && r.tsb < -20);
  if (overreached.length >= MASS_ADJUSTMENT_MIN_AFFECTED) {
    opportunities.push({
      id: 'mass-recovery-microcycle',
      kind: 'recovery_microcycle',
      affected_count: overreached.length,
      affected_athlete_ids: overreached.map((r) => r.athlete_id),
      rationale: `${overreached.length} atletas con TSB <-20 (sobreesfuerzo)`,
      suggestion: 'Programar microciclo de recuperación próxima semana',
      cta_label: `aplicar recovery · ${overreached.length} atletas`,
    });
  }

  return opportunities;
}

export function computePlan(now: Date): CohortPlanWeek[] {
  const weekStart = isoWeekStart(now);
  const week2Start = isoDateAddDays(weekStart, 7);
  return [
    buildPlanWeek(weekStart, now),
    buildPlanWeek(week2Start, now),
  ];
}

// =============================================================================
// DB plumbing
// =============================================================================

interface DbRow {
  id: string;
  coach_id: string;
  iso_week_start: string;
  status: string;
  snapshot_json: unknown;
  decisions_json: unknown;
  notes_json: unknown;
  plan_edits_json: unknown;
  duration_ms: number | null;
  opened_at: Date;
  approved_at: Date | null;
  deferred_until: string | null;
}

interface HistoryRow {
  id: string;
  iso_week_start: string;
  status: string;
  approved_at: Date | null;
  duration_ms: number | null;
  decisions_count: number;
  notes_count: number;
  active_athlete_count: number;
  compliance_pct: number | null;
}

async function loadDraft(
  client: Sql,
  coach_id: bigint | number,
  iso_week_start: string,
): Promise<CoachWeeklyReview | null> {
  const rows = await client<DbRow[]>`
    select
      id::text                              as id,
      coach_id::text                        as coach_id,
      to_char(iso_week_start, 'YYYY-MM-DD') as iso_week_start,
      status::text                          as status,
      snapshot_json,
      decisions_json,
      notes_json,
      plan_edits_json,
      duration_ms,
      opened_at,
      approved_at,
      to_char(deferred_until, 'YYYY-MM-DD') as deferred_until
    from coach_weekly_reviews
    where coach_id = ${coach_id as number}
      and iso_week_start = ${iso_week_start}::date
      and status = 'draft'
    limit 1
  `;
  return rows[0] ? rowToReview(rows[0]) : null;
}

function rowToReview(row: DbRow): CoachWeeklyReview {
  const snapshot = weeklyReviewSnapshotSchema.parse(coerceJson(row.snapshot_json));
  const decisions = z.array(weeklyReviewDecisionSchema).parse(coerceJson(row.decisions_json ?? []));
  const notes = z.array(weeklyReviewNoteSchema).parse(coerceJson(row.notes_json ?? []));
  const planEdits = z.array(weeklyReviewPlanEditSchema).parse(coerceJson(row.plan_edits_json ?? []));
  return {
    id: row.id,
    coach_id: BigInt(row.coach_id),
    iso_week_start: row.iso_week_start,
    status: row.status as CoachWeeklyReview['status'],
    snapshot,
    decisions,
    notes,
    plan_edits: planEdits,
    duration_ms: row.duration_ms,
    opened_at: row.opened_at.toISOString(),
    approved_at: row.approved_at?.toISOString() ?? null,
    deferred_until: row.deferred_until,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function isoWeekStart(d: Date): string {
  // Monday-based week, UTC.
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  if (day !== 1) utc.setUTCDate(utc.getUTCDate() - (day - 1));
  return utc.toISOString().slice(0, 10);
}

function isoWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604_800_000);
}

function isoDateAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function recommendationFor(row: CohortRow, severity: 'critical' | 'warning'): string {
  if (severity === 'critical') {
    if (row.tsb != null && row.tsb < -25) return 'Microciclo de recuperación + revisar sleep';
    if (row.hrv_delta_ms != null && row.hrv_delta_ms <= -10) return 'Deload 1 microciclo · revisar sleep';
    return 'Pausa estructurada · evaluar 1:1';
  }
  if (row.compliance_pct != null && row.compliance_pct < 75) return 'Mensaje 1:1 + revisar plan';
  // Nothing urgent, but part of his load is invisible: the useful thing to do is
  // close the gap, not "monitorizar" a curve with holes in it for another week.
  if (!row.load_coverage.allows_verdict && row.load_coverage.action_es) {
    return row.load_coverage.action_es;
  }
  return 'Monitorizar próximos 7d';
}

function transitionRank(t: WeeklyTransitionItem): number {
  // advance/high → 0, advance/medium → 1, hold → 2, regress → 3
  if (t.recommendation === 'advance') return t.confidence === 'high' ? 0 : 1;
  if (t.recommendation === 'hold') return 2;
  return 3;
}

const WEEKDAY_LABELS_ES = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
const TEMPLATE_ROTATION: Array<{ am: string | null; pm: string | null; highlights: string | null }> = [
  { am: 'Strength', pm: 'Z2 long', highlights: null },
  { am: 'Threshold', pm: 'Skill', highlights: null },
  { am: 'HYROX-sim', pm: 'Recovery', highlights: null },
  { am: 'Strength', pm: 'Mobility', highlights: null },
  { am: 'VO2max', pm: 'Strength', highlights: null },
  { am: 'Long-run', pm: 'Optional', highlights: null },
  { am: 'Rest', pm: null, highlights: null },
];

function buildPlanWeek(weekStartIso: string, now: Date): CohortPlanWeek {
  const days: CohortPlanDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const iso = isoDateAddDays(weekStartIso, i);
    const tpl = TEMPLATE_ROTATION[i];
    days.push({
      iso_date: iso,
      weekday_label: WEEKDAY_LABELS_ES[i],
      am_focus: tpl.am,
      pm_focus: tpl.pm,
      highlights: tpl.highlights,
      is_today: iso === now.toISOString().slice(0, 10),
    });
  }
  const baseWeekNumber = isoWeekNumber(parseIso(weekStartIso));
  return {
    iso_week_start: weekStartIso,
    week_label: `Sem ${baseWeekNumber}`,
    days,
  };
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  return new Date(Date.UTC(y, m - 1, d));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
