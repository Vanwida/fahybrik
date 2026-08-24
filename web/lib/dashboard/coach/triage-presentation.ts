// Triage presentation — the single source of truth that turns a raw signal_kind
// (from loadAttentionQueue) into everything the /hoy UI needs to paint and route
// it: semantic tier (color+icon+label via status-semantics), a deep-link target,
// and which lens it belongs to (SPEC §4 zones 1-2). Keeping this in ONE place
// means TriageCard, TriageQueue (lens filtering) and AthleteSidePanel agree.
//
// Client-safe (no server-only imports): consumed by the client orchestrator.

import type { SignalKind } from '@fahybrid/shared/domain/coach/signals';
import type { SemanticTier } from '@/lib/dashboard/constants/status-semantics';

/** The lenses surfaced as tabs (SPEC §4 zone 1). `all` always present. */
export type TriageLens =
  | 'all'
  | 'missed'
  | 'microcycle'
  | 'unanswered'
  | 'readiness';

/** Deep-link target for a signal, parameterised by athlete id. */
export type SignalDeepLink = (athleteId: string) => string;

export interface SignalPresentation {
  /** Semantic tier when no per-instance severity overrides it. */
  tier: SemanticTier;
  /** Material Symbols icon for the reason chip. */
  icon: string;
  /** Short reason-chip copy (es-ES). */
  label: string;
  /** Where "Abrir" navigates for this signal kind. */
  deepLink: SignalDeepLink;
  /** Lens this signal belongs to (besides `all`); null = only in `all`. */
  lens: Exclude<TriageLens, 'all'> | null;
}

// Deep-link builders (SPEC §4 per-type targets). Intake's target lives in the
// inbox-path adapter (decisions don't route through this signal map).
const toPlanReview: SignalDeepLink = (id) => `/atletas/${id}/plan?focus=review`;
// La ficha manda su sub-vista con `?tab=` (ver DetalleTabBar): `?section=` no lo
// lee nadie, así que estas señales aterrizaban en la pestaña por defecto en vez
// de en el cuerpo del atleta.
const toBody: SignalDeepLink = (id) => `/atletas/${id}?tab=biometria`;
const toFicha: SignalDeepLink = (id) => `/atletas/${id}`;
/** Lo que el coach le publicó y el atleta no ha cerrado vive en «Del coach». */
const toDelCoach: SignalDeepLink = (id) => `/atletas/${id}?tab=del-coach`;

/**
 * Per signal_kind presentation. Decision kinds (intake/week_adjustment/
 * monthly_block) are intentionally absent here — those render from the inbox
 * path with their rich proposal payload + approve endpoints (see TriageQueue).
 * Every other backed kind has an entry; unknown kinds fall back to neutral.
 */
const SIGNAL_PRESENTATION: Partial<Record<SignalKind, SignalPresentation>> = {
  hrv_crash: {
    tier: 'error',
    icon: 'monitor_heart',
    label: 'Caída de HRV',
    deepLink: toBody,
    lens: 'readiness',
  },
  no_sync: {
    tier: 'warning',
    icon: 'sync_problem',
    label: 'Sin sincronizar',
    deepLink: toBody,
    lens: null,
  },
  missed_sessions: {
    tier: 'warning',
    icon: 'event_busy',
    label: 'Sesiones perdidas',
    deepLink: toPlanReview,
    lens: 'missed',
  },
  rpe_high: {
    tier: 'warning',
    icon: 'whatshot',
    label: 'RPE alto',
    deepLink: toBody,
    lens: 'readiness',
  },
  checkin_skipped: {
    tier: 'warning',
    icon: 'assignment_late',
    label: 'Sin check-in',
    deepLink: toBody,
    lens: 'readiness',
  },
  message_unanswered: {
    tier: 'info',
    icon: 'forum',
    label: 'Sin responder',
    deepLink: toFicha,
    lens: 'unanswered',
  },
  readiness_low: {
    tier: 'warning',
    icon: 'battery_alert',
    label: 'Readiness baja',
    deepLink: toBody,
    lens: 'readiness',
  },
  transition_ready: {
    tier: 'info',
    icon: 'trending_up',
    label: 'Listo para avanzar',
    deepLink: toPlanReview,
    lens: 'microcycle',
  },
  programming_status: {
    tier: 'error',
    icon: 'calendar_month',
    label: 'Sin plan',
    deepLink: toPlanReview,
    lens: 'microcycle',
  },
  microcycle_ending: {
    tier: 'warning',
    icon: 'calendar_clock',
    label: 'Ciclo acaba',
    deepLink: toPlanReview,
    lens: 'microcycle',
  },
  a_event_near: {
    tier: 'info',
    icon: 'flag',
    label: 'Competición cerca',
    deepLink: toPlanReview,
    lens: null,
  },
  billing_at_risk: {
    tier: 'warning',
    icon: 'credit_card_off',
    label: 'Cobro en riesgo',
    deepLink: toFicha,
    lens: null,
  },
  workout_libre: {
    tier: 'info',
    icon: 'fitness_center',
    label: 'Entreno libre',
    deepLink: toFicha,
    lens: null,
  },
  // Comunicados del coach: los tres abren la pestaña donde está el seguimiento
  // de ese atleta, que es desde donde se le insiste o se le cambia el plan.
  communication_question_unanswered: {
    tier: 'warning',
    icon: 'help',
    label: 'Pregunta sin responder',
    deepLink: toDelCoach,
    lens: 'unanswered',
  },
  communication_task_overdue: {
    tier: 'warning',
    icon: 'assignment_late',
    label: 'Tarea vencida',
    deepLink: toDelCoach,
    lens: null,
  },
  communication_protocol_unopened: {
    tier: 'warning',
    icon: 'checklist',
    label: 'Protocolo sin abrir',
    deepLink: toDelCoach,
    lens: null,
  },
};

const FALLBACK: SignalPresentation = {
  tier: 'neutral',
  icon: 'info',
  label: 'Señal',
  deepLink: toFicha,
  lens: null,
};

/** Resolve presentation for a signal kind, falling back to neutral. */
export function presentSignal(kind: string): SignalPresentation {
  return SIGNAL_PRESENTATION[kind as SignalKind] ?? FALLBACK;
}

/** Map a raw signal severity to its semantic tier (live severity wins). */
export function tierForSignalSeverity(
  severity: 'critical' | 'warning' | 'info',
): SemanticTier {
  if (severity === 'critical') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}
