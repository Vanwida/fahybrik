// @fahybrid/shared/domain/coach/athlete-state — EL estado de un atleta para el
// coach. Un modelo para Hoy, Atletas, Mensajes y la ficha (plan §4.1).
//
// Antes había tres definiciones de «Atención» (roster: readiness < 55 o hueco de
// plan · Hoy: < 67, cumplimiento < 70, 2 días quietos · Mensajes: otra más) y
// «Sin plan» no podía salir nunca porque el hueco de plan pintaba «Atención»
// antes (informe B, R6/R7). Aquí el estado se DERIVA de una sola fuente:
//   - las señales del motor (`coach_attention_items`, sin las silenciadas por el
//     coach en `coach_alert_overrides`),
//   - el ciclo de vida (pausado / baja),
//   - el alta pendiente (cuestionario terminado sin revisar),
//   - el estado del plan (sin programa nunca / programa terminado sin siguiente).
//
// Precedencia (la primera que aplica):
//   pausado  > accion (alguna señal crítica) > nuevo (alta pendiente, o invitado
//            sin cuestionario) > sin_plan > vigilar (alguna señal de vigilar, o
//            su semana oculta) > al_dia
// El hueco de plan y el alta NO elevan a «acción» por sí mismos: son estados, y
// «Sin plan» tiene que poder leerse. Una semana oculta al atleta NO es «Al día».
//
// «Te necesita» (`needs_you`) es UNA definición, la misma para la cifra de Hoy,
// su insignia y la vista «Necesitan algo» de Atletas (DECISIONS 2026-09-23,
// «Una sola cuenta de quién te necesita»): atleta activo con alguna de
//   - una señal crítica o de vigilar (viva, ya reconciliada con los hechos),
//   - el alta pendiente,
//   - hueco de plan (sin programa o terminado; no el invitado sin cuestionario),
//   - su semana oculta (la de ahora, o la que viene cuando por la regla del
//     coach ya debería verse),
//   - un mensaje suyo por responder (la regla de Mensajes, desde el primer
//     minuto y en cualquier estado del atleta: alguien espera respuesta).
// Hoy pinta eso como grupos + filas; la cifra cuenta ATLETAS, no filas.
//
// «Sin plan» es UNA definición (`isWithoutPlan`), la misma para el grupo de Hoy
// «N sin programa», el estado y el chip «Sin plan» de Atletas: atleta activo,
// con el alta ya revisada, sin programa ni entrenos del coach de esta semana en
// adelante. Quien tiene su programa empezando la semana que viene NO está sin
// plan («Empieza pronto»).
//
// Puro: sin base de datos.

import {
  SIGNAL_SEVERITY_RANK,
  type SignalKind,
  type SignalSeverity,
} from './signals';

export type StatusTone = 'danger' | 'warn' | 'ok' | 'info' | 'neutral';
export type AthleteStatusKey = 'accion' | 'vigilar' | 'nuevo' | 'sin_plan' | 'al_dia' | 'pausado';
export type SignalAction =
  | 'responder'
  | 'proponer_descarga'
  | 'publicar_semana'
  | 'asignar_programa'
  | 'revisar_alta'
  | 'recordar_pago'
  | 'mensaje'
  | 'ver_semana'
  | 'abrir_ficha';

/** El filtro de Hoy al que pertenece una señal (chips «Por responder», «Sesiones»…). */
export type SignalLens = 'mensajes' | 'sesiones' | 'fisiologia' | 'plan' | 'altas' | 'cobros';

export interface AthleteSignal {
  kind: SignalKind;
  severity: SignalSeverity;
  /** «Readiness 31», «2 de 4 debidas sin hacer», «Pago vencido». */
  label: string;
  /** «−24 vs su base 55 · 3 días seguidos · hoy» — valor, base, ventana y fecha. */
  evidence: string;
  value: number | null;
  baseline: number | null;
  window_label: string | null;
  /** ISO — cuándo se observó lo que dice la señal (la lectura, el mensaje…). */
  observed_at: string | null;
  action: SignalAction;
  lens: SignalLens;
  /** ISO — desde cuándo la ve el motor (la «edad» de la fila en Hoy). */
  first_seen_at: string | null;
  /** Identidad de la instancia (propuesta, comunicado, episodio…). */
  dedupe_key: string;
}

