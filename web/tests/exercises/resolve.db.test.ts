/**
 * Exercise resolution for the quick-entry line (lib/exercises/resolve.ts) — real DB.
 *
 * The catalog under test is the PRODUCTION shape: the base rows these tokens need are
 * seeded with their real slugs, ES/EN names and aliases from migration 0178 (the local
 * branches don't carry the 119-row base catalog). Rows that already exist are reused and
 * never deleted; only what this suite inserts is cleaned up.
 *
 * Tokens are the ones a coach types in the quick-entry grammar: «press banca»,
 * «sentadilla», «wall balls», «remo», «burpees broad jump», «sled push», «farmers carry»,
 * «ski». Plus: accents/case/plural, load noise, a typo, a coach synonym, and tenancy
 * (another coach's own exercise and synonyms never leak).
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  BEST_MIN,
  matchKey,
  resolveExercise,
  resolveExercises,
  scoreName,
  singularWord,
} from '@/lib/exercises/resolve';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

// slug, name, name_es, name_en, category, modality, aliases (term, lang) — from 0178.
const CATALOG: Array<[string, string, string, string, string, string, Array<[string, 'es' | 'en']>]> = [
  ['bench-press', 'Bench Press', 'Press banca', 'Bench Press', 'strength', 'strength',
    [['press banca', 'es'], ['banca', 'es'], ['bench press', 'en'], ['press de banca', 'es']]],
  ['back-squat', 'Back Squat', 'Sentadilla trasera', 'Back Squat', 'strength', 'strength',
    [['sentadilla', 'es'], ['sentadilla trasera', 'es'], ['sentadilla con barra', 'es'], ['back squat', 'en']]],
  ['hyrox-wall-balls', 'Wall Balls', 'Wall balls', 'Wall Balls', 'hyrox_station', 'functional',
    [['wall ball', 'en'], ['wall balls', 'en'], ['wb', 'en']]],
  ['row', 'Row', 'Remo', 'Rowing', 'cardio', 'row', [['remo', 'es'], ['rowing', 'en']]],
  ['hyrox-burpee-broad-jump', 'Burpee Broad Jump', 'Burpee con salto de longitud', 'Burpee Broad Jump',
    'hyrox_station', 'functional', [['burpee broad jump', 'en'], ['burpee con salto', 'es'], ['bbj', 'en']]],
  ['burpee', 'Burpee', 'Burpee', 'Burpee', 'plyometric', 'functional', [['burpee', 'en'], ['burpees', 'en']]],
  ['broad-jump', 'Broad Jump', 'Salto de longitud', 'Broad Jump', 'plyometric', 'functional', [['broad jump', 'en']]],
  ['hyrox-sled-push', 'Sled Push', 'Empuje de trineo', 'Sled Push', 'hyrox_station', 'functional',
    [['empuje de trineo', 'es'], ['sled push', 'en']]],
  ['hyrox-farmer-carry', 'Farmers Carry', 'Transporte de pesas', 'Farmers Carry', 'hyrox_station', 'functional',
    [['farmers', 'en'], ['farmers carry', 'en'], ['paseo del granjero', 'es']]],
  ['ski-erg', 'SkiErg', 'SkiErg', 'SkiErg', 'cardio', 'ski', []],
];

// ── Pure pieces ──────────────────────────────────────────────────────────────────
describe('resolve: normalization and scoring (pure)', () => {
  test('singular ES/EN, conservative', () => {
    expect(singularWord('sentadillas')).toBe('sentadilla');
    expect(singularWord('balls')).toBe('ball');
    expect(singularWord('burpees')).toBe('burpee');
    expect(singularWord('flexiones')).toBe('flexion');
    expect(singularWord('crunches')).toBe('crunch');
    expect(singularWord('press')).toBe('press');
    expect(singularWord('abs')).toBe('abs');
  });

  test('matchKey folds accents, case, punctuation and plural', () => {
    expect(matchKey('  Sentadillas  Búlgaras ')).toBe('sentadilla bulgara');
    expect(matchKey('Push-Ups')).toBe('push up');
    expect(matchKey('PRESS BANCA')).toBe('press banca');
  });

  test('a whole name beats a name contained in the typed words', () => {
    const whole = scoreName('burpee broad jump', 'burpee broad jump');
    const inside = scoreName('burpee broad jump', 'broad jump');
    expect(whole.score).toBe(1);
    expect(inside.kind).toBe('partial');
    expect(inside.score).toBeLessThan(0.9);
  });
});

// ── Against the catalog ──────────────────────────────────────────────────────────
describeWithDb('resolveExercise — coach-visible catalog, ES/EN (real DB)', () => {
  const sql = getTestSql();
  let clubA: Fixture;
  let clubB: Fixture;
  const createdExerciseIds: number[] = [];
  const createdAliasIds: number[] = [];
  const slugId = new Map<string, string>();
  let ownA = '';
  let ownB = '';

  beforeAll(async () => {
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    for (const [slug, name, es, en, category, modality, aliases] of CATALOG) {
      const ins = await sql<{ id: string }[]>`
        insert into exercises (slug, name, name_es, name_en, category, modality)
        values (${slug}, ${name}, ${es}, ${en}, ${category}::exercise_category, ${modality})
        on conflict (slug) do nothing
        returning id::text as id`;
      if (ins[0]) createdExerciseIds.push(Number(ins[0].id));
      const id = (await sql<{ id: string }[]>`select id::text as id from exercises where slug = ${slug}`)[0]!.id;
      slugId.set(slug, id);
      for (const [term, lang] of aliases) {
        const a = await sql<{ id: string }[]>`
          insert into exercise_aliases (exercise_id, term, term_normalized, lang)
          values (${Number(id)}, ${term}, fahybrid_normalize_term(${term}), ${lang})
          on conflict (exercise_id, term_normalized) do nothing
          returning id::text as id`;
        if (a[0]) createdAliasIds.push(Number(a[0].id));
      }
    }
    // Each coach owns one exercise; the other must never see it.
    const a = await sql<{ id: string }[]>`
      insert into exercises (slug, name, name_es, category, modality, coach_id)
      values (${`own-a-${clubA.coachId}`}, 'Zancada zeta del club A', 'Zancada zeta del club A',
              'strength', 'strength', ${clubA.coachId})
      returning id::text as id`;
    ownA = a[0]!.id;
    const b = await sql<{ id: string }[]>`
      insert into exercises (slug, name, name_es, category, modality, coach_id)
      values (${`own-b-${clubB.coachId}`}, 'Zancada zeta del club B', 'Zancada zeta del club B',
              'strength', 'strength', ${clubB.coachId})
      returning id::text as id`;
    ownB = b[0]!.id;
    createdExerciseIds.push(Number(ownA), Number(ownB));
    // Coach B's private shorthand: «pb» means bench press — for B only.
    await sql`
      insert into coach_exercise_synonyms (coach_id, term_normalized, exercise_id)
      values (${clubB.coachId}, 'pb', ${Number(slugId.get('bench-press'))})`;
  });

  afterAll(async () => {
    await sql`delete from coach_exercise_synonyms where coach_id in (${clubA.coachId}, ${clubB.coachId})`;
    if (createdAliasIds.length) await sql`delete from exercise_aliases where id in ${sql(createdAliasIds)}`;
    if (createdExerciseIds.length) await sql`delete from exercises where id in ${sql(createdExerciseIds)}`;
    await clubA.cleanup();
    await clubB.cleanup();
    await closeTestSql();
  });

  const cases: Array<[string, string]> = [
    ['press banca', 'bench-press'],
    ['sentadilla', 'back-squat'],
    ['wall balls', 'hyrox-wall-balls'],
    ['remo', 'row'],
    ['burpees broad jump', 'hyrox-burpee-broad-jump'],
    ['sled push', 'hyrox-sled-push'],
    ['farmers carry', 'hyrox-farmer-carry'],
    ['ski', 'ski-erg'],
  ];

  test.each(cases)('«%s» links to %s with high confidence', async (token, slug) => {
    const res = await resolveExercise({ coach_id: clubA.coachId, token });
    expect(res.best?.id).toBe(slugId.get(slug));
    expect(res.confidence).toBeGreaterThanOrEqual(BEST_MIN);
    expect(res.candidates[0]!.id).toBe(slugId.get(slug));
  });

  test('accents, case, plural and load noise do not matter', async () => {
    const [upper, plural, singular, loaded, english] = await resolveExercises({
      coach_id: clubA.coachId,
      tokens: ['PRESS BANCA', 'Sentadillas', 'wall ball', 'press banca 80kg', 'Bench press'],
    });
    expect(upper!.best?.id).toBe(slugId.get('bench-press'));
    expect(plural!.best?.id).toBe(slugId.get('back-squat'));
    expect(singular!.best?.id).toBe(slugId.get('hyrox-wall-balls'));
    expect(loaded!.best?.id).toBe(slugId.get('bench-press'));
    expect(english!.candidates.map((c) => c.id)).toContain(slugId.get('bench-press'));
  });

  test('«burpees broad jump» is the station, not the burpee or the broad jump', async () => {
    const res = await resolveExercise({ coach_id: clubA.coachId, token: 'burpees broad jump' });
    const ids = res.candidates.map((c) => c.id);
    expect(ids[0]).toBe(slugId.get('hyrox-burpee-broad-jump'));
    expect(ids).toContain(slugId.get('broad-jump')); // offered, ranked below
  });

  test('a typo still finds it as the top candidate', async () => {
    const res = await resolveExercise({ coach_id: clubA.coachId, token: 'sentadila' });
    expect(res.candidates[0]?.id).toBe(slugId.get('back-squat'));
  });

  test('unknown words link nothing and say so', async () => {
    const res = await resolveExercise({ coach_id: clubA.coachId, token: 'qwxz plomp' });
    expect(res.best).toBeNull();
    expect(res.candidates).toEqual([]);
    expect(res.confidence).toBe(0);
  });

  test('tenancy: a coach resolves to its own exercise, never to another coach\'s', async () => {
    const forA = await resolveExercise({ coach_id: clubA.coachId, token: 'zancada zeta del club' });
    const idsA = forA.candidates.map((c) => c.id);
    expect(idsA).toContain(ownA);
    expect(idsA).not.toContain(ownB);

    const forB = await resolveExercise({ coach_id: clubB.coachId, token: 'zancada zeta del club' });
    const idsB = forB.candidates.map((c) => c.id);
    expect(idsB).toContain(ownB);
    expect(idsB).not.toContain(ownA);
  });

  test('a coach synonym resolves for that coach only', async () => {
    const forB = await resolveExercise({ coach_id: clubB.coachId, token: 'PB' });
    expect(forB.best?.id).toBe(slugId.get('bench-press'));
    expect(forB.candidates[0]!.via).toBe('synonym');

    const forA = await resolveExercise({ coach_id: clubA.coachId, token: 'PB' });
    expect(forA.best).toBeNull();
  });
});
