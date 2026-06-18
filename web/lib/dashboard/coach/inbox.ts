import 'server-only';

// HOY — unified coach inbox (UX redesign Phase 1, docs/design/ux-redesign/SPEC.md §1).
// Aggregates the surfaces Pablo had to visit separately into ONE ordered queue:
// pending intakes, weekly-adjustment proposals (the old /review inbox), monthly
// block / ATR-transition proposals, operational alerts (inactivity, billing)
// and unread athlete messages.
//
// This module REUSES the existing per-surface loaders (listPendingIntake,
// listPendingWeekAdjustments, listPendingMonthlyBlocksForCoach,
// listThreadsForCoach) — it never re-implements their queries. Approvals keep
// going through the existing endpoints:
//   POST /api/coach/athletes/[id]/week-adjustment/[proposalId]/approve
//   POST /api/coach/athletes/[id]/monthly-block/[proposalId]/approve

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/atr/dates';
import { listPendingIntake } from '@/lib/coach/intake';
import { listPendingWeekAdjustments } from '@/lib/dashboard/coach/week-adjustments';
import { listPendingMonthlyBlocksForCoach } from '@/lib/dashboard/coach/monthly-block-proposal';
import { listThreadsForCoach } from '@/lib/dashboard/chat/service';
import { DAY_LABELS } from '@/lib/dashboard/constants/calendar';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';

// ── Thresholds (signal-config.ts — single source of truth, spec §10) ─────────
/** Intake older than this many hours escalates to the Crítico group. */
const INTAKE_CRITICAL_HOURS = SIGNAL_THRESHOLDS.intake_critical_hours;
/** Days without completed session NOR check-in before the inactivity alert fires. */
const INACTIVITY_ALERT_DAYS = SIGNAL_THRESHOLDS.inactivity_alert_days;
/** Subscription ends (cancel_at_period_end) within this many days → renewal alert. */
const RENEWAL_ALERT_DAYS = SIGNAL_THRESHOLDS.renewal_alert_days;
/** Max diff rows surfaced inline on a week-adjustment card. */
const MAX_DIFF_ROWS = SIGNAL_THRESHOLDS.max_diff_rows;

// ── Types (snake_case — API contract) ───────────────────────────────────────

export type InboxSeverity = 'critical' | 'decision' | 'alert' | 'message';

export interface InboxItemBase {
  /** Stable unique id within the queue, e.g. "week_adjustment:42". */
  id: string;
  severity: InboxSeverity;
  athlete_id: string;
  athlete_name: string;
}

export interface InboxIntakeItem extends InboxItemBase {
  type: 'intake_pending';
  hours_since_onboarded: number;
  a_event_name: string | null;
  a_event_days: number | null;
}

export interface InboxDiffRow {
  day_label: string;
  before: string;
  after: string;
}

export interface InboxWeekAdjustmentItem extends InboxItemBase {
  type: 'week_adjustment';
  proposal_id: string;
  week_start: string;
  title: string;
  summary: string;
  diff_rows: InboxDiffRow[];
  extra_change_count: number;
}

export interface InboxMonthlyBlockItem extends InboxItemBase {
  type: 'monthly_block';
  proposal_id: string;
  month_name: string;
  proposed_start_date: string;
  rationale: string | null;
}

export interface InboxInactivityAlertItem extends InboxItemBase {
  type: 'alert_inactivity';
  days_inactive: number;
  last_session_label: string | null;
  race_name: string | null;
  race_days: number | null;
}

export interface InboxPaymentAlertItem extends InboxItemBase {
  type: 'alert_payment_failed';
}

export interface InboxRenewalAlertItem extends InboxItemBase {
  type: 'alert_renewal';
  days_to_period_end: number;
}

