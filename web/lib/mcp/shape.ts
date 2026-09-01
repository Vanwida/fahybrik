// What the connector puts on the wire.
//
// Every mapper here is EXPLICIT and PURE: it names each field it forwards. No
// spread, no passthrough. Two reasons, and both bite in production:
//
//   1. A passthrough turns any future field added to a dashboard payload into
//      something an assistant reads and repeats to the coach, unreviewed. The
//      deep dive alone carries private notes and health readings; what leaves
//      the building is a decision, not a default.
//   2. The dashboard payloads are built for PIXELS. `trends` is ~120 raw daily
//      points that exist to draw four sparklines. An assistant cannot see a
//      sparkline; handed the array it either ignores it or invents a trend from
//      it. So the series are dropped and the summaries they were drawn from are
//      kept: same truth, none of the noise.
//
// The nulls are load-bearing. A null here means "we do not know", never zero
// (docs/CONTRATO-UI.md §7), and the assistant must be able to say "no lo sé"
// with the same confidence the dashboard leaves a cell blank.

import { READINESS_COMPLIANCE_DAYS } from '@fahybrid/shared/domain/coach/race-readiness';
import type { AlertReason, CohortRow } from '@fahybrid/shared/domain/coach/types';
import type { LoadCoverage } from '@/lib/training-load';
import type { AthleteDeepDive } from '@/lib/coach/deep-dive-types';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** A signal, with the sentence that explains it. Never just a severity. */
function signal(a: AlertReason) {
  return { kind: a.kind, severity: a.severity, label: a.label, detail: a.detail };
}

/**
 * How much of the executed work the load numbers actually priced. Travels with
 * every load number so nothing downstream can compare a floor against a
 * measurement, and so the assistant can say what is missing in words the coach
 * already reads on the dashboard (`note_es`).
 */
function coverage(c: LoadCoverage) {
  return {
    state: c.state,
    pct: c.pct,
    allows_verdict: c.allows_verdict,
    note_es: c.note_es,
    unknown_sessions: c.unknown_sessions,
  };
}

// ---------------------------------------------------------------------------
// list_athletes
// ---------------------------------------------------------------------------

export interface McpAthleteSummary {
  athlete_id: string;
  full_name: string;
  /** Current microciclo as the coach named it, plus which week of it he is in. */
  block: { name: string | null; week: number | null };
  /**
   * Adherence, WITH its window. The number alone is unreadable: the roster's is
   * a trailing 7 days, the athlete card's is 30, and they routinely disagree by
   * a lot. Carrying the span means the two can never be quoted as one.
   */
  compliance: { pct: number | null; window_days: number };
  readiness_score: number | null;
  race_readiness: number | null;
  /** Everything worth telling him about, each with its own reason. */
  signals: ReturnType<typeof signal>[];
  primary_signal: ReturnType<typeof signal> | null;
  next_session: { label: string; iso_date: string | null } | null;
  sessions_today: { am: 'done' | 'pending' | null; pm: 'done' | 'pending' | null };
  in_gym_today: boolean;
  target_race: { name: string; days_until: number } | null;
  last_checkin_at: string | null;
  last_sync_at: string | null;
  sync_minutes_ago: number | null;
  /** Fitness / fatigue / form, and how much of the work they saw. */
  load: {
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
    acr: number | null;
    volume_7d_h: number | null;
    coverage: ReturnType<typeof coverage>;
  };
  /** Whether the athlete actually has a programmed week, and what is wrong if not. */
  programming: { status: CohortRow['programming_status']; label: string | null };
}

export function toAthleteSummary(row: CohortRow): McpAthleteSummary {
  return {
    athlete_id: row.athlete_id,
    full_name: row.full_name,
    block: { name: row.block_type, week: row.block_week },
    compliance: { pct: row.compliance_pct, window_days: READINESS_COMPLIANCE_DAYS },
    readiness_score: row.readiness_score,
    race_readiness: row.race_readiness,
    signals: row.alerts.map(signal),
    primary_signal: row.primary_alert ? signal(row.primary_alert) : null,
    next_session: row.next_session,
    sessions_today: row.sessions_today,
    in_gym_today: row.in_gym_today,
    // Both halves or neither: a countdown with no race named is a number the
    // assistant would have to guess a subject for.
    target_race:
      row.a_event_name != null && row.days_to_a_event != null
        ? { name: row.a_event_name, days_until: row.days_to_a_event }
        : null,
    last_checkin_at: row.last_checkin_at,
    last_sync_at: row.last_sync_at,
    sync_minutes_ago: row.sync_minutes_ago,
    load: {
      ctl: row.ctl,
      atl: row.atl,
      tsb: row.tsb,
      acr: row.acr,
      volume_7d_h: row.volume_7d_h,
      coverage: coverage(row.load_coverage),
    },
    programming: { status: row.programming_status, label: row.programming_label },
  };
}

