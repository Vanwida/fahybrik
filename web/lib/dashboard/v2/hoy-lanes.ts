import 'server-only';

// v2 Hoy — the 4-LANE triage model. The flagship screen organizes the coach's
// day into four ACTION buckets (not the v1 critico/vigilar severity split):
//
//   1. fallo_sesiones    — missed work / low adherence / no active plan.
//   2. listo_progresar   — earned the next step (high adherence, no flags).
//   3. vigilar_fisiologia — biometric/readiness flags (fatigue, low readiness).
//   4. espera_respuesta  — athlete is waiting on a coach reply.
//
// Mapping is FAITHFUL to the real loaders — it reuses the exact fields already
// produced for v1 (no new queries, no invented athletes):
//   • roster rows  → fetchAthletesForCoach (AthleteRow: compliance_pct,
//                    readiness_score, programming_status, alert_*, week_ok, level…)
//   • threads      → listThreadsForCoach (unread_count → "espera respuesta")
//   • inbox alerts → loadCoachInbox (alert_inactivity reinforces "falló sesiones")
//
// An athlete surfaces in AT MOST ONE of the three roster lanes (priority:
// falló > vigilar > listo) so a low-adherence AND fatigued athlete shows once,
// in the most actionable lane. Messages are thread-based and INDEPENDENT: the
// same athlete may also sit in "espera respuesta" (two distinct coach actions).

import type { AthleteRow } from '@/lib/dashboard/athletes/list';
import type { CoachThreadSummary } from '@/lib/dashboard/chat/service';
import type { CoachInbox } from '@/lib/dashboard/coach/inbox';
import { readinessBucket } from '@/lib/dashboard/constants/readiness';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';
import { formatRelative } from '@/lib/dashboard/relative-time';
import { athleteLevel } from '@/lib/dashboard/v2/level';

// ── Thresholds (single source: signal-config) ────────────────────────────────
/** Compliance below this % counts as "falló sesiones". */
const COMPLIANCE_ATTENTION_MAX = SIGNAL_THRESHOLDS.compliance_attention_max_pct; // 70
/**
 * "Listo para progresar" heuristic floor. The real model has no explicit
 * "ready to advance" flag, so we derive it: a clean week (week_ok), strong
 * adherence, and no alert. TODO(model): replace with a first-class signal once
 * the block-progression engine emits "phase near end + improving" (F-follow-up).
 */
const READY_ADHERENCE_MIN = 90;

// ── Lane identity ─────────────────────────────────────────────────────────────

export type V2LaneId =
  | 'fallo_sesiones'
  | 'listo_progresar'
  | 'vigilar_fisiologia'
  | 'espera_respuesta';

/** Action a card can offer; the page wires these to links/handlers. */
export type V2LaneAction =
  | 'ver'
  | 'mensaje'
  | 'responder'
  | 'ajustar_fase'
  | 'descargar_carga';

export interface V2LaneCard {
  /** Stable key within its lane. */
  id: string;
  athlete_id: string;
  athlete_name: string;
  /** Real level name from athlete_levels.name (e.g. 'N1'–'N5'); null = not assigned. */
  level: string | null;
  /** One-line reason the athlete is in this lane. */
  reason: string;
  /** Optional adherence to draw a mini bar (null when no scheduled work). */
  adherence_pct: number | null;
  /** Optional readiness 0–100 for the physiology lane signal. */
  readiness_score: number | null;
  /** Optional age label for message cards (e.g. "hace 3 h"). */
  age_label: string | null;
  /** Unread count for message cards (badge when > 1). */
  unread_count: number | null;
  /** Actions to render, in order. */
  actions: V2LaneAction[];
}

export interface V2Lane {
  id: V2LaneId;
  title: string;
  /** Dot token color var for the lane header. */
  dot_var: string;
  cards: V2LaneCard[];
  /** Total in the lane (cards may be capped by the page for display). */
  count: number;
}

