// Un paso atrás del último avance en vivo. No es un historial.
// La tabla decide QUÉ deshacer. Quién aplica (motor Swift / gemelo) es otro sitio.

export type LiveUndoSet = {
  confirmed: boolean;
};

export type LiveUndoCursor = {
  finished: boolean;
  awaitingFinish: boolean;
  sets: readonly LiveUndoSet[] | null;
  segmentIndex: number;
  sameBlockAsPrevious: boolean;
  roundsDone: number;
  emomIntervalIndex: number;
  isEmom: boolean;
};

export const LIVE_UNDO = {
  unconfirmLastSet: 'unconfirm_last_set',
  unmarkLastRound: 'unmark_last_round',
  reopenFromFinish: 'reopen_from_finish',
  stepBackSegment: 'step_back_segment',
  parkBlockGate: 'park_block_gate',
  stepBackEmom: 'step_back_emom',
  noop: 'noop',
} as const;

export type LiveUndoAction = (typeof LIVE_UNDO)[keyof typeof LIVE_UNDO];

export function lastConfirmedSetIndex(sets: readonly LiveUndoSet[]): number | null {
  for (let i = sets.length - 1; i >= 0; i--) {
    if (sets[i]?.confirmed) return i;
  }
  return null;
}

export function liveUndoAction(c: LiveUndoCursor): LiveUndoAction {
  if (c.finished) return LIVE_UNDO.noop;
  if (c.awaitingFinish) return LIVE_UNDO.reopenFromFinish;
  if (c.sets && lastConfirmedSetIndex(c.sets) != null) return LIVE_UNDO.unconfirmLastSet;
  if (c.isEmom && c.emomIntervalIndex > 0) return LIVE_UNDO.stepBackEmom;
  if (c.roundsDone > 0) return LIVE_UNDO.unmarkLastRound;
  if (c.segmentIndex > 0 && c.sameBlockAsPrevious) return LIVE_UNDO.stepBackSegment;
  if (c.segmentIndex > 0) return LIVE_UNDO.parkBlockGate;
  return LIVE_UNDO.noop;
}

export function canLiveUndo(c: LiveUndoCursor): boolean {
  return liveUndoAction(c) !== LIVE_UNDO.noop;
}

export function popLastConfirmedSet<T>(hechas: Readonly<Record<number, T>>): Record<number, T> {
  const keys = Object.keys(hechas).map(Number);
  if (keys.length === 0) return { ...hechas };
  const last = Math.max(...keys);
  const next = { ...hechas };
  delete next[last];
  return next;
}

export function holdOpenLastSceneStation(
  ultimaDeLaEscena: number | null,
  heldOpen: readonly number[],
): number[] {
  if (ultimaDeLaEscena == null) return [...heldOpen];
  if (heldOpen.includes(ultimaDeLaEscena)) return [...heldOpen];
  return [...heldOpen, ultimaDeLaEscena];
}
