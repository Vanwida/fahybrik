/**
 * Card 128 · hueco 5. Formas literales del ciclo de 12 semanas.
 * Fiel o revisión: el número que escribió el coach entra; si no se puede
 * tipar sin inventar, la línea se queda en revisión con el texto intacto.
 */
import { describe, expect, test } from 'vitest';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';
import { asScopedGroupRest } from '@fahybrid/shared/domain/import/rest-scope';

function detected(raw: string) {
  const lines = parseNotationCell(raw, { bareNamesAreExercises: true });
  return lines.filter((l) => l.confidence === 'detected');
}

describe('90-90 en el nombre no es un esquema de reps', () => {
  test('bajo 3 series de 10 reps hereda la cabecera', () => {
    const lines = parseNotationCell(`3 series de 10 reps de:
Cat cow
Movilidad cadera 90-90 to lunge
30" Side plank`);
    const hip = lines.find((l) => /90-90/.test(l.exercise_token));
    expect(hip?.confidence).toBe('detected');
    expect(hip?.prescription.sets).toHaveLength(3);
    expect(hip?.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 10 });
    expect(hip?.exercise_token).toMatch(/90-90/);
  });
});

describe('N bloques de M series de: (corte claro)', () => {
  test('los hijos heredan las series; los bloques son rondas', () => {
    const lines = parseNotationCell(`10' en Zona 2
3 bloques de 8 series de:
30" a ritmo Microintervalos
30" andando rapido
3' parado entre bloques
10' cool down en Zona 2`);
    const work = lines.filter((l) => l.confidence === 'detected' && l.exercise_token !== 'descanso');
    const micro = work.find((l) => /Microintervalos|ritmo/i.test(l.exercise_token));
    const walk = work.find((l) => /andando/i.test(l.exercise_token));
    expect(micro?.prescription.sets).toHaveLength(8);
    expect(micro?.prescription.rounds).toBe(3);
    expect(micro?.prescription.sets![0]!.measure).toEqual({ kind: 'duration', seconds: 30 });
    expect(walk?.prescription.sets).toHaveLength(8);
    expect(walk?.prescription.sets![0]!.measure).toEqual({ kind: 'duration', seconds: 30 });
    expect(lines[0]?.confidence).not.toBe('review');
  });

  test('N bloques de M rondas con Bloque A/B/C se queda en revisión', () => {
    const [header] = parseNotationCell(
      '3 bloques de 4 rondas · 2\' entre rondas, 5\' entre bloques',
    );
    expect(header?.confidence).toBe('review');
    expect(header?.prescription.note).toContain('3 bloques de 4 rondas');
  });
});

describe('dosis suelta sin recuento de series', () => {
  test('20 aperturas y cierres de mano es 1×20', () => {
    const [l] = detected('20 aperturas y cierres de mano');
    expect(l?.exercise_token).toMatch(/aperturas/i);
    expect(l?.prescription.sets).toHaveLength(1);
    expect(l?.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 20 });
  });

  test('15 por lado flexion de muneca con banda', () => {
    const [l] = detected('15 por lado flexion de muneca con banda');
    expect(l?.prescription.laterality).toBe('per_side');
    expect(l?.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 15 });
  });

  test('10 encogimientos con DB con parada', () => {
    const [l] = detected('10 encogimientos con DB con parada');
    expect(l?.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 10 });
  });

  test('25m Sandbag walking lunge', () => {
    const [l] = detected('25m Sandbag walking lunge');
    expect(l?.exercise_token).toMatch(/Sandbag/i);
    expect(l?.prescription.sets![0]!.measure).toEqual({ kind: 'distance', meters: 25 });
  });

  test('50 Wall balls', () => {
    const [l] = detected('50 Wall balls');
    expect(l?.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 50 });
  });
});

