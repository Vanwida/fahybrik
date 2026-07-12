// Biometric / behaviour evaluators — extracted VERBATIM from
// lib/coach/cohort.ts::computeAlerts. Thresholds, Spanish labels and details are
// preserved exactly; the only behavioural change is the hrv_crash baseline guard
// (suppress the false crash when <14 distinct days of HRV back the baseline).

import {
  type SignalEvaluator,
  type SignalResult,
  dedupeKey,
  hoursBetween,
} from '@fahybrid/shared/domain/coach/signals';

/** Minimum distinct days of HRV data before an HRV crash is trustworthy. */
const HRV_MIN_BASELINE_DAYS = 14;

export const hrvCrashEvaluator: SignalEvaluator = {
  kind: 'hrv_crash',
  default_severity: 'critical',
  enabled: true,
  evaluate(facts, thresholds): SignalResult {
    const delta = facts.hrv_delta_ms;
    // False-alert guard: ignore when the baseline is thin or absent.
    const baselineOk =
      facts.hrv_baseline_days != null && facts.hrv_baseline_days >= HRV_MIN_BASELINE_DAYS;
    const fires =
      delta != null && delta <= thresholds.hrv_crash_delta_ms && baselineOk;
    return {
      kind: 'hrv_crash',
      fires,
      severity: 'critical',
      value: delta,
      baseline: 0,
      trend: 'down',
      label: 'HRV crash',
      detail: delta != null ? `▼ ${Math.abs(delta).toFixed(0)} ms vs baseline` : '',
      dedupe_key: dedupeKey('hrv_crash', facts.athlete_id),
    };
  },
};

export const noSyncEvaluator: SignalEvaluator = {
  kind: 'no_sync',
  default_severity: 'critical',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    const minutes = facts.sync_minutes_ago;
    if (minutes == null) return null;

    if (minutes > thresholds.no_sync_critical_hours * 60) {
      return {
        kind: 'no_sync',
        fires: true,
        severity: 'critical',
        value: minutes,
        baseline: null,
        trend: null,
        label: `${Math.floor(minutes / 60 / 24)}d sin sync`,
        detail: 'wearable offline',
        dedupe_key: dedupeKey('no_sync', facts.athlete_id),
      };
    }
    if (minutes > thresholds.no_sync_warning_hours * 60) {
      return {
        kind: 'no_sync',
        fires: true,
        severity: 'warning',
        value: minutes,
        baseline: null,
        trend: null,
        label: `Sync >${thresholds.no_sync_warning_hours}h`,
        detail: 'comprobar wearable',
        dedupe_key: dedupeKey('no_sync', facts.athlete_id),
      };
    }
    return null;
  },
};

export const missedSessionsEvaluator: SignalEvaluator = {
  kind: 'missed_sessions',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult {
    const n = facts.missed_sessions_7d;
    const fires = n >= thresholds.missed_sessions_min;
    return {
      kind: 'missed_sessions',
      fires,
      severity: 'warning',
      value: n,
      baseline: thresholds.missed_sessions_min,
      trend: null,
      label: `${n} sesiones perdidas`,
      detail: 'última 7 días',
      dedupe_key: dedupeKey('missed_sessions', facts.athlete_id),
    };
  },
};

export const rpeHighEvaluator: SignalEvaluator = {
  kind: 'rpe_high',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    const rpe = facts.rpe_yesterday;
    if (rpe == null) return null;
    const fires = rpe >= thresholds.rpe_high_min;
    return {
      kind: 'rpe_high',
      fires,
      severity: 'warning',
      value: rpe,
      baseline: thresholds.rpe_high_min,
      trend: null,
      label: `RPE ${rpe.toFixed(1)} ayer`,
      detail: 'monitor sobreesfuerzo',
      dedupe_key: dedupeKey('rpe_high', facts.athlete_id),
    };
  },
};

/** Generic body-area token (#58) → display label (tokens are already Spanish). */
const PAIN_AREA_LABEL: Record<string, string> = {
  rodilla: 'Rodilla',
  tobillo: 'Tobillo',
  cadera: 'Cadera',
  espalda: 'Espalda',
  hombro: 'Hombro',
  otra: 'Otra zona',
};

/** Max chars of the athlete's pain note shown on the card (it is a one-line chip). */
const PAIN_NOTE_MAX = 80;

export const discomfortReportedEvaluator: SignalEvaluator = {
  kind: 'discomfort_reported',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds, now): SignalResult | null {
    const area = facts.discomfort_area;
    const at = facts.discomfort_at;
    if (area == null || at == null) return null;
    const days = hoursBetween(at, now) / 24;
    // Only a RECENT report warrants attention; older ones auto-clear (no card).
    if (days > thresholds.discomfort_recent_days) return null;
    const areaLabel = PAIN_AREA_LABEL[area] ?? 'Molestia';
    const note = facts.discomfort_note?.trim();
    const detail =
      note && note.length > 0
        ? note.length > PAIN_NOTE_MAX
          ? `${note.slice(0, PAIN_NOTE_MAX - 1)}…`
          : note
        : 'reportada en una sesión';
    return {
      kind: 'discomfort_reported',
      fires: true,
      severity: 'warning',
      value: Math.max(0, Math.round(days)),
      baseline: thresholds.discomfort_recent_days,
      trend: null,
      label: `Molestia · ${areaLabel}`,
      detail,
      dedupe_key: dedupeKey('discomfort_reported', facts.athlete_id),
    };
  },
};

export const checkinSkippedEvaluator: SignalEvaluator = {
  kind: 'checkin_skipped',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds, now): SignalResult {
    // Mirror cohort.ts: a null check-in is treated as infinitely old → fires.
    const checkinAgeH =
      facts.last_checkin_at == null
        ? Number.POSITIVE_INFINITY
        : hoursBetween(facts.last_checkin_at, now);
    const fires = checkinAgeH > thresholds.checkin_skipped_hours;
    return {
      kind: 'checkin_skipped',
      fires,
      severity: 'warning',
      value: Number.isFinite(checkinAgeH) ? Math.round(checkinAgeH) : null,
      baseline: thresholds.checkin_skipped_hours,
      trend: null,
      label: 'Check-in 2d',
      detail: 'sin daily',
      dedupe_key: dedupeKey('checkin_skipped', facts.athlete_id),
    };
  },
};

export const messageUnansweredEvaluator: SignalEvaluator = {
  kind: 'message_unanswered',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    const ageMin = facts.unread_message_age_min;
    if (ageMin == null) return null;
    const fires = ageMin > thresholds.message_unanswered_hours * 60;
    if (!fires) return null;
    return {
      kind: 'message_unanswered',
      fires: true,
      severity: 'warning',
      value: Math.floor(ageMin / 60),
      baseline: thresholds.message_unanswered_hours,
      trend: null,
      label: `Mensaje ${Math.floor(ageMin / 60)}h sin responder`,
      detail: 'inbox',
      dedupe_key: dedupeKey('message_unanswered', facts.athlete_id),
    };
  },
};
