import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEY_MARKERS,
  KEY_MARKERS_MAX,
  formatKeyMarkerValue,
  resolveKeyMarkers,
} from '@fahybrid/shared/domain/coach/key-markers';

describe('marcadores clave del coach', () => {
  it('sin elegir nada, los cuatro de siempre', () => {
    expect(resolveKeyMarkers([]).map((d) => d.key)).toEqual([...DEFAULT_KEY_MARKERS]);
  });
  it('lo elegido, en su orden; lo desconocido se ignora', () => {
    expect(resolveKeyMarkers(['row_2k', 'nope', 'max_hr']).map((d) => d.key)).toEqual(['row_2k', 'max_hr']);
  });
  it('si todo es desconocido, el defecto', () => {
    expect(resolveKeyMarkers(['nope']).length).toBe(DEFAULT_KEY_MARKERS.length);
  });
  it('nunca más del máximo', () => {
    const many = resolveKeyMarkers([
      'back_squat_1rm', 'deadlift_1rm', 'bench_press_1rm', 'ohp_1rm', 'clean_1rm', 'snatch_1rm', 'run_5k',
    ]);
    expect(many.length).toBe(KEY_MARKERS_MAX);
  });
  it('formatos', () => {
    expect(formatKeyMarkerValue('kg', 110)).toBe('110 kg');
    expect(formatKeyMarkerValue('kg', 112.5)).toBe('112,5 kg');
    expect(formatKeyMarkerValue('time', 1180)).toBe('19:40');
    expect(formatKeyMarkerValue('time', 4320)).toBe('1:12:00');
    expect(formatKeyMarkerValue('pace_km', 245)).toBe('4:05 /km');
    expect(formatKeyMarkerValue('bpm', 186.2)).toBe('186 ppm');
  });
});
