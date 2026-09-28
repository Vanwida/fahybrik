import { describe, expect, it } from 'vitest';
import { buildModalityRows, modalityBucket, type ModalitySegment } from '@/lib/coach/deep-dive-modality';

// El reparto de la semana del deep dive se clasifica por lo que se HIZO (la
// modalidad del tramo) y no por la plantilla; un remo no es correr; los % suman 100.

const seg = (over: Partial<ModalitySegment>): ModalitySegment => ({
  modality: null,
  category: null,
  exercise_modality: null,
  seconds: 0,
  meters: 0,
  reps_completed: null,
  weight_used_kg: null,
  sets: [],
  ...over,
});

describe('modalityBucket', () => {
  it('manda la modalidad del tramo; remo, ski y bici son ergómetro, nunca carrera', () => {
    expect(modalityBucket(seg({ modality: 'run' }))).toBe('running');
    expect(modalityBucket(seg({ modality: 'row', category: 'cardio' }))).toBe('erg');
    expect(modalityBucket(seg({ modality: 'ski' }))).toBe('erg');
    expect(modalityBucket(seg({ modality: 'bike' }))).toBe('erg');
    expect(modalityBucket(seg({ modality: 'strength' }))).toBe('strength');
  });

  it('sin modalidad útil, decide el movimiento; una estación HYROX es HYROX', () => {
    expect(modalityBucket(seg({ modality: 'other', category: 'hyrox_station' }))).toBe('hyrox');
    expect(modalityBucket(seg({ modality: 'strength', category: 'hyrox_station' }))).toBe('hyrox');
    expect(modalityBucket(seg({ modality: 'functional', category: 'core' }))).toBe('strength');
    expect(modalityBucket(seg({ modality: 'other', category: 'plyometric' }))).toBe('skill');
    expect(modalityBucket(seg({ modality: 'other', category: 'mobility' }))).toBe('recovery');
    expect(modalityBucket(seg({ modality: 'other', category: 'cardio', exercise_modality: 'row' }))).toBe('erg');
    expect(modalityBucket(seg({ modality: 'other', category: 'cardio', exercise_modality: 'run' }))).toBe('running');
  });

  it('una importación de Salud sin ejercicio (caminata, yoga) es «other», no desaparece', () => {
    expect(modalityBucket(seg({ modality: 'other' }))).toBe('other');
    expect(modalityBucket(seg({ modality: null }))).toBe('other');
  });
});

describe('buildModalityRows', () => {
  it('los % suman 100, los km son solo de carrera y los kg salen de las series', () => {
    const { rows, total_seconds } = buildModalityRows([
      seg({ modality: 'run', seconds: 1000, meters: 3000 }),
      seg({ modality: 'row', category: 'cardio', seconds: 1000, meters: 4000 }),
      seg({
        modality: 'strength',
        seconds: 1000,
        sets: [
          { reps: 5, kg: 100, status: 'done' },
          { reps: 5, kg: 110, status: 'done' },
          { reps: 3, kg: 120, status: 'skipped' },
        ],
      }),
      seg({ modality: 'other', category: 'core', seconds: 500, reps_completed: 10, weight_used_kg: 20 }),
      seg({ modality: 'other', seconds: 500 }),
    ]);
    const by = new Map(rows.map((r) => [r.key, r]));
    expect(total_seconds).toBe(4000);
    expect(rows.reduce((n, r) => n + r.pct, 0)).toBe(100);
    expect(by.get('running')).toMatchObject({ km: 3, pct: 25 });
    expect(by.get('erg')).toMatchObject({ km: null, pct: 25 });
    // core cuenta como fuerza: se SUMA a la fila, no la pisa.
    expect(by.get('strength')).toMatchObject({ pct: 38, kg: 1050 + 200 });
    expect(by.get('other')).toMatchObject({ pct: 12 });
  });

  it('tres tercios redondean a 100, no a 99', () => {
    const { rows } = buildModalityRows([
      seg({ modality: 'run', seconds: 100 }),
      seg({ modality: 'row', seconds: 100 }),
      seg({ modality: 'strength', seconds: 100 }),
    ]);
    expect(rows.reduce((n, r) => n + r.pct, 0)).toBe(100);
  });

  it('sin tiempo, todo a cero (nada inventado)', () => {
    const { rows, total_seconds } = buildModalityRows([]);
    expect(total_seconds).toBe(0);
    expect(rows.every((r) => r.pct === 0 && r.hours === 0)).toBe(true);
  });
});
