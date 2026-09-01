// El tipo de sesión (#carrera-hub-ios, 13-ago-2026) — CADA caso de aquí es un
// caso REAL de `web/tests/prescription/to-text-structure.test.ts`, incluido el
// fartlek que el coach dictó de verdad el 10-ago-2026 (ver esa cabecera). Es el
// stress-test de build-right contra la realidad: si un caso real deja de
// clasificar, el modelo está mal, no el test.

import { describe, expect, test } from 'vitest';
import type { RunStructure } from '@fahybrid/shared/domain/prescription/run-structure';
import {
  classifyRunSessionType,
  runSessionDoseLabel,
  RUN_SESSION_TYPES,
} from '@fahybrid/shared/domain/running/session-type';

const main = (elements: RunStructure[number]['elements']): RunStructure => [{ role: 'main', elements }];

describe('classifyRunSessionType', () => {
  test('sin estructura → null', () => {
    expect(classifyRunSessionType(null)).toBeNull();
    expect(classifyRunSessionType(undefined)).toBeNull();
    expect(classifyRunSessionType([])).toBeNull();
  });

  test('estructura sin fase principal → null', () => {
    const noMain: RunStructure = [
      { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: null }] },
    ];
    expect(classifyRunSessionType(noMain)).toBeNull();
  });

  test('el fartlek REAL dictado por el coach (10-ago-2026): 16×(500m @ Z4 pulso / 1\' trote Z2)', () => {
    const structure = main([
      {
        times: 16,
        elements: [
          { kind: 'work', measure: { type: 'distance', m: 500 }, target: { type: 'hr_zone', zone: 4 } },
          {
            kind: 'recovery',
            measure: { type: 'duration', s: 60 },
            target: { type: 'hr_zone', zone: 2 },
            recovery_mode: 'trote',
          },
        ],
      },
    ]);
    expect(classifyRunSessionType(structure)).toBe('fartlek');
    expect(runSessionDoseLabel(structure)).toBe('16×500');
  });

  test('series clásicas: 4×(400m @ Z4 ritmo / r1\')', () => {
    const structure = main([
      {
        times: 4,
        elements: [
          { kind: 'work', measure: { type: 'distance', m: 400 }, target: { type: 'pace_zone', zone: 4 } },
          { kind: 'recovery', measure: { type: 'duration', s: 60 }, target: null, recovery_mode: 'parado' },
        ],
      },
    ]);
    expect(classifyRunSessionType(structure)).toBe('series');
    expect(runSessionDoseLabel(structure)).toBe('4×400');
  });

  test('una repetición de un solo tramo, sin recuperación: 4×1000m @ ritmo → series', () => {
    const structure = main([
      { times: 4, elements: [{ kind: 'work', measure: { type: 'distance', m: 1000 }, target: { type: 'pace', value_s: 250 } }] },
    ]);
    expect(classifyRunSessionType(structure)).toBe('series');
    expect(runSessionDoseLabel(structure)).toBe('4×1000');
  });

  test('cuesta con repeticiones: 8×(45\'\' @ RPE 8-9 al 8% / 2\' caminar) → cuestas, no fartlek', () => {
    const structure = main([
      {
        times: 8,
        elements: [
          { kind: 'work', measure: { type: 'duration', s: 45 }, target: { type: 'rpe', min: 8, max: 9 }, incline_pct: 8 },
          { kind: 'recovery', measure: { type: 'duration', s: 120 }, target: null, recovery_mode: 'caminar' },
        ],
      },
    ]);
    expect(classifyRunSessionType(structure)).toBe('cuestas');
    // La pendiente prima sobre la forma "N×duración+RPE" que solo leería fartlek.
    expect(runSessionDoseLabel(structure)).toBe("8×45''");
  });

  test('cuesta continua sin repeticiones: 20\' al 6,5% → cuestas', () => {
    const structure = main([{ kind: 'work', measure: { type: 'duration', s: 1200 }, target: null, incline_pct: 6.5 }]);
    expect(classifyRunSessionType(structure)).toBe('cuestas');
    expect(runSessionDoseLabel(structure)).toBeNull();
  });

  test('recuperación medida en distancia (200m al trote) no cambia la clasificación', () => {
    const structure = main([
      {
        times: 4,
        elements: [
          { kind: 'work', measure: { type: 'distance', m: 400 }, target: { type: 'pace_zone', zone: 4 } },
          { kind: 'recovery', measure: { type: 'distance', m: 200 }, target: null, recovery_mode: 'trote' },
        ],
      },
    ]);
    expect(classifyRunSessionType(structure)).toBe('series');
  });

  test('anidado 3×(4×400 @ RPE9 / r1\') / r3\': series, y la dosis corta no se inventa', () => {
    const structure = main([
      {
        times: 3,
        elements: [
          {
            times: 4,
            elements: [
              { kind: 'work', measure: { type: 'distance', m: 400 }, target: { type: 'rpe', value: 9 } },
              { kind: 'recovery', measure: { type: 'duration', s: 60 }, target: null, recovery_mode: 'parado' },
            ],
          },
          { kind: 'recovery', measure: { type: 'duration', s: 180 }, target: null, recovery_mode: 'parado' },
        ],
      },
    ]);
    expect(classifyRunSessionType(structure)).toBe('series');
    // El nivel superior no tiene tramo de trabajo propio (solo un Repeat y un
    // descanso): no hay "N×medida" limpio, y se declara null en vez de adivinar.
    expect(runSessionDoseLabel(structure)).toBeNull();
  });

  test('progresivo heterogéneo: 1000@Z2 / 1000@Z3 / 1000@Z4, tramo a tramo', () => {
    const structure = main(
      [2, 3, 4].map((zone) => ({
        kind: 'work' as const,
        measure: { type: 'distance' as const, m: 1000 },
        target: { type: 'pace_zone' as const, zone },
      })),
    );
    expect(classifyRunSessionType(structure)).toBe('progresivo');
    expect(runSessionDoseLabel(structure)).toBeNull();
  });

  test('pirámide sin envoltorio Repeat (200-400-600-800-600-400-200, con recuperación) → series, no progresivo', () => {
    const structure = main(
      [200, 400, 600, 800, 600, 400, 200].flatMap((m) => [
        { kind: 'work' as const, measure: { type: 'distance' as const, m }, target: { type: 'pace' as const, value_s: 240 } },
        { kind: 'recovery' as const, measure: { type: 'duration' as const, s: 90 }, target: null, recovery_mode: 'trote' as const },
      ]),
    );
    expect(classifyRunSessionType(structure)).toBe('series');
  });

  test('un único tramo de trabajo (rodaje/tempo/largo) → continuo, sin distinguir cuál', () => {
    const rodaje = main([{ kind: 'work', measure: { type: 'duration', s: 2700 }, target: { type: 'hr_zone', zone: 2 } }]);
    expect(classifyRunSessionType(rodaje)).toBe('continuo');
    expect(runSessionDoseLabel(rodaje)).toBeNull();
  });

  test('estructura corrupta (tramo sin medida) nunca lanza — un único tramo cae a continuo', () => {
    // En producción esto no llega aquí: `safeParseRunStructure` lo rechaza antes
    // (el editor solo escribe estructura validada). El clasificador solo tiene
    // que sobrevivir a la forma, no revalidar lo que Zod ya garantizó.
    const corrupt = [{ role: 'main', elements: [{ kind: 'work', target: { type: 'pace_zone', zone: 4 } }] }] as unknown as RunStructure;
    expect(() => classifyRunSessionType(corrupt)).not.toThrow();
    expect(classifyRunSessionType(corrupt)).toBe('continuo');
  });

  test('el catálogo es exactamente estos cinco slugs', () => {
    expect(RUN_SESSION_TYPES).toEqual(['series', 'fartlek', 'cuestas', 'progresivo', 'continuo']);
  });
});
