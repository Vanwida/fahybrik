// Un metcon puntuado «fuera del plan» (0270: sin asignación, porque el coach quitó
// la sesión mientras el atleta la hacía) es una puntuación real: sale en
// «Simulaciones y metcons» y en su detalle, como ya contaba en la carga.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildHyroxSection } from '@/lib/athlete/analytics/hyrox';
import { buildDrillDown, resolvePeriod } from '@/lib/athlete/analytics';
import { UNPLANNED_SCORED_TITLE } from '@/lib/athlete/analytics/hyrox';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2026-07-11T12:00:00.000Z');
const period = resolvePeriod({ key: 'month', now: NOW });

describeWithDb('HYROX: lo puntuado fuera del plan cuenta (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds,
                                      score_rounds, score_reps, source, recorded_via, off_plan_reason)
      values (null, ${fx.athleteId}, '2026-07-08T17:00:00Z', '2026-07-08T17:20:00Z', 1200, 7, 12, 'manual', 'live',
              'no_assignment')
    `;
  }, 60_000);

  afterAll(async () => {
    await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  test('la tarjeta y su detalle lo listan, con un nombre honesto', async () => {
    const section = await buildHyroxSection({ athlete_id: fx.athleteId, period }, sql);
    const scores = section.cards.find((c) => c.id === 'sim_scores')!;
    expect(scores.availability).toBe('real');
    const row = scores.rows.find((r) => r.value === '7 rondas + 12');
    expect(row?.label).toBe(UNPLANNED_SCORED_TITLE);

    const drill = await buildDrillDown({ athlete_id: fx.athleteId, kind: 'hyrox.scores', params: {}, period }, sql);
    expect(drill?.sessions).toHaveLength(1);
    expect(drill!.sessions[0]).toMatchObject({ title_es: UNPLANNED_SCORED_TITLE, value: '7 rondas + 12' });
  });
});
