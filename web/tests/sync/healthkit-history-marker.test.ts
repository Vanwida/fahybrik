// El marcador de un entreno de Salud se lee ENTERO o no se lee (0278).
//
// 13-08-2026: el histórico se materializó desde 1.657 marcadores guardados como
// jsonb de tipo cadena. El lector los veía vacíos y nacieron 1.277 sesiones sin
// tipo, distancia, pulso ni calorías. Aquí, el mismo marcador en las dos formas.

import { describe, expect, test } from 'vitest';
import { workoutFromStream, type StreamRow } from '@/lib/sync/materialize-healthkit-history';

const PAYLOAD = {
  source: 'healthkit',
  source_workout_id: 'A1B2C3',
  workout_activity_type: 20, // functionalStrengthTraining
  started_at: '2026-05-04T08:00:00Z',
  ended_at: '2026-05-04T09:10:00Z',
  duration_seconds: 3000,
  total_distance_meters: null,
  total_energy_burned_kcal: 412.5,
  avg_heart_rate_bpm: 131,
  max_heart_rate_bpm: 168,
  lap_markers: [],
};

const row = (payload: unknown): StreamRow => ({
  athlete_id: '64',
  source_workout_id: 'A1B2C3',
  recorded_at: '2026-05-04T08:00:00Z',
  value_numeric: 3000,
  payload,
});

describe('workoutFromStream', () => {
  test('un marcador guardado como objeto da el entreno con su tipo y sus totales', () => {
    const w = workoutFromStream(row(PAYLOAD));
    expect(w?.workout_activity_type).toBe(20);
    expect(w?.ended_at).toBe('2026-05-04T09:10:00Z');
    expect(w?.total_energy_burned_kcal).toBe(412.5);
    expect(w?.avg_heart_rate_bpm).toBe(131);
  });

  test('el mismo marcador guardado como CADENA da exactamente lo mismo', () => {
    expect(workoutFromStream(row(JSON.stringify(PAYLOAD)))).toEqual(workoutFromStream(row(PAYLOAD)));
  });

  test('un marcador que no es un objeto ni desenvuelto no inventa una sesión «other» vacía', () => {
    expect(workoutFromStream(row('no es json'))).toBeNull();
    expect(workoutFromStream(row(null))).toBeNull();
    expect(workoutFromStream(row([1, 2]))).toBeNull();
  });
});
