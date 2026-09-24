// Real-DB test (#71) — resolveEffectiveRunningThresholds contra una fila
// real: defectos cuando el coach no ha escrito ninguna, la fila del coach
// cuando sí. Mismo patrón que signal-thresholds — nunca mockea la tabla.
//
// Un coach propio del test (no «el primero de la base»): así no depende de lo
// que haya sembrado la rama ni borra umbrales de nadie. Y la fila lleva las
// trece columnas: desde 0187 las nueve de progreso son NOT NULL, así que una
// fila con solo las cuatro primeras ya no existe en ningún club.

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { resolveEffectiveRunningThresholds } from '@/lib/coach/running-thresholds';
import {
  DEFAULT_COACH_RUNNING_THRESHOLDS,
  type CoachRunningThresholds,
} from '@fahybrid/shared/domain/coach/running-thresholds';

/** Un método entero, ninguno igual al defecto, todos dentro de su CHECK. */
const SU_METODO: CoachRunningThresholds = {
  min_reps_per_position: 5,
  min_series_for_calibration: 30,
  freshness_alert_tsb: -12,
  min_pairs_for_compromised_trend: 6,
  min_weeks_to_judge: 8,
  meaningful_gain_s_per_km: 5,
  volume_surge_ratio: 0.3,
  good_in_band_pct: 75,
  min_reps_to_judge_band: 12,
  same_hr_reference_zone: 3,
  same_hr_tolerance_bpm: 4,
  same_hr_min_distance_m: 1500,
  gradient_retires_pace_pct: 4,
};

describeWithDb('resolveEffectiveRunningThresholds vs coach_running_thresholds real (#71)', () => {
  const sql = getTestSql();
  let club: Fixture;

  const insertRow = (t: CoachRunningThresholds) => sql`
    insert into coach_running_thresholds (
      coach_id, min_reps_per_position, min_series_for_calibration, freshness_alert_tsb,
      min_pairs_for_compromised_trend, min_weeks_to_judge, meaningful_gain_s_per_km,
      volume_surge_ratio, good_in_band_pct, min_reps_to_judge_band, same_hr_reference_zone,
      same_hr_tolerance_bpm, same_hr_min_distance_m, gradient_retires_pace_pct
    ) values (
      ${club.coachId}, ${t.min_reps_per_position}, ${t.min_series_for_calibration}, ${t.freshness_alert_tsb},
      ${t.min_pairs_for_compromised_trend}, ${t.min_weeks_to_judge}, ${t.meaningful_gain_s_per_km},
      ${t.volume_surge_ratio}, ${t.good_in_band_pct}, ${t.min_reps_to_judge_band}, ${t.same_hr_reference_zone},
      ${t.same_hr_tolerance_bpm}, ${t.same_hr_min_distance_m}, ${t.gradient_retires_pace_pct}
    )
  `;

  beforeAll(async () => {
    club = await makeCoachAndAthlete(sql);
  });
  afterEach(async () => {
    await sql`delete from coach_running_thresholds where coach_id = ${club.coachId}`;
  });
  afterAll(async () => {
    await club?.cleanup();
    await closeTestSql();
  });

  test('sin fila del coach: sirve los defectos del sistema', async () => {
    const res = await resolveEffectiveRunningThresholds(club.coachId, sql);
    expect(res).toEqual(DEFAULT_COACH_RUNNING_THRESHOLDS);
  });

  test('con fila del coach: sus números mandan, no una mezcla parcial', async () => {
    await insertRow(SU_METODO);
    const res = await resolveEffectiveRunningThresholds(club.coachId, sql);
    expect(res).toEqual(SU_METODO);
  });

  test('un valor fuera de rango lo rechaza la propia tabla (CHECK), no el resolutor', async () => {
    // 1 < mínimo permitido (2)
    await expect(insertRow({ ...SU_METODO, min_reps_per_position: 1 })).rejects.toThrow();
  });
});