describe('descanso suelto y entre series', () => {
  test('90" entre series es descanso de series, sin la palabra descanso', () => {
    const rest = asScopedGroupRest('90" entre series');
    expect(rest?.seconds).toBe(90);
    expect(rest?.scope).toBe('sets');

    const lines = parseNotationCell(`4 x 25m Sandbag walking lunge
90" entre series`);
    const typed = lines.filter((l) => l.confidence === 'detected');
    expect(typed.length).toBeGreaterThanOrEqual(2);
    expect(typed.some((l) => l.prescription.rest_s === 90 || l.prescription.sets?.[0]?.rest_s === 90)).toBe(
      true,
    );
  });

  test('60" de descanso entre series tras una línea ya tipada', () => {
    const lines = parseNotationCell(`4 x 25m Sandbag walking lunge
60" de descanso entre series`);
    expect(lines.some((l) => l.confidence === 'detected')).toBe(true);
    expect(
      lines.some(
        (l) =>
          l.confidence === 'detected' &&
          (l.prescription.rest_s === 60 || l.prescription.sets?.[0]?.rest_s === 60),
      ),
    ).toBe(true);
  });

  test('2\' de descanso entre series y entre bloques no adivina el ámbito', () => {
    const [l] = parseNotationCell("2' de descanso entre series y entre bloques");
    expect(l?.confidence).toBe('review');
    expect(l?.prescription.note).toContain('entre series y entre bloques');
  });
});

describe('bici con tope de pulso no es un WOD', () => {
  test('45-90\' de bici en Zona 1, maximo 142 ppm', () => {
    const [l] = detected("45-90' de bici en Zona 1, maximo 142 ppm");
    expect(l?.prescription.modality).toBe('bike');
    expect(l?.prescription.sets?.[0]?.measure).toEqual({
      kind: 'duration',
      seconds: 45 * 60,
      max: 90 * 60,
    });
    expect(l?.prescription.hr_zone).toBe(1);
    expect(l?.prescription.target).toMatchObject({ kind: 'hr_bpm', max: 142 });
  });
});

describe('lista con punto medio bajo N series de:', () => {
  test('2 series de: 10 Cat cow · 10 90-90 · 5 por lado Cossack squat', () => {
    const lines = detected(
      '2 series de: 10 Cat cow · 10 90-90 · 5 por lado Cossack squat · 10" por lado Forward leg swing',
    );
    expect(lines.length).toBe(4);
    expect(lines.every((l) => l.prescription.sets?.length === 2)).toBe(true);
    expect(lines[0]!.exercise_token).toMatch(/Cat cow/i);
    expect(lines[0]!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 10 });
    expect(lines[1]!.exercise_token).toMatch(/90-90/);
    expect(lines[2]!.prescription.laterality).toBe('per_side');
    expect(lines[3]!.prescription.sets![0]!.measure).toEqual({ kind: 'duration', seconds: 10 });
  });
});

describe('3 rondas AFAP: es la misma cabecera de rondas', () => {
  test('50 Wall balls hereda las 3 rondas', () => {
    const lines = parseNotationCell(`3 rondas AFAP:
1000m Row
50 Wall balls
5' de descanso entre rondas`);
    const balls = lines.find((l) => /Wall balls/i.test(l.exercise_token));
    expect(balls?.confidence).toBe('detected');
    expect(balls?.prescription.rounds).toBe(3);
    expect(balls?.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 50 });
  });
});

describe('coma decimal no finge un WOD de dos estaciones', () => {
  test('3 x 12,5m Sled push a peso de competicion', () => {
    const [l] = parseNotationCell('3 x 12,5m Sled push a peso de competicion');
    expect(l?.confidence).toBe('detected');
    expect(l?.exercise_token).toMatch(/Sled push/i);
    expect(l?.prescription.sets).toHaveLength(3);
    expect(l?.prescription.sets![0]!.measure).toEqual({ kind: 'distance', meters: 12.5 });
  });
});

describe('lo que no se inventa', () => {
  test('carga media sin diccionario sigue en revisión', () => {
    const [l] = parseNotationCell('6 x 15m Sled push a carga media');
    expect(l?.confidence).toBe('review');
  });

  test('por encima del peso de competicion sin kilos sigue en revisión', () => {
    const [l] = parseNotationCell('10 Wall balls por encima del peso de competicion');
    expect(l?.confidence).toBe('review');
  });

  test('5\' entre bloques no se mete en rest_s', () => {
    expect(asScopedGroupRest("5' entre bloques")).toBeUndefined();
  });
});
