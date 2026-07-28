// Una fórmula, un número: el roster y la ficha del atleta tienen que dar lo
// mismo, y «no puntuable» no es lo mismo que «cero».

import { describe, expect, test } from 'vitest';
import { estimateRaceReadiness } from '@fahybrid/shared/domain/coach/race-readiness';
import { readLoadCoverage, summarizeLoad } from '@fahybrid/shared/domain/training-load';
import type { RaceReadinessInput } from '@fahybrid/shared/domain/coach/race-readiness';

function coverage(knownSeconds: number, unknownSeconds: number, unknownSessions: number) {
  return readLoadCoverage(
    summarizeLoad([
      {
        date: '2026-07-01',
        tss: 60,
        known_seconds: knownSeconds,
        unknown_seconds: unknownSeconds,
        unknown_sessions: unknownSessions,
      },
    ]),
  );
}

const FULL = coverage(3600, 0, 0);
const HOLED = coverage(1800, 1800, 2);

function input(overrides: Partial<RaceReadinessInput> = {}): RaceReadinessInput {
  return {
    tsb: 0,
    compliance_pct: 90,
    hrv_delta_ms: 0,
    active_days_7d: 4,
    load_coverage: FULL,
    ...overrides,
  };
}

describe('estimateRaceReadiness', () => {
  test('con las cuatro señales puntúa dentro de 0..100', () => {
    const score = estimateRaceReadiness(input());
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(100);
  });

  test('más frescura puntúa más', () => {
    const fresh = estimateRaceReadiness(input({ tsb: 10 }))!;
    const cooked = estimateRaceReadiness(input({ tsb: -10 }))!;
    expect(fresh).toBeGreaterThan(cooked);
  });

  test('sin ninguna señal no hay número: no se inventa un ~50 de partida', () => {
    expect(
      estimateRaceReadiness(
        input({ active_days_7d: 0, hrv_delta_ms: null, compliance_pct: null }),
      ),
    ).toBeNull();
  });

  test('sin TSB no hay número: la frescura son 40 de los 100 puntos', () => {
    // La copia de la ficha hacía `tsb ?? 0`, que son 20 de esos 40 puntos
    // regalados a un atleta cuya frescura nadie había calculado.
    expect(estimateRaceReadiness(input({ tsb: null }))).toBeNull();
  });

  test('con la carga a medias tampoco: el número saldría con ±40 de incertidumbre', () => {
    expect(estimateRaceReadiness(input({ load_coverage: HOLED }))).toBeNull();
    expect(estimateRaceReadiness(input({ load_coverage: FULL }))).not.toBeNull();
  });

  test('la puerta de la cobertura manda incluso sobre un atleta impecable', () => {
    expect(
      estimateRaceReadiness(
        input({ tsb: 10, compliance_pct: 100, hrv_delta_ms: 10, load_coverage: HOLED }),
      ),
    ).toBeNull();
  });

  test('los cuatro tramos suman 100 en el mejor caso posible', () => {
    expect(
      estimateRaceReadiness(
        input({ tsb: 10, compliance_pct: 100, hrv_delta_ms: 10, active_days_7d: 7 }),
      ),
    ).toBe(100);
  });
});
