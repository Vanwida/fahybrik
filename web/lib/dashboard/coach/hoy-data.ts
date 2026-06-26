import 'server-only';

// hoy-data — the server-side assembler for the /hoy triage screen (SPEC §4).
// It loads the F1 backbone (loadAttentionQueue) + the legacy decision inbox
// (loadCoachInbox) + the chat threads + the team pulse, and adapts them into the
// single TriageData the client orchestrator renders. Each loader is wrapped so
// ONE failure degrades its section (the page renders an ErrorState) instead of
// 500-ing.
//
// DE-DUPE: the attention store ALSO emits intake/week_adjustment/monthly_block
// as signal kinds, but those decisions render from the inbox path (richer
// payload + the existing approve endpoints); and it emits message_unanswered,
// but a waiting message renders as a first-class MESSAGE line (inline reply via
// the ThreadDrawer). We therefore DROP those four signal kinds from the
// attention queue here so each decision/message shows exactly once.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { loadAttentionQueue, type AttentionCard } from '@/lib/coach/attention/queue';
import {
  loadCoachInbox,
  type InboxItem,
  type InboxIntakeItem,
  type InboxWeekAdjustmentItem,
} from '@/lib/dashboard/coach/inbox';
import { presentSignal, tierForSignalSeverity } from '@/lib/dashboard/coach/triage-presentation';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';
import { formatRelative } from '@/lib/dashboard/relative-time';
import type { CoachThreadSummary } from '@/lib/dashboard/chat/service';
import type {
  TriageItem,
  TriageSignalItem,
  TriageDecisionItem,
  TriageMessageItem,
  TriageData,
} from '@/lib/dashboard/coach/triage-types';
import type { RailSessionSummary, RailUpcomingEvent } from '@/lib/dashboard/coach/hoy-rail-types';

/**
 * Signal kinds owned by another render path — dropped from the attention queue
 * so a decision/message shows exactly once. Intake/week/month are owned by the
 * inbox path; `message_unanswered` is owned by the MESSAGE lines (each waiting
 * thread becomes one TriageMessageItem with inline reply, see adaptMessage), so
 * it must NOT also render as a signal card.
 */
const INBOX_OWNED_SIGNAL_KINDS = new Set([
  'intake_pending',
  'week_adjustment_pending',
  'monthly_block_pending',
  'message_unanswered',
]);

/** A loader result that never throws to the page (SPEC §4 partial-error). */
export type LoaderResult<T> = { ok: true; data: T } | { ok: false };

async function safe<T>(load: () => Promise<T>): Promise<LoaderResult<T>> {
  try {
    return { ok: true, data: await load() };
  } catch {
    return { ok: false };
  }
}

// ── Adapters: F1 sources → TriageItem ─────────────────────────────────────────

function signalEvidence(card: AttentionCard): string {
  // The store already carries a one-line detail; fall back to the label.
  return card.primary.detail || card.primary.label;
}

function adaptSignal(card: AttentionCard): TriageSignalItem {
  const present = presentSignal(card.primary.signal_kind);
  const tier = card.primary.severity === 'critical' ? 'critico' : 'vigilar';
  return {
    kind: 'signal',
    id: `signal:${card.primary.signal_kind}:${card.athlete_id}`,
    tier,
    athlete_id: card.athlete_id,
    athlete_name: card.athlete_name,
    signal_kind: card.primary.signal_kind,
    reason_tier: tierForSignalSeverity(card.primary.severity),
    reason_label: card.primary.label || present.label,
    reason_icon: present.icon,
    evidence: signalEvidence(card),
    readiness_score: null,
    other_signal_count: card.other_signal_count,
    open_href: present.deepLink(card.athlete_id),
    snoozable: true,
  };
}

function intakeEvidence(p: InboxIntakeItem): string {
  const days = Math.round(p.hours_since_onboarded / 24);
  const base = `Terminó el onboarding hace ${days <= 0 ? `${p.hours_since_onboarded} h` : `${days} ${days === 1 ? 'día' : 'días'}`} y sigue sin plan.`;
  return p.a_event_name && p.a_event_days != null
    ? `${base} ${p.a_event_name} en ${p.a_event_days} días.`
    : base;
}

function weekAdjEvidence(p: InboxWeekAdjustmentItem): string {
  const first = p.diff_rows[0];
  const head = first ? `${first.day_label}: ${first.before} → ${first.after}` : p.summary;
  const extra = p.extra_change_count > 0 ? ` (+${p.extra_change_count} cambios)` : '';
  return `${head}${extra}`;
}

