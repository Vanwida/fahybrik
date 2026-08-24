/**
 * Card 141 — una cabecera manda sobre las líneas de debajo.
 *
 * Tres formas del ciclo real. La cabecera guarda lo que prescribe; los hijos
 * heredan eso y nada más. Si no hay reps en la cabecera, la línea entra sin
 * reps. Si la estructura no está clara, la línea va a revisión con su texto.
 */
import { describe, expect, test } from 'vitest';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';

describe('cabecera que manda — N series: (solo series)', () => {
  test('los hijos desnudos heredan las series y no se inventan reps', () => {
    const lines = parseNotationCell(`4 series:
Band scapular retraction
Banded front raise
Scapular push up`);
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.confidence === 'detected')).toBe(true);
    expect(lines.map((l) => l.exercise_token)).toEqual([
      'Band scapular retraction',
      'Banded front raise',
      'Scapular push up',
    ]);
    for (const l of lines) {
      expect(l.prescription.scheme).toBe('sets');
      expect(l.prescription.sets).toHaveLength(4);
      expect(l.prescription.sets!.every((s) => s.measure === undefined)).toBe(true);
    }
  });

  test('el hijo que ya trae reps las conserva: 4 series de 6 dominadas', () => {
    const lines = parseNotationCell(`4 series:
6 Dominadas estrictas (lastradas si se puede)
10 Remo invertido con barra
90" rest`);
    const work = lines.filter((l) => l.confidence === 'detected');
    expect(work).toHaveLength(2);
    expect(work[0]!.exercise_token).toMatch(/Dominadas/i);
    expect(work[0]!.prescription.sets).toHaveLength(4);
    expect(work[0]!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 6 });
    expect(work[1]!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 10 });
    expect(work[1]!.prescription.sets![0]!.rest_s).toBe(90);
    expect(lines.every((l) => l.exercise_token === '' && l.confidence === 'review')).toBe(false);
  });

  test('carga y RIR del hijo se conservan', () => {
    const [l] = parseNotationCell(`4 series:
8 Press banca con barra RIR 3-4`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.sets).toHaveLength(4);
    expect(l!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 8 });
    expect(l!.prescription.sets![0]!.target).toEqual({ kind: 'rir', min: 3, max: 4 });
  });
});

describe('cabecera que manda — N series de N reps de:', () => {
  test('hijos desnudos heredan series y reps', () => {
    const lines = parseNotationCell(`2 series de 8 reps de:
Band scapular retraction
Banded front raise
Scapular push up`);
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.confidence === 'detected')).toBe(true);
    for (const l of lines) {
      expect(l.prescription.sets).toHaveLength(2);
      expect(l.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 8 });
    }
  });

  test('la duración del hijo gana: no se le pegan las reps de la cabecera', () => {
    const lines = parseNotationCell(`3 series de 10 reps de:
Cat cow
30" Side plank`);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 10 });
    expect(lines[1]!.exercise_token).toMatch(/Side plank/i);
    expect(lines[1]!.prescription.sets).toHaveLength(3);
    expect(lines[1]!.prescription.sets![0]!.measure).toEqual({ kind: 'duration', seconds: 30 });
  });

  test('las reps del hijo ganan sobre las de la cabecera', () => {
    const [l] = parseNotationCell(`3 series de 10 reps de:
20 Climb plank elbow to hand`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.sets).toHaveLength(3);
    expect(l!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 20 });
  });

  test('N series de N: (sin la palabra reps) es la misma forma', () => {
    const lines = parseNotationCell(`3 series de 8:
Puente de gluteo unilateral
Peso muerto unilateral con DB`);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.confidence === 'detected')).toBe(true);
    for (const l of lines) {
      expect(l.prescription.sets).toHaveLength(3);
      expect(l.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 8 });
    }
  });
});

describe('cabecera que manda — N rondas:', () => {
  test('cada hijo entra con las rondas y su propia medida', () => {
    const lines = parseNotationCell(`4 rondas:
400m Run
15 Wall balls`);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.confidence === 'detected')).toBe(true);
    expect(lines[0]!.prescription.rounds).toBe(4);
    expect(lines[0]!.prescription.sets).toHaveLength(4);
    expect(lines[0]!.prescription.sets![0]!.measure).toEqual({ kind: 'distance', meters: 400 });
    expect(lines[1]!.exercise_token).toMatch(/Wall balls/i);
    expect(lines[1]!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 15 });
    expect(lines[1]!.prescription.rounds).toBe(4);
  });

  test('el descanso entre rondas se reparte y no se convierte en ejercicio', () => {
    const lines = parseNotationCell(`4 rondas:
20 Wall balls
8 Devil press
2' rest entre rondas`);
    const work = lines.filter((l) => l.confidence === 'detected');
    expect(work).toHaveLength(2);
    expect(work.every((l) => l.prescription.sets![0]!.rest_s === 120)).toBe(true);
    expect(lines.every((l) => !/rest entre rondas/i.test(l.exercise_token))).toBe(true);
  });
});

describe('cabecera que manda — fiel o revisión', () => {
  test('una cabecera anidada no se lee como series planas', () => {
    const lines = parseNotationCell(`3 bloques de 8 series de:
30" a ritmo Microintervalos
30" andando rapido`);
    expect(lines[0]!.confidence).toBe('review');
    expect(lines[0]!.prescription.note).toContain('3 bloques de 8 series de:');
    expect(lines[0]!.prescription.sets).toBeUndefined();
  });

  test('si el hijo ya trae su propio Nx, no se adivina qué recuento manda', () => {
    const [l] = parseNotationCell(`4 series:
4 x 40'' on / 20'' off Side plank`);
    expect(l!.confidence).toBe('review');
    expect(l!.prescription.note).toContain('Side plank');
    expect(l!.prescription.sets).toBeUndefined();
  });

  test('la cabecera misma no se emite como ejercicio', () => {
    const lines = parseNotationCell(`4 series:
Band face pull`);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.exercise_token).toBe('Band face pull');
  });

  test('la línea suelta de siempre no cambia: 5 rounds en la misma línea', () => {
    const lines = parseNotationCell(`5 rounds c/2': 3 Power Clean 70-80% + 5 high box jump`);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.confidence === 'detected')).toBe(true);
    expect(lines[0]!.prescription.sets).toHaveLength(5);
    expect(lines[0]!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 3 });
  });
});