export interface AthleteStatus {
  key: AthleteStatusKey;
  tone: StatusTone;
  label: string;
  reason: string | null;
  /** Peor primero. Incluye las informativas (p. ej. «Listo para progresar»). */
  signals: AthleteSignal[];
  /** Si alguna señal está pospuesta, hasta cuándo (la más tardía). */
  snoozed_until: string | null;
  /** ¿Te necesita? La cuenta de Hoy y la vista «Necesitan algo» (ver arriba). */
  needs_you: boolean;
}

// ── Qué hace el coach con cada señal y en qué filtro vive ─────────────────────

export const SIGNAL_ACTION: Record<SignalKind, SignalAction> = {
  hrv_crash: 'proponer_descarga',
  no_sync: 'mensaje',
  missed_sessions: 'mensaje',
  rpe_high: 'proponer_descarga',
  discomfort_reported: 'abrir_ficha',
  checkin_skipped: 'mensaje',
  message_unanswered: 'responder',
  readiness_low: 'proponer_descarga',
  transition_ready: 'asignar_programa',
  programming_status: 'asignar_programa',
  microcycle_ending: 'asignar_programa',
  a_event_near: 'ver_semana',
  test_logged: 'abrir_ficha',
  race_completed: 'abrir_ficha',
  workout_libre: 'abrir_ficha',
  intake_pending: 'revisar_alta',
  week_adjustment_pending: 'ver_semana',
  monthly_block_pending: 'abrir_ficha',
  billing_at_risk: 'recordar_pago',
  test_due: 'abrir_ficha',
  communication_question_unanswered: 'mensaje',
  communication_task_overdue: 'mensaje',
  communication_protocol_unopened: 'mensaje',
  review_1on1_due: 'abrir_ficha',
  video_review_pending: 'abrir_ficha',
  mass_adjustment_pending: 'ver_semana',
  compliance_drop: 'mensaje',
};

export const SIGNAL_LENS: Record<SignalKind, SignalLens> = {
  hrv_crash: 'fisiologia',
  no_sync: 'fisiologia',
  missed_sessions: 'sesiones',
  rpe_high: 'sesiones',
  discomfort_reported: 'fisiologia',
  checkin_skipped: 'fisiologia',
  message_unanswered: 'mensajes',
  readiness_low: 'fisiologia',
  transition_ready: 'plan',
  programming_status: 'plan',
  microcycle_ending: 'plan',
  a_event_near: 'plan',
  test_logged: 'sesiones',
  race_completed: 'sesiones',
  workout_libre: 'sesiones',
  intake_pending: 'altas',
  week_adjustment_pending: 'plan',
  monthly_block_pending: 'plan',
  billing_at_risk: 'cobros',
  test_due: 'plan',
  communication_question_unanswered: 'plan',
  communication_task_overdue: 'plan',
  communication_protocol_unopened: 'plan',
  review_1on1_due: 'plan',
  video_review_pending: 'sesiones',
  mass_adjustment_pending: 'plan',
  compliance_drop: 'sesiones',
};

/**
 * La acción de UNA señal: la de su tipo, con los matices de la instancia.
 *   - Cancelar la suscripción no se «recuerda»: se habla con el atleta.
 *   - Una semana vacía con programa se mira; sin programa se asigna.
 *   - Un readiness bajo de alguien SIN base todavía no justifica una descarga:
 *     la acción es preguntarle cómo está (la descarga pide evidencia).
 */
export function signalActionFor(s: {
  kind: SignalKind;
  severity: SignalSeverity;
  dedupe_key: string;
  baseline: number | null;
}): SignalAction {
  if (s.kind === 'billing_at_risk' && s.severity !== 'critical') return 'mensaje';
  if (s.kind === 'programming_status' && s.dedupe_key.endsWith(':empty_week')) return 'ver_semana';
  if (s.kind === 'readiness_low' && s.baseline == null) return 'mensaje';
  return SIGNAL_ACTION[s.kind];
}

/**
 * Dentro de una misma severidad, qué va antes («peor primero»): lo que afecta al
 * cuerpo del atleta, luego lo que espera al coach, luego las sesiones, luego el
 * plan. Menor = antes.
 */
