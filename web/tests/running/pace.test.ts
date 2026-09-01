import { describe, expect, it } from 'vitest';
import { speedSeriesToPace, type RunningTraceSeries } from '@fahybrid/shared/domain/running/pace';

const series = (offsets_s: number[], values: number[]): RunningTraceSeries => ({ offsets_s, values });

describe('speedSeriesToPace', () => {
  it('convierte m/s a s/km punto a punto', () => {
    const pace = speedSeriesToPace(series([0, 10], [4, 5]));
    expect(pace.offsets_s).toEqual([0, 10]);
    expect(pace.values).toEqual([250, 200]); // 1000/4=250, 1000/5=200
  });

  it('omite (nunca fabrica) los puntos con velocidad <= 0 — parado no tiene ritmo', () => {
    const pace = speedSeriesToPace(series([0, 10, 20], [4, 0, -1]));
    expect(pace.offsets_s).toEqual([0]);
    expect(pace.values).toEqual([250]);
  });

  it('serie vacía da una serie vacía', () => {
    expect(speedSeriesToPace(series([], []))).toEqual({ offsets_s: [], values: [] });
  });
});
