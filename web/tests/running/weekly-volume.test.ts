// Pure unit tests for shared/domain/running/weekly-volume.ts (#71) — verifica
// la tendencia contra los números exactos del mockup (carrera-en-el-panel.html
// §06: "+6 % la semana pasada contra las 4 anteriores").

import { describe, expect, test } from 'vitest';
import { weeklyVolumeTrend, type WeeklyVolumeWeek } from '@fahybrid/shared/domain/running/weekly-volume';

function week(week_start: string, km: number, en_curso = false): WeeklyVolumeWeek {
  return { week_start, km, en_curso };
}

describe('weeklyVolumeTrend', () => {
  test('reproduce el +6 % del mockup: última semana cerrada contra la media de las 4 anteriores', () => {
    const weeks = [
      week('2026-06-22', 34.2),
      week('2026-06-29', 38.6),
      week('2026-07-06', 41.0),
      week('2026-07-13', 29.8),
      week('2026-07-20', 43.5),
      week('2026-07-27', 46.1),
      week('2026-08-03', 42.7), // última cerrada
      week('2026-08-10', 18.9, true), // en curso
    ];
    const res = weeklyVolumeTrend(weeks);
    expect(res.compare_weeks).toBe(4);
    expect(res.pct_vs_previous_weeks).toBe(6); // (42.7 - 40.1) / 40.1 = 6.48 % → redondea a 6
  });

  test('la semana en curso nunca entra — ni como "última" ni en el fondo de comparación', () => {
    const withCurso = weeklyVolumeTrend([
      week('2026-07-06', 40), week('2026-07-13', 40), week('2026-07-20', 40),
      week('2026-07-27', 40), week('2026-08-03', 40), week('2026-08-10', 999, true),
    ]);
    const withoutCurso = weeklyVolumeTrend([
      week('2026-07-06', 40), week('2026-07-13', 40), week('2026-07-20', 40),
      week('2026-07-27', 40), week('2026-08-03', 40),
    ]);
    expect(withCurso).toEqual(withoutCurso);
  });

  test('menos de 5 semanas cerradas (4 anteriores + 1 última): null, nunca una tendencia inventada', () => {
    const weeks = [week('2026-07-27', 40), week('2026-08-03', 42)];
    expect(weeklyVolumeTrend(weeks).pct_vs_previous_weeks).toBeNull();
  });

  test('fondo de comparación en cero: null, división por cero no es una tendencia', () => {
    const weeks = [
      week('2026-07-06', 0), week('2026-07-13', 0), week('2026-07-20', 0),
      week('2026-07-27', 0), week('2026-08-03', 10),
    ];
    expect(weeklyVolumeTrend(weeks).pct_vs_previous_weeks).toBeNull();
  });

  test('bajada real se refleja en negativo', () => {
    const weeks = [
      week('2026-07-06', 40), week('2026-07-13', 40), week('2026-07-20', 40),
      week('2026-07-27', 40), week('2026-08-03', 20),
    ];
    expect(weeklyVolumeTrend(weeks).pct_vs_previous_weeks).toBe(-50);
  });
});
