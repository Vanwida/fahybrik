// El compuesto lee el método del coach del atleta (0256) contra una base real:
// el objetivo de sueño y los pesos que el coach guarda en coach_signal_thresholds
// llegan al número y al desglose que ve el atleta.

import { afterEach, beforeEach, expect, test } from 'vitest';
import { computeAthleteDailyReadiness } from '@fahybrid/shared/domain/coach/athlete-daily-readiness';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const TODAY = '2026-06-15';

describeWithDb('readiness con el método del coach (DB real)', () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await makeCoachAndAthlete(getTestSql());
    const sql = fx.sql;
    await sql`
      insert into biometric_streams (athlete_id, source, metric_type, recorded_at, value_numeric, unit)
      values (${fx.athleteId}, 'healthkit', 'sleep_duration'::biometric_metric,
              ${new Date('2026-06-15T05:00:00Z')}, ${6 * 3600}, 'seconds')
    `;
    await sql`
      insert into daily_checkins
        (athlete_id, recorded_for, recorded_at, sub_score, soreness, mood, motivation, fatigue, sleep_quality)
      values (${fx.athleteId}, ${TODAY}::date, ${new Date('2026-06-15T06:30:00Z')}, 60, 3, 3, 3, 3, 3)
    `;
  });

  afterEach(async () => {
    const sql = fx.sql;
    await sql`delete from athlete_daily_readiness_snapshots where athlete_id = ${fx.athleteId}`;
    await sql`delete from biometric_streams where athlete_id = ${fx.athleteId}`;
    await sql`delete from coach_signal_thresholds where coach_id = ${fx.coachId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  test('sin fila del coach: 8 h y los pesos de siempre', async () => {
    const snap = await computeAthleteDailyReadiness({ athlete_id: fx.athleteId, recorded_for: TODAY, client: fx.sql });
    expect(snap!.breakdown.sleep_target_h).toBe(8);
    expect(snap!.breakdown.sleep_component).toBe(75);
    // check-in 60 (0,35) + sueño 75 (0,2), repartido: (21 + 15) / 0,55 = 65
    expect(snap!.score).toBe(65);
  });

  test('con su objetivo de sueño y sus pesos', async () => {
    await fx.sql`
      insert into coach_signal_thresholds (coach_id, readiness_sleep_target_hours, readiness_weight_checkin)
      values (${fx.coachId}, 6, 20)
    `;
    const snap = await computeAthleteDailyReadiness({ athlete_id: fx.athleteId, recorded_for: TODAY, client: fx.sql });
    expect(snap!.breakdown.sleep_target_h).toBe(6);
    expect(snap!.breakdown.sleep_component).toBe(100);
    // check-in 60 (20) + sueño 100 (20), repartido a partes iguales = 80
    expect(snap!.score).toBe(80);
  });
});