const KIND_PRIORITY: SignalKind[] = [
  'readiness_low',
  'hrv_crash',
  'discomfort_reported',
  'message_unanswered',
  'billing_at_risk',
  'missed_sessions',
  'rpe_high',
  'communication_task_overdue',
  'communication_question_unanswered',
  'communication_protocol_unopened',
  'intake_pending',
  'week_adjustment_pending',
  'monthly_block_pending',
  'programming_status',
  'microcycle_ending',
  'checkin_skipped',
  'review_1on1_due',
  'no_sync',
  'transition_ready',
  'test_due',
  'test_logged',
  'race_completed',
  'a_event_near',
  'workout_libre',
  'video_review_pending',
  'mass_adjustment_pending',
  'compliance_drop',
];
const KIND_RANK = new Map<SignalKind, number>(KIND_PRIORITY.map((k, i) => [k, i]));

/**
 * Cuánto de mal está una señal frente a otra DEL MISMO TIPO (mayor = peor), o
 * null si el tipo no se gradúa. «3 de 5 sin hacer» es peor que «2 de 6»: se mira
 * la proporción de lo debido y, a igualdad, el número; un readiness más bajo es
 * peor. Sin esto el orden dentro de Vigilar era la edad de la fila.
 */
function signalBadness(s: Pick<AthleteSignal, 'kind' | 'value' | 'baseline'>): [number, number] | null {
  if (s.value == null) return null;
  if (s.kind === 'missed_sessions' || s.kind === 'rpe_high') {
    return [s.baseline != null && s.baseline > 0 ? s.value / s.baseline : 0, s.value];
  }
  if (s.kind === 'readiness_low') return [-s.value, 0];
  return null;
}

/** Peor primero: severidad, prioridad del tipo, gravedad dentro del tipo y, al final, la más antigua. */
export function compareSignals(a: AthleteSignal, b: AthleteSignal): number {
  const bySev = SIGNAL_SEVERITY_RANK[a.severity] - SIGNAL_SEVERITY_RANK[b.severity];
  if (bySev !== 0) return bySev;
  const byKind = (KIND_RANK.get(a.kind) ?? 99) - (KIND_RANK.get(b.kind) ?? 99);
  if (byKind !== 0) return byKind;
  const ba = signalBadness(a);
  const bb = signalBadness(b);
  if (ba && bb) {
    if (bb[0] !== ba[0]) return bb[0] - ba[0];
    if (bb[1] !== ba[1]) return bb[1] - ba[1];
  }
  return (a.first_seen_at ?? '').localeCompare(b.first_seen_at ?? '');
}

export function sortSignals(signals: ReadonlyArray<AthleteSignal>): AthleteSignal[] {
  return [...signals].sort(compareSignals);
}

/**
 * ¿La señal la cubre un GRUPO de Hoy (causa compartida) en vez de una fila?
 *   - el alta pendiente → «N altas pendientes»;
 *   - el pago vencido → «N pagos vencidos»;
 *   - sin programa / programa terminado → «N atletas sin programa»;
 *   - el mensaje por responder → «N por responder» (cada espera se cierra en su
 *     hilo o en el filtro «Por responder», no con el «Hecho» de otra fila).
 * Una semana vacía con programa NO: es de ese atleta. Lo usan Hoy (no repetir
 * como fila) y posponer/hecho de una fila (no silenciar el grupo sin querer).
 */
export function isGroupOwnedSignal(
  s: Pick<AthleteSignal, 'kind' | 'severity' | 'dedupe_key'>,
): boolean {
  if (s.kind === 'intake_pending') return true;
  if (s.kind === 'message_unanswered') return true;
  if (s.kind === 'billing_at_risk') return s.severity === 'critical';
  return isPlanGapSignal(s);
}

/** «Sin programa» / «programa terminado» del motor (no la semana vacía). */
export function isPlanGapSignal(s: Pick<AthleteSignal, 'kind' | 'dedupe_key'>): boolean {
  return (
    s.kind === 'programming_status' &&
    (s.dedupe_key.endsWith(':no_month') || s.dedupe_key.endsWith(':block_ended'))
  );
}

/** Crítica o vigilar: lo que pide acción (las informativas no). */
export function isActionable(s: Pick<AthleteSignal, 'severity'>): boolean {
  return s.severity === 'critical' || s.severity === 'warning';
}

