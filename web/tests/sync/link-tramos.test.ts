/**
 * Reglas puras de «un solo entreno» (DECISIONS 2026-09-28):
 *   · `linkTramos` — a qué segmento de su plantilla pertenece cada tramo de un
 *     entreno libre (explícito por `item_index`, o inferido para la app de hoy);
 *   · `tramoModality` — con qué se hizo un tramo (cinta, ejercicio 0053, cable).
 * Los casos son las formas reales que guardó la app (EMOM alterno, fuerza con
 * calentamiento, rondas plegadas, series de carrera en cinta).
 */
import { describe, expect, it } from 'vitest';
import { linkTramos, type TemplateItem } from '@/lib/sync/link-tramos';
import { segmentModalityOfExercise, storedRoundIndex, tramoModality } from '@/lib/sync/segment-derivations';
import type { SegmentInput } from '@/lib/sync/segment-input-schema';

const tramo = (fields: Partial<SegmentInput> & { position: number; modality: string }): SegmentInput =>
  fields as SegmentInput;
const bout = (position: number, modality: string, source?: string): SegmentInput =>
  tramo({ position, modality, leg_index: position, leg_role: 'work', leg_phase: 'main', ...(source ? { source } : {}) });
const ids = (segs: SegmentInput[]) => segs.map((s) => s.template_segment_id ?? null);

describe('linkTramos', () => {
  it('una plantilla de un segmento: todos sus tramos son de él (series de carrera en cinta)', () => {
    const items: TemplateItem[] = [{ id: 10, modality: 'run' }];
    const segs = [bout(0, 'other', 'treadmill'), bout(1, 'other', 'treadmill'), bout(2, 'run')];
    expect(ids(linkTramos(segs, items))).toEqual([10, 10, 10]);
  });

  it('fuerza con calentamiento: la posición del tramo es el orden 1-based de su ítem', () => {
    const items: TemplateItem[] = [
      { id: 1, modality: 'strength' },
      { id: 2, modality: 'strength' },
      { id: 3, modality: 'strength' },
    ];
    const segs = [tramo({ position: 1, modality: 'strength' }), tramo({ position: 3, modality: 'strength' })];
    expect(ids(linkTramos(segs, items))).toEqual([1, 3]);
  });

  it('un bloque plegado (other) casa con su primer ítem, como en el camino del coach', () => {
    const items: TemplateItem[] = [
      { id: 7, modality: 'run' },
      { id: 8, modality: 'row' },
      { id: 9, modality: 'ski' },
    ];
    expect(ids(linkTramos([tramo({ position: 1, modality: 'other' })], items))).toEqual([7]);
  });

  it('una modalidad que contradice el ítem de su posición no se enlaza', () => {
    const items: TemplateItem[] = [
      { id: 1, modality: 'strength' },
      { id: 2, modality: 'row' },
    ];
    expect(ids(linkTramos([tramo({ position: 1, modality: 'run' })], items))).toEqual([null]);
  });

  it('EMOM alterno: cada serie va al ÚNICO ítem de su modalidad', () => {
    const items: TemplateItem[] = [
      { id: 21, modality: 'strength' },
      { id: 22, modality: 'row' },
    ];
    const segs = [bout(0, 'strength'), bout(1, 'row'), bout(2, 'strength'), bout(3, 'rowing')];
    expect(ids(linkTramos(segs, items))).toEqual([21, 22, 21, 22]);
  });

  it('dos ítems de la misma modalidad: la serie no es inequívoca y se queda sin enlazar', () => {
    const items: TemplateItem[] = [
      { id: 31, modality: 'strength' },
      { id: 32, modality: 'strength' },
    ];
    expect(ids(linkTramos([bout(0, 'strength')], items))).toEqual([null]);
  });

  it('item_index explícito manda, y un tramo sin él se queda sin enlazar', () => {
    const items: TemplateItem[] = [
      { id: 41, modality: 'strength' },
      { id: 42, modality: 'strength' },
    ];
    const segs = [
      tramo({ ...bout(0, 'strength'), item_index: 1 }),
      tramo({ ...bout(1, 'strength'), item_index: 0 }),
      bout(2, 'strength'),
    ];
    expect(ids(linkTramos(segs, items))).toEqual([42, 41, null]);
  });

  it('un id de OTRA plantilla se sustituye; uno de esta se respeta', () => {
    const items: TemplateItem[] = [{ id: 51, modality: 'run' }];
    const segs = [
      tramo({ position: 1, modality: 'run', template_segment_id: 3670 }),
      tramo({ position: 2, modality: 'run', template_segment_id: 51 }),
    ];
    expect(ids(linkTramos(segs, items))).toEqual([51, 51]);
  });

  it('sin segmentos (un cronómetro) no enlaza nada', () => {
    const segs = [tramo({ position: 1, modality: 'other' })];
    expect(linkTramos(segs, [])).toBe(segs);
  });
});

describe('tramoModality', () => {
  const single = (modality: string) => ({ modality, blockSingleModality: true });
  const mixed = (modality: string) => ({ modality, blockSingleModality: false });

  it('cinta = correr, diga lo que diga el cable', () => {
    expect(tramoModality({ wire: 'other', source: 'treadmill', exercise: null })).toBe('run');
    expect(tramoModality({ wire: 'other', source: 'treadmill', exercise: mixed('run') })).toBe('run');
  });

  it('el ejercicio manda (0053): un SkiErg que el aparato llamó «row» es ski', () => {
    expect(tramoModality({ wire: 'row', source: 'pm5', exercise: single('ski') })).toBe('ski');
  });

  it('bloque de una modalidad: el tramo plegado es de esa modalidad', () => {
    expect(tramoModality({ wire: 'other', source: null, exercise: single('strength') })).toBe('strength');
  });

  it('bloque mixto: el plegado (other) se queda en other; el de un ejercicio toma el suyo', () => {
    expect(tramoModality({ wire: 'other', source: 'manual', exercise: mixed('run') })).toBe('other');
    expect(tramoModality({ wire: 'row', source: 'manual', exercise: mixed('ski') })).toBe('ski');
  });

  it('funcional, core y movilidad son other en el vocabulario de tramos', () => {
    expect(segmentModalityOfExercise('functional')).toBe('other');
    expect(segmentModalityOfExercise('core')).toBe('other');
    expect(tramoModality({ wire: 'strength', source: null, exercise: single('functional') })).toBe('other');
  });

  it('sin ejercicio, el cable normalizado', () => {
    expect(tramoModality({ wire: 'running', source: 'gps', exercise: null })).toBe('run');
    expect(tramoModality({ wire: null, source: null, exercise: null })).toBe('other');
  });
});

describe('storedRoundIndex — la ronda del cable (base 0) en la columna de 0155', () => {
  const at = (round_index: number | null | undefined) =>
    storedRoundIndex(tramo({ position: 0, modality: 'run', round_index }));

  it('una ronda que llega se guarda + 1: el 0 de la columna es «no se repite»', () => {
    expect([at(0), at(1), at(7)]).toEqual([1, 2, 8]);
  });

  it('sin ronda (la app instalada, un tramo suelto) o rota: 0, lo de siempre', () => {
    expect([at(undefined), at(null), at(-1), at(1.5)]).toEqual([0, 0, 0, 0]);
  });
});
