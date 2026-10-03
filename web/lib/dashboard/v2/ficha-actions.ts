// «Hacer ahora» de la ficha — las acciones que tocan a ESTE atleta, sacadas de las
// MISMAS señales que Hoy (coach_attention_items vía el estado §4.1) y de los hechos
// que la cabecera ya trae (semana oculta, debida sin hacer, check-in sin contestar).
// Antes era «N cosas tuyas pendientes» y no veía ni la semana oculta (H2). Puro.

import { SIGNAL_SEVERITY_RANK, worseSeverity, type SignalKind, type SignalSeverity } from '@fahybrid/shared/domain/coach/signals';
import { shortDate, sortSignals, type AthleteSignal, type SignalAction } from '@fahybrid/shared/domain/coach/athlete-state';
import { weekdayLabelLong } from './ficha-dates';
import type { FichaShell } from './atleta-detalle-types';
import { weekRangeLabel } from './ficha-format';
import { proposalIdFromSignal } from './week-adjustment-period';

export type HacerAhoraKind =
  | 'publicar'
  | 'responder'
  | 'ajustar'
  | 'descarga'
  | 'evaluar'
  | 'alta'
  | 'pago'
  | 'comunicado'
  | 'asignar'
  | 'revision'
  | 'senal';

export interface HacerAhoraChip {
  key: string;
  kind: HacerAhoraKind;
  label: string;
  /** Causa y evidencia juntas con su control, sin elipsis ni otra franja. */
  cause: string;
  evidence: string[];
  severity: SignalSeverity;
  /** Identidades cubiertas por el control; no se deduplica por texto. */
  source_keys: string[];
  href?: string;
  action?: SignalAction;
  /** Semana sobre la que actúa (publicar, descarga, evaluar). */
  week_start?: string;
  /** Entreno que abre (ajustar). */
  session_id?: string;
  /** Propuesta concreta serializada en la identidad de la señal. */
  proposal_id?: string;
}

/** Una acción a primera vista; las demás siguen accesibles en el pliegue. */
export const HACER_AHORA_MAX = 1;

/**
 * Hasta dónde atrás un entreno sin hacer sigue siendo una ACCIÓN («Ajustar …»):
 * la semana en curso o los 7 días anteriores (lo que llegue más atrás, que siempre
 * son los 7 días: el lunes de esta semana cae dentro). Más viejo es historia: cuenta
 * en la adherencia, no pide nada hoy. Mecanismo de la ficha, no método: no cambia
 * qué es «sin hacer», solo qué se ofrece como botón.
 */
export const MISSED_ACTIONABLE_DAYS = 7;