// ---------------------------------------------------------------------------
// get_athlete
// ---------------------------------------------------------------------------

export function toAthleteDetail(d: AthleteDeepDive) {
  return {
    generated_at_iso: d.generated_at_iso,
    athlete: {
      athlete_id: d.header.athlete_id,
      full_name: d.header.full_name,
      age_years: d.header.age_years,
      sex_label: d.header.sex_label,
      height_cm: d.header.height_cm,
      weight_kg: d.header.weight_kg,
      experience_label: d.header.experience_label,
    },
    /** The one thing to say first, when there is one (new, inactive, in alert…). */
    headline: d.banner
      ? {
          kind: d.banner.kind,
          severity: d.banner.severity,
          title: d.banner.title,
          detail: d.banner.detail,
        }
      : null,
    signals: d.alerts.map(signal),
    target_race: d.a_event,
    plan: d.macrocycle
      ? {
          current_block: d.macrocycle.current_block,
          current_week: d.macrocycle.current_week,
          total_weeks: d.macrocycle.total_weeks,
          weeks_to_event: d.macrocycle.weeks_to_event,
          blocks: d.macrocycle.blocks.map((b) => ({
            name: b.type,
            weeks: b.weeks,
            position: b.position,
            is_current: b.is_current,
          })),
        }
      : null,
    load: {
      ctl: d.carga.ctl,
      ctl_trend: d.carga.ctl_trend,
      atl: d.carga.atl,
      atl_trend: d.carga.atl_trend,
      tsb: d.carga.tsb,
      tsb_label: d.carga.tsb_label,
      acr: d.carga.acr,
      acr_label: d.carga.acr_label,
      z34_pct_7d: d.carga.z34_pct_7d,
      polarization_pct: d.carga.polarization_pct,
      polarization_warn: d.carga.polarization_warn,
      coverage: coverage(d.carga.coverage),
    },
    compliance: {
      pct_7d: d.compliance.pct_7d,
      pct_30d: d.compliance.pct_30d,
      pct_total: d.compliance.pct_total,
      streak_days: d.compliance.streak_days,
      checkin_done_7d: d.compliance.checkin_done_7d,
    },
    readiness: {
      daily_readiness_score: d.readiness.daily_readiness_score,
      daily_readiness_delta_7d: d.readiness.daily_readiness_delta_7d,
      race_readiness: d.readiness.race_readiness,
      race_readiness_trend: d.readiness.race_readiness_trend,
      hrv_ms: d.readiness.hrv_ms,
      hrv_delta_ms: d.readiness.hrv_delta_ms,
      hrv_baseline_ms: d.trends.hrv_baseline_ms,
      sleep_avg_h: d.readiness.sleep_avg_h,
      rhr: d.readiness.rhr,
      rhr_delta: d.readiness.rhr_delta,
      recovery_pct: d.readiness.recovery_pct,
      mood: d.readiness.mood,
      fatigue: d.readiness.fatigue,
    },
    /** What he has actually been training the last 7 days, and how much. */
    modality_7d: {
      total_hours: d.modality.total_hours,
      sessions_count: d.modality.sessions_count,
      twice_daily_days_label: d.modality.twice_daily_days_label,
      rows: d.modality.rows.map((r) => ({
        key: r.key,
        label: r.label,
        hours: r.hours,
        pct: r.pct,
        km: r.km,
        kg: r.kg,
      })),
    },
    /**
     * Time in zones WITH the threshold it was measured against and whether that
     * threshold was measured or guessed. The percentages mean nothing without
     * it: the same split reads as polarized or as junk depending on what "Z4"
     * meant for this athlete.
     */
    zone_time_30d: d.trends.zone_time
      ? {
          pct: d.trends.zone_time.pct,
          lthr_bpm: d.trends.zone_time.lthr_bpm,
          estimated: d.trends.zone_time.estimated,
          source_label: d.trends.zone_time.source_label,
        }
      : null,
    /**
     * The 30-day adherence the compliance strip was drawn from, as counts. The
     * day-by-day strip itself is dropped: 30 states of 'completed' | 'missed' |
     * 'rest' | 'future' say nothing the ratio does not.
     */
    compliance_30d: {
      pct: d.trends.compliance_pct,
      done: d.trends.compliance_done,
      total: d.trends.compliance_total,
    },
    /** Bests and trends per movement, already worded (this is what he asks about). */
    performance: d.performance.groups.map((g) => ({
      key: g.key,
      label: g.label,
      rows: g.rows.map((r) => ({
        exercise_label: r.exercise_label,
        best_label: r.best_label,
        avg_label: r.avg_label,
        trend: r.trend,
        trend_pct: r.trend_pct,
        variability: r.variability,
        last_done_label: r.last_done_label,
        hint_text: r.hint_text,
      })),
    })),
    /** The last 7 days session by session, including what the athlete reported. */
    recent_days: d.recent_days.map((day) => ({
      iso_date: day.iso_date,
      label: day.label,
      sessions: day.sessions.map((s) => ({
        slot: s.slot,
        title: s.title,
        duration_seconds: s.duration_seconds,
        rpe: s.rpe,
        status: s.status,
        is_pr: s.is_pr,
        perceived_difficulty: s.perceived_difficulty,
        pain_area: s.pain_area,
        pain_note: s.pain_note,
      })),
    })),
    /** The coach's own private notes on this athlete. */
    notes: d.notes.map((n) => ({
      id: n.id,
      body: n.body,
      created_at_iso: n.created_at_iso,
    })),
    /** Whether the engine thinks he is ready to move on from his block, and why. */
    transition_suggest: d.transition_suggest,
  };
}

