import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { defaultMetricsSchema } from '@fahybrid/shared/schema/exercises';
import { loadCoachCatalog } from '@/lib/dashboard/exercises/list-exercises';
import { loadAthleteExerciseCatalog } from '@/lib/athlete/exercise-catalog';
import { loadCoachExerciseCatalog } from '@/lib/dashboard/coach/ai/exercise-catalog';
import { resolveExercise as importResolve, learnSynonym } from '@/lib/import/exercise-resolve';
import { resolveExercises } from '@/lib/exercises/resolve';
import { upsertCoachExerciseOverride } from '@/lib/exercises/coach-override';
import { filterExerciseCatalog } from '@/lib/dashboard/exercises/catalog-search';
import { findNearMatches } from '@/lib/dashboard/exercises/near-match';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, type Fixture } from '../utils/db-fixtures';

const audit = JSON.parse(readFileSync(resolve(process.cwd(), '../docs/auditoria-biblioteca-ejercicios-2026-10-01.json'), 'utf8')) as {
  inventory: { slug: string }[];
  audit: { priority_candidates: string[][] };
};
const newSlugs = audit.audit.priority_candidates.map((row) => row[2]!).filter((slug) => slug !== 'bent-knee-calf-raise');

describeWithDb('Launch catalog — real data, same search and historical identity', () => {
  const sql = getTestSql();
  let a: Fixture;
  let b: Fixture;
  beforeAll(async () => {
    a = await makeCoachAndAthlete(sql);
    b = await makeCoachAndAthlete(sql);
  });
  afterAll(async () => {
    await a.cleanup();
    await b.cleanup();
    await closeTestSql();
  });

  test('all audited and new global identities have usable content and metadata', async () => {
    const slugs = [...audit.inventory.map((row) => row.slug), ...newSlugs];
    const rows = await sql<{ slug: string; name_es: string; name_en: string; description: string; cues: string;
      equipment: string[]; primary_muscle_groups: string[]; default_metrics_json: Record<string, boolean>; aliases: number }[]>`
      select e.slug, e.name_es, e.name_en, e.description, e.cues, e.equipment, e.primary_muscle_groups,
        e.default_metrics_json, (select count(*)::int from exercise_aliases x where x.exercise_id = e.id) as aliases
      from exercises e where e.coach_id is null and e.archived_at is null and e.slug in ${sql(slugs)}
    `;
    expect(rows).toHaveLength(171);
    for (const row of rows) {
      expect(row.name_es, row.slug).toBeTruthy();
      expect(row.name_en, row.slug).toBeTruthy();
      expect(row.description.length, row.slug).toBeGreaterThan(30);
      expect(row.cues.length, row.slug).toBeGreaterThan(30);
      expect(row.equipment.length, row.slug).toBeGreaterThan(0);
      expect(row.primary_muscle_groups.length, row.slug).toBeGreaterThan(0);
      expect(row.aliases, row.slug).toBeGreaterThan(0);
      const metrics = defaultMetricsSchema.parse(row.default_metrics_json);
      expect(metrics.reps || metrics.time || metrics.distance || metrics.calories, row.slug).toBe(true);
    }
  });

  const cases = [
    ['sentadilla trasera', 'back-squat'], ['peso muerto unilateral', 'single-leg-rdl'],
    ['empuje de trineo', 'hyrox-sled-push'], ['remo', 'row'], ['salto simple de comba', 'single-under'],
    ['skipping A', 'a-skip'], ['90/90 Hip Stretch', 'hip-90-90-stretch'],
    ['estiramiento de isquios', 'hamstring-stretch'], ['transporte de pesas', 'hyrox-farmer-carry'],
    ['wall balls', 'hyrox-wall-balls'],
  ];
  test.each(cases)('«%s» is selectable and importable as %s', async (term, slug) => {
    const catalog = await loadCoachCatalog(sql, BigInt(a.coachId), { search: term, limit: 2000 });
    expect(catalog.some((row) => row.slug === slug)).toBe(true);
    const expected = (await sql<{ id: number }[]>`select id::int as id from exercises where slug = ${slug} and coach_id is null`)[0]!;
    const imported = await importResolve(a.coachId, term!, sql);
    expect(imported.exercise_id).toBe(expected.id);
  });

  test('API and both client screens find the same rows for reordered words and accents', async () => {
    const all = await loadCoachCatalog(sql, BigInt(a.coachId), { limit: 2000 });
    for (const query of ['traseras sentadillas', 'STRETCH HIP', 'glúteos puente', '90-90', 'remo barra', 'cuerda salto']) {
      const api = await loadCoachCatalog(sql, BigInt(a.coachId), { search: query, limit: 2000 });
      expect(api.map((row) => row.id).sort(), query)
        .toEqual(filterExerciseCatalog(all, { query }).map((row) => row.id).sort());
    }
  });

  test('holds suggest time; carries suggest distance; drills do not become GPS runs', async () => {
    const catalog = await loadCoachCatalog(sql, BigInt(a.coachId), { limit: 2000 });
    const stretch = catalog.find((row) => row.slug === 'hip-90-90-stretch')!;
    expect(stretch.default_metrics_json).toMatchObject({ time: true, reps: false });
    expect(catalog.find((row) => row.slug === 'hyrox-farmer-carry')!.default_metrics_json)
      .toMatchObject({ distance: true, time: true, reps: false });
    expect(catalog.find((row) => row.slug === 'hyrox-farmer-carry')!.implement_count).toBe(2);
    for (const slug of ['high-knees','butt-kicks','a-skip','b-skip','ankling','lateral-shuffle']) {
      expect(catalog.find((row) => row.slug === slug)!.modality, slug).toBe('functional');
    }
  });

  test('identity-bearing material is retained when cleaning loaded import notation', async () => {
    const expected = (await sql<{ id: number }[]>`select id::int as id from exercises where slug = 'dumbbell-snatch'`)[0]!;
    for (const term of ['DB Snatch','8r DB Snatch 24kg','Arrancada con mancuerna']) {
      expect((await importResolve(a.coachId, term, sql)).exercise_id, term).toBe(expected.id);
      expect((await resolveExercises({ coach_id: a.coachId, tokens: [term], client: sql }))[0]!.best?.id, term).toBe(String(expected.id));
    }
  });

  test('no stale competition dose in wall balls or farmer carry', async () => {
    const rows = await sql<{ slug: string; description: string; cues: string }[]>`
      select slug, description, cues from exercises where slug in ('hyrox-wall-balls','hyrox-farmer-carry')
    `;
    for (const row of rows) expect(row.description + row.cues).not.toMatch(/75|no rest|no setting down|\d+\s*kg/i);
  });

  test('archived identities and private synonyms never return as candidates but remain readable', async () => {
    const id = await makeExercise({ fx: a, name: 'Zqxarchive drill', coachId: a.coachId });
    await learnSynonym(a.coachId, 'zqxclosed', id, sql);
    await sql`update exercises set archived_at = now() where id = ${id}`;
    expect((await loadCoachCatalog(sql, BigInt(a.coachId))).some((row) => Number(row.id) === id)).toBe(false);
    expect((await loadAthleteExerciseCatalog(sql, { coachId: a.coachId, limit: 2000 })).some((row) => row.id === id)).toBe(false);
    expect((await loadCoachExerciseCatalog(sql, a.coachId, { order: 'name', limit: null })).some((row) => Number(row.id) === id)).toBe(false);
    expect((await importResolve(a.coachId, 'zqxclosed', sql)).exercise_id).toBeNull();
    expect((await resolveExercises({ coach_id: a.coachId, tokens: ['zqxclosed'], client: sql }))[0]!.best).toBeNull();
    expect((await sql`select id from exercises where id = ${id}`)).toHaveLength(1);
    await sql`delete from coach_exercise_synonyms where coach_id = ${a.coachId} and exercise_id = ${id}`;
  });

  test('private names stay private and a coach override wins without contaminating other coaches', async () => {
    const own = await makeExercise({ fx: a, name: 'Zqxprivate drill', coachId: a.coachId });
    expect((await importResolve(b.coachId, 'Zqxprivate drill', sql)).exercise_id).toBeNull();
    const base = await makeExercise({ fx: a, name: 'Zqxpublic drill' });
    await upsertCoachExerciseOverride(sql, { coach_id: BigInt(a.coachId), exercise_id: BigInt(base), patch: { name: 'Zqx voz única' } });
    expect((await loadCoachCatalog(sql, BigInt(a.coachId), { search: 'única voz' })).some((row) => Number(row.id) === base)).toBe(true);
    expect((await loadCoachCatalog(sql, BigInt(b.coachId), { search: 'única voz' })).some((row) => Number(row.id) === base)).toBe(false);
    expect(own).not.toBe(base);
  });

  test('ambiguous aliases require a choice in import just as in the editor', async () => {
    const ids = await Promise.all(['one','two'].map((suffix) => makeExercise({ fx: a, name: `Zqxtie ${suffix}`, coachId: a.coachId })));
    for (const id of ids) await sql`insert into exercise_aliases (exercise_id,term,term_normalized,lang) values (${id},'zqxsame','zqxsame','en')`;
    expect((await importResolve(a.coachId, 'zqxsame', sql)).exercise_id).toBeNull();
    const resolution = (await resolveExercises({ coach_id: a.coachId, tokens: ['zqxsame'], client: sql }))[0]!;
    expect(resolution.best).toBeNull();
    expect(resolution.candidates.slice(0,2).map((row) => Number(row.id)).sort()).toEqual(ids.sort());
    for (const id of ids) await sql`delete from exercise_aliases where exercise_id = ${id}`;
  });

  test('generic comba and gemelos expose alternatives instead of choosing a different movement', async () => {
    for (const term of ['comba','gemelos']) {
      const resolution = (await resolveExercises({ coach_id: a.coachId, tokens: [term], client: sql }))[0]!;
      expect(resolution.best, term).toBeNull();
      expect(resolution.candidates.filter((candidate) => candidate.score === 1).length, term).toBeGreaterThanOrEqual(2);
    }
  });

  test('missing-exercise suggestions search Spanish aliases as well as English titles', async () => {
    const catalog = await loadCoachExerciseCatalog(sql, a.coachId, { order: 'name', limit: null });
    const suggestions = findNearMatches('estiramiento de isquios', catalog.map((row) => ({
      id: Number(row.id), name: row.name, modality: row.modality, category: row.category,
      search_names: [row.name_es, row.name_en, ...row.search_names].filter((name): name is string => !!name),
    })));
    const expected = (await sql<{ id: number }[]>`select id::int as id from exercises where slug='hamstring-stretch'`)[0]!;
    expect(suggestions[0]?.id).toBe(expected.id);
  });

  test('old canonical rows on a fresh installation also receive complete public fichas', async () => {
    const rollback = new Error('rollback fresh-catalog simulation');
    await expect(sql.begin(async (tx) => {
      // Reproduce the 0247 global rows without touching production or leaving data.
      await tx`update exercises set slug = slug || '-fresh-simulation'
        where slug in ('catalog-push-jerk','outdoor-bike') and coach_id is null`;
      await tx`update exercises set coach_id = null, description = null, cues = null,
        equipment = '{}', primary_muscle_groups = '{}', default_metrics_json = '{}'
        where slug in ('push-jerk','bici-libre')`;
      await tx.unsafe(readFileSync(resolve(process.cwd(), '../infra/migrations/0286_catalog_launch_metadata.sql'), 'utf8'));
      const completed = await tx<{ slug: string; description: string; cues: string; equipment: string[]; metrics: Record<string, boolean> }[]>`
        select slug, description, cues, equipment, default_metrics_json as metrics from exercises
        where slug in ('push-jerk','bici-libre') and coach_id is null`;
      expect(completed).toHaveLength(2);
      for (const row of completed) {
        expect(row.description.length).toBeGreaterThan(30);
        expect(row.cues.length).toBeGreaterThan(30);
        expect(row.equipment.length).toBeGreaterThan(0);
        expect(row.metrics.reps || row.metrics.time).toBe(true);
      }
      expect((await tx`select id from exercises where slug in ('catalog-push-jerk','outdoor-bike')`)).toHaveLength(0);
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
