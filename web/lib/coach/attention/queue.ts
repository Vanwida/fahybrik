// loadAttentionQueue — the ONE indexed read that powers HOY (SPEC §8/§9).
//
// Replaces the O(athletes) N+1 the old inbox/team-pulse path incurred: the
// recompute sweep (recompute.ts) has already persisted firing signals into
// coach_attention_items, so HOY just reads that table joined to the coach's
// overrides + athlete names, applies suppression in TS, groups per athlete and
// splits into the two surfaced tiers. It calls NO per-athlete service.

import 'server-only';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import { captureRouteError } from '@/lib/observability/capture';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';
import {
  worseSeverity,
  SIGNAL_SEVERITY_RANK,
  type SignalSeverity,
  type SignalTrend,
} from '@fahybrid/shared/domain/coach/signals';
import { isSuppressed, type SuppressionOverride } from './resurface';

/** Cache tag for a coach's attention queue — invalidated by the recompute/override write paths. */
export function attentionTag(coach_id: string | number | bigint): string {
  return `coach:${coach_id}:attention`;
}

export interface AttentionSignalSummary {
  signal_kind: string;
  severity: SignalSeverity;
  value_numeric: number | null;
  baseline_numeric: number | null;
  trend: SignalTrend | null;
  label: string;
  detail: string;
}

export interface AttentionCard {
  athlete_id: string;
  athlete_name: string;
  primary: AttentionSignalSummary;
  other_signal_count: number;
  snoozed_until: string | null;
  coach_note: string | null;
}

export interface AttentionQueue {
  generated_at: string;
  counts: { critico: number; vigilar: number; total: number; overflow: number };
  critico: AttentionCard[];
  vigilar: AttentionCard[];
}

interface QueueRow {
  athlete_id: string;
  athlete_name: string;
  signal_kind: string;
  severity: SignalSeverity;
  value_numeric: number | null;
  baseline_numeric: number | null;
  trend: SignalTrend | null;
  label: string;
  detail: string;
  computed_at: Date;
  snoozed_until: Date | null;
  dismissed_at: Date | null;
  resurface_on_new_signal: boolean | null;
  baseline_value_at_override: number | null;
  coach_note: string | null;
}

function emptyQueue(now: Date): AttentionQueue {
  return {
    generated_at: now.toISOString(),
    counts: { critico: 0, vigilar: 0, total: 0, overflow: 0 },
    critico: [],
    vigilar: [],
  };
}

