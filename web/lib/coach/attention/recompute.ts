// Recompute layer — turns the live cohort state into persisted attention items.
//
// Three entry points (SPEC §8):
//   - rollupAthleteFacts: one SignalFacts per athlete of a coach. Coach-level
//     loaders run ONCE (indexed into Maps); biometrics/microciclo/billing come
//     from ONE batched CTE; plan facts, readiness history, due-only sessions and
//     awaiting-reply threads from one batched query each. Only the
//     progress-readiness service (info-tier «Listo para progresar») still runs
//     per athlete (acceptable in the 300s cron budget) inside a try/catch so one
//     bad athlete never aborts the rollup.
//   - recomputeCoach: the SWEEP — evaluate every athlete, upsert firing signals,
//     auto-clear the rest, per-athlete transaction + try/catch.
//   - recomputeAthlete: single-athlete event-driven recompute (best-effort; never
//     throws into the caller's mutation).

import 'server-only';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { captureRouteError } from '@/lib/observability/capture';
import { resolveEffectiveThresholds } from '@/lib/coach/signal-thresholds';
import { evaluateAll } from '@/lib/coach/attention/evaluators';
import { communicationClaims } from './communication-claims';
import { invalidateAttention } from './invalidate';
import { assessAthleteProgressReadiness } from '@fahybrid/shared/domain/coach/progress-readiness';
import { loadPlanFacts, type AthletePlanFacts } from '@/lib/dashboard/athletes/plan-facts';
import { listPendingIntake } from '@/lib/coach/intake';
import { listPendingWeekAdjustments } from '@/lib/dashboard/coach/week-adjustments';
import { listPendingMonthlyBlocksForCoach } from '@/lib/dashboard/coach/monthly-block-proposal';
import { loadAwaitingReply, type AwaitingReply } from './awaiting-reply';
import { loadReadinessHistory, type ReadinessHistory } from './readiness-history';
import { latestReading } from './readiness-baseline';
import {
  computeAdherence,
  loadAdherenceSessionsBatch,
  type AdherenceSessionsBatch,
} from '@fahybrid/shared/domain/coach/adherence';
import { BOX_TIMEZONE, zonedDayString } from '@fahybrid/shared/domain/dates';
import { daysFromNowToIso, type SignalFacts } from '@fahybrid/shared/domain/coach/signals';
import { benchmarkLabel } from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { strengthLiftLabel } from '@fahybrid/shared/domain/strength';
import { loadBatch, type BatchRow } from './recompute-batch';
import { clearUnevaluated, persistAthlete } from './persist';

/** Human label for a recorded test's benchmark (strength labels live with the
 *  lift catalog — single source per concept). */
function testLabel(slug: string | null, unit: string | null): string | null {
  if (!slug) return null;
  return unit === 'kg' ? strengthLiftLabel(slug) : benchmarkLabel(slug);
}

/** Window of the due-only «sesiones perdidas» signal. */
const MISSED_WINDOW_DAYS = 7;

interface CoachLevelMaps {
  intake: Map<
    string,
    { hours_since_onboarded: number; a_event_name: string | null; a_event_iso: string | null }
  >;
  weekAdj: Map<string, { proposal_id: string; summary: string | null }>;
  monthly: Map<string, { proposal_id: string; month_name: string | null }>;
  awaiting: Map<string, AwaitingReply>;
  plan: Map<string, AthletePlanFacts>;
  readiness: Map<string, ReadinessHistory>;
  sessions: AdherenceSessionsBatch;
}

// ── Public: rollupAthleteFacts ────────────────────────────────────────────────

export async function rollupAthleteFacts(params: {
  coach_id: bigint | number;
  now: Date;
  client?: Sql;
  /** Optional single-athlete scope (event-driven recompute). */
  athlete_id?: bigint | number;
}): Promise<SignalFacts[]> {
  const client = params.client ?? defaultSql;
  const { now } = params;

  const batch = await loadBatch(client, params.coach_id, now, params.athlete_id ?? null);
  const maps = await loadCoachLevelMaps(
    client,
    params.coach_id,
    batch.map((r) => r.athlete_id),
    now,
  );

  const facts: SignalFacts[] = [];
  for (const row of batch) {
    try {
      facts.push(await assembleFacts(row, maps, String(params.coach_id), client, now));
    } catch (err) {
      captureRouteError(err, {
        route: 'lib/coach/attention/recompute.rollupAthleteFacts',
        meta: { athlete_id: row.athlete_id },
      });
      // Skip the bad athlete; the sweep continues.
    }
  }
  return facts;
}

