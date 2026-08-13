import { describe, expect, test } from 'vitest';
import { heightsFromAttempts, valuesForOccurrence } from '@/lib/coach/occurrence-values';

describe('ocurrencia ≠ último slug', () => {
  test('dos CMJ del mismo atleta no se pisan', () => {
    const benches = [
      { assignment_id: '100', exercise_slug: 'cmj', value: 47.33, recorded_at: '2026-08-01' },
      { assignment_id: '200', exercise_slug: 'cmj', value: 720.45, recorded_at: '2026-08-13' },
    ];
    expect(valuesForOccurrence('100', benches).get('cmj')).toBe(47.33);
    expect(valuesForOccurrence('200', benches).get('cmj')).toBe(720.45);
  });

  test('un slug suelto (Marcas / onboarding) no cuenta como esta ocurrencia', () => {
    const benches = [
      { assignment_id: null, exercise_slug: 'cmj', value: 40, recorded_at: '2026-07-01' },
    ];
    expect(valuesForOccurrence('100', benches).size).toBe(0);
  });

  test('si no hay benchmark anclado, los intentos de ESA assignment bastan', () => {
    const attempts = [
      { assignment_id: '100', kind: 'cmj', height_cm: 46.1, kept: false },
      { assignment_id: '100', kind: 'cmj', height_cm: 47.33, kept: true },
      { assignment_id: '200', kind: 'cmj', height_cm: 720.45, kept: true },
    ];
    expect(heightsFromAttempts('100', attempts).get('cmj')).toBe(47.33);
    expect(heightsFromAttempts('200', attempts).get('cmj')).toBe(720.45);
  });
});
