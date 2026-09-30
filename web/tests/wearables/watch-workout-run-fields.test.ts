// El entorno (M3), el cue (M8) y el aviso por tramo llegan al modelo neutro del
// reloj SIN tocar lo que ya emitía: ni el nombre del paso ni el objetivo cambian,
// así que los codificadores de fabricante (FIT, Suunto) producen los mismos bytes
// que antes. Un motor propio los lee del paso.

import { describe, expect, test } from 'vitest';
import { buildWatchWorkout } from '@fahybrid/shared/domain/wearables/watch-workout';
import type { RunStructure } from '@fahybrid/shared/domain/prescription';
import { encodeWorkoutFit } from '@/lib/wearables/fit/workout-encoder';

const plain: RunStructure = [
  { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'hr_zone', zone: 1 } }] },
  {
    role: 'main',
    elements: [
      {
        times: 3,
        elements: [
          { kind: 'work', measure: { type: 'distance', m: 1000 }, target: { type: 'pace', min_s: 225, max_s: 235 } },
          { kind: 'recovery', measure: { type: 'duration', s: 90 }, target: null, recovery_mode: 'trote' },
        ],
      },
    ],
  },
];

const decorated: RunStructure = [
  {
    role: 'warmup',
    elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'hr_zone', zone: 1 }, environment: 'cinta', cue: 'Suave al principio' }],
  },
  {
    role: 'main',
    elements: [
      {
        times: 3,
        elements: [
          { kind: 'work', measure: { type: 'distance', m: 1000 }, target: { type: 'pace', min_s: 225, max_s: 235 }, environment: 'cinta', alert: 'ambos' },
          { kind: 'recovery', measure: { type: 'duration', s: 90 }, target: null, recovery_mode: 'trote', environment: 'cinta', alert: 'ninguno' },
        ],
      },
    ],
  },
];

describe('WatchStep lleva el entorno, el cue y el aviso del tramo', () => {
  const w = buildWatchWorkout(decorated, {}, { name: 'Series' });

  test('los copia al paso tal como los escribió el coach', () => {
    expect(w.warmup).toMatchObject({ environment: 'cinta', cue: 'Suave al principio' });
    const [work, recovery] = w.blocks[0]!.steps;
    expect(work).toMatchObject({ environment: 'cinta', alert: 'ambos' });
    expect(recovery).toMatchObject({ environment: 'cinta', alert: 'ninguno' });
  });

  test('sin los campos, el paso no los lleva (ni siquiera como undefined)', () => {
    const p = buildWatchWorkout(plain, {}, { name: 'Series' });
    for (const step of [p.warmup!, ...p.blocks[0]!.steps]) {
      expect(step).not.toHaveProperty('environment');
      expect(step).not.toHaveProperty('cue');
      expect(step).not.toHaveProperty('alert');
    }
  });

  test('el nombre del paso y el objetivo son los mismos con y sin los campos nuevos', () => {
    const p = buildWatchWorkout(plain, {}, { name: 'Series' });
    expect(w.warmup!.name).toBe(p.warmup!.name);
    expect(w.warmup!.target).toEqual(p.warmup!.target);
    expect(w.blocks[0]!.steps.map((s) => s.name)).toEqual(p.blocks[0]!.steps.map((s) => s.name));
    expect(w.blocks[0]!.steps.map((s) => s.target)).toEqual(p.blocks[0]!.steps.map((s) => s.target));
  });

  test('el fichero FIT es idéntico byte a byte: el codificador de fabricante ignora los campos nuevos', () => {
    const opts = { createdAt: new Date('2026-09-29T08:00:00Z'), serialNumber: 7 };
    const a = encodeWorkoutFit(buildWatchWorkout(plain, {}, { name: 'Series' }), opts);
    const b = encodeWorkoutFit(w, opts);
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
  });
});
