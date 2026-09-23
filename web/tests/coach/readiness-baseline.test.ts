// La base propia de readiness (web/lib/coach/attention/readiness-baseline) — lo
// que roster, ficha y señal llaman «su base».

import { describe, expect, it } from 'vitest';
import {
  assessReadiness,
  readinessBaseline,
  readinessTrend,
  type ReadinessReading,
} from '@/lib/coach/attention/readiness-baseline';

const T = { readiness_critical_floor: 40, readiness_drop_points: 15, readiness_drop_days: 3, readiness_max_age_days: 2 };

function day(offset: number): string {
  return new Date(Date.UTC(2026, 8, 23 + offset)).toISOString().slice(0, 10);
}
function run(values: number[], end = 0): ReadinessReading[] {
  return values.map((score, i) => ({ on: day(end - (values.length - 1 - i)), score }));
}

describe('readinessBaseline', () => {
  it('mediana de los 28 días ANTERIORES a la lectura (la propia no entra)', () => {
    const s = [...run([60, 62, 64, 66, 68, 70, 72], -1), { on: day(0), score: 20 }];
    expect(readinessBaseline(s, day(0))).toEqual({ baseline: 66, readings: 7 });
  });

  it('sin 7 lecturas no hay base', () => {
    expect(readinessBaseline(run([60, 61, 62], -1), day(0))).toEqual({ baseline: null, readings: 3 });
  });

  it('solo mira 28 días atrás', () => {
    const old = run(Array.from({ length: 10 }, () => 90), -40);
    const recent = run([50, 50, 50, 50, 50, 50, 50], -1);
    expect(readinessBaseline([...old, ...recent], day(0)).baseline).toBe(50);
  });

  it('con número par de lecturas redondea la media de las dos centrales', () => {
    expect(readinessBaseline(run([50, 51, 52, 53, 54, 55, 56, 57], -1), day(0)).baseline).toBe(54);
  });
});

describe('readinessTrend', () => {
  it('14 posiciones, la más vieja primero, null donde no hubo lectura', () => {
    const t = readinessTrend([{ on: day(0), score: 70 }, { on: day(-2), score: 60 }], day(0));
    expect(t).toHaveLength(14);
    expect(t[13]).toBe(70);
    expect(t[12]).toBeNull();
    expect(t[11]).toBe(60);
  });
});

describe('assessReadiness', () => {
  it('sin lecturas: nada, marcado como viejo', () => {
    expect(assessReadiness([], day(0), T)).toMatchObject({ fires: false, stale: true, latest: null });
  });

  it('la frescura manda: una lectura de hace 3 días no dispara', () => {
    expect(assessReadiness(run([20], -3), day(0), T)).toMatchObject({ fires: false, stale: true, age_days: 3 });
  });

  it('el episodio empieza el primer día de la racha marcada', () => {
    const stable = Array.from({ length: 20 }, () => 70);
    const a = assessReadiness(run([...stable, 38, 52, 50]), day(0), T);
    expect(a).toMatchObject({ fires: true, severity: 'warning', drop_streak_days: 3, episode_start: day(-2) });
  });
});
