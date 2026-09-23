// «Hacer ahora» de la ficha — las acciones que tocan a ESTE atleta, sacadas de las
// MISMAS señales que Hoy (coach_attention_items vía el estado §4.1) y de los hechos
// que la cabecera ya trae (semana oculta, debida sin hacer, check-in sin contestar).
// Antes era «N cosas tuyas pendientes» y no veía ni la semana oculta (H2). Puro.

import type { SignalKind } from '@fahybrid/shared/domain/coach/signals';
import { weekdayLabelLong } from './ficha-dates';
import type { FichaShell } from './atleta-detalle-types';
import { weekRangeLabel } from './ficha-format';

export type HacerAhoraKind =
  | 'publicar'
  | 'responder'
  | 'ajustar'
  | 'descarga'
  | 'evaluar'
  | 'alta'
  | 'pago'
  | 'comunicado'
  | 'asignar';

export interface HacerAhoraChip {
  key: string;
  kind: HacerAhoraKind;
  label: string;
  /** Semana sobre la que actúa (publicar, descarga, evaluar). */
  week_start?: string;
  /** Entreno que abre (ajustar). */
  session_id?: string;
}

/** Como mucho, para que siga siendo un vistazo. */
export const HACER_AHORA_MAX = 4;

const DESCARGA_KINDS: ReadonlySet<SignalKind> = new Set(['readiness_low', 'hrv_crash', 'rpe_high']);
const COMUNICADO_KINDS: ReadonlySet<SignalKind> = new Set([
  'communication_question_unanswered',
  'communication_task_overdue',
  'communication_protocol_unopened',
]);

function clip(text: string, max = 32): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

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
  const kinds = new Set(shell.status.signals.map((s) => s.kind));
  const paused = shell.lifecycle.status !== 'activo';
  const push = (c: HacerAhoraChip) => {
    if (!out.some((x) => x.kind === c.kind)) out.push(c);
  };

  if (shell.intake_pending) push({ key: 'alta', kind: 'alta', label: 'Revisar alta' });
  if (!paused && !shell.intake_pending && !shell.has_upcoming_plan) {
    push({ key: 'asignar', kind: 'asignar', label: 'Asignar programa' });
  }
  // Una semana que se publicará sola en su día no es tarea del coach todavía.
  if (!paused && shell.publish_target?.due) {
    push({
      key: `publicar-${shell.publish_target.week_start}`,
      kind: 'publicar',
      label: `Publicar ${weekRangeLabel(shell.publish_target.week_start)}`,
      week_start: shell.publish_target.week_start,
    });
  }
  const ck = shell.last_checkin;
  if (ck && !ck.answered && ck.notes) {
    push({ key: 'responder-checkin', kind: 'responder', label: `Responder check-in «${clip(ck.notes)}»` });
  } else if (shell.awaiting_reply || kinds.has('message_unanswered')) {
    push({ key: 'responder', kind: 'responder', label: 'Responder' });
  }
  if (shell.last_missed) {
    push({
      key: `ajustar-${shell.last_missed.id}`,
      kind: 'ajustar',
      label: `Ajustar ${weekdayLabelLong(shell.last_missed.date)} (sin hacer)`,
      session_id: shell.last_missed.id,
    });
  }
  if (!paused && [...kinds].some((k) => DESCARGA_KINDS.has(k))) {
    push({ key: 'descarga', kind: 'descarga', label: 'Proponer descarga', week_start: mondayOf(shell.today) });
  }
  if (kinds.has('week_adjustment_pending')) {
    push({ key: 'evaluar', kind: 'evaluar', label: 'Revisar ajuste propuesto', week_start: mondayOf(shell.today) });
  }
  if (kinds.has('billing_at_risk')) push({ key: 'pago', kind: 'pago', label: 'Recordar pago' });
  if ([...kinds].some((k) => COMUNICADO_KINDS.has(k)) || shell.pending_comunicados > 0) {
    const n = shell.pending_comunicados;
    push({
      key: 'comunicado',
      kind: 'comunicado',
      label: n > 1 ? `${n} comunicados pendientes` : 'Comunicado pendiente',
    });
  }
  return out.slice(0, HACER_AHORA_MAX);
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