// ── Derivación del estado ─────────────────────────────────────────────────────

export type PlanState = 'con_programa' | 'sin_programa' | 'terminado';

export interface AthleteStateInput {
  lifecycle: 'activo' | 'pausado' | 'baja';
  /** Motivo de la pausa en palabras del coach («Lesión», «Vacaciones»…), o null. */
  pause_label?: string | null;
  /** Alta pendiente: terminó el cuestionario y el coach no lo ha revisado. */
  intake_pending: boolean;
  /** ISO de cuando terminó el cuestionario (para «hace 2 d»). */
  intake_since?: string | null;
  /** Invitado que aún no ha terminado el cuestionario de entrada. */
  not_onboarded?: boolean;
  plan: PlanState;
  /** YYYY-MM-DD de cuando terminó su último programa (si `terminado`). */
  plan_ended_on?: string | null;
  /** Señales VIVAS (ya sin las silenciadas por el coach, y reconciliadas). */
  signals: ReadonlyArray<AthleteSignal>;
  /**
   * Su semana está oculta al atleta: `actual` (la de ahora tiene entrenos y no
   * la ve) o `siguiente` (la que viene, cuando ya debería verse). null = la ve.
   */
  week_hidden?: 'actual' | 'siguiente' | null;
  /** Esa semana la retuvo el coach a mano. */
  week_held?: boolean;
  snoozed_until?: string | null;
  /** Tiene un mensaje por responder (la regla de Mensajes: ni hecho ni pospuesto). */
  awaiting_reply?: boolean;
  /** Para decir «hace 2 d». */
  now: Date;
}

const STATUS_VIEW: Record<AthleteStatusKey, { tone: StatusTone; label: string }> = {
  accion: { tone: 'danger', label: 'Acción' },
  vigilar: { tone: 'warn', label: 'Vigilar' },
  nuevo: { tone: 'info', label: 'Alta pendiente' },
  sin_plan: { tone: 'warn', label: 'Sin plan' },
  al_dia: { tone: 'ok', label: 'Al día' },
  pausado: { tone: 'neutral', label: 'En pausa' },
};

/** Tipos que ya dicen el estado (alta y hueco de plan): no elevan a acción/vigilar. */
const STATE_OWNED_KINDS: ReadonlySet<SignalKind> = new Set(['intake_pending']);

function signalReason(s: AthleteSignal): string {
  return s.evidence ? `${s.label} · ${s.evidence}` : s.label;
}

/**
 * ¿Está sin plan? LA definición de «Sin plan» (Hoy «N sin programa», el estado y
 * el chip de Atletas): activo, alta revisada (ni invitado ni alta pendiente) y
 * sin programa ni entrenos del coach de esta semana en adelante.
 */
export function isWithoutPlan(
  input: Pick<AthleteStateInput, 'lifecycle' | 'intake_pending' | 'not_onboarded' | 'plan'>,
): boolean {
  return (
    input.lifecycle === 'activo' &&
    input.plan !== 'con_programa' &&
    !input.intake_pending &&
    !input.not_onboarded
  );
}

/**
 * ¿Te necesita este atleta? LA definición (Hoy, su insignia y «Necesitan algo»).
 * Pura; las señales ya vivas y reconciliadas (`reconcileSignals`).
 */
export function athleteNeedsYou(
  input: Pick<
    AthleteStateInput,
    'lifecycle' | 'intake_pending' | 'not_onboarded' | 'plan' | 'signals' | 'week_hidden' | 'awaiting_reply'
  >,
): boolean {
  // Alguien que espera respuesta te necesita, esté como esté (Mensajes lo cuenta igual).
  if (input.awaiting_reply) return true;
  if (input.lifecycle !== 'activo') return false;
  // El alta y el hueco de plan se juzgan por los hechos (abajo), no por la señal:
  // así un invitado sin cuestionario no «necesita» un programa todavía.
  const bySignal = input.signals.some(
    (s) => isActionable(s) && s.kind !== 'intake_pending' && !isPlanGapSignal(s),
  );
  if (bySignal) return true;
  if (input.intake_pending) return true;
  if (isWithoutPlan(input)) return true;
  return input.week_hidden != null;
}

