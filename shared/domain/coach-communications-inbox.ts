// @fahybrid/shared/domain/coach-communications-inbox — EL ESTADO Y EL ORDEN.
//
// El mecanismo de la bandeja del atleta: en qué estado está un comunicado, qué
// sigue reclamándole algo y en qué orden se le pone delante. Vive aparte del
// vocabulario (`coach-communications.ts`, que lo reexporta entero, así que nadie
// tiene que cambiar de import) porque es la única parte que se ejecuta en las dos
// puntas — servidor e iOS — y la que no puede tener dos versiones.
//
// Todo esto es MECANISMO (CLAUDE.md, HARD RULE Nº0): que una pregunta se cierre
// respondiendo y que lo que bloquea vaya primero no es criterio de entrenador,
// es lo que hace que el tipo signifique lo que dice.

import type { CommunicationKind, CommunicationState } from './coach-communications';

/** El estado del atleta, derivado de sus sellos. Una sola verdad, aquí. */
export function communicationState(marks: {
  seen_at: string | null;
  done_at: string | null;
  answered_at: string | null;
}): CommunicationState {
  if (marks.answered_at) return 'answered';
  if (marks.done_at) return 'done';
  if (marks.seen_at) return 'seen';
  return 'published';
}

/**
 * Los pasos que de verdad se marcan. Un protocolo puede no tener ninguno (el
 * check es del paso, no del tipo), y entonces se lee y ya está: ni la barra de
 * avance ni el «hecho» derivado tienen nada que contar.
 */
export function checkableItems<T extends { checkable: boolean }>(items: T[]): T[] {
  return items.filter((i) => i.checkable);
}

/**
 * Lo que aún te reclama: sin ver, sin responder o sin hacer.
 *
 * Un protocolo o una nota ya vistos NO reclaman: leerlos ERA el acto pendiente
 * (un protocolo con casillas además se cierra solo al marcar la última, y uno
 * sin ninguna se cierra con haberlo leído). El foco no se cierra nunca, y por
 * eso tampoco reclama: si lo hiciera, la bandeja no podría estar en calma jamás.
 */
export function claimsAttention(kind: CommunicationKind, state: CommunicationState): boolean {
  if (state === 'published') return true;
  if (kind === 'question') return state !== 'answered';
  if (kind === 'task') return state !== 'done';
  return false;
}

/** La bandeja en calma: nada sin ver, nada sin responder, nada sin hacer. */
export function inboxIsClear(items: { kind: CommunicationKind; state: CommunicationState }[]) {
  return items.every((c) => !claimsAttention(c.kind, c.state));
}

/**
 * En qué cajón de la bandeja cae. Menor = más arriba.
 *
 * El orden no es una preferencia estética: es lo que decide qué ve el atleta con
 * el pulgar en la pantalla. Primero lo que BLOQUEA (una pregunta sin responder
 * deja el plan a medio cerrar), luego lo que VENCE, luego lo que aún no ha
 * abierto, y el foco por delante de lo ya resuelto porque justamente no se cierra
 * nunca — si cayera al fondo, dejaría de ser el foco.
 */
export const INBOX_BUCKET = {
  blockingQuestion: 0,
  openQuestion: 1,
  openTask: 2,
  unseen: 3,
  focus: 4,
  settled: 5,
} as const;

export function inboxBucket(c: {
  kind: CommunicationKind;
  state: CommunicationState;
  blocks: boolean;
}): number {
  if (c.kind === 'question' && c.state !== 'answered') {
    return c.blocks ? INBOX_BUCKET.blockingQuestion : INBOX_BUCKET.openQuestion;
  }
  if (c.kind === 'task' && c.state !== 'done') return INBOX_BUCKET.openTask;
  if (c.state === 'published') return INBOX_BUCKET.unseen;
  if (c.kind === 'focus') return INBOX_BUCKET.focus;
  return INBOX_BUCKET.settled;
}

/** Lo mínimo para ordenar. Estructural a propósito: así este módulo no depende
 *  del DTO completo y no hay ciclo de imports con el vocabulario. */
export interface SortableCommunication {
  id: string;
  kind: CommunicationKind;
  state: CommunicationState;
  blocks: boolean;
  due_date: string | null;
  published_at: string;
}

/**
 * El orden de la bandeja: por cajón, y dentro del cajón lo que antes vence
 * (tareas) o lo más reciente (todo lo demás). El id desempata para que dos
 * lecturas seguidas nunca devuelvan órdenes distintos.
 */
export function compareInboxCommunications(
  a: SortableCommunication,
  b: SortableCommunication,
): number {
  const bucket = inboxBucket(a) - inboxBucket(b);
  if (bucket !== 0) return bucket;

  if (a.kind === 'task' && b.kind === 'task' && a.due_date && b.due_date && a.due_date !== b.due_date) {
    return a.due_date < b.due_date ? -1 : 1;
  }

  if (a.published_at !== b.published_at) return a.published_at < b.published_at ? 1 : -1;
  return Number(b.id) - Number(a.id);
}

/** Ordena una bandeja completa sin mutar la entrada. */
export function sortInbox<T extends SortableCommunication>(items: T[]): T[] {
  return [...items].sort(compareInboxCommunications);
}
