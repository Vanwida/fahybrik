// Real-DB test (#71) — buildRunningAnalytics contra ejecuciones reales.
// Athlete 64: los únicos legs estructurados (leg_index) de producción, pocos
// y con datos incompletos — el caso que prueba la disciplina de hueco
// declarado, no el caso feliz. Athlete 67: volumen semanal rico, para
// probar que la pieza de carga no se rompe con datos reales abundantes.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { buildRunningAnalytics } from '@/lib/coach/running-analytics';

describeWithDb('buildRunningAnalytics vs ejecuciones reales (#71)', () => {
  const sql = getTestSql();

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterAll(async () => {
    await closeTestSql();
  });

  test('athlete 64 (datos estructurados escasos): declara el hueco, nunca inventa ni rompe', async () => {
    const res = await buildRunningAnalytics({
      coach_id: 60,
      athlete_id: 64,
      now: new Date('2026-08-11T12:00:00Z'),
      window_weeks: 4,
      client: sql,
    });

    // Coherencia estructural — nada de NaN, nada indefinido donde debería
    // haber un número o un null explícito.
    expect(Number.isFinite(res.calibration.bias.total)).toBe(true);
    expect(res.calibration.bias.evaluable).toBeLessThanOrEqual(res.calibration.bias.total);
    expect(res.pacing_shape.total).toBe(
      res.pacing_shape.aguantaste + res.pacing_shape.de_menos_a_mas + res.pacing_shape.se_te_fue,
    );

    // Muy por debajo del mínimo de calibración (20 por defecto): el hueco se
    // declara, nunca se fuerza un porcentaje.
    expect(res.calibration.has_enough_data).toBe(false);
    expect(res.calibration.min_series_required).toBe(20);

    // Ninguna de las 3 ejecuciones reales tiene 4+ tramos de trabajo con
    // pace/distancia real en la MISMA sesión (verificado a mano contra la
    // rama de test): la huella no debe inventar un patrón.
    expect(res.pacing_shape.total).toBe(0);

    // Arranque en frío: primera sesión 20-jul-2026, "ahora" 11-ago-2026→
    // 22 días, por debajo de los 42 de la ventana crónica. Los números
    // siguen ahí; el veredicto se retira.
    expect(res.load.cold_start.is_warmed_up).toBe(false);
    expect(res.load.cold_start.days_of_history).toBe(22);
    expect(res.load.allows_verdict).toBe(false);
    expect(res.load.is_alert).toBe(false);
    expect(Number.isFinite(res.load.ctl)).toBe(true);
    expect(Number.isFinite(res.load.tsb)).toBe(true);

    expect(res.window_weeks).toBe(4);
    expect(res.athlete_id).toBe('64');
  });

  test('athlete 67 (volumen rico): la pieza de carga y volumen no se rompen con datos abundantes', async () => {
    const res = await buildRunningAnalytics({
      coach_id: 62,
      athlete_id: 67,
      now: new Date('2026-07-24T12:00:00Z'),
      client: sql,
    });

    // El volumen es EXACTAMENTE el mismo que el loader dedicado ya probado
    // por separado — no una segunda ruta que pudiera divergir.
    expect(res.volume.weeks.some((w) => w.km > 0)).toBe(true);
    expect(res.volume.trend.pct_vs_previous_weeks).not.toBeNull();

    // Con más de 42 días de historial (primera sesión 1-jun-2026, "ahora"
    // 24-jul-2026 ≈ 53 días), el arranque en frío ya no bloquea el veredicto
    // — lo que quede sin verdict, si acaso, es por cobertura.
    expect(res.load.cold_start.is_warmed_up).toBe(true);
    expect(Number.isFinite(res.load.ctl)).toBe(true);
    expect(Number.isFinite(res.load.atl)).toBe(true);
  });

  test('los umbrales devueltos son los REALMENTE usados — verificable sin volver a resolverlos', async () => {
    const res = await buildRunningAnalytics({
      coach_id: 60,
      athlete_id: 64,
      now: new Date('2026-08-11T12:00:00Z'),
      client: sql,
    });
    expect(res.thresholds).toEqual({
      min_reps_per_position: 3,
      min_series_for_calibration: 20,
      freshness_alert_tsb: -8,
      min_pairs_for_compromised_trend: 4,
    });
    expect(res.calibration.min_series_required).toBe(res.thresholds.min_series_for_calibration);
    expect(res.load.freshness_alert_tsb).toBe(res.thresholds.freshness_alert_tsb);
    expect(res.compromised.min_pairs_required).toBe(res.thresholds.min_pairs_for_compromised_trend);
  });

  test('carrera comprometida: nunca rompe con datos escasos — declara el hueco honesto (sin validar aún contra carreras reales)', async () => {
    const res = await buildRunningAnalytics({
      coach_id: 60,
      athlete_id: 64,
      now: new Date('2026-08-11T12:00:00Z'),
      client: sql,
    });
    expect(Number.isFinite(res.compromised.valid_pairs)).toBe(true);
    expect(res.compromised.points.length).toBeLessThanOrEqual(res.compromised.valid_pairs);
    // Con los datos reales de hoy (escasos, ver el test de arriba) es
    // esperable que no llegue al mínimo — lo que importa es que lo DECLARE,
    // no que lo alcance.
    if (!res.compromised.has_enough_data) {
      expect(res.compromised.valid_pairs).toBeLessThan(res.compromised.min_pairs_required);
    }
  });
});
