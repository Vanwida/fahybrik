import 'server-only';

// "Pulso del equipo" — right rail of HOY (spec §1). Three readouts computed
// from the same roster rows the /atletas grid already loads (no duplicate
// per-athlete queries) plus ONE aggregate query for the weekly compliance
// spark + trend vs the previous week.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { AthleteRow } from '@/lib/dashboard/athletes/list';
import {
  addDays,
  isoDateString,
  mondayOfWeek,
  startOfDayInBox,
} from '@fahybrid/shared/domain/atr/dates';
import { readinessBucket } from '@/lib/dashboard/constants/readiness';
import { DAY_LABELS, WEEKDAY_COUNT } from '@/lib/dashboard/constants/calendar';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';

/** Compliance below this marks an athlete as needing attention (signal-config.ts). */
const ATTENTION_COMPLIANCE_MAX = SIGNAL_THRESHOLDS.compliance_attention_max_pct;
/** Max athletes listed under "Necesitan atención". */
const ATTENTION_LIST_SIZE = 3;

export interface TeamPulseDay {
  day_label: string;
  /** 0-100, or null when the day has no scheduled sessions / is in the future. */
  pct: number | null;
  is_today: boolean;
}

export interface TeamPulseAttention {
  athlete_id: string;
  full_name: string;
  reason: string;
  readiness_score: number | null;
}

export interface TeamPulse {
  readiness: { ok: number; caution: number; low: number; unknown: number };
  compliance: {
    avg_pct: number | null;
    trend_pts: number | null;
    by_day: TeamPulseDay[];
  };
  attention: TeamPulseAttention[];
}

export async function loadTeamPulse(params: {
  coach_id: number | bigint;
  athletes: AthleteRow[];
  client?: Sql;
}): Promise<TeamPulse> {
  const client = params.client ?? defaultSql;

  // Readiness distribution from roster rows.
  const readiness = { ok: 0, caution: 0, low: 0, unknown: 0 };
  for (const a of params.athletes) {
    if (a.readiness_score == null) readiness.unknown += 1;
    else readiness[readinessBucket(a.readiness_score)] += 1;
  }

  // Mean weekly compliance across athletes with scheduled work.
  const withCompliance = params.athletes.filter((a) => a.compliance_pct != null);
  const avg_pct =
    withCompliance.length > 0
      ? Math.round(
          withCompliance.reduce((s, a) => s + (a.compliance_pct ?? 0), 0) /
            withCompliance.length,
        )
      : null;

  const { by_day, trend_pts } = await loadComplianceWeek({ coach_id: params.coach_id, client });

  return {
    readiness,
    compliance: { avg_pct, trend_pts, by_day },
    attention: pickAttention(params.athletes),
  };
}

// ── Necesitan atención — top N by urgency ───────────────────────────────────

function pickAttention(athletes: AthleteRow[]): TeamPulseAttention[] {
  const candidates = athletes
    .map((a) => {
      let reason: string | null = null;
      if (a.alert_label) reason = a.alert_label;
      else if (a.readiness_score != null && readinessBucket(a.readiness_score) !== 'ok') {
        reason = `Readiness ${a.readiness_score}%`;
      } else if (a.compliance_pct != null && a.compliance_pct < ATTENTION_COMPLIANCE_MAX) {
        reason = `Cumplimiento ${a.compliance_pct}% esta semana`;
      }
      return reason
        ? {
            athlete_id: a.athlete_id,
            full_name: a.full_name,
            reason,
            readiness_score: a.readiness_score,
            // Urgency: critical alerts first, then lowest readiness, then lowest compliance.
            sort_key:
              (a.alert_severity === 'critical' ? 0 : a.alert_severity === 'warning' ? 1 : 2) * 1000 +
              (a.readiness_score ?? 100) +
              (a.compliance_pct ?? 100) / 1000,
          }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((x, y) => x.sort_key - y.sort_key)
    .slice(0, ATTENTION_LIST_SIZE);

  return candidates.map(({ athlete_id, full_name, reason, readiness_score }) => ({
    athlete_id,
    full_name,
    reason,
    readiness_score,
  }));
}

// ── Weekly compliance spark + trend (one query, two week windows) ────────────

async function loadComplianceWeek(params: {
  coach_id: number | bigint;
  client: Sql;
}): Promise<{ by_day: TeamPulseDay[]; trend_pts: number | null }> {
  const today = startOfDayInBox(new Date());
  const todayIso = isoDateString(today);
  const weekStart = mondayOfWeek(today);
  const prevWeekStartIso = isoDateString(addDays(weekStart, -WEEKDAY_COUNT));
  const weekEndIso = isoDateString(addDays(weekStart, WEEKDAY_COUNT - 1));

  const rows = await params.client<
    Array<{ day: string; scheduled: number; completed: number }>
  >`
    select
      to_char(w.scheduled_for, 'YYYY-MM-DD') as day,
      count(*)::int as scheduled,
      count(*) filter (where w.status = 'completed')::int as completed
    from workout_assignments w
    join athletes a on a.id = w.athlete_id
    where a.coach_id = ${params.coach_id as number}
      and w.scheduled_for >= ${prevWeekStartIso}::date
      and w.scheduled_for <= ${weekEndIso}::date
    group by w.scheduled_for
  `;
  const byIso = new Map(rows.map((r) => [r.day, r]));

  const by_day: TeamPulseDay[] = [];
  for (let i = 0; i < WEEKDAY_COUNT; i += 1) {
    const iso = isoDateString(addDays(weekStart, i));
    const row = byIso.get(iso);
    const inFuture = iso > todayIso;
    by_day.push({
      day_label: (DAY_LABELS[i] ?? '').charAt(0),
      pct:
        !inFuture && row && row.scheduled > 0
          ? Math.round((row.completed / row.scheduled) * 100)
          : null,
      is_today: iso === todayIso,
    });
  }

  const weekPct = (fromIso: string, toIso: string): number | null => {
    let scheduled = 0;
    let completed = 0;
    for (const r of rows) {
      if (r.day >= fromIso && r.day <= toIso) {
        scheduled += r.scheduled;
        completed += r.completed;
      }
    }
    return scheduled > 0 ? Math.round((completed / scheduled) * 100) : null;
  };

  const currentPct = weekPct(isoDateString(weekStart), todayIso);
  const prevPct = weekPct(prevWeekStartIso, isoDateString(addDays(weekStart, -1)));
  const trend_pts = currentPct != null && prevPct != null ? currentPct - prevPct : null;

  return { by_day, trend_pts };
}
