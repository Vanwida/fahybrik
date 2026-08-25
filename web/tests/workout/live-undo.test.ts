import { describe, expect, it } from 'vitest';
import {
  LIVE_UNDO,
  canLiveUndo,
  holdOpenLastSceneStation,
  lastConfirmedSetIndex,
  liveUndoAction,
  popLastConfirmedSet,
  type LiveUndoCursor,
} from '@fahybrid/shared/domain/live-undo';

function cursor(parcial: Partial<LiveUndoCursor> = {}): LiveUndoCursor {
  return {
    finished: false,
    awaitingFinish: false,
    sets: null,
    segmentIndex: 0,
    sameBlockAsPrevious: false,
    roundsDone: 0,
    emomIntervalIndex: 0,
    isEmom: false,
    ...parcial,
  };
}

describe('liveUndoAction — el último avance, no un historial', () => {
  it('en el primer ejercicio sin series cerradas no hay nada que deshacer', () => {
    expect(liveUndoAction(cursor({ sets: [{ confirmed: false }, { confirmed: false }] }))).toBe(
      LIVE_UNDO.noop,
    );
    expect(canLiveUndo(cursor({ sets: [{ confirmed: false }] }))).toBe(false);
  });

  it('una serie cerrada se deshace aunque sea el primer tramo del bloque', () => {
    const c = cursor({
      sets: [{ confirmed: true }, { confirmed: false }],
      segmentIndex: 0,
    });
    expect(liveUndoAction(c)).toBe(LIVE_UNDO.unconfirmLastSet);
    expect(canLiveUndo(c)).toBe(true);
    expect(lastConfirmedSetIndex(c.sets!)).toBe(0);
  });

  it('con dos series cerradas solo señala la última', () => {
    expect(
      lastConfirmedSetIndex([{ confirmed: true }, { confirmed: true }, { confirmed: false }]),
    ).toBe(1);
  });

  it('una estación del mismo bloque vuelve al tramo anterior', () => {
    expect(
      liveUndoAction(cursor({ segmentIndex: 2, sameBlockAsPrevious: true })),
    ).toBe(LIVE_UNDO.stepBackSegment);
  });

  it('el primer movimiento de un bloque no te saca al bloque de antes (card 115)', () => {
    expect(
      liveUndoAction(cursor({ segmentIndex: 1, sameBlockAsPrevious: false })),
    ).toBe(LIVE_UNDO.parkBlockGate);
  });

  it('al preguntar si has acabado, un toque reabre y te deja en vivo', () => {
    expect(
      liveUndoAction(
        cursor({
          awaitingFinish: true,
          sets: [{ confirmed: true }],
          segmentIndex: 0,
        }),
      ),
    ).toBe(LIVE_UNDO.reopenFromFinish);
  });

  it('una sesión ya cerrada no se reabre', () => {
    expect(liveUndoAction(cursor({ finished: true, awaitingFinish: true }))).toBe(LIVE_UNDO.noop);
  });

  it('un intervalo EMOM ya hecho vuelve a ese intervalo', () => {
    expect(
      liveUndoAction(cursor({ isEmom: true, emomIntervalIndex: 2 })),
    ).toBe(LIVE_UNDO.stepBackEmom);
  });

  it('una ronda o estación de lista se desmarca (el modelo ya lo sabía)', () => {
    expect(liveUndoAction(cursor({ roundsDone: 3 }))).toBe(LIVE_UNDO.unmarkLastRound);
  });

  it('la serie cerrada manda sobre volver de tramo', () => {
    expect(
      liveUndoAction(
        cursor({
          sets: [{ confirmed: true }],
          segmentIndex: 2,
          sameBlockAsPrevious: true,
        }),
      ),
    ).toBe(LIVE_UNDO.unconfirmLastSet);
  });
});

describe('aplicar el paso — el resto del entreno se queda', () => {
  it('quitar la última serie no borra las anteriores', () => {
    const hechas = { 0: { reps: 10 }, 1: { reps: 8 }, 2: { reps: 6 } };
    expect(popLastConfirmedSet(hechas)).toEqual({ 0: { reps: 10 }, 1: { reps: 8 } });
    expect(hechas[2]).toEqual({ reps: 6 });
  });

  it('sin series cerradas no inventa un paso', () => {
    expect(popLastConfirmedSet({})).toEqual({});
  });

  it('una estación sellada en la escena se puede reabrir y el resto sigue cerrado', () => {
    expect(holdOpenLastSceneStation(10, [])).toEqual([10]);
    expect(holdOpenLastSceneStation(10, [10])).toEqual([10]);
    expect(holdOpenLastSceneStation(null, [9])).toEqual([9]);
  });
});
