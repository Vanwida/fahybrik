// El tramo 1–4 del alta (foto del alta y contexto de la IA) se lee con la
// escalera del COACH — la misma que la sugerencia de nivel —, no con los defectos.

import { afterAll, expect, test } from 'vitest';
import { createCoachLevel, setLevelCriteria } from '@/lib/coach/levels';
import { loadIntakeProfile } from '@/lib/coach/intake';
import { inferLevel } from '@/lib/coach/intake-suggestions';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('tramo del alta con la escalera del coach (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    for (const fx of fixtures) {
      await sql`delete from athlete_benchmarks where athlete_id = ${fx.athleteId}`;
      await sql`delete from athlete_levels where coach_id = ${fx.coachId}`;
    }
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  test('un 5K de 23′20″ es tramo alto con los defectos y el primero con los cortes de este coach', async () => {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await sql`update athletes set sex = 'male', training_experience_years = 1, intake_notes_json = '{}'::jsonb where id = ${fx.athleteId}`;
    await sql`insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit) values (${fx.athleteId}, 'run_5k', 1400, 's')`;

    const base = await createCoachLevel(fx.coachId, { name: 'Base' }, sql);
    const alto = await createCoachLevel(fx.coachId, { name: 'Alto' }, sql);
    await setLevelCriteria(fx.coachId, Number(base), [], sql);
    await setLevelCriteria(fx.coachId, Number(alto), [{ metric: 'run_5k_s', sex: null, threshold: 900 }], sql);

    const withDefaults = inferLevel({
      training_experience_years: 1,
      benchmarks: [{ exercise_slug: 'run_5k', label: '5K', value: 1400, unit: 's' }],
    });
    expect(withDefaults).toBeGreaterThan(1);

    const profile = await loadIntakeProfile({ athlete_id: fx.athleteId, coach_id: fx.coachId, client: sql });
    expect(profile.suggestions.level).toBe(1);
  });
});
