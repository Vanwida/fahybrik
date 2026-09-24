// Real-DB test (#71) — kilómetros por semana contra ejecuciones reales de un
// atleta propio del test. Verifica el zero-fill (semanas sin JOIN aparecen
// igual, a 0), el corte de semana en SU zona horaria (Europe/Madrid) y la
// semana en curso.
//
// Antes leía al atleta 67 de la rama demo de Neon; ahora siembra su propio
// historial y lo borra al acabar. Las fechas están elegidas para los bordes:
// lo corrido el lunes entre las 00:00 y las 02:00 de Madrid es DOMINGO en UTC,
// y tiene que caer en la semana del lunes — también en la PRIMERA semana del
// rango, que es donde el loader lo perdía (cortaba el inicio en UTC).
//
// Skips automáticamente cuando TEST_DATABASE_URL no está (describeWithDb).

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { makeRunExecution, makeRunExercise, makeTemplateSegment, type RunLap } from '../utils/run-fixtures';
import { loadWeeklyRunVolume } from '@/lib/coach/running-volume';

const NOW = new Date('2026-07-24T12:00:00Z'); // viernes de la semana del 20-jul

describeWithDb('loadWeeklyRunVolume vs ejecuciones reales (#71)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  /** Una carrera continua de `km` a 5:00/km. `startUtc` en UTC; el comentario
   *  de cada llamada dice la hora de Madrid (UTC+2 en verano). */
  const run = (startUtc: string, km: number, modality = 'run') =>
    makeRunExecution({
      fx,
      assignmentId: null,
      startedAtIso: startUtc,
      laps: [{ duration_s: Math.round(km * 300), distance_m: Math.round(km * 1000), modality }],
    });

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update athletes set timezone = 'Europe/Madrid' where id = ${fx.athleteId}`;

    // Fuera del rango: domingo 31-may 23:00 Madrid (semana del 25-may).
    await run('2026-05-31T21:00:00Z', 5);

    // Semana 01-jun → 22.8. La primera carrera es lunes 00:05 Madrid, que en
    // UTC todavía es domingo 31-may: es la que se perdía.
    await run('2026-05-31T22:05:00Z', 8);
    await run('2026-06-03T05:00:00Z', 10); // miércoles 07:00
    await run('2026-06-06T07:00:00Z', 4.8); // sábado 09:00

    // Semana 08-jun → nada: tiene que salir, a 0.

    // Semana 15-jun → 22.8.
    await run('2026-06-16T05:00:00Z', 12);
    await run('2026-06-20T07:00:00Z', 10.8);

    // Semana 22-jun → 22.8. Lunes 00:10 Madrid = domingo 21-jun en UTC: cuenta
    // en la semana del 22, no en la del 15.
    await run('2026-06-21T22:10:00Z', 6);
    await run('2026-06-25T05:00:00Z', 16.8);

    // Semana 29-jun → 22.8: unas series 5×1000 con 400 m de trote — la
    // recuperación SÍ es volumen (SEG_COUNTS_AS_VOLUME) — y una tirada larga.
    const exerciseId = await makeRunExercise(fx);
    const templateId = await makeTemplate({ fx, name: 'Series 5×1000', format: 'intervals' });
    const segmentId = await makeTemplateSegment({
      fx,
      templateId,
      exerciseId,
      position: 0,
      prescription: {
        scheme: 'intervals',
        modality: 'run',
        structure: [
          {
            role: 'main',
            elements: [
              {
                times: 5,
                elements: [
                  { kind: 'work', measure: { type: 'distance', m: 1000 }, target: { type: 'pace_zone', zone: 4 } },
                  { kind: 'recovery', measure: { type: 'distance', m: 400 }, target: null, recovery_mode: 'trote' },
                ],
              },
            ],
          },
        ],
      },
    });
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: '2026-06-30' });
    const laps: RunLap[] = [];
    for (let i = 0; i < 5; i++) {
      laps.push({ template_segment_id: segmentId, duration_s: 280, distance_m: 1000, pace_s_per_km: 280, leg: { index: 2 * i, role: 'work', phase: 'main' } });
      laps.push({ template_segment_id: segmentId, duration_s: 150, distance_m: 400, pace_s_per_km: 375, leg: { index: 2 * i + 1, role: 'recovery', phase: 'main' } });
    }
    await makeRunExecution({ fx, assignmentId, startedAtIso: '2026-06-30T05:00:00Z', laps });
    await run('2026-07-04T07:00:00Z', 15.8);

    // Semana 06-jul → 22.8. El remo del miércoles no es carrera: no suma.
    await run('2026-07-07T05:00:00Z', 12);
    await run('2026-07-08T05:00:00Z', 2, 'row');
    await run('2026-07-11T07:00:00Z', 10.8);

    // Semana 13-jul → 9.0, cerrada y más floja.
    await run('2026-07-15T05:00:00Z', 9);

    // Semana 20-jul (en curso) → 6.1. Arranca otra vez un lunes 00:30 Madrid.
    await run('2026-07-19T22:30:00Z', 3);
    await run('2026-07-22T05:00:00Z', 3.1);
  }, 60_000);

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('serie completa de 8 semanas, zero-fill incluido, cortada en la zona del atleta', async () => {
    // "Ahora" cae dentro de la semana del 20-jul (Europe/Madrid): esa semana
    // es la última del rango y tiene que salir en_curso.
    const res = await loadWeeklyRunVolume({ athlete_id: fx.athleteId, weeks: 8, now: NOW, client: sql });

    expect(res.weeks.map((w) => [w.week_start, w.km])).toEqual([
      ['2026-06-01', 22.8],
      ['2026-06-08', 0],
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
    const res = await loadWeeklyRunVolume({ athlete_id: fx.athleteId, weeks: 1, now: NOW, client: sql });
    expect(res.weeks).toHaveLength(1);
    // 6.1 y no 3.1: la carrera del lunes 00:30 Madrid es de ESTA semana, aunque
    // en UTC todavía fuera domingo.
    expect(res.weeks[0]).toMatchObject({ week_start: '2026-07-20', en_curso: true, km: 6.1 });
    expect(res.trend.pct_vs_previous_weeks).toBeNull();
  });

  test('un atleta sin ninguna carrera en el rango: semanas a 0, nunca un error', async () => {
    // athlete_id inexistente en segment_executions de carrera: coalesce hace
    // el zero-fill igual que con datos reales.
    const res = await loadWeeklyRunVolume({
      athlete_id: 999999,
      weeks: 4,
      now: NOW,
      client: sql,
    });
    expect(res.weeks.every((w) => w.km === 0)).toBe(true);
    expect(res.trend.pct_vs_previous_weeks).toBeNull(); // fondo en 0: sin división
  });
});
