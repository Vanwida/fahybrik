// Mensajes — la lógica pura de la bandeja: qué estado tiene un hilo, qué hilos
// entran en cada filtro y en qué orden, y de qué color va la espera.
//
// Sin React y sin base de datos: la usan el cargador del servidor, la pantalla
// (para reordenar al instante lo que llega en vivo) y los tests.

import { ageLabel } from '@fahybrid/shared/domain/coach/athlete-state';
import type { MensajesFilter, MensajesThread, ThreadState } from './mensajes-types';

/** La fila de `coach_alert_overrides` de `message_unanswered` de un atleta. */
export interface ReplyOverride {
  snoozed_until: Date | null;
  dismissed_at: Date | null;
  override_kind: 'snooze' | 'done' | null;
}

/**
 * El estado de un hilo a partir de su espera y de lo que el coach hizo con ella.
 *
 *   sin espera                                   → al día (el coach escribió lo último)
 *   pospuesto con fecha y la fecha no ha llegado → pospuesto (como en Hoy: la fecha manda)
 *   despachado DESPUÉS del último mensaje suyo   → hecho / pospuesto hasta que escriba
 *   cualquier otro caso                          → por responder
 *
 * «Despachado después» compara con el ÚLTIMO mensaje del atleta, no con el
 * primero: si vuelve a escribir tras un «hecho», es otra espera y vuelve a salir.
 */
export function threadState(
  waiting: { last_at: Date } | null,
  override: ReplyOverride | null,
  now: Date,
): { state: ThreadState; snoozed_until: string | null } {
  if (!waiting) return { state: 'al_dia', snoozed_until: null };
  if (override?.snoozed_until && override.snoozed_until.getTime() > now.getTime()) {
    return { state: 'pospuesto', snoozed_until: override.snoozed_until.toISOString() };
  }
  if (override?.dismissed_at && override.dismissed_at.getTime() >= waiting.last_at.getTime()) {
    return override.override_kind === 'done'
      ? { state: 'hecho', snoozed_until: null }
      : { state: 'pospuesto', snoozed_until: null };
  }
  return { state: 'por_responder', snoozed_until: null };
}

const byName = (a: MensajesThread, b: MensajesThread) => a.athlete_name.localeCompare(b.athlete_name, 'es');
const lastAt = (t: MensajesThread) => (t.last_message ? Date.parse(t.last_message.at) : 0);
const newestFirst = (a: MensajesThread, b: MensajesThread) => lastAt(b) - lastAt(a) || byName(a, b);

/** ¿Entra el hilo en el filtro? */
export function inFilter(t: MensajesThread, filter: MensajesFilter): boolean {
  switch (filter) {
    case 'por_responder':
      return t.state === 'por_responder';
    case 'sin_leer':
      return t.unread > 0;
    case 'hechas':
      return t.state === 'hecho';
    case 'todas':
      return t.last_message != null;
  }
}

/**
 * Los hilos de un filtro, en su orden: «Por responder» por la espera más larga
 * primero (quien más lleva esperando, arriba); el resto, lo más reciente primero.
 */
export function filterThreads(threads: readonly MensajesThread[], filter: MensajesFilter): MensajesThread[] {
  const out = threads.filter((t) => inFilter(t, filter));
  if (filter === 'por_responder') {
    return out.sort(
      (a, b) => Date.parse(a.waiting?.since ?? '') - Date.parse(b.waiting?.since ?? '') || byName(a, b),
    );
  }
  return out.sort(newestFirst);
}

export function filterCounts(threads: readonly MensajesThread[]): Record<MensajesFilter, number> {
  const counts: Record<MensajesFilter, number> = { por_responder: 0, todas: 0, sin_leer: 0, hechas: 0 };
  for (const t of threads) {
    if (inFilter(t, 'por_responder')) counts.por_responder += 1;
    if (inFilter(t, 'todas')) counts.todas += 1;
    if (inFilter(t, 'sin_leer')) counts.sin_leer += 1;
    if (inFilter(t, 'hechas')) counts.hechas += 1;
  }
  return counts;
}

export type WaitTone = 'neutral' | 'warn' | 'danger';

/**
 * A partir de cuántas veces el umbral del coach la espera pasa de «vigilar» a
 * «actúa ya». El umbral (`message_unanswered_hours`) es dato del coach; esto es
 * solo la escala, así que un coach que lo mueve mueve también el rojo.
 */
export const WAIT_DANGER_MULTIPLE = 2;

/** Gris antes del umbral del coach; ámbar desde el umbral; rojo desde el doble. */
export function waitTone(since: string, now: Date, threshold_hours: number): WaitTone {
  const hours = (now.getTime() - Date.parse(since)) / 3_600_000;
  if (!Number.isFinite(hours) || hours < threshold_hours) return 'neutral';
  if (hours < threshold_hours * WAIT_DANGER_MULTIPLE) return 'warn';
  return 'danger';
}

/** «19 h», «3 d», «ahora». */
export function waitLabel(since: string, now: Date): string {
  return ageLabel(since, now);
}

export interface IncomingMessage {
  thread_id: string;
  from: 'athlete' | 'coach';
  preview: string;
  at: string;
}

/**
 * Lo que un mensaje en vivo le hace a su hilo, sin esperar al servidor (que
 * después confirma con la bandeja entera). Si el hilo está abierto y a la vista,
 * no suma sin leer: la conversación manda el acuse en cuanto entra.
 */
export function applyIncoming(
  t: MensajesThread,
  m: IncomingMessage,
  opts: { open: boolean; now: Date },
): MensajesThread {
  const last_message = { preview: m.preview, at: m.at, from: m.from };
  if (m.from === 'coach') {
    return { ...t, last_message, waiting: null, state: 'al_dia', snoozed_until: null };
  }
  const waiting = {
    since: t.waiting?.since ?? m.at,
    last_at: m.at,
    count: (t.waiting?.count ?? 0) + 1,
  };
  const timedSnooze =
    t.state === 'pospuesto' && t.snoozed_until != null && Date.parse(t.snoozed_until) > opts.now.getTime();
  return {
    ...t,
    last_message,
    waiting,
    unread: opts.open ? 0 : t.unread + 1,
    state: timedSnooze ? 'pospuesto' : 'por_responder',
    snoozed_until: timedSnooze ? t.snoozed_until : null,
  };
}
