// Biometric / behaviour evaluators. Nacieron extraídos de
// lib/coach/cohort.ts::computeAlerts; la auditoría del panel con 100 atletas
// (informe B) los rehízo con persistencia y base propia: sesiones perdidas =
// solo lo DEBIDO, RPE alto = una tendencia de la semana, check-in = solo a quien
// tiene el hábito, «por responder» = el último mensaje es del atleta. Los
// números son del coach (`coach_signal_thresholds`), el cómo vive aquí. Copy en
// castellano del panel (plan §2).

import {
  type SignalEvaluator,
  type SignalResult,
  dedupeKey,
  hoursBetween,
} from '@fahybrid/shared/domain/coach/signals';
import { ageLabel, relativeDay } from '@fahybrid/shared/domain/coach/athlete-state';
import { zonedDayString } from '@fahybrid/shared/domain/dates';

/** «hoy», «ayer» o «22 sept» de un INSTANTE, en el día del atleta. */
function whenLocal(instantIso: string, facts: { today_iso: string; timezone: string }): string {
  return relativeDay(zonedDayString(new Date(instantIso), facts.timezone), facts.today_iso);
}

/** RPE alto necesita al menos dos entrenos: uno solo es un día duro, no una tendencia. */
const RPE_HIGH_MIN_SESSIONS = 2;

/** La ventana del hábito de check-in (el «14 d» de «hacía 12 de 14 días»). */
const CHECKIN_HABIT_WINDOW_DAYS = 14;

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
      label: delta != null ? `HRV −${Math.abs(delta).toFixed(0)} ms` : 'HRV baja',
      detail: 'media de 7 d vs su base de 60 d',
      window_label: '7 d',
      dedupe_key: dedupeKey('hrv_crash', facts.athlete_id),
    };
  },
};

export const noSyncEvaluator: SignalEvaluator = {
  kind: 'no_sync',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds, now): SignalResult | null {
    // Un reloj sin sincronizar es calidad del dato, no un atleta en riesgo: nunca
    // «acción». Pasado el umbral largo es vigilar; entre medias, informativo.
    const minutes = facts.sync_minutes_ago;
    if (minutes == null) return null;
    if (minutes <= thresholds.no_sync_warning_hours * 60) return null;
    const since = new Date(now.getTime() - minutes * 60_000).toISOString();
    const long = minutes > thresholds.no_sync_critical_hours * 60;
    return {
      kind: 'no_sync',
      fires: true,
      severity: long ? 'warning' : 'info',
      value: minutes,
      baseline: null,
      trend: null,
      label: `Reloj sin sincronizar · ${ageLabel(since, now)}`,
      detail: `último dato, ${whenLocal(since, facts)}`,
      observed_at: since,
      window_label: null,
      dedupe_key: dedupeKey('no_sync', facts.athlete_id),
    };
  },
};

export const missedSessionsEvaluator: SignalEvaluator = {
  kind: 'missed_sessions',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    // Solo lo DEBIDO (adherence.ts): un día de descanso no es un entreno perdido,
    // y lo de hoy aún no se ha perdido. Antes contaba `status='missed'` sin más.
    const n = facts.missed_sessions_7d;
    if (n < thresholds.missed_sessions_min!) return null;
    const last = facts.last_missed_on ? relativeDay(facts.last_missed_on, facts.today_iso) : null;
    return {
      kind: 'missed_sessions',
      fires: true,
      severity: 'warning',
      value: n,
      baseline: facts.due_sessions_7d,
      trend: null,
      label: `${n} de ${facts.due_sessions_7d} debidas sin hacer`,
      detail: last ? `últimos 7 d · el último, ${last}` : 'últimos 7 d',
      observed_at: facts.last_missed_on ? `${facts.last_missed_on}T12:00:00.000Z` : null,
      window_label: '7 d',
      dedupe_key: dedupeKey('missed_sessions', facts.athlete_id),
    };
  },
};

