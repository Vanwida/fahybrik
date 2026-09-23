// The quick line's contract with the grammar (editor redesign).
//
// The placeholder promises "6x1000 @4:30 r2'" — this test pins that the importer
// grammar actually DELIVERS on the examples the UI advertises, and that the parse
// lifts into a run structure the editor can merge. If the grammar ever regresses
// on these shapes, the input would silently become a liar.

import { describe, expect, it } from 'vitest';
import { parseNotationCell } from '../../../shared/domain/import/notation';
import { legacyToStructure, isRepeat } from '../../../shared/domain/prescription';

function structureOf(text: string) {
  const line = parseNotationCell(text)[0];
  if (!line || line.confidence !== 'detected') return null;
  return legacyToStructure(line.prescription);
}

describe('the advertised quick-line examples parse', () => {
  it("6x1000 @4:30 r2' → a 6× repeat of 1000 m work", () => {
    const st = structureOf("6x1000 @4:30 r2'");
    expect(st).not.toBeNull();
    const main = st!.find((p) => p.role === 'main') ?? st![0]!;
    const rep = main.elements.find(isRepeat);
    expect(rep).toBeDefined();
    expect(rep!.times).toBe(6);
  });

  it("20' Z2 → a single steady duration bout", () => {
    const st = structureOf("20' Z2");
    expect(st).not.toBeNull();
  });
});

// Wave-3 sweep: lo que un coach escribe de verdad en la línea rápida de fuerza.
describe('fuerza en la línea rápida', () => {
  const one = (text: string) => {
    const l = parseNotationCell(text);
    expect(l).toHaveLength(1);
    return l[0]!;
  };

  it.each([
    ["sentadilla 5x5 @75% r2'", 'sentadilla', 5, 5, { kind: 'percent_rm', value: 75 }, 120],
    ["peso muerto 4x5 @80% r3'", 'peso muerto', 4, 5, { kind: 'percent_rm', value: 80 }, 180],
    ["press banca 4x4 @78-80% r1'30''", 'press banca', 4, 4, { kind: 'percent_rm', min: 78, max: 80 }, 90],
    ["hip thrust 3x10 @RPE8 rec 2'", 'hip thrust', 3, 10, { kind: 'rpe', value: 8 }, 120],
  ])('«%s» → %s %i×%i con su carga y descanso en minutos', (text, token, sets, reps, target, rest) => {
    const l = one(text);
    expect(l.confidence).toBe('detected');
    expect(l.exercise_token).toBe(token);
    expect(l.prescription).toMatchObject({ scheme: 'sets', modality: 'strength' });
    expect(l.prescription.sets).toHaveLength(sets);
    for (const s of l.prescription.sets!) {
      expect(s.measure).toEqual({ kind: 'reps', value: reps });
      expect(s.target).toEqual(target);
      expect(s.rest_s).toBe(rest);
    }
  });

  it("«wall balls 4x25 r1'» → 4×25 con 1' de descanso", () => {
    const l = one("wall balls 4x25 r1'");
    expect(l.confidence).toBe('detected');
    expect(l.exercise_token).toBe('wall balls');
    expect(l.prescription.sets).toHaveLength(4);
    expect(l.prescription.sets!.every((s) => s.measure?.kind === 'reps' && s.measure.value === 25 && s.rest_s === 60)).toBe(true);
  });

  it.each([
    'remo con barra 3x8 RIR2',
    'remo con mancuerna 4x10 @20kg',
    'Remo invertido 3x12',
    'remo al mentón 3x12',
    'Pendlay row 5x5 @60kg',
    'Renegade row 3x10',
    'Seated cable row 3x12',
  ])('«%s» es fuerza (un tirón), no el ergómetro', (text) => {
    const l = one(text);
    expect(l.confidence).toBe('detected');
    expect(l.prescription).toMatchObject({ scheme: 'sets', modality: 'strength' });
  });

  it('«remo con barra 3x8 RIR2» lleva sus 3 series de 8 a RIR 2', () => {
    const l = one('remo con barra 3x8 RIR2');
    expect(l.exercise_token).toBe('remo con barra');
    expect(l.prescription.sets).toEqual(
      Array.from({ length: 3 }, () => ({ measure: { kind: 'reps', value: 8 }, target: { kind: 'rir', value: 2 } })),
    );
  });

  it.each(['6x500 remo', "remo 20' Z2", 'Row 2000m', "10' row + 10' ski, todo Z2"])(
    '«%s» sigue siendo el ergómetro',
    (text) => {
      const lines = parseNotationCell(text);
      expect(lines.every((l) => l.confidence === 'detected')).toBe(true);
      expect(lines[0]!.prescription.modality).toBe('row');
    },
  );

  it('«5r 10-10-8» siguen siendo 5 rondas, no un descanso', () => {
    const l = one("5r 10-10-8 sentadilla");
    expect(l.prescription.sets?.[0]?.rest_s).toBeUndefined();
  });
});