function adaptDecision(item: InboxItem): TriageDecisionItem | null {
  const planReview = `/atletas/${item.athlete_id}/plan?focus=review`;
  // Decisions sort: critical intake → critico; everything else → vigilar.
  if (item.type === 'intake_pending') {
    return {
      kind: 'decision',
      id: item.id,
      tier: item.severity === 'critical' ? 'critico' : 'vigilar',
      athlete_id: item.athlete_id,
      athlete_name: item.athlete_name,
      reason_tier: item.severity === 'critical' ? 'error' : 'warning',
      reason_label: 'Intake pendiente',
      reason_icon: 'assignment_ind',
      evidence: intakeEvidence(item),
      readiness_score: null,
      open_href: `/atletas/${item.athlete_id}/intake`,
      payload: item,
      approve_endpoint: null,
    };
  }
  if (item.type === 'week_adjustment') {
    return {
      kind: 'decision',
      id: item.id,
      tier: 'vigilar',
      athlete_id: item.athlete_id,
      athlete_name: item.athlete_name,
      reason_tier: 'warning',
      reason_label: 'Ajuste semanal',
      reason_icon: 'tune',
      evidence: weekAdjEvidence(item),
      readiness_score: null,
      open_href: planReview,
      payload: item,
      approve_endpoint: `/api/coach/athletes/${item.athlete_id}/week-adjustment/${item.proposal_id}/approve`,
    };
  }
  if (item.type === 'monthly_block') {
    return {
      kind: 'decision',
      id: item.id,
      tier: 'vigilar',
      athlete_id: item.athlete_id,
      athlete_name: item.athlete_name,
      reason_tier: 'warning',
      reason_label: 'Transición de bloque',
      reason_icon: 'calendar_month',
      evidence: item.rationale
        ? `${item.rationale} · Nuevo mes: ${item.month_name}.`
        : `Nuevo mes propuesto: ${item.month_name}.`,
      readiness_score: null,
      open_href: planReview,
      payload: item,
      approve_endpoint: `/api/coach/athletes/${item.athlete_id}/monthly-block/${item.proposal_id}/approve`,
    };
  }
  // Alerts/messages from the inbox are represented by the attention store
  // (billing_at_risk / message_unanswered signals), so they are NOT re-adapted
  // here — avoids double-surfacing.
  return null;
}

// ── Adapter: chat thread → TriageMessageItem ──────────────────────────────────

const MINUTE_MS = 60_000;

/** Minutes elapsed since an ISO timestamp (0 when missing/invalid). */
function minutesSince(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / MINUTE_MS));
}