export async function loadAttentionQueue(params: {
  coach_id: bigint | number;
  client?: Sql;
  now?: Date;
}): Promise<AttentionQueue> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();

  let rows: QueueRow[];
  try {
    rows = await client<QueueRow[]>`
      select
        i.athlete_id::text          as athlete_id,
        a.full_name                 as athlete_name,
        i.signal_kind               as signal_kind,
        i.severity                  as severity,
        i.value_numeric             as value_numeric,
        i.baseline_numeric          as baseline_numeric,
        i.trend                     as trend,
        i.label                     as label,
        i.detail                    as detail,
        i.computed_at               as computed_at,
        o.snoozed_until             as snoozed_until,
        o.dismissed_at              as dismissed_at,
        o.resurface_on_new_signal   as resurface_on_new_signal,
        o.baseline_value_at_override as baseline_value_at_override,
        o.coach_note                as coach_note
      from coach_attention_items i
      join athletes a on a.id = i.athlete_id
      left join coach_alert_overrides o
        on o.athlete_id = i.athlete_id and o.signal_kind = i.signal_kind
      where i.coach_id = ${params.coach_id as number}
      order by
        (case i.severity when 'critical' then 0 when 'warning' then 1 else 2 end),
        i.computed_at desc
    `;
  } catch (err) {
    // Not-yet-migrated env: render empty rather than 500.
    if (isPgMissingRelation(err, 'coach_attention_items')) return emptyQueue(now);
    captureRouteError(err, { route: 'lib/coach/attention/queue.loadAttentionQueue' });
    throw err;
  }

  // Filter suppressed rows, then group per athlete keeping the worst-severity
  // signal as the card primary (info-tier rows are context — excluded from cards
  // but counted toward other_signal_count for actionable cards).
  const perAthlete = new Map<
    string,
    {
      athlete_id: string;
      athlete_name: string;
      primary: QueueRow;
      actionable_count: number;
      snoozed_until: Date | null;
      coach_note: string | null;
    }
  >();

  for (const row of rows) {
    const override = toOverride(row);
    if (isSuppressed(row, override, now)) continue;

    const isActionable = row.severity === 'critical' || row.severity === 'warning';

    const existing = perAthlete.get(row.athlete_id);
    if (!existing) {
      perAthlete.set(row.athlete_id, {
        athlete_id: row.athlete_id,
        athlete_name: row.athlete_name,
        primary: row,
        actionable_count: isActionable ? 1 : 0,
        snoozed_until: row.snoozed_until,
        coach_note: row.coach_note,
      });
      continue;
    }

    if (isActionable) existing.actionable_count += 1;

    // Keep the worst-severity signal as the primary; ties broken by the SQL
    // order (rows already sorted worst-first then most-recent, so the first row
    // encountered for an athlete is the strongest — only replace on strict win).
    const winner = worseSeverity(row.severity, existing.primary.severity);
    if (winner === row.severity && winner !== existing.primary.severity) {
      existing.primary = row;
      existing.snoozed_until = row.snoozed_until;
      existing.coach_note = row.coach_note;
    }
  }

  // Build cards only for athletes whose PRIMARY (worst) signal is actionable.
  const cards: AttentionCard[] = [];
  for (const a of perAthlete.values()) {
    if (a.primary.severity === 'info') continue;
    cards.push({
      athlete_id: a.athlete_id,
      athlete_name: a.athlete_name,
      primary: {
        signal_kind: a.primary.signal_kind,
        severity: a.primary.severity,
        value_numeric: a.primary.value_numeric,
        baseline_numeric: a.primary.baseline_numeric,
        trend: a.primary.trend,
        label: a.primary.label,
        detail: a.primary.detail,
      },
      other_signal_count: Math.max(0, a.actionable_count - 1),
      snoozed_until: a.snoozed_until ? a.snoozed_until.toISOString() : null,
      coach_note: a.coach_note,
    });
  }

  // Sort cards worst-first (severity rank, then label for stability).
  cards.sort((x, y) => {
    const bySev =
      SIGNAL_SEVERITY_RANK[x.primary.severity] - SIGNAL_SEVERITY_RANK[y.primary.severity];
    if (bySev !== 0) return bySev;
    return x.athlete_name.localeCompare(y.athlete_name, 'es');
  });

  // Cap the TOTAL surfaced cards; overflow counts the truncated athletes.
  const limit = SIGNAL_THRESHOLDS.queue_card_limit;
  const surfaced = cards.slice(0, limit);
  const overflow = Math.max(0, cards.length - surfaced.length);

  const critico = surfaced.filter((c) => c.primary.severity === 'critical');
  const vigilar = surfaced.filter((c) => c.primary.severity === 'warning');

  return {
    generated_at: now.toISOString(),
    counts: {
      critico: critico.length,
      vigilar: vigilar.length,
      total: surfaced.length,
      overflow,
    },
    critico,
    vigilar,
  };
}

function toOverride(row: QueueRow): SuppressionOverride | null {
  if (
    row.snoozed_until == null &&
    row.dismissed_at == null &&
    row.resurface_on_new_signal == null &&
    row.baseline_value_at_override == null
  ) {
    return null;
  }
  return {
    snoozed_until: row.snoozed_until,
    dismissed_at: row.dismissed_at,
    // Column default is true; treat a present override row with null flag as true.
    resurface_on_new_signal: row.resurface_on_new_signal ?? true,
    baseline_value_at_override: row.baseline_value_at_override,
  };
}
