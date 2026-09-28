/**
 * canonicalPrescription — la misma dosis se guarda de UNA sola manera, la escriba
 * el editor del coach o el constructor libre del atleta (DECISIONS 2026-09-28).
 * Y el resumen escalar (`prescriptionToParams`) cuenta una serie representativa
 * por sus rondas, igual que el texto.
 */
import { describe, expect, test } from 'vitest';
import {
  canonicalPrescription,
  prescriptionToParams,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';

const p = (x: Prescription): Prescription => x;
const PACE_ROW = { kind: 'pace', unit: 'per_500m', value_s: 120 } as const;

describe('canonicalPrescription — series de ergo por tiempo', () => {
  // Lo que guarda el formulario Series del coach (modo tiempo).
  const coach = p({
    scheme: 'intervals',
    modality: 'row',
    rounds: 6,
    work_s: 180,
    rest_s: 120,
    target: { ...PACE_ROW },
  });
  // Lo que manda el constructor libre (FreeWorkoutDraft.buildPrescription).
  const libre = p({
    scheme: 'intervals',
    modality: 'row',
    rounds: 6,
    rest_s: 120,
    target: { ...PACE_ROW },
    sets: [{ measure: { kind: 'duration', seconds: 180 }, target: { ...PACE_ROW }, modality: 'row', rest_s: 120 }],
  });

  test('coach y libre acaban en la MISMA prescripción', () => {
    expect(canonicalPrescription(libre)).toEqual(canonicalPrescription(coach));
  });

  test('la ventana vive en work_s y la serie la repite como duración', () => {
    expect(canonicalPrescription(libre)).toEqual({
      scheme: 'intervals',
      modality: 'row',
      rounds: 6,
      work_s: 180,
      rest_s: 120,
      target: { ...PACE_ROW },
      sets: [{ measure: { kind: 'duration', seconds: 180 } }],
    });
  });

  test('la ventana manda: una serie con otra duración se reescribe', () => {
    const out = canonicalPrescription({ ...coach, sets: [{ measure: { kind: 'duration', seconds: 60 } }] });
    expect(out.work_s).toBe(180);
    expect(out.sets).toEqual([{ measure: { kind: 'duration', seconds: 180 } }]);
  });

  test('es idempotente', () => {
    const once = canonicalPrescription(libre);
    expect(canonicalPrescription(once)).toEqual(once);
  });
});

describe('canonicalPrescription — resto de formas', () => {
  test('series por distancia: objetivo y descanso suben a cabecera, la serie guarda la medida', () => {
    const libre = p({
      scheme: 'intervals',
      modality: 'ski',
      rounds: 5,
      rest_s: 90,
      target: { kind: 'rpe', value: 8 },
      sets: [{ measure: { kind: 'distance', meters: 500 }, target: { kind: 'rpe', value: 8 }, modality: 'ski', rest_s: 90 }],
    });
    const coach = p({
      scheme: 'intervals',
      modality: 'ski',
      rounds: 5,
      rest_s: 90,
      target: { kind: 'rpe', value: 8 },
      sets: [{ measure: { kind: 'distance', meters: 500 } }],
    });
    expect(canonicalPrescription(libre)).toEqual(coach);
    expect(canonicalPrescription(coach)).toEqual(coach);
  });

  test('continuo por tiempo: total_s + serie de duración', () => {
    const coach = p({ scheme: 'steady', modality: 'bike', total_s: 1800, target: { kind: 'hr_zone', value: 2 } });
    const libre = p({
      scheme: 'steady',
      modality: 'bike',
      total_s: 1800,
      target: { kind: 'hr_zone', value: 2 },
      sets: [{ measure: { kind: 'duration', seconds: 1800 }, target: { kind: 'hr_zone', value: 2 }, modality: 'bike' }],
    });
    expect(canonicalPrescription(coach)).toEqual(canonicalPrescription(libre));
    expect(canonicalPrescription(coach).sets).toEqual([{ measure: { kind: 'duration', seconds: 1800 } }]);
  });

  test('una pirámide (varias series) no se toca salvo la modalidad repetida', () => {
    const piramide = p({
      scheme: 'intervals',
      modality: 'run',
      sets: [
        { measure: { kind: 'distance', meters: 1200 }, rest_s: 120, modality: 'run' },
        { measure: { kind: 'distance', meters: 800 }, rest_s: 90 },
      ],
    });
    expect(canonicalPrescription(piramide)).toEqual({
      ...piramide,
      sets: [
        { measure: { kind: 'distance', meters: 1200 }, rest_s: 120 },
        { measure: { kind: 'distance', meters: 800 }, rest_s: 90 },
      ],
    });
  });

  test('una estación de EMOM: el objetivo es de la serie; la copia en cabecera sobra', () => {
    const libre = p({
      scheme: 'emom',
      modality: 'row',
      rounds: 10,
      work_s: 60,
      target: { kind: 'rpe', value: 7 },
      sets: [{ measure: { kind: 'calories', value: 12 }, target: { kind: 'rpe', value: 7 }, modality: 'row' }],
    });
    expect(canonicalPrescription(libre)).toEqual({
      scheme: 'emom',
      modality: 'row',
      rounds: 10,
      work_s: 60,
      sets: [{ measure: { kind: 'calories', value: 12 }, target: { kind: 'rpe', value: 7 } }],
    });
  });

  test('un objetivo relativo igual en serie y cabecera también se reconoce igual', () => {
    const rel: Prescription['target'] = { kind: 'relative', ref: { of: 'race_pace', modality: 'run' } };
    const out = canonicalPrescription(
      p({ scheme: 'for_time', rounds: 3, target: rel, sets: [{ measure: { kind: 'reps', value: 10 }, target: rel }] }),
    );
    expect(out.target).toBeUndefined();
  });
});

describe('prescriptionToParams — una serie representativa se cuenta por sus rondas', () => {
  test('6 × 3′ de remo resume 6 series, 180 s y el descanso de cabecera', () => {
    const params = prescriptionToParams(
      canonicalPrescription(p({ scheme: 'intervals', modality: 'row', rounds: 6, work_s: 180, rest_s: 120 })),
    );
    expect(params.sets).toBe(6);
    expect(params.duration_seconds).toBe(180);
    expect(params.rest_seconds).toBe(120);
  });

  test('una tabla de fuerza sigue contando sus series', () => {
    const params = prescriptionToParams(
      p({ scheme: 'sets', sets: [{ measure: { kind: 'reps', value: 5 } }, { measure: { kind: 'reps', value: 5 } }] }),
    );
    expect(params.sets).toBe(2);
  });
});