export interface InboxMessageItem extends InboxItemBase {
  type: 'message';
  thread_id: string;
  preview: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export type InboxItem =
  | InboxIntakeItem
  | InboxWeekAdjustmentItem
  | InboxMonthlyBlockItem
  | InboxInactivityAlertItem
  | InboxPaymentAlertItem
  | InboxRenewalAlertItem
  | InboxMessageItem;

export interface CoachInbox {
  generated_at: string;
  counts: {
    total: number;
    critical: number;
    decisions: number;
    alerts: number;
    messages: number;
  };
  items: InboxItem[];
}

// ── Week-adjustment presentation (moved verbatim from the old ReviewInbox) ──

const RECOMMENDATION_TITLE: Record<string, string> = {
  soften: 'Ajuste de volumen',
  swap: 'Cambio de sesión',
  rest_day: 'Día de descanso',
  keep: 'Validación semanal',
};

function dayLabelFor(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0 = Sunday
  return DAY_LABELS[(dow + 6) % 7] ?? isoDate;
}

// ── Loader ───────────────────────────────────────────────────────────────────

export async function loadCoachInbox(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<CoachInbox> {
  const client = params.client ?? defaultSql;

  const [intakes, adjustments, monthlyBlocks, alerts, threads] = await Promise.all([
    listPendingIntake({ coach_id: params.coach_id, client }),
    listPendingWeekAdjustments({ coach_id: params.coach_id, client }),
    listPendingMonthlyBlocksForCoachSafe({ coach_id: params.coach_id, client }),
    listInboxAlerts({ coach_id: params.coach_id, client }),
    listThreadsForCoach({ coach_id: params.coach_id, client }),
  ]);

  // Resolve template names for the diff mini-tables in one query.
  const templateIds = new Set<string>();
  for (const adj of adjustments) {
    for (const c of adj.proposal.slot_changes) {
      if (c.from_template_id != null) templateIds.add(String(c.from_template_id));
      if (c.to_template_id != null) templateIds.add(String(c.to_template_id));
    }
  }
  const templateNames = await loadTemplateNames({ ids: [...templateIds], client });

  const todayIso = isoDateString(startOfDayInBox(new Date()));

  const intakeItems: InboxIntakeItem[] = intakes.map((a) => ({
    id: `intake_pending:${a.athlete_id}`,
    type: 'intake_pending',
    severity: a.hours_since_onboarded >= INTAKE_CRITICAL_HOURS ? 'critical' : 'decision',
    athlete_id: a.athlete_id,
    athlete_name: a.full_name,
    hours_since_onboarded: a.hours_since_onboarded,
    a_event_name: a.a_event_name,
    a_event_days: a.a_event_iso ? daysBetweenIso(todayIso, a.a_event_iso) : null,
  }));

  const adjustmentItems: InboxWeekAdjustmentItem[] = adjustments.map((p) => {
    const changes = p.proposal.slot_changes;
    const diff_rows: InboxDiffRow[] = changes.slice(0, MAX_DIFF_ROWS).map((c) => ({
      day_label: dayLabelFor(c.date),
      before:
        c.from_template_id != null
          ? (templateNames.get(String(c.from_template_id)) ?? `Sesión #${c.from_template_id}`)
          : 'Sin sesión',
      after:
        c.to_template_id != null
          ? (templateNames.get(String(c.to_template_id)) ?? `Sesión #${c.to_template_id}`)
          : 'Descanso',
    }));
    return {
      id: `week_adjustment:${p.id}`,
      type: 'week_adjustment',
      severity: 'decision',
      athlete_id: p.athlete_id,
      athlete_name: p.athlete_name,
      proposal_id: p.id,
      week_start: p.week_start,
      title: RECOMMENDATION_TITLE[p.proposal.recommendation] ?? 'Ajuste semanal',
      summary:
        p.coach_summary ?? p.proposal.rationale ?? 'Propuesta de Pablo IA pendiente de revisión.',
      diff_rows,
      extra_change_count: Math.max(0, changes.length - MAX_DIFF_ROWS),
    };
  });

  const monthlyItems: InboxMonthlyBlockItem[] = monthlyBlocks.map((p) => ({
    id: `monthly_block:${p.id}`,
    type: 'monthly_block',
    severity: 'decision',
    athlete_id: p.athlete_id,
    athlete_name: p.athlete_name,
    proposal_id: p.id,
    month_name: p.month_name,
    proposed_start_date: p.proposed_start_date,
    rationale: p.rationale,
  }));

  const messageItems: InboxMessageItem[] = threads
    .filter((t) => t.unread_count > 0)
    .map((t) => ({
      id: `message:${t.thread_id}`,
      type: 'message',
      severity: 'message',
      athlete_id: t.athlete_id,
      athlete_name: t.athlete_full_name,
      thread_id: t.thread_id,
      preview: t.last_message_body,
      last_message_at: t.last_message_at,
      unread_count: t.unread_count,
    }));

  // Order: critical → decisions → alerts → messages (spec §1).
  const critical = [
    ...intakeItems.filter((i) => i.severity === 'critical'),
  ].sort((a, b) => b.hours_since_onboarded - a.hours_since_onboarded);
  const decisions: InboxItem[] = [
    ...intakeItems.filter((i) => i.severity === 'decision'),
    ...adjustmentItems,
    ...monthlyItems,
  ];
  const items: InboxItem[] = [...critical, ...decisions, ...alerts, ...messageItems];

  return {
    generated_at: new Date().toISOString(),
    counts: {
      total: items.length,
      critical: critical.length,
      decisions: decisions.length,
      alerts: alerts.length,
      messages: messageItems.length,
    },
    items,
  };
}

/** Total pending items — drives the sidebar "Hoy" badge. */
export async function countCoachInboxItems(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<number> {
  const inbox = await loadCoachInbox(params);
  return inbox.counts.total;
}

// ── Alerts (inactivity 2+ días · pago fallido · renovación ≤7d) ─────────────

type AlertItem = InboxInactivityAlertItem | InboxPaymentAlertItem | InboxRenewalAlertItem;

async function listInboxAlerts(params: {
  coach_id: number | bigint;
  client: Sql;
}): Promise<AlertItem[]> {
  const todayIso = isoDateString(startOfDayInBox(new Date()));
  const out: AlertItem[] = [];

  try {
    const rows = await params.client<
      Array<{
        athlete_id: string;
        full_name: string;
        last_completed: string | null;
        last_completed_name: string | null;
        last_checkin: string | null;
        race_name: string | null;
        race_days: number | null;
      }>
    >`
      select
        a.id::text as athlete_id,
        a.full_name,
        lc.scheduled_for as last_completed,
        lc.session_name as last_completed_name,
        ch.recorded_for as last_checkin,
        tr.name as race_name,
        tr.days_until as race_days
      from athletes a
      left join lateral (
        select to_char(w.scheduled_for, 'YYYY-MM-DD') as scheduled_for, t.name as session_name
        from workout_assignments w
        join templates t on t.id = w.template_id
        where w.athlete_id = a.id and w.status = 'completed'
        order by w.scheduled_for desc
        limit 1
      ) lc on true
      left join lateral (
        select to_char(c.recorded_for, 'YYYY-MM-DD') as recorded_for
        from daily_checkins c
        where c.athlete_id = a.id
        order by c.recorded_for desc
        limit 1
      ) ch on true
      left join lateral (
        select r.name, (r.race_date - ${todayIso}::date)::int as days_until
        from races r
        where r.athlete_id = a.id
          and r.race_date >= ${todayIso}::date
          and r.status in ('planned', 'registered')
          and r.priority = 'target'
        order by r.race_date asc, r.id asc
        limit 1
      ) tr on true
      where a.coach_id = ${params.coach_id as number}
        and a.intake_completed_at is not null
        -- Only athletes with an active plan in the recent window — a paused
        -- athlete without assignments is not "inactive", just unplanned.
        and exists (
          select 1 from workout_assignments w2
          where w2.athlete_id = a.id
            and w2.scheduled_for >= ${todayIso}::date - 14
            and w2.scheduled_for <= ${todayIso}::date
        )
    `;

    for (const r of rows) {
      const lastActivity = maxIso(r.last_completed, r.last_checkin);
      if (!lastActivity) continue;
      const daysInactive = daysBetweenIso(lastActivity, todayIso);
      if (daysInactive < INACTIVITY_ALERT_DAYS) continue;
      out.push({
        id: `alert_inactivity:${r.athlete_id}`,
        type: 'alert_inactivity',
        severity: 'alert',
        athlete_id: r.athlete_id,
        athlete_name: r.full_name,
        days_inactive: daysInactive,
        last_session_label:
          r.last_completed && r.last_completed_name
            ? `${r.last_completed_name} · ${r.last_completed}`
            : null,
        race_name: r.race_name,
        race_days: r.race_days,
      });
    }
  } catch (err) {
    if (!isPgMissingRelation(err, 'daily_checkins')) throw err;
  }

  try {
    const billing = await params.client<
      Array<{
        athlete_id: string;
        full_name: string;
        status: string;
        cancel_at_period_end: boolean;
        days_to_period_end: number | null;
      }>
    >`
      select distinct on (a.id)
        a.id::text as athlete_id,
        a.full_name,
        s.status::text as status,
        s.cancel_at_period_end,
        case
          when s.current_period_end is null then null
          else (s.current_period_end::date - ${todayIso}::date)::int
        end as days_to_period_end
      from athletes a
      join subscriptions s
        on s.user_id = a.user_id or s.partner_user_id = a.user_id
      where a.coach_id = ${params.coach_id as number}
      order by a.id, s.created_at desc
    `;

    for (const b of billing) {
      if (b.status === 'past_due') {
        out.push({
          id: `alert_payment_failed:${b.athlete_id}`,
          type: 'alert_payment_failed',
          severity: 'alert',
          athlete_id: b.athlete_id,
          athlete_name: b.full_name,
        });
      } else if (
        b.status === 'active' &&
        b.cancel_at_period_end &&
        b.days_to_period_end != null &&
        b.days_to_period_end >= 0 &&
        b.days_to_period_end <= RENEWAL_ALERT_DAYS
      ) {
        out.push({
          id: `alert_renewal:${b.athlete_id}`,
          type: 'alert_renewal',
          severity: 'alert',
          athlete_id: b.athlete_id,
          athlete_name: b.full_name,
          days_to_period_end: b.days_to_period_end,
        });
      }
    }
  } catch (err) {
    if (!isPgMissingRelation(err, 'subscriptions')) throw err;
  }

  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function listPendingMonthlyBlocksForCoachSafe(params: {
  coach_id: number | bigint;
  client: Sql;
}): Promise<Awaited<ReturnType<typeof listPendingMonthlyBlocksForCoach>>> {
  try {
    return await listPendingMonthlyBlocksForCoach(params);
  } catch (err) {
    if (isPgMissingRelation(err, 'monthly_block_proposals')) return [];
    throw err;
  }
}

async function loadTemplateNames(params: {
  ids: string[];
  client: Sql;
}): Promise<Map<string, string>> {
  if (params.ids.length === 0) return new Map();
  const rows = await params.client<Array<{ id: string; name: string }>>`
    select id::text, name from templates
    where id = any(${params.ids.map(Number)}::bigint[])
  `;
  return new Map(rows.map((r) => [r.id, r.name]));
}

function maxIso(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return a >= b ? a : b;
}

/** Whole days from `fromIso` to `toIso` (both YYYY-MM-DD). */
function daysBetweenIso(fromIso: string, toIso: string): number {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((parse(toIso) - parse(fromIso)) / 86_400_000);
}
