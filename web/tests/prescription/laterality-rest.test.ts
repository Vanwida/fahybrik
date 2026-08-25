/**
 * Card 128 · hueco 2: por lado, ámbito del descanso, descanso activo.
 * Líneas literales del ciclo de 12 semanas. El número escrito se queda;
 * la analítica cuenta los dos lados. Los descansos que ya viajaban fuera
 * del contrato entran en el tipo. Entre bloques / vueltas no se inventan.
 */
import { describe, expect, test } from 'vitest';
import { asScopedGroupRest } from '@fahybrid/shared/domain/import/rest-scope';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';
import {
  countWorked,
  lateralitySides,
  measureWorked,
  parsePrescription,
  prescriptionToParams,
  prescriptionToText,
  safeParsePrescription,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';

function detected(raw: string): Prescription {
  const [line] = parseNotationCell(raw);
  expect(line, raw).toBeDefined();
  expect(line!.confidence, raw).toBe('detected');
  return line!.prescription;
}

describe('laterality — el número escrito, el trabajo es el doble', () => {
  test('8 por lado son 16 reps de trabajo, no un ejercicio nuevo', () => {
    expect(lateralitySides('per_side')).toBe(2);
    expect(countWorked(8, 'per_side')).toBe(16);
    expect(countWorked(8, undefined)).toBe(8);
    expect(measureWorked({ kind: 'reps', value: 6 }, 'per_side')).toBe(12);
    expect(measureWorked({ kind: 'duration', seconds: 30 }, 'per_side')).toBe(60);
  });

  test('el schema acepta laterality y un row viejo sigue igual', () => {
    const typed = parsePrescription({
      scheme: 'sets',
      laterality: 'per_side',
      sets: [{ measure: { kind: 'reps', value: 6 } }],
    });
    expect(typed.laterality).toBe('per_side');
    const legacy = parsePrescription({
      scheme: 'sets',
      sets: [{ measure: { kind: 'reps', value: 8 } }],
    });
    expect(legacy.laterality).toBeUndefined();
    expect(safeParsePrescription({ scheme: 'sets', laterality: 'both' }).success).toBe(false);
  });

  test('la nota «8/lado» o «por lado» se levanta al campo', () => {
    const fromLine = parsePrescription({
      scheme: 'sets',
      note: '8/lado',
      sets: [{ measure: { kind: 'reps', value: 8 } }],
    });
    expect(fromLine.laterality).toBe('per_side');
    const fromSets = parsePrescription({
      scheme: 'sets',
      sets: [
        { measure: { kind: 'reps', value: 4 }, note: 'por lado' },
        { measure: { kind: 'reps', value: 4 }, note: 'por lado' },
      ],
    });
    expect(fromSets.laterality).toBe('per_side');
  });

  test('«6 por lado Bulgarian split squat 2DB» bajo cabecera', () => {
    const p = detected(`4 series:
6 por lado Bulgarian split squat 2DB`);
    expect(p.laterality).toBe('per_side');
    expect(p.sets?.[0]?.measure).toEqual({ kind: 'reps', value: 6 });
    expect(countWorked(6, p.laterality)).toBe(12);
    expect(prescriptionToText(p)).toMatch(/por lado/);
  });

  test('«10 Paloff press por lado» bajo cabecera', () => {
    const p = detected(`4 series:
10 Paloff press por lado`);
    expect(p.laterality).toBe('per_side');
    expect(p.sets?.[0]?.measure).toEqual({ kind: 'reps', value: 10 });
    expect(countWorked(10, p.laterality)).toBe(20);
  });

  test('«30" Side plank por lado» bajo cabecera', () => {
    const p = detected(`4 series:
30" Side plank por lado`);
    expect(p.laterality).toBe('per_side');
    expect(p.sets?.[0]?.measure).toEqual({ kind: 'duration', seconds: 30 });
    expect(measureWorked(p.sets![0]!.measure!, p.laterality)).toBe(60);
  });

  test('«3 rounds RDL 8/lado»', () => {
    const p = detected('3 rounds RDL 8/lado');
    expect(p.laterality).toBe('per_side');
    expect(p.sets).toHaveLength(3);
    expect(p.sets![0]!.measure).toEqual({ kind: 'reps', value: 8 });
    expect(p.note).toBe('8/lado');
    expect(countWorked(8, p.laterality) * 3).toBe(48);
  });

  test('el salto al cajón a una pierna NO es laterality', () => {
    const [line] = parseNotationCell('6 Box jump unilateral aterrizando a una pierna');
    expect(line).toBeDefined();
    expect(line!.prescription.laterality).toBeUndefined();
  });
});

describe('ámbito del descanso — los que ya viajaban fuera del contrato', () => {
  test('levanta rest_between_rounds_seconds y restBetweenRoundsS', () => {
    const fromDb = parsePrescription({
      scheme: 'rounds',
      rounds: 4,
      rest_between_rounds_seconds: 120,
    });
    expect(fromDb.rest_between_rounds_s).toBe(120);
    expect((fromDb as { rest_between_rounds_seconds?: number }).rest_between_rounds_seconds).toBeUndefined();

    const fromIos = parsePrescription({
      scheme: 'rounds',
      rounds: 3,
      restBetweenRoundsS: 90,
    });
    expect(fromIos.rest_between_rounds_s).toBe(90);
  });

  test('levanta rest_between_stations_seconds', () => {
    const p = parsePrescription({
      scheme: 'rounds',
      rounds: 1,
      rest_between_stations_seconds: 15,
    });
    expect(p.rest_between_stations_s).toBe(15);
    expect(prescriptionToParams(p).rest_between_stations_seconds).toBe(15);
  });

  test('la admisión vieja se queda: «2\' rest» se traga, «5\' entre bloques» no', () => {
    const rounds = asScopedGroupRest("2' rest entre rondas");
    expect(rounds?.consume).toBe(true);
    expect(rounds?.scope).toBe('rounds');
    expect(rounds?.seconds).toBe(120);

    expect(asScopedGroupRest("5' entre bloques")).toBeUndefined();
    expect(asScopedGroupRest("5' andando entre bloques")).toBeUndefined();
    expect(asScopedGroupRest("5' en Zona 1 entre bloques")).toBeUndefined();
  });

  test('«2\' rest entre rondas» bajo cabecera va al campo de rondas, no a rest_s', () => {
    const lines = parseNotationCell(`4 rondas:
20 Wall balls
8 Devil press
2' rest entre rondas`);
    const work = lines.filter((l) => l.confidence === 'detected');
    expect(work).toHaveLength(2);
    expect(work.every((l) => l.prescription.rest_between_rounds_s === 120)).toBe(true);
    expect(work.every((l) => l.prescription.rest_s === undefined)).toBe(true);
  });

  test('«60" de descanso entre series» sigue en rest_s de la serie', () => {
    const lines = parseNotationCell(`4 series:
6 Dominadas estrictas
60" de descanso entre series`);
    const work = lines.filter((l) => l.confidence === 'detected');
    expect(work.length).toBeGreaterThan(0);
    expect(work.every((l) => l.prescription.sets?.[0]?.rest_s === 60 || l.prescription.rest_s === 60)).toBe(
      true,
    );
  });

  test('«5\' entre bloques» no inventa un sexto ámbito ni se mete en rest_s', () => {
    const lines = parseNotationCell(`4 series:
Back squat
5' entre bloques`);
    const work = lines.filter((l) => l.confidence === 'detected');
    expect(work.every((l) => l.prescription.rest_s === undefined)).toBe(true);
    expect(work.every((l) => l.prescription.rest_between_rounds_s === undefined)).toBe(true);
  });

  test('«1 vuelta · 2\' de descanso entre cada estacion»', () => {
    const rest = parseNotationCell(`4 rondas:
250m Ski erg
2' de descanso entre cada estacion`);
    const work = rest.filter((l) => l.confidence === 'detected');
    expect(work.some((l) => l.prescription.rest_between_stations_s === 120)).toBe(true);
  });
});

describe('descanso activo — rest con modalidad, no una serie fingida', () => {
  test('schema: measure + modality opcional, sin carga inventada', () => {
    const p = parsePrescription({
      scheme: 'rounds',
      rounds: 3,
      rest_between_rounds_s: 120,
      active_rest: { measure: { kind: 'duration', seconds: 120 }, modality: 'bike' },
    });
    expect(p.active_rest).toEqual({
      measure: { kind: 'duration', seconds: 120 },
      modality: 'bike',
    });
    expect(p.sets).toBeUndefined();
    expect(prescriptionToText(p)).toMatch(/descanso activo/);
    expect(prescriptionToText(p)).toMatch(/bici/);
  });

  test('«2\' de descanso activo en Air bike»', () => {
    const annotated = asScopedGroupRest("2' de descanso activo en Air bike");
    expect(annotated?.consume).toBe(false);
    expect(annotated?.active_rest?.modality).toBe('bike');

    const lines = parseNotationCell(`3 rondas:
20 Wall balls
2' de descanso activo en Air bike`);
    const work = lines.filter((l) => l.confidence === 'detected');
    expect(work.length).toBeGreaterThanOrEqual(2);
    expect(work.some((l) => l.prescription.active_rest?.modality === 'bike')).toBe(true);
    expect(work.some((l) => l.prescription.active_rest?.measure.kind === 'duration')).toBe(true);
  });

  test('«5\' de descanso entre rondas, soltando en bici»', () => {
    const lines = parseNotationCell(`3 rondas:
500m Ski erg a ritmo HYROX
5' de descanso entre rondas, soltando en bici`);
    const work = lines.filter((l) => l.confidence === 'detected');
    expect(work.some((l) => l.prescription.rest_between_rounds_s === 300)).toBe(true);
    expect(work.some((l) => l.prescription.active_rest?.modality === 'bike')).toBe(true);
  });

  test('«2\' de descanso parado» no es active_rest', () => {
    const lines = parseNotationCell(`3 rondas:
20 Wall balls
2' de descanso parado`);
    const work = lines.filter((l) => l.confidence === 'detected');
    expect(work.every((l) => l.prescription.active_rest === undefined)).toBe(true);
  });
});