export interface V2HoyData {
  lanes: V2Lane[];
  total_athletes: number;
  /** Distinct athletes flagged across the three roster lanes (red top chip). */
  need_attention_count: number;
  /** Athletes waiting on a reply (blue top chip). */
  awaiting_reply_count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Level is derived by the shared `athleteLevel()` util (lib/dashboard/v2/level)
// so every surface — and every lane within this screen — agrees on the rung.

/** True when the athlete has no usable plan / a structurally broken week. */
function hasPlanGap(a: AthleteRow): boolean {
  return (
    a.programming_status === 'no_month' ||
    a.programming_status === 'month_2_pending' ||
    a.programming_status === 'empty_week'
  );
}

/** True when the athlete has a fatigue/readiness biometric flag. */
function hasPhysiologyFlag(a: AthleteRow): boolean {
  return a.readiness_score != null && readinessBucket(a.readiness_score) !== 'ok';
}

/** True when adherence is below the attention threshold. */
function lowAdherence(a: AthleteRow): boolean {
  return a.compliance_pct != null && a.compliance_pct < COMPLIANCE_ATTENTION_MAX;
}

// ── Builders per lane ─────────────────────────────────────────────────────────

function fallaReason(a: AthleteRow, inactivityDays: number | null): string {
  if (a.programming_status === 'no_month') return 'Sin plan activo esta semana.';
  if (a.programming_status === 'month_2_pending') return 'Falta el siguiente bloque del plan.';
  if (a.programming_status === 'empty_week') return 'Semana sin sesiones programadas.';
  if (inactivityDays != null) return `${inactivityDays} días sin completar ni registrar nada.`;
  if (a.compliance_pct != null) return `Solo ${a.compliance_pct}% de la semana completado.`;
  return 'Sesiones sin completar esta semana.';
}

function physioReason(a: AthleteRow): string {
  if (a.alert_label) return a.alert_label;
  if (a.readiness_score != null) {
    const bucket = readinessBucket(a.readiness_score);
    return bucket === 'low'
      ? `Readiness en rojo (${a.readiness_score}%) — fatiga alta.`
      : `Readiness con cautela (${a.readiness_score}%).`;
  }
  return 'Señal fisiológica a vigilar.';
}

// ── Public assembler ──────────────────────────────────────────────────────────

export function buildHoyLanes(params: {
  athletes: AthleteRow[];
  threads: CoachThreadSummary[];
  inbox: CoachInbox | null;
}): V2HoyData {
  const { athletes, threads, inbox } = params;

  // Inactivity days by athlete (reinforces "falló sesiones" reasons).
  const inactivityByAthlete = new Map<string, number>();
  for (const item of inbox?.items ?? []) {
    if (item.type === 'alert_inactivity') {
      inactivityByAthlete.set(item.athlete_id, item.days_inactive);
    }
  }

  const fallo: V2LaneCard[] = [];
  const listo: V2LaneCard[] = [];
  const vigilar: V2LaneCard[] = [];
  const flaggedAthleteIds = new Set<string>();

  // Level per athlete from the shared util — the espera-respuesta lane (built
  // from threads, which carry no modality) reuses this so the SAME athlete shows
  // the SAME level in every lane.
  const levelByAthlete = new Map<string, string | null>();
  for (const a of athletes) {
    levelByAthlete.set(a.athlete_id, athleteLevel(a));
  }

  for (const a of athletes) {
    const level = levelByAthlete.get(a.athlete_id) ?? athleteLevel(a);
    const base = {
      athlete_id: a.athlete_id,
      athlete_name: a.full_name,
      level,
      readiness_score: a.readiness_score,
      age_label: null,
      unread_count: null,
    };
    const inactivity = inactivityByAthlete.get(a.athlete_id) ?? null;

    // Priority order: falló (missed work / plan gap) wins, then vigilar
    // (biometric), then listo (earned progress). One lane per athlete.
    if (lowAdherence(a) || hasPlanGap(a) || inactivity != null) {
      flaggedAthleteIds.add(a.athlete_id);
      fallo.push({
        ...base,
        id: `fallo:${a.athlete_id}`,
        reason: fallaReason(a, inactivity),
        adherence_pct: a.compliance_pct,
        actions: hasPlanGap(a) ? ['ver', 'ajustar_fase'] : ['ver', 'mensaje'],
      });
      continue;
    }
    if (hasPhysiologyFlag(a)) {
      flaggedAthleteIds.add(a.athlete_id);
      vigilar.push({
        ...base,
        id: `vigilar:${a.athlete_id}`,
        reason: physioReason(a),
        adherence_pct: a.compliance_pct,
        actions: ['ver', 'descargar_carga'],
      });
      continue;
    }
    // Listo: clean week + strong adherence + no flags (derived heuristic).
    if (a.week_ok && a.compliance_pct != null && a.compliance_pct >= READY_ADHERENCE_MIN) {
      listo.push({
        ...base,
        id: `listo:${a.athlete_id}`,
        reason: `Semana al ${a.compliance_pct}% sin incidencias — lista para subir carga.`,
        adherence_pct: a.compliance_pct,
        actions: ['ver', 'ajustar_fase'],
      });
    }
  }

  // Espera respuesta — every thread the athlete is waiting on. Oldest first so
  // the coach clears the most-ghosted athlete first (matches v1 message sort).
  const waiting = threads.filter((t) => t.unread_count > 0);
  const espera: V2LaneCard[] = waiting
    .slice()
    .sort((x, y) => {
      const xt = x.last_message_at ? Date.parse(x.last_message_at) : Infinity;
      const yt = y.last_message_at ? Date.parse(y.last_message_at) : Infinity;
      return xt - yt; // oldest first
    })
    .map((t) => ({
      id: `espera:${t.thread_id}`,
      athlete_id: t.athlete_id,
      athlete_name: t.athlete_full_name,
      // Threads carry no modality — resolve the level from the roster map so this
      // lane agrees with the roster lanes. Null when the athlete isn't on the
      // roster (e.g. a thread with an athlete outside the current coach filter).
      level: levelByAthlete.get(t.athlete_id) ?? null,
      reason: oneLine(t.last_message_body) || 'Mensaje sin responder.',
      adherence_pct: null,
      readiness_score: null,
      age_label: t.last_message_at ? formatRelative(t.last_message_at) : null,
      unread_count: t.unread_count,
      actions: ['responder', 'ver'],
    }));

  const lanes: V2Lane[] = [
    {
      id: 'fallo_sesiones',
      title: 'Falló sesiones',
      dot_var: '--v2-mod-carrera',
      cards: fallo,
      count: fallo.length,
    },
    {
      id: 'listo_progresar',
      title: 'Listo para progresar',
      dot_var: '--v2-ok',
      cards: listo,
      count: listo.length,
    },
    {
      id: 'vigilar_fisiologia',
      title: 'Vigilar fisiología',
      dot_var: '--v2-warn',
      cards: vigilar,
      count: vigilar.length,
    },
    {
      id: 'espera_respuesta',
      title: 'Espera respuesta',
      dot_var: '--v2-info',
      cards: espera,
      count: espera.length,
    },
  ];

  // Athletes waiting on a reply, counted distinctly (a thread is per-athlete).
  const awaitingIds = new Set(waiting.map((t) => t.athlete_id));

  return {
    lanes,
    total_athletes: athletes.length,
    need_attention_count: flaggedAthleteIds.size,
    awaiting_reply_count: awaitingIds.size,
  };
}

/** Collapse a body to one tidy line for a card reason. */
function oneLine(body: string | null): string {
  return (body ?? '').replace(/\s+/g, ' ').trim();
}
