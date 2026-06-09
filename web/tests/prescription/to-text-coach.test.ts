// prescriptionToText — coach natural-language output (UX redesign §4).
// Locks the EXACT strings of the session drawer's exercise rows against the
// approved mockup (docs/design/ux-redesign/mockups/02-atleta.html):
//
//   "5×5 @ 75% RM · descanso 2'" / "4×1000m @ 4:10/km · r2'" / "AMRAP 12'" …
//
// Conventions under test: uniform sets collapse to N×work; targets join with
// " @ "; rest reads "descanso" for strength and "r" otherwise; seconds use
// double prime (90''), whole minutes prime (2'); copy in Spanish.

import { describe, expect, test } from 'vitest';
import {
  prescriptionToText,
  type Prescription,
  type PrescriptionSet,
} from '@fahybrid/shared/domain/prescription';

function uniformSets(n: number, set: PrescriptionSet): PrescriptionSet[] {
  return Array.from({ length: n }, () => ({ ...set }));
}

describe('prescriptionToText — coach natural language (mockup-exact)', () => {
  test('fuerza uniforme: 5×5 @ 75% RM · descanso 2\'', () => {
    const p: Prescription = {
      scheme: 'sets',
      modality: 'strength',
      sets: uniformSets(5, {
        measure: { kind: 'reps', value: 5 },
        target: { kind: 'percent_rm', value: 75 },
        rest_s: 120,
      }),
    };
    expect(prescriptionToText(p)).toBe("5×5 @ 75% RM · descanso 2'");
  });

  test('fuerza descanso en segundos: 3×8 @ RPE 7 · descanso 90\'\'', () => {
    const p: Prescription = {
      scheme: 'sets',
      modality: 'strength',
      sets: uniformSets(3, {
        measure: { kind: 'reps', value: 8 },
        target: { kind: 'rpe', value: 7 },
        rest_s: 90,
      }),
    };
    expect(prescriptionToText(p)).toBe("3×8 @ RPE 7 · descanso 90''");
  });

  test('pirámide por serie: 10/10/8/8/6 @ 60/65/70/70/75% RM', () => {
    const reps = [10, 10, 8, 8, 6];
    const loads = [60, 65, 70, 70, 75];
    const p: Prescription = {
      scheme: 'sets',
      modality: 'strength',
      sets: reps.map((r, i) => ({
        measure: { kind: 'reps', value: r },
        target: { kind: 'percent_rm', value: loads[i]! },
        rest_s: 150,
      })),
    };
    expect(prescriptionToText(p)).toBe(
      "10/10/8/8/6 @ 60/65/70/70/75% RM · descanso 2'30''",
    );
  });

  test('series running: 4×1000m @ 4:10/km · r2\'', () => {
    const p: Prescription = {
      scheme: 'interval',
      modality: 'run',
      rounds: 4,
      rest_s: 120,
      sets: uniformSets(4, {
        measure: { kind: 'distance', meters: 1000 },
        target: { kind: 'pace', unit: 'per_km', value_s: 250 },
      }),
    };
    expect(prescriptionToText(p)).toBe("4×1000m @ 4:10/km · r2'");
  });

  test('series ergómetro por tiempo: 3×3\' @ RPE 8 · r2\'', () => {
    const p: Prescription = {
      scheme: 'interval',
      modality: 'ski',
      rounds: 3,
      rest_s: 120,
      sets: uniformSets(3, {
        measure: { kind: 'duration', seconds: 180 },
        target: { kind: 'rpe', value: 8 },
      }),
    };
    expect(prescriptionToText(p)).toBe("3×3' @ RPE 8 · r2'");
  });

  test('pieza de remo continua: 2000m @ 1:50/500m', () => {
    const p: Prescription = {
      scheme: 'steady',
      modality: 'row',
      sets: [
        {
          measure: { kind: 'distance', meters: 2000 },
          target: { kind: 'pace', unit: 'per_500m', value_s: 110 },
        },
      ],
    };
    expect(prescriptionToText(p)).toBe('2000m @ 1:50/500m');
  });

  test('continuo Z2: 45\' @ Z2', () => {
    const p: Prescription = {
      scheme: 'steady',
      modality: 'bike',
      total_s: 2700,
      target: { kind: 'hr_zone', value: 2 },
    };
    expect(prescriptionToText(p)).toBe("45' @ Z2");
  });

  test('AMRAP con cap: AMRAP 12\'', () => {
    expect(prescriptionToText({ scheme: 'amrap', modality: 'functional', total_s: 720 })).toBe(
      "AMRAP 12'",
    );
  });

  test('EMOM: EMOM 10\'', () => {
    expect(prescriptionToText({ scheme: 'emom', modality: 'functional', rounds: 10 })).toBe(
      "EMOM 10'",
    );
  });

  test('For Time con rondas y cap: 3 rondas For Time · 21 @ RPE 8 · cap 12\'', () => {
    const p: Prescription = {
      scheme: 'for_time',
      modality: 'functional',
      rounds: 3,
      total_s: 720,
      sets: [{ measure: { kind: 'reps', value: 21 }, target: { kind: 'rpe', value: 8 } }],
    };
    // 1 representative set × rounds 3 → "3×21".
    expect(prescriptionToText(p)).toBe("3 rondas For Time · 3×21 @ RPE 8 · cap 12'");
  });

  test('farmer carry funcional: 4×40m @ 24 kg · r90\'\'', () => {
    const p: Prescription = {
      scheme: 'sets',
      modality: 'functional',
      sets: uniformSets(4, {
        measure: { kind: 'distance', meters: 40 },
        target: { kind: 'kg', value: 24 },
        rest_s: 90,
      }),
    };
    expect(prescriptionToText(p)).toBe("4×40m @ 24 kg · r90''");
  });

  test('core por tiempo: 3×45\'\' · r30\'\'', () => {
    const p: Prescription = {
      scheme: 'sets',
      modality: 'core',
      sets: uniformSets(3, {
        measure: { kind: 'duration', seconds: 45 },
        rest_s: 30,
      }),
    };
    expect(prescriptionToText(p)).toBe("3×45'' · r30''");
  });

  test('sprint de calorías: 15 cal objetivo', () => {
    const p: Prescription = {
      scheme: 'amrap',
      modality: 'ski',
      target: { kind: 'calories', value: 15 },
    };
    expect(prescriptionToText(p)).toBe('AMRAP · 15 cal');
  });

  test('rango %RM: 5×5 @ 60-75% RM', () => {
    const p: Prescription = {
      scheme: 'sets',
      modality: 'strength',
      sets: uniformSets(5, {
        measure: { kind: 'reps', value: 5 },
        target: { kind: 'percent_rm', min: 60, max: 75 },
      }),
    };
    expect(prescriptionToText(p)).toBe('5×5 @ 60-75% RM');
  });

  test('intervalo sin per-set: 4×3\' @ Z4 · r3\'', () => {
    const p: Prescription = {
      scheme: 'interval',
      modality: 'bike',
      rounds: 4,
      work_s: 180,
      rest_s: 180,
      target: { kind: 'hr_zone', value: 4 },
    };
    expect(prescriptionToText(p)).toBe("4×3' @ Z4 · r3'");
  });

  test('la nota del coach se añade al final', () => {
    const p: Prescription = {
      scheme: 'sets',
      modality: 'strength',
      note: 'pausa abajo',
      sets: uniformSets(3, {
        measure: { kind: 'reps', value: 8 },
        target: { kind: 'rpe', value: 7 },
      }),
    };
    expect(prescriptionToText(p)).toBe('3×8 @ RPE 7 · pausa abajo');
  });
});
