/**
 * LAS SEMANAS DE ZONAS SON LAS DEL ATLETA — contra base de datos REAL.
 *
 * La polarización semana a semana y la gráfica de tiempo en zonas cortan la
 * semana de lunes a domingo EN SU HUSO (`athletes.timezone`) y la rotulan con su
 * lunes (DECISIONS 2026-09-23, «Qué día es en cada sitio»). Antes, la
 * polarización contaba tramos de 7 × 24 h desde ahora rotulados con el día UTC, y
 * la gráfica abría la ventana en «ahora − N × 7 días»: media semana de más,
 * recortada, como si fuera una semana medida.
 *
 * Se siembran los segundos en zona a mano (`segment_zone_seconds`): lo que se
 * prueba es dónde cae cada entreno, no cómo se reparte el pulso.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadPolarizationHistory } from '@/lib/zones/polarization';
import { loadWeeklyZones } from '@/lib/zones/weekly';
import { DEFAULT_COACH_HR_METHOD } from '@fahybrid/shared/domain/coach/hr-method';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('semanas de zonas en el calendario del atleta (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  async function athleteIn(tz: string): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await sql`update athletes set timezone = ${tz} where id = ${fx.athleteId}`;
    return fx;
  }

  /** Un entreno de un tramo que acaba en `endedUtc`, con sus segundos en Z2 o Z4. */
  async function session(fx: Fixture, endedUtc: string, zone: 'z2' | 'z4', seconds: number): Promise<void> {
    const ended = new Date(endedUtc);
    const started = new Date(ended.getTime() - seconds * 1000);
    const [we] = await sql<Array<{ id: string }>>`
      insert into workout_executions (athlete_id, started_at, ended_at, total_duration_seconds, source)
      values (${fx.athleteId}, ${started.toISOString()}::timestamptz, ${ended.toISOString()}::timestamptz, ${seconds}, 'healthkit')
      returning id::text
    `;
    const [se] = await sql<Array<{ id: string }>>`
      insert into segment_executions (execution_id, position, started_at, ended_at, modality)
      values (${Number(we!.id)}, 0, ${started.toISOString()}::timestamptz, ${ended.toISOString()}::timestamptz, 'run')
      returning id::text
    `;
    await sql`
      insert into segment_zone_seconds
        (segment_execution_id, z2_s, z4_s, hr_origin, computed_with_anchor, computed_with_lthr_bpm)
      values (
        ${Number(se!.id)}, ${zone === 'z2' ? seconds : 0}, ${zone === 'z4' ? seconds : 0},
        'samples', 'from_max_hr', 170
      )
    `;
  }

  describe('Madrid: el domingo por la noche y el lunes de madrugada', () => {
    // Miércoles 12-mar-2031 al mediodía. En Madrid (UTC+1) la semana en curso es
    // la del lunes 10; la anterior, la del 3.
    const NOW = new Date('2031-03-12T12:00:00Z');
    let fx: Fixture;

    beforeAll(async () => {
      fx = await athleteIn('Europe/Madrid');
      // Domingo 9 a las 22:00 de Madrid (21:00 UTC): semana del 3, todo duro.
      await session(fx, '2031-03-09T21:00:00Z', 'z4', 1800);
      // Lunes 10 a las 00:30 de Madrid (domingo 9, 23:30 UTC): semana del 10, todo fácil.
      await session(fx, '2031-03-09T23:30:00Z', 'z2', 1800);
    });

    test('polarización: cada semana es de lunes a domingo del atleta y se rotula con su lunes', async () => {
      const history = await loadPolarizationHistory({
        athlete_id: fx.athleteId,
        weeks: 2,
        method: DEFAULT_COACH_HR_METHOD,
        now: NOW,
        client: sql,
      });
      expect(history.map((w) => w.iso_date)).toEqual(['2031-03-03', '2031-03-10']);
      // El domingo por la noche y el lunes de madrugada NO son la misma semana.
      expect(history[0]!.pct).toMatchObject({ low: 0 });
      expect(history[1]!.pct).toMatchObject({ low: 100 });
    });

    test('gráfica de zonas: la ventana son las N semanas del atleta, sin media semana de más', async () => {
      // Jueves 27-feb, semana del 24: fuera de las dos semanas pedidas, aunque
      // caiga dentro de «ahora − 14 días».
      await session(fx, '2031-02-27T10:00:00Z', 'z2', 600);

      const payload = await loadWeeklyZones({ athlete_id: fx.athleteId, weeks: 2, now: NOW, client: sql });
      expect(payload.weeks.map((w) => w.week_start)).toEqual(['2031-03-03', '2031-03-10']);
      expect(payload.weeks.map((w) => w.z4_s)).toEqual([1800, 0]);
      expect(payload.weeks.map((w) => w.z2_s)).toEqual([0, 1800]);
      expect(payload.meta.weeks_with_data).toBe(2);
      expect(payload.meta.weeks_without_data).toBe(0);
      expect(payload.meta.first_week_with_data).toBe('2031-03-03');
    });
  });

  test('al este de UTC, la semana en curso es la del lunes del atleta aunque en UTC aún sea domingo', async () => {
    // Domingo 9-mar-2031 12:00 UTC = lunes 10 a la 01:00 en Auckland (UTC+13).
    const now = new Date('2031-03-09T12:00:00Z');
    const fx = await athleteIn('Pacific/Auckland');
    // Lunes 10 a las 00:30 de Auckland.
    await session(fx, '2031-03-09T11:30:00Z', 'z2', 1200);

    const history = await loadPolarizationHistory({
      athlete_id: fx.athleteId,
      weeks: 1,
      method: DEFAULT_COACH_HR_METHOD,
      now,
      client: sql,
    });
    expect(history).toEqual([{ iso_date: '2031-03-10', pct: expect.objectContaining({ low: 100 }) }]);

    const payload = await loadWeeklyZones({ athlete_id: fx.athleteId, weeks: 1, now, client: sql });
    expect(payload.weeks.map((w) => [w.week_start, w.z2_s])).toEqual([['2031-03-10', 1200]]);
    expect(payload.meta.weeks_without_data).toBe(0);
  });
});