/** Días entre dos fechas YYYY-MM-DD (b − a). */
function daysBetween(a: string, b: string): number {
  const t = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** ¿Este entreno sin hacer todavía se puede ajustar hoy? */
export function missedIsActionable(missed_date: string, today: string): boolean {
  const age = daysBetween(missed_date, today);
  const sinceMonday = daysBetween(mondayOf(today), today);
  return age >= 0 && age <= Math.max(MISSED_ACTIONABLE_DAYS, sinceMonday);
}

const COMUNICADO_KINDS: ReadonlySet<SignalKind> = new Set([
  'communication_question_unanswered',
  'communication_task_overdue',
  'communication_protocol_unopened',
]);

/** Lunes de la semana de `iso` (YYYY-MM-DD). */
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

export function buildHacerAhora(shell: FichaShell): HacerAhoraChip[] {
  const out: HacerAhoraChip[] = [];
  const paused = shell.lifecycle.status !== 'activo';
  const base = `/atletas/${shell.athlete_id}`;
  type Input = Omit<HacerAhoraChip, 'cause' | 'evidence' | 'severity' | 'source_keys'> & Partial<Pick<HacerAhoraChip, 'cause' | 'evidence' | 'severity' | 'source_keys'>>;
  const push = (input: Input) => {
    const c: HacerAhoraChip = { cause: input.label, evidence: [], severity: 'warning', source_keys: [input.key], ...input };
    // Un control compartido (chat, una descarga de semana, historial) conserva
    // TODAS sus evidencias. Una revisión jamás se funde con una respuesta.
    const same = out.find((x) => x.kind === c.kind && x.href === c.href && x.week_start === c.week_start
      && x.session_id === c.session_id && x.proposal_id === c.proposal_id && (c.kind !== 'senal' || x.key === c.key));
    if (!same) { out.push(c); return; }
    if (c.source_keys.every((key) => same.source_keys.includes(key))) return;
    same.source_keys = [...new Set([...same.source_keys, ...c.source_keys])];
    same.evidence = [...same.evidence, ...c.evidence.map((e) => c.cause === same.cause ? e : `${c.cause}: ${e}`)];
    same.severity = worseSeverity(same.severity, c.severity);
  };

  if (shell.intake_pending) push({ key: 'alta', kind: 'alta', label: 'Revisar alta', cause: 'Alta pendiente',
    evidence: ['Cuestionario de entrada por revisar'], href: `${base}/intake` });
  if (!paused && !shell.intake_pending && !shell.has_upcoming_plan) {
    push({ key: 'asignar', kind: 'asignar', label: 'Asignar programa', cause: 'Sin programa', evidence: ['No tiene un plan de hoy en adelante'] });
  }
  // Una semana que se publicará sola en su día no es tarea del coach todavía.
  if (!paused && shell.publish_target?.due) {
    push({
      key: `publicar-${shell.publish_target.week_start}`,
      kind: 'publicar',
      label: `Publicar ${weekRangeLabel(shell.publish_target.week_start)}`,
      cause: 'Semana oculta',
      evidence: [`${shell.publish_target.sessions} entrenos · ya debería verla`],
      week_start: shell.publish_target.week_start,
    });
  }
  const ck = shell.last_checkin;
  if (ck && !ck.answered && ck.notes) {
    push({ key: 'responder-checkin', kind: 'responder', label: 'Responder', cause: 'Por responder',
      evidence: [`Check-in del ${shortDate(ck.on)}: «${ck.notes}»`] });
  }
  if (shell.awaiting_reply && !shell.status.signals.some((s) => s.kind === 'message_unanswered')) {
    push({ key: 'responder', kind: 'responder', label: 'Responder', cause: 'Por responder',
      evidence: ['Su conversación espera respuesta'] });
  }
  if (shell.last_missed && missedIsActionable(shell.last_missed.date, shell.today)) {
    push({
      key: `ajustar-${shell.last_missed.id}`,
      kind: 'ajustar',
      label: `Ajustar ${weekdayLabelLong(shell.last_missed.date)} (sin hacer)`,
      cause: 'Entreno sin hacer', evidence: [shell.last_missed.title],
      session_id: shell.last_missed.id,
    });
  }
  if (shell.pending_comunicados > 0) {
    const n = shell.pending_comunicados;
    push({
      key: 'comunicado',
      kind: 'comunicado',
      label: n > 1 ? `${n} comunicados pendientes` : 'Comunicado pendiente',
      cause: n > 1 ? `${n} comunicados pendientes` : 'Comunicado pendiente',
      evidence: ['Publicados, aún pendientes para el atleta'],
      href: `${base}?tab=perfil&seccion=historial&historial=comunicado`,
    });
  }

  const seen = new Set<string>();
  for (const s of shell.status.signals) {
    const key = `${s.kind}:${s.dedupe_key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fact = { source_keys: [key], severity: s.severity, cause: s.label,
      evidence: s.evidence ? [s.evidence] : [] };
    if (s.kind === 'message_unanswered') {
      push({ ...fact, key, kind: 'responder', label: 'Responder' });
    } else if (s.kind === 'review_1on1_due') {
      push({ ...fact, key, kind: 'revision', label: 'Revisar 1:1', href: `${base}?tab=perfil&seccion=revisiones` });
    } else if (COMUNICADO_KINDS.has(s.kind)) {
      const n = shell.pending_comunicados;
      push({ ...fact, key, kind: 'comunicado', label: n > 1 ? `${n} comunicados pendientes` : 'Comunicado pendiente',
        href: `${base}?tab=perfil&seccion=historial&historial=comunicado` });
    } else if (s.kind === 'intake_pending') {
      push({ ...fact, key, kind: 'alta', label: 'Revisar alta', href: `${base}/intake` });
    } else if (s.kind === 'week_adjustment_pending') {
      const id = proposalIdFromSignal(s.dedupe_key, shell.athlete_id);
      push({ ...fact, key, kind: 'evaluar', label: 'Revisar ajuste propuesto', proposal_id: id ?? undefined,
        evidence: id ? fact.evidence : [...fact.evidence, 'No se ha podido identificar el ajuste · actualiza la ficha'] });
    } else if (s.kind === 'billing_at_risk' && s.action === 'recordar_pago') {
      push({ ...fact, key, kind: 'pago', label: 'Recordar pago', href: `${base}?tab=perfil&seccion=pagos` });
    } else if (!paused && s.action === 'proponer_descarga') {
      push({ ...fact, key, kind: 'descarga', label: 'Proponer descarga', week_start: mondayOf(shell.today) });
    } else if (!paused && !shell.intake_pending && s.action === 'asignar_programa') {
      push({ ...fact, key, kind: 'asignar', label: 'Asignar programa' });
    } else {
      const destination = signalDestination(s, base);
      push({ ...fact, key, kind: 'senal', ...destination });
    }
  }
  // La prioridad es la misma del estado/Hoy. Los hechos sin señal conservan
  // su orden detrás de las señales de igual severidad; no desplazan su respuesta.
  const signalOrder = new Map<string, number>();
  sortSignals(shell.status.signals).forEach((s, i) => {
    const key = `${s.kind}:${s.dedupe_key}`;
    if (!signalOrder.has(key)) signalOrder.set(key, i);
  });
  const priority = (chip: HacerAhoraChip) => Math.min(...chip.source_keys.map((k) => signalOrder.get(k) ?? Infinity));
  return out.sort((a, b) => {
    const bySeverity = SIGNAL_SEVERITY_RANK[a.severity] - SIGNAL_SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const ap = priority(a), bp = priority(b);
    return ap === bp ? 0 : ap - bp;
  });
}

/** El dato de la señal decide su control; un plan pausado no se modifica aquí. */
function signalDestination(s: AthleteSignal, base: string): Pick<HacerAhoraChip, 'label' | 'href' | 'action'> {
  if (s.action === 'mensaje' || s.action === 'responder') return { label: 'Mensaje', action: 'mensaje' };
  if (s.kind === 'discomfort_reported') return { label: 'Revisar molestia', href: `${base}?tab=perfil&seccion=lesiones` };
  if (s.kind === 'video_review_pending') return { label: 'Revisar vídeo', href: `${base}?tab=perfil&seccion=revisiones` };
  if (['test_logged', 'race_completed', 'workout_libre', 'workout_off_plan'].includes(s.kind)) {
    return { label: 'Ver sesión', href: `${base}?tab=rendimiento&seccion=sesiones` };
  }
  return { label: 'Ver estado', href: `${base}?tab=plan#estado-atleta` };
}

/** Qué se conoce, sin traducir ausencia de lecturas a salud favorable. */
export function fichaStatusSummary(shell: FichaShell): string {
  const parts: string[] = [];
  if (shell.status.signals.length === 0 && shell.status.reason) parts.push(shell.status.reason);
  if (!shell.readiness) parts.push('Readiness sin datos');
  if (!shell.last_checkin) parts.push('Sin check-in');
  const adh = shell.adherence;
  if (adh && adh.due > 0) parts.push(`${adh.done} de ${adh.due} debidas hechas en ${adh.window_days} d`);
  return parts.join(' · ');
}

/** Una acción principal; el resto crítico sigue visible y lo demás se detalla. */
export function partitionHacerAhora(chips: ReadonlyArray<HacerAhoraChip>) {
  return {
    primary: chips.slice(0, HACER_AHORA_MAX),
    critical: chips.slice(HACER_AHORA_MAX).filter((c) => c.severity === 'critical'),
    remaining: chips.slice(HACER_AHORA_MAX).filter((c) => c.severity !== 'critical'),
  };
}

export type HacerAhoraCommand =
  | { kind: 'link'; href: string }
  | { kind: 'chat' }
  | { kind: 'session'; id: string }
  | { kind: 'deload'; week_start: string }
  | { kind: 'review_adjustment'; proposal_id: string }
  | { kind: 'assign' }
  | { kind: 'publish'; week_start: string };

/** El control del dato: la UI ejecuta este destino sin otra interpretación. */
export function hacerAhoraCommand(chip: HacerAhoraChip): HacerAhoraCommand | null {
  if (chip.href) return { kind: 'link', href: chip.href };
  if (chip.kind === 'responder' || chip.action === 'mensaje' || chip.action === 'responder') return { kind: 'chat' };
  if (chip.kind === 'ajustar' && chip.session_id) return { kind: 'session', id: chip.session_id };
  if (chip.kind === 'descarga' && chip.week_start) return { kind: 'deload', week_start: chip.week_start };
  if (chip.kind === 'evaluar' && chip.proposal_id) return { kind: 'review_adjustment', proposal_id: chip.proposal_id };
  if (chip.kind === 'asignar') return { kind: 'assign' };
  if (chip.kind === 'publicar' && chip.week_start) return { kind: 'publish', week_start: chip.week_start };
  return null;
}

/**
 * La línea del motivo bajo el estado: su razón y la evidencia de las señales
 * que pesan (peor primero), sin repetir. Nunca un «Atención» pelado.
 */
export function statusReasonParts(shell: Pick<FichaShell, 'status'>, max = 3): string[] {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const s of shell.status.signals) {
    if (s.severity === 'info' && s.label !== shell.status.label) continue;
    // La señal que da nombre al estado no se repite: basta su evidencia.
    const sameAsStatus = s.label === shell.status.label;
    if (sameAsStatus && !s.evidence) continue;
    const text = sameAsStatus ? s.evidence : s.evidence ? `${s.label} (${s.evidence})` : s.label;
    if (seen.has(s.label)) continue;
    seen.add(s.label);
    parts.push(text);
    if (parts.length >= max) break;
  }
  if (parts.length === 0 && shell.status.reason) parts.push(shell.status.reason);
  return parts;
}