// ── Per-athlete assembly (shared by rollup + single-athlete path) ─────────────

async function assembleFacts(
  row: BatchRow,
  maps: CoachLevelMaps,
  coach_id: string,
  client: Sql,
  now: Date,
): Promise<SignalFacts> {
  const athleteIdNum = Number(row.athlete_id);

  const progress = await assessAthleteProgressReadiness({
    athlete_id: athleteIdNum,
    on_date: now,
    client,
  });
  const plan = maps.plan.get(row.athlete_id) ?? null;
  const readiness = maps.readiness.get(row.athlete_id) ?? null;
  const timezone = readiness?.timezone ?? BOX_TIMEZONE;
  const today_iso =
    readiness?.today ?? maps.sessions.as_of.get(row.athlete_id) ?? zonedDayString(now, timezone);
  const missed = computeAdherence(
    maps.sessions.sessions.get(row.athlete_id) ?? [],
    maps.sessions.as_of.get(row.athlete_id) ?? today_iso,
    MISSED_WINDOW_DAYS,
  );
  const awaiting = maps.awaiting.get(row.athlete_id) ?? null;
  const rpeDays = row.rpe_days ?? [];
  const rpeValues = row.rpe_values ?? [];

  const hrv_delta_ms =
    row.hrv_recent != null && row.hrv_baseline != null
      ? round1(row.hrv_recent - row.hrv_baseline)
      : null;

  const sync_minutes_ago =
    row.last_sync_at == null
      ? null
      : Math.floor((now.getTime() - row.last_sync_at.getTime()) / 60_000);

  const days_to_a_event = row.a_event_iso ? daysFromNowToIso(row.a_event_iso, now) : null;

  const intake = maps.intake.get(row.athlete_id) ?? null;
  const weekAdj = maps.weekAdj.get(row.athlete_id) ?? null;
  const monthly = maps.monthly.get(row.athlete_id) ?? null;
  const unread_message_age_min =
    awaiting?.since != null ? Math.floor((now.getTime() - awaiting.since.getTime()) / 60_000) : null;
  const programming = plan?.programming ?? null;

  return {
    athlete_id: row.athlete_id,
    coach_id,
    full_name: row.full_name,

    hrv_delta_ms,
    hrv_baseline_days: row.hrv_baseline_days,
    sync_minutes_ago,
    missed_sessions_7d: missed.missed,
    due_sessions_7d: missed.due,
    last_missed_on: missed.last_missed_on,
    sessions_7d_rpe: rpeDays.map((on, i) => ({ on, rpe: rpeValues[i] ?? null })),
    last_checkin_at: row.last_checkin_at,
    checkins_prior_14d: row.checkins_prior_14d,
    unread_message_age_min,
    awaiting_reply_count: awaiting?.count ?? 0,
    awaiting_reply_last_at: awaiting?.last_at ?? null,
    readiness_score: readiness ? (latestReading(readiness.series)?.score ?? null) : null,
    readiness_series: readiness?.series ?? [],
    today_iso,
    timezone,

    discomfort_area: row.latest_pain_area,
    discomfort_at: row.latest_pain_at,
    discomfort_note: row.latest_pain_note,

    programming_status: programming?.status ?? 'ok',
    programming_label: programming?.label ?? null,
    programming_detail: programming?.detail ?? null,
    current_microcycle_end_iso: row.current_microcycle_end_iso,
    next_program_start_iso: plan?.next_program_start ?? null,
    last_program_end_iso: plan?.last_program_end ?? null,
    current_block_type: row.current_microciclo_name,
    transition_recommendation: mapTransition(progress?.recommendation ?? null),
    transition_detail: progress?.reasons.length ? progress.reasons.join(' · ') : null,
    days_to_a_event,
    a_event_name: row.a_event_name,

    intake_pending_hours: intake?.hours_since_onboarded ?? null,
    intake_a_event_name: intake?.a_event_name ?? null,
    intake_a_event_days:
      intake?.a_event_iso != null ? daysFromNowToIso(intake.a_event_iso, now) : null,
    week_adjustment_proposal_id: weekAdj?.proposal_id ?? null,
    week_adjustment_summary: weekAdj?.summary ?? null,
    monthly_block_proposal_id: monthly?.proposal_id ?? null,
    monthly_block_month_name: monthly?.month_name ?? null,

    billing_risk: deriveBillingRisk(row),
    billing_days_to_period_end:
      deriveBillingRisk(row) === 'renewal_soon' ? row.billing_days_to_period_end : null,
    billing_period_end_iso: deriveBillingRisk(row) === 'renewal_soon' ? row.billing_period_end_iso : null,

    latest_test_at: row.latest_test_at,
    latest_test_label: testLabel(row.latest_test_slug, row.latest_test_unit),
    latest_test_is_pr: row.latest_test_is_pr ?? false,
    days_since_last_test: row.days_since_last_test,
    latest_race_completed_at: row.latest_race_completed_at,
    latest_race_name: row.latest_race_name,
    latest_race_id: row.latest_race_id,

    latest_libre_at: row.latest_libre_at,
    latest_libre_title: row.latest_libre_title,
    latest_libre_detail: row.latest_libre_title
      ? `${row.latest_libre_title} · no prescrito · suma al plan`
      : null,

    // Revisiones 1:1 (#21). days_since = desde la última 1:1 o, si nunca hubo, desde el
    // alta del atleta (así una cadencia recién puesta no vence al instante).
    review_cadence: row.review_cadence as SignalFacts['review_cadence'],
    days_since_last_1on1: Math.floor(
      (now.getTime() - (row.last_1on1_at ?? row.athlete_since).getTime()) / 86_400_000,
    ),
    has_upcoming_review: row.has_upcoming_review,

    ...communicationClaims(row, now),
  };
}

