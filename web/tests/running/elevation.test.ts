import { describe, expect, it } from 'vitest';
import {
  computeElevation,
  ELEVATION_NOISE_THRESHOLD_M,
  type RunningTraceSeries,
} from '@fahybrid/shared/domain/running/elevation';

const series = (offsets_s: number[], values: number[]): RunningTraceSeries => ({ offsets_s, values });

describe('computeElevation — filtro de ruido (test que acepta la pieza)', () => {
  it('una traza LLANA que oscila por ruido de GPS da ~0, nunca la suma bruta de deltas positivos', () => {
    // Oscilación clásica de jitter: +1/-1 alrededor de 100 m. Una suma ingenua
    // de deltas positivos daría 5 (cinco subidas de +1); la histéresis contra
    // línea base da EXACTAMENTE 0 porque ninguna se aleja del umbral (3 m).
    const offsets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
    const values = [100, 101, 100, 101, 100, 101, 100, 101, 100, 101];
    const result = computeElevation({ altitude: series(offsets, values) });
    expect(result.elevation_gain_m).toBe(0);
    expect(result.elevation_loss_m).toBe(0);
  });

  it('un delta justo por debajo del umbral no cuenta; justo en el umbral sí', () => {
    const under = computeElevation({
      altitude: series([0, 10], [100, 100 + ELEVATION_NOISE_THRESHOLD_M - 0.01]),
    });
    expect(under.elevation_gain_m).toBe(0);

    const atThreshold = computeElevation({
      altitude: series([0, 10], [100, 100 + ELEVATION_NOISE_THRESHOLD_M]),
    });
    expect(atThreshold.elevation_gain_m).toBe(ELEVATION_NOISE_THRESHOLD_M);
  });
});

describe('computeElevation — subida y bajada reales', () => {
  it('acumula una subida constante por encima del umbral', () => {
    const result = computeElevation({ altitude: series([0, 10, 20, 30, 40, 50], [100, 104, 108, 112, 116, 120]) });
    expect(result.elevation_gain_m).toBe(20);
    expect(result.elevation_loss_m).toBe(0);
  });

  it('gain y loss se guardan por SEPARADO, nunca netos: subir y volver a bajar no es un llano', () => {
    const result = computeElevation({ altitude: series([0, 10, 20], [100, 110, 100]) });
    expect(result.elevation_gain_m).toBe(10);
    expect(result.elevation_loss_m).toBe(10);
  });
});

describe('computeElevation — cobertura', () => {
  it('con menos de dos muestras útiles, null (no hay delta que medir) — nunca 0', () => {
    expect(computeElevation({ altitude: series([0], [100]) })).toEqual({
      elevation_gain_m: null,
      elevation_loss_m: null,
    });
    expect(computeElevation({ altitude: series([], []) })).toEqual({
      elevation_gain_m: null,
      elevation_loss_m: null,
    });
  });

  it('ordena por tiempo antes de acumular', () => {
    const ordered = computeElevation({ altitude: series([0, 10, 20], [100, 104, 108]) });
    const shuffled = computeElevation({ altitude: series([20, 0, 10], [108, 100, 104]) });
    expect(shuffled).toEqual(ordered);
  });
});
