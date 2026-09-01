import { describe, expect, it } from 'vitest';
import { downsampleSeries, type RunningTraceSeries } from '@fahybrid/shared/domain/running/downsample';

const series = (offsets_s: number[], values: number[]): RunningTraceSeries => ({ offsets_s, values });

describe('downsampleSeries — el test que acepta la pieza: los picos sobreviven', () => {
  it('una oscilación de periodo 2 (el caso adversario de la decimación ingenua) conserva AMBAS fases en cada cubo', () => {
    // 200 muestras alternando 180/120 estrictamente — el peor caso posible
    // para "uno de cada N": con N par, una decimación ingenua caería siempre
    // en la MISMA fase y enseñaría una línea plana en 180 (o en 120) donde
    // había una sierra entera. El bucketing mín/máx no puede fallar así: dos
    // fases distintas dentro de un mismo cubo SIEMPRE producen mín Y máx.
    const offsets_s = Array.from({ length: 200 }, (_, i) => i * 5);
    const values = offsets_s.map((_, i) => (i % 2 === 0 ? 180 : 120));

    const reduced = downsampleSeries(series(offsets_s, values), 40);

    expect(reduced.values.length).toBeLessThanOrEqual(40);
    // 200 puntos / 20 cubos = 10 puntos por cubo, división exacta → cada cubo
    // aporta EXACTAMENTE su mín y su máx: 40 puntos, 20 de cada valor.
    expect(reduced.values).toHaveLength(40);
    expect(reduced.values.filter((v) => v === 180)).toHaveLength(20);
    expect(reduced.values.filter((v) => v === 120)).toHaveLength(20);
    // Nunca un valor intermedio inventado.
    expect(reduced.values.every((v) => v === 180 || v === 120)).toBe(true);
  });

  it('el máximo y el mínimo GLOBAL de la traza sobreviven siempre, sea cual sea el presupuesto', () => {
    const offsets_s = Array.from({ length: 500 }, (_, i) => i);
    const values = offsets_s.map((t) => 150 + 30 * Math.sin(t / 7));
    values[237] = 999; // un pico aislado, aguja en el pajar
    values[411] = -50; // un valle aislado

    const reduced = downsampleSeries(series(offsets_s, values), 30);
    expect(Math.max(...reduced.values)).toBe(999);
    expect(Math.min(...reduced.values)).toBe(-50);
  });

  it('un 6×800 sintético (picos de trabajo cortos entre recuperaciones) no se aplana', () => {
    // 6 tramos de trabajo (170 lpm, 60 s) alternando con 6 de recuperación
    // (125 lpm, 40 s), muestreados cada 5 s — 120 muestras totales.
    const offsets_s: number[] = [];
    const values: number[] = [];
    let t = 0;
    for (let rep = 0; rep < 6; rep++) {
      for (let i = 0; i < 12; i++, t += 5) {
        offsets_s.push(t);
        values.push(170);
      }
      for (let i = 0; i < 8; i++, t += 5) {
        offsets_s.push(t);
        values.push(125);
      }
    }

    const reduced = downsampleSeries(series(offsets_s, values), 60);
    // Las seis subidas de verdad tienen que verse: al menos UN punto de 170
    // por cada una de las 6 repeticiones (no solo "alguno, en algún sitio") —
    // nunca "aplanado a un rodaje continuo".
    const peakOffsetsByRep = Array.from({ length: 6 }, (_, rep) => offsets_s[rep * 20]!); // el primer punto de cada tramo de trabajo
    const repsWithSurvivingPeak = peakOffsetsByRep.filter((t) => reduced.offsets_s.includes(t)).length;
    expect(reduced.values).toContain(170);
    expect(reduced.values).toContain(125);
    expect(repsWithSurvivingPeak).toBe(6);
  });
});

describe('downsampleSeries — presupuesto y honestidad', () => {
  it('nunca supera el presupuesto, aunque la traza sea enorme', () => {
    const offsets_s = Array.from({ length: 10_000 }, (_, i) => i);
    const values = offsets_s.map(() => Math.random() * 200);
    expect(downsampleSeries(series(offsets_s, values), 600).values.length).toBeLessThanOrEqual(600);
  });

  it('sin reducción cuando la traza ya cabe en el presupuesto — nunca infla', () => {
    const s = series([0, 10, 20], [100, 110, 105]);
    expect(downsampleSeries(s, 600)).toEqual(s);
  });

  it('nunca rellena un hueco: un salto grande en la traza sigue siendo un salto en la salida', () => {
    const before = Array.from({ length: 20 }, (_, i) => i * 5); // 0..95
    const after = Array.from({ length: 20 }, (_, i) => 2000 + i * 5); // 2000..2095, hueco de ~1900s
    const offsets_s = [...before, ...after];
    const values = offsets_s.map(() => 150);

    const reduced = downsampleSeries(series(offsets_s, values), 10);
    const gaps = reduced.offsets_s.slice(1).map((t, i) => t - reduced.offsets_s[i]!);
    expect(Math.max(...gaps)).toBeGreaterThan(1000); // el hueco se ve, no se disimula
  });

  it('traza vacía da una serie vacía, no un error', () => {
    expect(downsampleSeries(series([], []), 100)).toEqual({ offsets_s: [], values: [] });
  });

  it('ordena por tiempo antes de reducir', () => {
    const ordered = downsampleSeries(series([0, 10, 20, 30], [1, 2, 3, 4]), 2);
    const shuffled = downsampleSeries(series([20, 0, 30, 10], [3, 1, 4, 2]), 2);
    expect(shuffled).toEqual(ordered);
  });
});