/**
 * Las señales persistidas por el motor que hablan de algo que el panel ya sabe
 * AHORA se reconcilian con ese dato fresco (el barrido corre cada 15 min y un
 * «asignar» o una respuesta no esperan a él):
 *   - `programming_status` (sin programa · terminado · semana vacía) solo sigue
 *     viva si el estado de programación actual es el mismo que dice su clave;
 *   - `message_unanswered` solo sigue viva si el hilo sigue por responder
 *     (cuando se conoce: `awaiting_reply` undefined = no se sabe, se deja).
 */
export function reconcileSignals(
  signals: ReadonlyArray<AthleteSignal>,
  now: { programming_status: string; awaiting_reply?: boolean },
): AthleteSignal[] {
  return signals.filter((s) => {
    if (s.kind === 'programming_status') {
      return s.dedupe_key.endsWith(`:${now.programming_status}`);
    }
    if (s.kind === 'message_unanswered' && now.awaiting_reply === false) return false;
    return true;
  });
}

/** El único derivador del estado. Puro. */
export function deriveAthleteStatus(input: AthleteStateInput): AthleteStatus {
  const signals = sortSignals(input.signals);
  const snoozed_until = input.snoozed_until ?? null;
  const needs_you = athleteNeedsYou(input);
  const base = (key: AthleteStatusKey, reason: string | null, label?: string): AthleteStatus => ({
    key,
    tone: STATUS_VIEW[key].tone,
    label: label ?? STATUS_VIEW[key].label,
    reason,
    signals,
    snoozed_until,
    needs_you,
  });

  if (input.lifecycle !== 'activo') {
    return input.lifecycle === 'baja'
      ? base('pausado', null, 'Baja')
      : base('pausado', input.pause_label ?? null);
  }

  // Un programa ausente o terminado lo dice el estado, no una señal de «acción».
  const planGap = input.plan !== 'con_programa';
  const counted = signals.filter(
    (s) =>
      isActionable(s) &&
      !STATE_OWNED_KINDS.has(s.kind) &&
      !(planGap && s.kind === 'programming_status'),
  );

  const critical = counted.find((s) => s.severity === 'critical');
  if (critical) return base('accion', signalReason(critical));

  if (input.intake_pending) {
    const since = input.intake_since ? ageLabel(input.intake_since, input.now) : null;
    return base('nuevo', since ? `Terminó el cuestionario hace ${since}` : 'Cuestionario de entrada por revisar');
  }

  if (input.not_onboarded) {
    // Nada que hacer hasta que termine el cuestionario: nuevo, no «sin plan».
    return base('nuevo', 'Todavía no ha terminado el cuestionario de entrada', 'Invitado');
  }

  if (planGap) {
    const reason =
      input.plan === 'terminado'
        ? input.plan_ended_on
          ? `Su programa terminó el ${shortDate(input.plan_ended_on)} y no tiene siguiente`
          : 'Su programa terminó y no tiene siguiente'
        : 'Todavía no tiene programa';
    return base('sin_plan', reason);
  }

  const warning = counted.find((s) => s.severity === 'warning');
  if (warning) return base('vigilar', signalReason(warning));

  if (input.week_hidden) {
    const which = input.week_hidden === 'actual' ? 'Su semana' : 'La semana que viene';
    return base(
      'vigilar',
      input.week_held ? `${which} está retenida por ti` : `${which} está oculta al atleta`,
    );
  }

  return base('al_dia', null);
}

// ── Vocabulario de fechas del panel (plan §2: «22 sept», «24 d · 17 oct») ──────

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sept',
  'oct',
  'nov',
  'dic',
] as const;

/** «22 sept». Una fecha ilegible vuelve tal cual. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!m || !d || m < 1 || m > 12) return iso;
  return `${d} ${MESES_CORTOS[m - 1]}`;
}

/** «hoy», «ayer» o «22 sept», respecto al día `today` (ambos YYYY-MM-DD). */
export function relativeDay(iso: string, today: string): string {
  const day = iso.slice(0, 10);
  if (day === today) return 'hoy';
  const t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const d = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  if (t - d === 86_400_000) return 'ayer';
  return shortDate(day);
}

/** «ahora», «40 min», «5 h», «3 d» desde `iso` hasta `now`. */
export function ageLabel(iso: string, now: Date): string {
  const min = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** «1 día» / «3 días». */
export function dias(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}
