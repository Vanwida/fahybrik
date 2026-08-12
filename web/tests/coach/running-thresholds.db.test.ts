// Real-DB test (#71) — resolveEffectiveRunningThresholds contra una fila
// real: defectos cuando el coach no ha escrito ninguna, la fila del coach
// cuando sí. Mismo patrón que signal-thresholds — nunca mockea la tabla.

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { resolveEffectiveRunningThresholds } from '@/lib/coach/running-thresholds';
import { DEFAULT_COACH_RUNNING_THRESHOLDS } from '@fahybrid/shared/domain/coach/running-thresholds';

describeWithDb('resolveEffectiveRunningThresholds vs coach_running_thresholds real (#71)', () => {
  const sql = getTestSql();
  let coachId: number;

  beforeAll(async () => {
    const rows = await sql<Array<{ id: number }>>`select id from coaches order by id limit 1`;
    if (!rows[0]) throw new Error('no hay ningún coach en la rama de test');
    coachId = rows[0].id;
  });
  afterEach(async () => {
    await sql`delete from coach_running_thresholds where coach_id = ${coachId}`;
  });
  afterAll(async () => {
    await closeTestSql();
  });

  test('sin fila del coach: sirve los defectos del sistema', async () => {
    const res = await resolveEffectiveRunningThresholds(coachId, sql);
    expect(res).toEqual(DEFAULT_COACH_RUNNING_THRESHOLDS);
  });

  test('con fila del coach: sus números mandan, no una mezcla parcial', async () => {
    await sql`
      insert into coach_running_thresholds (
        coach_id, min_reps_per_position, min_series_for_calibration, freshness_alert_tsb, min_pairs_for_compromised_trend
      )
      values (${coachId}, 5, 30, -12, 6)
    `;
    const res = await resolveEffectiveRunningThresholds(coachId, sql);
    expect(res).toEqual({
      min_reps_per_position: 5,
      min_series_for_calibration: 30,
      freshness_alert_tsb: -12,
      min_pairs_for_compromised_trend: 6,
    });
  });

  test('un valor fuera de rango lo rechaza la propia tabla (CHECK), no el resolutor', async () => {
    await expect(
      sql`insert into coach_running_thresholds (
            coach_id, min_reps_per_position, min_series_for_calibration, freshness_alert_tsb, min_pairs_for_compromised_trend
          )
          values (${coachId}, 1, 30, -12, 4)`, // 1 < mínimo permitido (2)
    ).rejects.toThrow();
  });
});
