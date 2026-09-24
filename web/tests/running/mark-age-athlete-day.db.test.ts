// La edad de una marca (y del perfil de ritmo, y de la última VO₂máx) se cuenta
// en el calendario del ATLETA, por los dos lados de la resta: su «hoy» y el día
// en que la registró (DECISIONS «Qué día es en cada sitio», 2026-09-23). Antes
// era `current_date - recorded_at::date`: los dos días UTC de la sesión.
//
// El instante: 10 mar 2031, 12:00 UTC → 01:00 del 11 en Auckland. Las marcas:
//   · 1 mar, 09:00 UTC = 22:00 del 1 en Auckland → 10 días (UTC diría 9);
//   · 1 mar, 12:00 UTC = 01:00 del 2 en Auckland → 9 días (localizar solo el
//     «hoy» diría 10).
// Con el reloj real de la base (2026), cualquier edad sería negativa.
//
// Donde la edad no llega al payload (solo desempata en `selectRunMark`, y ese
// desempate no cambia de ganador con el huso), se mira lo que el lector le
// entrega al selector: envuelto, con el mismo comportamiento.

import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@fahybrid/shared/domain/athlete/mark-projection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fahybrid/shared/domain/athlete/mark-projection')>();
  return { ...actual, selectRunMark: vi.fn(actual.selectRunMark) };
});

import { selectRunMark } from '@fahybrid/shared/domain/athlete/mark-projection';
import {
  buildRunningProgress,
  loadPaceThreshold,
  loadRunMarkRows,
} from '@/lib/athlete/analytics/running-progress';
import { buildRunningSection } from '@/lib/athlete/analytics/running';
import { resolvePeriod } from '@/lib/athlete/analytics';
import { buildRunningAnalysis } from '@/lib/athlete/running-analysis';
import { buildRaceTransfer } from '@/lib/athlete/race-transfer';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2031-03-10T12:00:00Z');
/** 22:00 of his 1st in Auckland (UTC day: the 1st). */
const HIS_FIRST = '2031-03-01T09:00:00Z';
/** 01:00 of his 2nd in Auckland (UTC day: still the 1st). */
const HIS_SECOND = '2031-03-01T12:00:00Z';

const ZONES_6 = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'].map((code, i) => ({ code, sort_order: i }));

describeWithDb('edad de marcas en el día del atleta (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update athletes set timezone = 'Pacific/Auckland' where id = ${fx.athleteId}`;
  });

  beforeEach(() => {
    vi.mocked(selectRunMark).mockClear();
  });

  afterEach(async () => {
    await sql`delete from athlete_benchmarks where athlete_id = ${fx.athleteId}`;
    await sql`delete from athlete_zone_profiles where athlete_id = ${fx.athleteId}`;
    await sql`delete from biometric_streams where athlete_id = ${fx.athleteId}`;
  });

  afterAll(async () => {
    await fx?.cleanup();
    await closeTestSql();
  });

  async function run5k(recordedAt: string, seconds = 1200): Promise<void> {
    await sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, source, run_context, recorded_at)
      values (${fx.athleteId}, 'run_5k', ${seconds}, 'seconds', 'athlete_test', 'outdoor', ${recordedAt}::timestamptz)
    `;
  }

  async function bothMarks(): Promise<void> {
    await run5k(HIS_FIRST, 1200);
    await run5k(HIS_SECOND, 1210);
  }

  /** The ages each reader handed to the selector, one list per call, newest
   *  first. A builder may run other readers that also select (the VO₂máx card). */
  function agesSeenBySelector(): Array<Array<number | null>> {
    return vi.mocked(selectRunMark).mock.calls.map(([rows]) => rows.map((row) => row.age_days));
  }

  it('loadRunMarkRows (running-progress): su día en los dos lados', async () => {
    await bothMarks();
    const rows = await loadRunMarkRows(sql, fx.athleteId, { now: NOW });
    expect(rows.map((r) => r.age_days)).toEqual([9, 10]);
  });

  it('loadPaceThreshold (running-progress): la edad del perfil en su día, y sus marcas igual', async () => {
    await bothMarks();
    await sql`
      insert into athlete_zone_profiles (athlete_id, modality, threshold_s, pace_unit, zones_json, version, source, recorded_at)
      values (${fx.athleteId}, 'run', 270, 'per_km', ${sql.json(ZONES_6)}, 1, 'coach_test', ${HIS_FIRST}::timestamptz)
    `;
    const first = await loadPaceThreshold(sql, fx.athleteId, { now: NOW });
    expect(first.hace_dias).toBe(10);
    expect(agesSeenBySelector()).toContainEqual([9, 10]);

    await sql`update athlete_zone_profiles set recorded_at = ${HIS_SECOND}::timestamptz where athlete_id = ${fx.athleteId}`;
    const second = await loadPaceThreshold(sql, fx.athleteId, { now: NOW });
    expect(second.hace_dias).toBe(9);
  });

  it('buildRunningProgress le pasa su reloj al umbral', async () => {
    await bothMarks();
    await buildRunningProgress({ athlete_id: fx.athleteId, now: NOW, client: sql });
    expect(agesSeenBySelector()).toContainEqual([9, 10]);
  });

  it('buildRaceTransfer: la edad de la VO₂máx y la de la marca, en su día', async () => {
    await sql`
      insert into biometric_streams (athlete_id, source, metric_type, recorded_at, value_numeric, unit)
      values (${fx.athleteId}, 'healthkit', 'vo2max', ${HIS_FIRST}::timestamptz, 50, 'ml/kg/min')
    `;
    const watchOnly = await buildRaceTransfer({ athlete_id: fx.athleteId, now: NOW }, sql);
    const runFromWatch = watchOnly.stations.find((s) => s.kind === 'run')!;
    expect(runFromWatch.trained.source).toBe('vo2max');
    expect(runFromWatch.trained.age_days).toBe(10);

    await run5k(HIS_FIRST);
    const withMark = await buildRaceTransfer({ athlete_id: fx.athleteId, now: NOW }, sql);
    const runFromMark = withMark.stations.find((s) => s.kind === 'run')!;
    expect(runFromMark.trained.source).toBe('marca');
    expect(runFromMark.trained.age_days).toBe(10);
  });

  it('buildRunningAnalysis entrega al selector las edades en su día', async () => {
    await bothMarks();
    await buildRunningAnalysis({ athlete_id: fx.athleteId, now: NOW }, sql);
    expect(agesSeenBySelector()).toContainEqual([9, 10]);
  });

  it('analíticas · carrera entrega al selector las edades en su día', async () => {
    await bothMarks();
    const period = resolvePeriod({ key: 'month', now: NOW });
    await buildRunningSection({ athlete_id: fx.athleteId, period, now: NOW }, sql);
    expect(agesSeenBySelector()).toContainEqual([9, 10]);
  });
});
