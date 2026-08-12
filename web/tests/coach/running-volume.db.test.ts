// Real-DB test (#71) — kilómetros por semana contra la ejecución real del
// atleta 67. Verifica el zero-fill (semanas sin JOIN aparecen igual, a 0), el
// corte de semana en SU zona horaria (Europe/Madrid) y la semana en curso.
//
// Skips automáticamente cuando TEST_DATABASE_URL no está (describeWithDb).

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { loadWeeklyRunVolume } from '@/lib/coach/running-volume';

const ATHLETE_ID = 67;

describeWithDb('loadWeeklyRunVolume vs athlete 67 real executions (#71)', () => {
  const sql = getTestSql();

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterAll(async () => {
    await closeTestSql();
  });

  test('serie completa de 8 semanas, zero-fill incluido, cortada en la zona del atleta', async () => {
    // "Ahora" cae dentro de la semana del 20-jul (Europe/Madrid): esa semana
    // es la última del rango y tiene que salir en_curso.
    const res = await loadWeeklyRunVolume({
      athlete_id: ATHLETE_ID,
      weeks: 8,
      now: new Date('2026-07-24T12:00:00Z'),
      client: sql,
    });

    expect(res.weeks.map((w) => [w.week_start, w.km])).toEqual([
      ['2026-06-01', 22.8],
      ['2026-06-08', 22.8],
      ['2026-06-15', 22.8],
      ['2026-06-22', 22.8],
      ['2026-06-29', 22.8],
      ['2026-07-06', 22.8],
      ['2026-07-13', 9],
      ['2026-07-20', 6.1],
    ]);
    // Sólo la última semana está en curso — ninguna otra, aunque alguna
    // cerrada (07-13) tenga menos volumen que las anteriores.
    expect(res.weeks.map((w) => w.en_curso)).toEqual([false, false, false, false, false, false, false, true]);

    // Tendencia: última CERRADA (07-13, 9.0) contra la media de las 4
    // anteriores (06-15..07-06, todas 22.8) → (9-22.8)/22.8 ≈ -60.5 % → -61.
    // La semana en curso (07-20) no participa ni como "última" ni en el fondo.
    expect(res.trend.pct_vs_previous_weeks).toBe(-61);
    expect(res.trend.compare_weeks).toBe(4);
  });

  test('una ventana de 1 semana no rompe — sin fondo que comparar, tendencia null', async () => {
    const res = await loadWeeklyRunVolume({
      athlete_id: ATHLETE_ID,
      weeks: 1,
      now: new Date('2026-07-24T12:00:00Z'),
      client: sql,
    });
    expect(res.weeks).toHaveLength(1);
    expect(res.weeks[0]).toMatchObject({ week_start: '2026-07-20', en_curso: true });
    expect(res.trend.pct_vs_previous_weeks).toBeNull();
  });

  test('un atleta sin ninguna carrera en el rango: semanas a 0, nunca un error', async () => {
    // athlete_id inexistente en segment_executions de carrera: coalesce hace
    // el zero-fill igual que con datos reales.
    const res = await loadWeeklyRunVolume({
      athlete_id: 999999,
      weeks: 4,
      now: new Date('2026-07-24T12:00:00Z'),
      client: sql,
    });
    expect(res.weeks.every((w) => w.km === 0)).toBe(true);
    expect(res.trend.pct_vs_previous_weeks).toBeNull(); // fondo en 0: sin división
  });
});
