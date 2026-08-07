// La «dosis común» de un bloque (rediseño de microciclos, decisión 1) es
// presentación DERIVADA y nunca miente: agrupa solo lo idéntico (comparado con
// setMeasure/setTarget), saca la excepción de intensidad a la fila, y cuando los
// items divergen de verdad cada fila pinta su dosis entera. Sin dosis → aviso,
// jamás un cero inventado.

import { describe, expect, it } from 'vitest';
import { blockDoseView } from '@/components/v2/editor/shared-dose';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';
import type { Prescription } from '../../../shared/domain/prescription';

let uid = 0;
function block(prescriptions: Prescription[]): EditorBlock {
  return {
    uid: `b-${uid++}`,
    title: 'Bloque',
    format: null,
    items: prescriptions.map((prescription, i) => ({
      uid: `i-${uid}-${i}`,
      exercise_id: i + 1,
      exercise_name: `Ejercicio ${i + 1}`,
      prescription,
    })),
  };
}

const strengthSets = (target?: Prescription['target']) =>
  Array.from({ length: 4 }, () => ({
    measure: { kind: 'reps' as const, value: 4 },
    rest_s: 90,
    ...(target ? { target } : {}),
  }));

describe('blockDoseView — la dosis común no miente', () => {
  it('items idénticos → shared, la dosis una vez y todas las filas heredan', () => {
    const p: Prescription = {
      scheme: 'sets',
      modality: 'strength',
      sets: strengthSets({ kind: 'rir', value: 2 }),
    };
    const view = blockDoseView(block([p, structuredClone(p), structuredClone(p)]));
    expect(view.kind).toBe('shared');
    if (view.kind !== 'shared') return;
    expect(view.label).toContain('4×4');
    expect(view.label).toContain('RIR 2');
    expect(view.exceptions).toEqual([null, null, null]);
    expect(view.inherit).toContain('4×4');
  });

  it('mismo trabajo, intensidades distintas → shared con la excepción en su fila', () => {
    const rir: Prescription = {
      scheme: 'sets',
      modality: 'strength',
      sets: strengthSets({ kind: 'rir', value: 2 }),
    };
    const pct: Prescription = {
      scheme: 'sets',
      modality: 'strength',
      sets: strengthSets({ kind: 'percent_rm', min: 78, max: 80 }),
    };
    const view = blockDoseView(block([pct, rir, structuredClone(rir)]));
    expect(view.kind).toBe('shared');
    if (view.kind !== 'shared') return;
    expect(view.label).toContain('4×4'); // el trabajo común, sin intensidad
    expect(view.exceptions[0]).toContain('78-80% RM');
    expect(view.exceptions[1]).toContain('RIR 2');
  });

  it('trabajos distintos de verdad → each, cada fila su dosis entera', () => {
    const a: Prescription = { scheme: 'sets', sets: strengthSets() };
    const b: Prescription = {
      scheme: 'sets',
      sets: [{ measure: { kind: 'reps', value: 12 } }],
    };
    const view = blockDoseView(block([a, b]));
    expect(view.kind).toBe('each');
    if (view.kind !== 'each') return;
    expect(view.doses[0]).toContain('4×4');
    expect(view.doses[1]).toContain('12');
  });

  it('marco de rondas compartido → frame: el formato una vez, el trabajo por fila', () => {
    const frame = { scheme: 'rounds' as const, rounds: 3, rest_s: 60 };
    const a: Prescription = {
      ...frame,
      sets: [{ measure: { kind: 'distance', meters: 500 } }],
    };
    const b: Prescription = {
      ...frame,
      sets: [{ measure: { kind: 'reps', value: 10 } }],
    };
    const view = blockDoseView(block([a, b]));
    expect(view.kind).toBe('frame');
    if (view.kind !== 'frame') return;
    expect(view.label).toContain('3 rondas');
    expect(view.doses[0]).toContain('500m');
    expect(view.doses[1]).toContain('10');
  });

  it('sin dosis utilizable en ningún item → undosed (aviso, no un cero)', () => {
    const view = blockDoseView(block([{ scheme: 'sets' }, { scheme: 'sets' }]));
    expect(view.kind).toBe('undosed');
  });

  it('una línea a revisar (solo verbatim) nunca se agrupa: each con su nota', () => {
    const typed: Prescription = { scheme: 'sets', sets: strengthSets() };
    const review: Prescription = { scheme: 'for_time', note: 'wod raro sin tipar' };
    const view = blockDoseView(block([typed, review]));
    expect(view.kind).toBe('each');
    if (view.kind !== 'each') return;
    expect(view.doses[1]).toBe('wod raro sin tipar'); // el verbatim, sin lead inventado
  });
});