/** Collapse a multi-line preview to one tidy line for the queue. */
function oneLine(body: string | null): string {
  return (body ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * A thread with unread athlete messages → a MESSAGE line. Tier escalates to
 * crítico once the last message has waited ≥ 2× the message_unanswered threshold
 * (the same threshold the signal engine uses to fire `message_unanswered`), so
 * "answered slowly" reads as vigilar and "ghosted" reads as crítico — one knob,
 * the signal-config single source.
 */
function adaptMessage(thread: CoachThreadSummary): TriageMessageItem | null {
  if (thread.unread_count <= 0) return null;
  const ageMin = minutesSince(thread.last_message_at);
  const criticoCutoffMin = SIGNAL_THRESHOLDS.message_unanswered_hours * 2 * 60;
  const tier: 'critico' | 'vigilar' = ageMin >= criticoCutoffMin ? 'critico' : 'vigilar';
  return {
    kind: 'message',
    id: `message:${thread.thread_id}`,
    tier,
    athlete_id: thread.athlete_id,
    athlete_name: thread.athlete_full_name,
    thread_id: thread.thread_id,
    preview: oneLine(thread.last_message_body),
    unread_count: thread.unread_count,
    age_label: thread.last_message_at ? formatRelative(thread.last_message_at) : '',
    age_minutes: ageMin,
    // Crítico messages chip in error red, the rest in info blue — same icon as
    // the dropped message_unanswered signal (forum) so the visual reads "chat".
    reason_tier: tier === 'critico' ? 'error' : 'info',
    reason_label: 'Mensaje',
    reason_icon: 'forum',
    readiness_score: null,
    open_href: `/atletas/${thread.athlete_id}`,
  };
}

// ── Rail data (sessions today + upcoming A-events) ────────────────────────────

async function loadRailSessions(params: {
  coach_id: number | bigint;
  client: Sql;
}): Promise<RailSessionSummary> {
  const todayIso = isoDateString(startOfDayInBox(new Date()));
  const rows = await params.client<Array<{ athlete_id: string; n: number }>>`
    select w.athlete_id::text as athlete_id, count(*)::int as n
    from workout_assignments w
    join athletes a on a.id = w.athlete_id
    where a.coach_id = ${params.coach_id as number}
      and w.scheduled_for = ${todayIso}::date
      and w.status <> 'cancelled'
    group by w.athlete_id
  `;
  return {
    total: rows.length,
    twice_count: rows.filter((r) => r.n >= 2).length,
  };
}

async function loadRailUpcoming(params: {
  coach_id: number | bigint;
  client: Sql;
}): Promise<RailUpcomingEvent[]> {
  const todayIso = isoDateString(startOfDayInBox(new Date()));
  const rows = await params.client<
    Array<{
      athlete_id: string;
      athlete_name: string;
      event_name: string;
      days_until: number;
      cohort_count: number;
    }>
  >`
    with target_races as (
      select
        r.athlete_id,
        a.full_name as athlete_name,
        r.name as event_name,
        (r.race_date - ${todayIso}::date)::int as days_until,
        r.race_date
      from races r
      join athletes a on a.id = r.athlete_id
      where a.coach_id = ${params.coach_id as number}
        and r.priority = 'target'
        and r.race_date >= ${todayIso}::date
        and r.status in ('planned', 'registered')
    )
    select
      tr.athlete_id::text as athlete_id,
      tr.athlete_name,
      tr.event_name,
      tr.days_until,
      count(*) over (partition by tr.event_name, tr.race_date)::int as cohort_count
    from target_races tr
    order by tr.days_until asc, tr.athlete_name asc
    limit 6
  `;
  // De-dupe by event so a shared race shows once (cohort_count carries the size).
  const seen = new Set<string>();
  const out: RailUpcomingEvent[] = [];
  for (const r of rows) {
    const key = `${r.event_name}|${r.days_until}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      athlete_id: r.athlete_id,
      athlete_name: r.athlete_name,
      event_name: r.event_name,
      days_until: r.days_until,
      cohort_count: r.cohort_count,
    });
  }
  return out;
}

// ── Public assemblers (each independently safe) ───────────────────────────────

export async function loadTriageData(params: {
  coach_id: number | bigint;
  /** Pre-loaded chat threads (the page loads them in its own safe loader). */
  threads?: CoachThreadSummary[];
  client?: Sql;
}): Promise<LoaderResult<TriageData>> {
  const client = params.client ?? defaultSql;
  return safe(async () => {
    const [queue, inbox] = await Promise.all([
      loadAttentionQueue({ coach_id: params.coach_id as number, client }),
      loadCoachInbox({ coach_id: params.coach_id, client }),
    ]);

    const signalCards = [...queue.critico, ...queue.vigilar].filter(
      (c) => !INBOX_OWNED_SIGNAL_KINDS.has(c.primary.signal_kind),
    );
    const signals: TriageItem[] = signalCards.map(adaptSignal);
    const decisions: TriageItem[] = inbox.items
      .map(adaptDecision)
      .filter((i): i is TriageDecisionItem => i != null);
    const messages: TriageItem[] = (params.threads ?? [])
      .map(adaptMessage)
      .filter((i): i is TriageMessageItem => i != null);

    // Combined severity order (NOT "inbox first, signals after"): all three
    // sources merge into ONE list per tier. Crítico above Vigilar; within a tier
    // message lines sort by how long they have waited (oldest unanswered first —
    // the coach clears the most ghosted athlete first), then everything
    // interleaves deterministically by athlete name (es) so a week-adjustment
    // (vigilar) always sits below an hrv_crash (crítico) and the tier reads as a
    // single ranked list rather than concatenated blocks.
    const all = [...signals, ...decisions, ...messages];
    const ranked = (a: TriageItem, b: TriageItem) => {
      const aAge = a.kind === 'message' ? a.age_minutes : -1;
      const bAge = b.kind === 'message' ? b.age_minutes : -1;
      if (aAge !== bAge) return bAge - aAge; // oldest message first; non-messages keep name order among themselves
      return a.athlete_name.localeCompare(b.athlete_name, 'es');
    };
    const critico = all.filter((i) => i.tier === 'critico').sort(ranked);
    const vigilar = all.filter((i) => i.tier === 'vigilar').sort(ranked);

    return {
      critico,
      vigilar,
      // "Auto-resuelto hoy" needs the per-day audit table (F7 gap, SPEC §8
      // "auto-resueltos del día — derivable, no registrado"). Until that exists
      // we report 0 rather than fabricate a count from unrelated data; the
      // collapsed drawer simply hides. `overflow` (truncated-by-cap) is a
      // DIFFERENT number and stays separate.
      auto_resolved_count: 0,
      overflow: queue.counts.overflow,
    };
  });
}

export async function loadRailData(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<LoaderResult<{ sessions: RailSessionSummary; upcoming: RailUpcomingEvent[] }>> {
  const client = params.client ?? defaultSql;
  return safe(async () => {
    const [sessions, upcoming] = await Promise.all([
      loadRailSessions({ coach_id: params.coach_id, client }),
      loadRailUpcoming({ coach_id: params.coach_id, client }),
    ]);
    return { sessions, upcoming };
  });
}