export const rpeHighEvaluator: SignalEvaluator = {
  kind: 'rpe_high',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    // Persistencia, no un entreno: un día duro a la semana es el plan
    // funcionando; la mitad (o lo que fije el coach) al límite es sobrecarga.
    const logged = facts.sessions_7d_rpe.filter((x) => x.rpe != null);
    const hard = logged.filter((x) => (x.rpe as number) >= thresholds.rpe_high_min!);
    if (hard.length < RPE_HIGH_MIN_SESSIONS) return null;
    if (hard.length * 100 < thresholds.rpe_high_share_pct! * logged.length) return null;
    const lastHard = hard.reduce((acc, x) => (x.on > acc ? x.on : acc), hard[0]!.on);
    return {
      kind: 'rpe_high',
      fires: true,
      severity: 'warning',
      value: hard.length,
      baseline: logged.length,
      trend: 'up',
      label: `RPE alto en ${hard.length} de ${logged.length} entrenos`,
      detail: `RPE ${thresholds.rpe_high_min} o más · últimos 7 d · el último, ${relativeDay(lastHard, facts.today_iso)}`,
      observed_at: `${lastHard}T12:00:00.000Z`,
      window_label: '7 d',
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
      detail: `${detail} · ${whenLocal(at.toISOString(), facts)}`,
      observed_at: at.toISOString(),
      window_label: `${thresholds.discomfort_recent_days} d`,
      dedupe_key: dedupeKey('discomfort_reported', facts.athlete_id),
    };
  },
};

export const checkinSkippedEvaluator: SignalEvaluator = {
  kind: 'checkin_skipped',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds, now): SignalResult | null {
    // Solo a quien TIENE el hábito (K check-ins en los 14 días hasta el último) y
    // lo rompe. A quien no lo hace nunca no se le echa en falta: antes esto
    // saltaba para 42 de 100 atletas sin un solo check-in.
    const last = facts.last_checkin_at;
    if (last == null) return null;
    if (facts.checkins_prior_14d < thresholds.checkin_habit_min!) return null;
    const days = Math.floor(hoursBetween(last, now) / 24);
    if (days < thresholds.checkin_skipped_days!) return null;
    // Pasadas dos semanas el hábito ya no existe: la señal se retira sola.
    if (days > CHECKIN_HABIT_WINDOW_DAYS) return null;
    const lastIso = last.toISOString();
    return {
      kind: 'checkin_skipped',
      fires: true,
      severity: 'warning',
      value: days,
      baseline: facts.checkins_prior_14d,
      trend: null,
      label: `Sin check-in · ${days} d`,
      detail: `hacía ${facts.checkins_prior_14d} de 14 días · el último, ${whenLocal(lastIso, facts)}`,
      observed_at: lastIso,
      window_label: '14 d',
      dedupe_key: dedupeKey('checkin_skipped', facts.athlete_id, lastIso.slice(0, 10)),
    };
  },
};

export const messageUnansweredEvaluator: SignalEvaluator = {
  kind: 'message_unanswered',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds, now): SignalResult | null {
    // «Por responder» = el ÚLTIMO mensaje del hilo es del atleta, leído o no
    // (abrir el hilo no es contestar — informe B, H9).
    const ageMin = facts.unread_message_age_min;
    if (ageMin == null) return null;
    if (ageMin <= thresholds.message_unanswered_hours! * 60) return null;
    const since = new Date(now.getTime() - ageMin * 60_000).toISOString();
    const n = facts.awaiting_reply_count;
    return {
      kind: 'message_unanswered',
      fires: true,
      severity: 'warning',
      value: Math.floor(ageMin / 60),
      baseline: thresholds.message_unanswered_hours!,
      trend: null,
      label: 'Por responder',
      detail: `espera ${ageLabel(since, now)} · ${n} ${n === 1 ? 'mensaje' : 'mensajes'}`,
      observed_at: since,
      window_label: null,
      // El último mensaje del atleta es la identidad: si vuelve a escribir después
      // de que el coach lo diera por hecho, es otra espera y vuelve a salir.
      dedupe_key: dedupeKey(
        'message_unanswered',
        facts.athlete_id,
        facts.awaiting_reply_last_at?.toISOString() ?? since,
      ),
    };
  },
};