/**
 * The progress-readiness engine only emits 'advance' | 'hold' | 'regress'. The
 * facts contract allows 'advance' | 'hold' | 'extend' | null. We pass 'advance'/'hold'
 * through (the evaluator only acts on 'advance') and map 'regress' → 'hold' since
 * the attention engine treats both non-advance verdicts as "do not surface".
 */
function mapTransition(
  rec: 'advance' | 'hold' | 'regress' | null,
): SignalFacts['transition_recommendation'] {
  if (rec === 'advance') return 'advance';
  if (rec === 'hold' || rec === 'regress') return 'hold';
  return null;
}

function deriveBillingRisk(row: BatchRow): SignalFacts['billing_risk'] {
  if (row.billing_status === 'past_due') return 'past_due';
  if (
    row.billing_status === 'active' &&
    row.billing_cancel_at_period_end === true &&
    row.billing_days_to_period_end != null &&
    row.billing_days_to_period_end >= 0
  ) {
    // Cuántos días antes pasa a Hoy lo decide el evaluador con el umbral del
    // coach (`renewal_alert_days`, mig 0244); aquí solo el hecho.
    return 'renewal_soon';
  }
  return null;
}

// ── Coach-level loaders → Maps (run once per coach) ──────────────────────────

async function loadCoachLevelMaps(
  client: Sql,
  coach_id: bigint | number,
  athlete_ids: string[],
  now: Date,
): Promise<CoachLevelMaps> {
  const scope = athlete_ids.length > 0 ? athlete_ids : ['0'];
  const [intakeRows, weekAdjRows, monthlyRows, awaiting, planRows, readiness, sessions] =
    await Promise.all([
      listPendingIntake({ coach_id, client }).catch((err) => {
        captureRouteError(err, { route: 'recompute.listPendingIntake' });
        return [];
      }),
      listPendingWeekAdjustments({ coach_id, client }).catch((err) => {
        captureRouteError(err, { route: 'recompute.listPendingWeekAdjustments' });
        return [];
      }),
      listPendingMonthlyBlocksForCoach({ coach_id, client }).catch((err) => {
        captureRouteError(err, { route: 'recompute.listPendingMonthlyBlocks' });
        return [];
      }),
      loadAwaitingReply({ coach_id, athlete_ids: scope, client }),
      loadPlanFacts({ coach_id, athlete_ids: scope, now, client }),
      loadReadinessHistory({ coach_id, athlete_ids: scope, now, client }),
      loadAdherenceSessionsBatch({
        client,
        athlete_ids: scope,
        window_days: MISSED_WINDOW_DAYS,
        now,
      }),
    ]);

  const intake: CoachLevelMaps['intake'] = new Map();
  for (const r of intakeRows) {
    intake.set(r.athlete_id, {
      hours_since_onboarded: r.hours_since_onboarded,
      a_event_name: r.a_event_name,
      a_event_iso: r.a_event_iso,
    });
  }

  // Newest week-adjustment proposal per athlete (loader returns newest-first by
  // week_start; first seen per athlete wins).
  const weekAdj: CoachLevelMaps['weekAdj'] = new Map();
  for (const r of weekAdjRows) {
    if (weekAdj.has(r.athlete_id)) continue;
    weekAdj.set(r.athlete_id, {
      proposal_id: r.id,
      summary: r.coach_summary ?? r.proposal.rationale ?? null,
    });
  }

  const monthly: CoachLevelMaps['monthly'] = new Map();
  for (const r of monthlyRows) {
    if (monthly.has(r.athlete_id)) continue;
    monthly.set(r.athlete_id, { proposal_id: r.id, month_name: r.month_name ?? null });
  }

  const plan: CoachLevelMaps['plan'] = new Map(planRows.map((p) => [p.athlete_id, p]));

  return { intake, weekAdj, monthly, awaiting, plan, readiness, sessions };
}

