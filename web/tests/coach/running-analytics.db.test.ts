// Real-DB test (#71) — buildRunningAnalytics contra ejecuciones reales.
//
// Antes leía a los atletas 64 y 67 de la rama demo de Neon; ahora siembra los
// dos perfiles que esos atletas representaban y los borra al acabar:
//   · ESCASO — tres sesiones de series estructuradas (leg_index), pocas y con
//     datos incompletos: el caso que prueba la disciplina de hueco declarado,
//     no el caso feliz.
//   · RICO — ocho semanas de volumen, para probar que la pieza de carga no se
//     rompe con datos reales abundantes.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import {
  makeRunExecution,
  makeRunExercise,
  makeRunZoneProfile,
  makeTemplateSegment,
  type RunLap,
} from '../utils/run-fixtures';
import { buildRunningAnalytics } from '@/lib/coach/running-analytics';
import { loadWeeklyRunVolume } from '@/lib/coach/running-volume';
import { defaultCoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';

const SPARSE_NOW = new Date('2026-08-11T12:00:00Z');
const RICH_NOW = new Date('2026-07-24T12:00:00Z');

describeWithDb('buildRunningAnalytics vs ejecuciones reales (#71)', () => {
  const sql = getTestSql();
  let sparse: Fixture;
  let rich: Fixture;

  /**
   * Una sesión de series N × `workM` a la zona `zone`, con `recS` de trote, y su
   * ejecución tramo a tramo. `missingDistance` = índices de serie (0-based) cuyo
   * lap llegó sin distancia ni ritmo (el GPS la perdió).
   */
  async function seriesSession(p: {
    fx: Fixture;
    exerciseId: number;
    dateIso: string;
    times: number;
    workM: number;
    zone: number;
    recS: number;
    paceS: number;
    missingDistance?: number[];
  }): Promise<void> {
    const templateId = await makeTemplate({ fx: p.fx, name: `Series ${p.times}×${p.workM}`, format: 'intervals' });
    const segmentId = await makeTemplateSegment({
      fx: p.fx,
      templateId,
      exerciseId: p.exerciseId,
      position: 0,
      prescription: {
        scheme: 'intervals',
        modality: 'run',
        structure: [
          {
            role: 'main',
            elements: [
              {
                times: p.times,
                elements: [
                  { kind: 'work', measure: { type: 'distance', m: p.workM }, target: { type: 'pace_zone', zone: p.zone } },
                  { kind: 'recovery', measure: { type: 'duration', s: p.recS }, target: null, recovery_mode: 'trote' },
                ],
              },
            ],
          },
        ],
      },
    });
    const assignmentId = await makeAssignment({ fx: p.fx, templateId, scheduledForIso: p.dateIso });
    const workS = Math.round((p.workM / 1000) * p.paceS);
    const laps: RunLap[] = [];
    for (let i = 0; i < p.times; i++) {
      const lost = p.missingDistance?.includes(i) ?? false;
      laps.push({
        template_segment_id: segmentId,
        duration_s: workS,
        distance_m: lost ? null : p.workM,
        pace_s_per_km: lost ? null : p.paceS,
        leg: { index: 2 * i, role: 'work', phase: 'main' },
      });
      laps.push({
        template_segment_id: segmentId,
        duration_s: p.recS,
        distance_m: 200,
        leg: { index: 2 * i + 1, role: 'recovery', phase: 'main' },
      });
    }
    await makeRunExecution({ fx: p.fx, assignmentId, startedAtIso: `${p.dateIso}T06:00:00Z`, laps });
  }

  beforeAll(async () => {
    // ESCASO: primera sesión el 20-jul; ninguna con 4+ series que traigan
    // distancia real (la de 4×400 perdió el GPS en una).
    sparse = await makeCoachAndAthlete(sql);
    await makeRunZoneProfile(sparse);
    const sparseRun = await makeRunExercise(sparse);
    await seriesSession({ fx: sparse, exerciseId: sparseRun, dateIso: '2026-07-20', times: 3, workM: 1000, zone: 4, recS: 90, paceS: 285 });
    await seriesSession({
      fx: sparse, exerciseId: sparseRun, dateIso: '2026-07-28', times: 4, workM: 400, zone: 5, recS: 60, paceS: 255,
      missingDistance: [2],
    });
    await seriesSession({ fx: sparse, exerciseId: sparseRun, dateIso: '2026-08-05', times: 2, workM: 2000, zone: 3, recS: 120, paceS: 318 });

    // RICO: dos carreras por semana desde el lunes 1-jun hasta la semana en curso.
    rich = await makeCoachAndAthlete(sql);
    for (let week = 0; week < 8; week++) {
      const monday = new Date(Date.UTC(2026, 5, 1 + week * 7, 6));
      const thursday = new Date(monday.getTime() + 3 * 86_400_000);
      for (const [day, km] of [[monday, 10], [thursday, 12]] as const) {
        if (day.getTime() > RICH_NOW.getTime()) continue;
        await makeRunExecution({
          fx: rich,
          assignmentId: null,
          startedAtIso: day.toISOString(),
          laps: [{ duration_s: km * 300, distance_m: km * 1000, pace_s_per_km: 300 }],
        });
      }
    }
  }, 120_000);

  afterAll(async () => {
    await sparse?.cleanup();
    await rich?.cleanup();
    await closeTestSql();
  });

  test('datos estructurados escasos: declara el hueco, nunca inventa ni rompe', async () => {
    const res = await buildRunningAnalytics({
      coach_id: sparse.coachId,
      athlete_id: sparse.athleteId,
      now: SPARSE_NOW,
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

    // Ninguna de las 3 ejecuciones tiene 4+ tramos de trabajo con distancia
    // real en la MISMA sesión (la de 4×400 perdió una): la huella no debe
    // inventar un patrón.
    expect(res.pacing_shape.total).toBe(0);

    // Arranque en frío: primera sesión 20-jul-2026, "ahora" 11-ago-2026 →
    // 22 días, por debajo de los 42 de la ventana crónica. Los números
    // siguen ahí; el veredicto se retira.
    expect(res.load.cold_start.is_warmed_up).toBe(false);
    expect(res.load.cold_start.days_of_history).toBe(22);
    expect(res.load.allows_verdict).toBe(false);
    expect(res.load.is_alert).toBe(false);
    expect(Number.isFinite(res.load.ctl)).toBe(true);
    expect(Number.isFinite(res.load.tsb)).toBe(true);

    expect(res.window_weeks).toBe(4);
    expect(res.athlete_id).toBe(String(sparse.athleteId));
  });

  test('volumen rico: la pieza de carga y volumen no se rompen con datos abundantes', async () => {
    const res = await buildRunningAnalytics({
      coach_id: rich.coachId,
      athlete_id: rich.athleteId,
      now: RICH_NOW,
      client: sql,
    });

    // El volumen es EXACTAMENTE el mismo que el loader dedicado ya probado
    // por separado — no una segunda ruta que pudiera divergir.
    expect(res.volume.weeks.some((w) => w.km > 0)).toBe(true);
    expect(res.volume.trend.pct_vs_previous_weeks).not.toBeNull();
    expect(res.volume).toEqual(await loadWeeklyRunVolume({ athlete_id: rich.athleteId, now: RICH_NOW, client: sql }));

    // Con más de 42 días de historial (primera sesión 1-jun-2026, "ahora"
    // 24-jul-2026 ≈ 53 días), el arranque en frío ya no bloquea el veredicto
    // — lo que quede sin verdict, si acaso, es por cobertura.
    expect(res.load.cold_start.is_warmed_up).toBe(true);
    expect(Number.isFinite(res.load.ctl)).toBe(true);
    expect(Number.isFinite(res.load.atl)).toBe(true);
  });

  test('los umbrales devueltos son los REALMENTE usados — verificable sin volver a resolverlos', async () => {
    const res = await buildRunningAnalytics({
      coach_id: sparse.coachId,
      athlete_id: sparse.athleteId,
      now: SPARSE_NOW,
      client: sql,
    });
    // El objeto se sigue comparando ENTERO, pero ya no son cuatro claves: la
    // migración 0187 (coach_running_thresholds_progress) metió en la MISMA
    // fila los nueve umbrales del «¿estoy mejorando?» del atleta, y el
    // resolutor entrega el conjunto vigente completo. Para un coach sin fila,
    // ese conjunto son los defectos del sistema…
    expect(res.thresholds).toEqual(defaultCoachRunningThresholds());
    // …y los cuatro que leen estos agregados siguen fijados a su valor.
    expect(res.thresholds).toMatchObject({
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
      coach_id: sparse.coachId,
      athlete_id: sparse.athleteId,
      now: SPARSE_NOW,
      client: sql,
    });
    expect(Number.isFinite(res.compromised.valid_pairs)).toBe(true);
    expect(res.compromised.points.length).toBeLessThanOrEqual(res.compromised.valid_pairs);
    // Con datos escasos (ver el test de arriba) es esperable que no llegue al
    // mínimo — lo que importa es que lo DECLARE, no que lo alcance.
    if (!res.compromised.has_enough_data) {
      expect(res.compromised.valid_pairs).toBeLessThan(res.compromised.min_pairs_required);
    }
  });
});