// ---------------------------------------------------------------------------
// One-line human summaries
// ---------------------------------------------------------------------------
//
// Every tool answer carries `_resumen`: the same thing the coach would hear if
// he asked a person. It is not decoration. An assistant handed only a JSON blob
// reliably leads with whatever field came first; given the sentence it leads
// with what matters, and the coach can act on the first line without waiting for
// the rest to be read out.

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function briefingResumen(params: {
  active_athlete_count: number;
  cohort: CohortRow[];
  unread_messages: number;
}): string {
  const { active_athlete_count: n, cohort, unread_messages } = params;
  const roster = `${n} ${plural(n, 'atleta', 'atletas')}`;
  const parts: string[] = [];

  const critical = cohort.filter((r) => r.primary_alert?.severity === 'critical').length;
  const warning = cohort.filter(
    (r) => r.alerts.length > 0 && r.primary_alert?.severity !== 'critical',
  ).length;
  if (critical > 0) parts.push(`${critical} que ${plural(critical, 'pide', 'piden')} atención ya`);
  if (warning > 0) parts.push(`${warning} con algo que mirar`);
  if (unread_messages > 0) {
    parts.push(
      `${unread_messages} ${plural(unread_messages, 'mensaje', 'mensajes')} sin responder`,
    );
  }

  if (parts.length === 0) return `${roster} y nada que atender ahora mismo.`;
  return `${roster}: ${joinEs(parts)}.`;
}

export function athletesResumen(params: {
  rows: McpAthleteSummary[];
  modality: string | null;
}): string {
  const { rows, modality } = params;
  const scope = modality ? ` en plan ${modality}` : '';
  if (rows.length === 0) return `Ningún atleta${scope}.`;

  const flagged = rows.filter((r) => r.signals.length > 0).length;
  const roster = `${rows.length} ${plural(rows.length, 'atleta', 'atletas')}${scope}`;
  if (flagged === 0) return `${roster}, ninguno con señales activas.`;
  return `${roster}, ${flagged} con ${plural(flagged, 'una señal activa', 'señales activas')}.`;
}

export function athleteResumen(detail: ReturnType<typeof toAthleteDetail>): string {
  const parts: string[] = [];

  const adherence = detail.compliance.pct_7d;
  parts.push(
    adherence == null
      ? 'sin adherencia medible estos 7 días'
      : `adherencia ${adherence}% en 7 días`,
  );

  const readiness = detail.readiness.daily_readiness_score;
  if (readiness != null) parts.push(`readiness ${readiness}`);

  const n = detail.signals.length;
  parts.push(n === 0 ? 'sin señales activas' : `${n} ${plural(n, 'señal', 'señales')}`);

  if (detail.target_race) {
    parts.push(`${detail.target_race.name} en ${detail.target_race.days_until} días`);
  }

  return `${detail.athlete.full_name}: ${joinEs(parts)}.`;
}

/** "a, b y c" — the way it is said out loud, not "a, b, c". */
function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}