// ── Public: recomputeCoach (the sweep) ────────────────────────────────────────

export async function recomputeCoach(params: {
  coach_id: bigint | number;
  now?: Date;
  client?: Sql;
}): Promise<{ evaluated: number; fired: number; cleared: number }> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();

  // Los umbrales VIGENTES de este coach: los del sistema con su fila encima. Se
  // resuelven UNA vez por barrido — son método suyo, no una constante nuestra.
  const [facts, thresholds] = await Promise.all([
    rollupAthleteFacts({ coach_id: params.coach_id, now, client }),
    resolveEffectiveThresholds(params.coach_id, client),
  ]);

  let fired = 0;
  let cleared = 0;
  // Items of athletes the sweep no longer evaluates (paused, baja, moved to
  // another coach) would otherwise stay in the queue forever: the per-athlete
  // auto-clear below only touches the athletes it evaluated.
  cleared += await clearUnevaluated(client, params.coach_id);
  for (const f of facts) {
    try {
      const results = evaluateAll(f, thresholds, now);
      const removed = await persistAthlete(client, params.coach_id, f.athlete_id, results, now);
      fired += results.length;
      cleared += removed;
    } catch (err) {
      captureRouteError(err, {
        route: 'lib/coach/attention/recompute.recomputeCoach',
        meta: { athlete_id: f.athlete_id },
      });
    }
  }

  invalidateAttention(params.coach_id);
  return { evaluated: facts.length, fired, cleared };
}

// ── Public: recomputeAthlete (event-driven, best-effort) ──────────────────────

export async function recomputeAthlete(params: {
  athlete_id: bigint | number;
  now?: Date;
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();

  try {
    const coachRows = await client<Array<{ coach_id: string | null }>>`
      select coach_id::text as coach_id from athletes where id = ${Number(params.athlete_id)}
    `;
    const coachIdStr = coachRows[0]?.coach_id;
    if (!coachIdStr) return; // unassigned athlete — nothing to surface to a coach
    const coach_id = Number(coachIdStr);

    const [facts, thresholds] = await Promise.all([
      rollupAthleteFacts({ coach_id, now, client, athlete_id: params.athlete_id }),
      resolveEffectiveThresholds(coach_id, client),
    ]);

    for (const f of facts) {
      try {
        const results = evaluateAll(f, thresholds, now);
        await persistAthlete(client, coach_id, f.athlete_id, results, now);
      } catch (err) {
        captureRouteError(err, {
          route: 'lib/coach/attention/recompute.recomputeAthlete',
          meta: { athlete_id: f.athlete_id },
        });
      }
    }

    invalidateAttention(coach_id);
  } catch (err) {
    // Best-effort: never throw into the caller's mutation.
    captureRouteError(err, {
      route: 'lib/coach/attention/recompute.recomputeAthlete',
      meta: { athlete_id: String(params.athlete_id) },
    });
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
