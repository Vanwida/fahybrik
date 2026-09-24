// El Plan libre lee su «hoy» en el día del ATLETA (DECISIONS «Qué día es en cada
// sitio», 2026-09-23): si su carrera objetivo sigue por delante y cuántos días
// tiene cada marca, en su calendario — por los dos lados de la resta.
//
// El instante: 10 mar 2031, 12:00 UTC → 01:00 del 11 en Auckland. Con el día UTC
// (el 10) su carrera del 10 seguiría «por venir»; con el reloj real de la base
// (2026) todo 2031 lo estaría.
//
// La edad de una marca no llega al payload (solo desempata en el selector), así
// que se mira donde el cargador se la entrega al dominio: `projectRunMark`,
// envuelto sin cambiarle el comportamiento.

import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@fahybrid/shared/domain/athlete/mark-projection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fahybrid/shared/domain/athlete/mark-projection')>();
  return { ...actual, projectRunMark: vi.fn(actual.projectRunMark) };
});

import { projectRunMark } from '@fahybrid/shared/domain/athlete/mark-projection';
import { loadFreePlan } from '@/lib/athlete/free-plan';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeFreeAthlete, type FreeAthleteFixture } from '../utils/db-fixtures';

const NOW = new Date('2031-03-10T12:00:00Z');

describeWithDb('Plan libre en el día del atleta (DB real)', () => {
  const sql = getTestSql();
  let fx: FreeAthleteFixture;

  beforeAll(async () => {
    fx = await makeFreeAthlete(sql);
    await sql`update athletes set timezone = 'Pacific/Auckland' where id = ${fx.athleteId}`;
  });

  beforeEach(() => {
    vi.mocked(projectRunMark).mockClear();
  });

  afterAll(async () => {
    await sql`delete from races where athlete_id = ${fx.athleteId}`;
    await sql`delete from athlete_benchmarks where athlete_id = ${fx.athleteId}`;
    await fx?.cleanup();
    await closeTestSql();
  });

  async function target(date: string): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority, status, race_date, goal_time_seconds)
      values (${fx.athleteId}, 'Objetivo', 'hyrox', 'singles', 'open', 'men', 'target', 'planned', ${date}::date, 3600)
      returning id::text as id
    `;
    return Number(rows[0]!.id);
  }

  it('su carrera del día UTC ya pasó para él; la de su hoy sigue siendo el objetivo', async () => {
    const passed = await target('2031-03-10');
    const plan = await loadFreePlan(fx.athleteId, sql, { now: NOW });
    expect(plan.goal_check).toBeNull();

    await sql`delete from races where id = ${passed}`;
    const today = await target('2031-03-11');
    const planToday = await loadFreePlan(fx.athleteId, sql, { now: NOW });
    expect(planToday.goal_check?.target.race_id).toBe(today);
    expect(planToday.goal_check?.target.race_date).toBe('2031-03-11');
  });

  it('la edad de cada marca se cuenta en su calendario, por los dos lados', async () => {
    // 09:00 UTC del 1 = 22:00 del 1 en Auckland; 12:00 UTC del 1 = 01:00 del 2.
    await sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, source, run_context, recorded_at)
      values
        (${fx.athleteId}, 'run_5k', 1200, 'seconds', 'athlete_test', 'outdoor', ${'2031-03-01T09:00:00Z'}::timestamptz),
        (${fx.athleteId}, 'run_5k', 1210, 'seconds', 'athlete_test', 'outdoor', ${'2031-03-01T12:00:00Z'}::timestamptz)
    `;

    await loadFreePlan(fx.athleteId, sql, { now: NOW });

    const marks = vi.mocked(projectRunMark).mock.calls[0]![0];
    // Newest first. His today is the 11th: the mark of his 2nd is 9 days old
    // (today-only-local would say 10), the one of his 1st is 10 (UTC says 9).
    expect(marks.map((m) => m.age_days)).toEqual([9, 10]);
  });
});
