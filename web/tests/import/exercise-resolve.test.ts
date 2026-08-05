/**
 * Tests for the #28 importer exercise resolver (`lib/import/exercise-resolve.ts`).
 *
 * Two tiers:
 *   • `normalizeTerm` — PURE unit tests, always run (no DB). Pin the notation
 *     normalization contract that the synonym KEY and every lookup depend on.
 *   • resolve + learn — REAL-DB integration against the DEMO branch (nothing
 *     mocked — project rule). Seeds its own coach(es) + exercises via the shared
 *     fixtures and asserts the cascade: a GLOBAL-ALIAS term resolves to the
 *     catalog exercise; a LEARNED coach synonym then WINS over that alias (and is
 *     isolated to that coach); the catalog-name fallbacks resolve; an UNKNOWN
 *     term returns null. Skips loudly without TEST_DATABASE_URL (`describeWithDb`).
 *
 * Pattern mirrors tests/sync/ingest-healthkit-dedupe.test.ts.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import {
  GLOBAL_ALIASES,
  learnSynonym,
  normalizeTerm,
  resolveExercise,
} from '@/lib/import/exercise-resolve';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, type Fixture } from '../utils/db-fixtures';
import { upsertCoachExerciseOverride } from '@/lib/exercises/coach-override';

// ---------------------------------------------------------------------------
// PURE — always run.
// ---------------------------------------------------------------------------
describe('normalizeTerm (pure)', () => {
  test('lowercases, collapses whitespace, trims', () => {
    expect(normalizeTerm('  Front   Squat  ')).toBe('front squat');
  });

  test('strips accents (NFD + combining-mark removal)', () => {
    expect(normalizeTerm('Núcleo')).toBe('nucleo');
    expect(normalizeTerm('Zancada Búlgara')).toBe('zancada bulgara');
  });

  test('strips leading round/series/rep quantity noise', () => {
    expect(normalizeTerm('3 rounds Front Squat')).toBe('front squat');
    expect(normalizeTerm('5r Back Squat')).toBe('back squat');
    expect(normalizeTerm('6 series Goblet Squat')).toBe('goblet squat');
  });

  test('strips equipment/qualifier prefixes (db/kb/bw/high/strict/barbell/bb)', () => {
    expect(normalizeTerm('DB Snatch')).toBe('snatch');
    expect(normalizeTerm('strict Pull Up')).toBe('pull up');
    expect(normalizeTerm('High Box Jump')).toBe('box jump');
    expect(normalizeTerm('Barbell Row')).toBe('row');
  });

  test('strips a kg load suffix', () => {
    expect(normalizeTerm('Front Squat 70kg')).toBe('front squat');
    expect(normalizeTerm('Goblet Squat 22.5 kg')).toBe('goblet squat');
    expect(normalizeTerm('Deadlift 100 KG')).toBe('deadlift');
  });

  test('stacks leading noise + trailing load in one pass', () => {
    expect(normalizeTerm('3 rounds DB Front Squat 60kg')).toBe('front squat');
  });

  test('empty / whitespace-only input normalizes to empty string', () => {
    expect(normalizeTerm('   ')).toBe('');
    expect(normalizeTerm('')).toBe('');
  });

  test('a bare token that IS an exercise is not eaten by the noise strip', () => {
    // "run"/"row" etc. are not prefixes-of-something-else here.
    expect(normalizeTerm('Run')).toBe('run');
  });
});

// ---------------------------------------------------------------------------
// REAL DB — DEMO branch via TEST_DATABASE_URL.
// ---------------------------------------------------------------------------
describeWithDb('resolveExercise + learnSynonym (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  async function seedCoach(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    return fx;
  }

  // Pick a GLOBAL-ALIAS term whose target slug actually exists in THIS catalog,
  // so the alias-layer assertion is self-contained (reads whatever rows exist).
  async function findAliasTarget(): Promise<{ term: string; slug: string; id: number }> {
    for (const [term, slug] of Object.entries(GLOBAL_ALIASES)) {
      const row = await sql<Array<{ id: string }>>`
        select id::text as id from exercises where slug = ${slug} limit 1
      `;
      if (row[0]) return { term, slug, id: Number(row[0].id) };
    }
    throw new Error('no GLOBAL_ALIASES slug present in the catalog — cannot exercise the alias layer');
  }

  test('a global-alias term resolves to the catalog exercise (via alias)', async () => {
    const fx = await seedCoach();
    const target = await findAliasTarget();
    const res = await resolveExercise(fx.coachId, target.term, sql);
    expect(res).toMatchObject({ exercise_id: target.id, via: 'alias' });
  });

  test('a learned coach synonym WINS over the global alias, per-coach isolated, upsert-not-dup', async () => {
    const fx = await seedCoach();
    const target = await findAliasTarget();

    // A fixture-owned exercise DIFFERENT from the alias target.
    const mineId = await makeExercise({ fx, name: 'Coach Special Movement' });
    expect(mineId).not.toBe(target.id);

    // Before learning: the term resolves to the ALIAS target.
    expect(await resolveExercise(fx.coachId, target.term, sql)).toMatchObject({
      exercise_id: target.id,
      via: 'alias',
    });

    // The coach corrects the mapping → learn it.
    await learnSynonym(fx.coachId, target.term, mineId, sql);

    // After learning: the SAME term now resolves to the coach's exercise, via synonym.
    expect(await resolveExercise(fx.coachId, target.term, sql)).toMatchObject({
      exercise_id: mineId,
      via: 'synonym',
    });

    // Per-coach isolation: a DIFFERENT coach still gets the global-alias result.
    const other = await seedCoach();
    expect(await resolveExercise(other.coachId, target.term, sql)).toMatchObject({
      exercise_id: target.id,
      via: 'alias',
    });

    // Re-learning the same term to a NEW target updates in place (no duplicate row).
    await learnSynonym(fx.coachId, target.term, target.id, sql);
    expect(await resolveExercise(fx.coachId, target.term, sql)).toMatchObject({
      exercise_id: target.id,
      via: 'synonym',
    });
    const [cnt] = await sql<Array<{ n: number }>>`
      select count(*)::int as n from coach_exercise_synonyms
      where coach_id = ${fx.coachId} and term_normalized = ${normalizeTerm(target.term)}
    `;
    expect(cnt!.n).toBe(1);
  });

  test('catalog-name fallbacks: exact name, then substring (via name_exact / name_substring)', async () => {
    const fx = await seedCoach();
    // A rare, unique name so the fallbacks are deterministic and self-contained
    // (no alias key matches "zqxwv…", and no other catalog row carries the token).
    const id = await makeExercise({ fx, name: 'Zqxwv Special Move' });

    // Exact name (case-insensitive) — reached only after alias misses.
    expect(await resolveExercise(fx.coachId, 'Zqxwv Special Move', sql)).toMatchObject({
      exercise_id: id,
      via: 'name_exact',
    });

    // Substring — the rare token is contained in the catalog name.
    expect(await resolveExercise(fx.coachId, 'zqxwv', sql)).toMatchObject({
      exercise_id: id,
      via: 'name_substring',
    });
  });

  // -------------------------------------------------------------------------
  // ACCENTS (migration 0151) — before this fix, `lower()` alone never folded
  // á/é/í/ó/ú/ü/ñ, so an accented catalog name could never match the
  // accent-stripped `normalized` term and the importer silently created a
  // duplicate. `unaccent()` on both sides of layers 3/4 closes it.
  // -------------------------------------------------------------------------

  test('an accented catalog name resolves from an UNACCENTED term (layer 3, exact)', async () => {
    const fx = await seedCoach();
    const id = await makeExercise({ fx, name: 'Puente de Glúteo Xqzwv' });
    const res = await resolveExercise(fx.coachId, 'puente de gluteo xqzwv', sql);
    expect(res).toMatchObject({ exercise_id: id, via: 'name_exact' });
  });

  test('an accented catalog name resolves via an unaccented SUBSTRING token (layer 4)', async () => {
    const fx = await seedCoach();
    const id = await makeExercise({ fx, name: 'Vqzwx Glúteo Isométrico' });
    const res = await resolveExercise(fx.coachId, 'gluteo isometrico', sql);
    expect(res).toMatchObject({ exercise_id: id, via: 'name_substring' });
  });

  test('the TERM carrying an accent still resolves against an unaccented catalog name (symmetric)', async () => {
    const fx = await seedCoach();
    const id = await makeExercise({ fx, name: 'Nucleo Wprfx' }); // catalog name, no accent
    const res = await resolveExercise(fx.coachId, 'Núcleo Wprfx', sql); // term, WITH accent
    expect(res).toMatchObject({ exercise_id: id, via: 'name_exact' });
  });

  // -------------------------------------------------------------------------
  // TRANSLATION ALIASES (2026-08-05 sweep) — a coach who writes "Dominada"
  // for a catalog exercise named "Pull-up" isn't missing a movement, they're
  // writing it in Spanish. Every NEW key added to GLOBAL_ALIASES must point
  // at a slug that is REAL in the catalog today, verified against the actual
  // demo-branch rows (never assumed) — an alias to a slug that doesn't exist
  // is worse than no alias: it silently returns exercise_id: null forever.
  // -------------------------------------------------------------------------

  test('every NEW translation alias resolves to a slug that actually exists in the catalog', async () => {
    const newAliasTerms = [
      'dominada',
      'dominadas',
      'dominada lastrada',
      'dominadas lastradas',
      'press banca',
      'remo',
      'step ups cajon',
      'step up cajon',
      'forward leg swing',
      'forward leg swings',
      'balanceo de pierna',
      'balanceo de piernas',
    ];
    const missing: string[] = [];
    for (const term of newAliasTerms) {
      const slug = GLOBAL_ALIASES[term];
      expect(slug, `"${term}" must be a real GLOBAL_ALIASES key`).toBeDefined();
      const row = await sql<Array<{ id: string }>>`select id::text as id from exercises where slug = ${slug}`;
      if (row.length === 0) missing.push(`${term} → ${slug}`);
    }
    expect(missing, `alias targets a slug missing from the catalog: ${missing.join(', ')}`).toEqual([]);
  });

  test('the ES↔EN sweep: "Dominada (lastrada)"/"Remo"/"Press Banca"/"Step Ups Cajón" now resolve via alias', async () => {
    const fx = await seedCoach();
    const cases: Array<{ term: string; slug: string }> = [
      ['Dominada', 'pull-up'],
      ['Dominada (lastrada)', 'weighted-pullup'],
      ['Remo', 'row'],
      ['Press Banca >78-80%', 'bench-press'], // real card line, trailing load kept verbatim
      ['10+10 Step Ups Cajón', 'box-step-up'], // real card line, leading rep count kept verbatim
      ['Forward Leg Swing', 'leg-swings'],
    ].map(([term, slug]) => ({ term, slug }));
    for (const { term, slug } of cases) {
      const res = await resolveExercise(fx.coachId, term, sql);
      expect(res, `"${term}"`).toMatchObject({ via: 'alias' });
      const row = await sql<Array<{ slug: string }>>`select slug from exercises where id = ${res.exercise_id}`;
      expect(row[0]?.slug, `"${term}" resolved to the wrong exercise`).toBe(slug);
    }
  });

  test('genuinely DIFFERENT movements stay unaliased, on purpose — the sweep\'s negative findings', async () => {
    // "Puente de glúteo" is NOT "Hip Thrust" (a bridge and a loaded hip thrust
    // are different exercises); "Push Jerk" is NOT "Clean & Jerk" or "Push
    // Press" (a distinct Olympic-lift variant); "Bici Libre" is unstructured
    // outdoor riding, not necessarily the "BikeErg" machine. All three exist
    // as SOMETHING close in the catalog — aliasing them anyway is exactly the
    // false-synonym risk the sweep was told to avoid ("ante la duda, fuera").
    const fx = await seedCoach();
    for (const term of ['Puente de glúteo', 'Push Jerk', 'Bici Libre', 'Cat Cow', 'Cossack Squat']) {
      const res = await resolveExercise(fx.coachId, term, sql);
      expect(res.exercise_id, `"${term}" must NOT have been aliased to a look-alike`).toBeNull();
    }
  });

  // The count the client is waiting for: of the real unresolved-name corpus
  // (web/tests/import/photo-e2e.test.ts's `namedMisses`, de-duplicated and
  // stripped of parse artifacts — "A)", "OPCIONAL", "FUERZA PARTE ALTA" are
  // not movement names), how many now resolve PURELY from translating them?
  test('READOUT: how many of the real corpus resolve now, translation-only (no catalog growth)', async () => {
    const fx = await seedCoach();
    const corpus = [
      'Dominada (lastrada)',
      'Cable External Rotation',
      'Band Pull Apart',
      'Prone Y Raise',
      'Serratus wall slide',
      'Band Scapular Retraction',
      'Puente de glúteo',
      'Marcha desde puente de glúteo',
      'Isometría en puente de glúteo',
      'Cat Cow',
      'Cossack Squat',
      'Forward Leg Swing',
      'Cobra Pose',
      'Hip Flexor Stretch',
      'Bird Dog',
      'Incremental ergómetros',
      'Remo',
      'Single Leg Glute Bridge',
      'Side Step Squat With Band',
      'Extension de cadera en cuadrúp...',
      'Diagonal Band Pull Apart',
      'Banded Front Raise',
      'Prone T Raise',
      'Push Jerk',
      'Bici Libre',
    ];
    let resolved = 0;
    for (const term of corpus) {
      const res = await resolveExercise(fx.coachId, term, sql);
      if (res.exercise_id !== null) resolved += 1;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[translation sweep] ${resolved}/${corpus.length} of the real unresolved corpus now resolve via alias.`,
    );
    // "Dominada (lastrada)", "Remo", "Forward Leg Swing" — 3 of these 25 unique
    // names. "Press Banca" and "Step Ups Cajón" also now resolve (see the
    // dedicated test above) but were never IN this specific 25-name corpus —
    // they surfaced from re-reading the source cards directly, not from this
    // test's own unresolved list.
    expect(resolved).toBe(3);
  });

  test('an unknown term resolves to null with the normalized key (caller escalates)', async () => {
    const fx = await seedCoach();
    // Pure gibberish, verified to contain (and be contained by) NO catalog name.
    const term = 'kkxzq wvptm zzqjx bbnfv';
    const res = await resolveExercise(fx.coachId, term, sql);
    expect(res.exercise_id).toBeNull();
    expect(res).toMatchObject({ exercise_id: null, normalized: normalizeTerm(term) });
  });

  // -------------------------------------------------------------------------
  // OWNERSHIP (migration 0132) — the layer-3/4 leak this task closes, plus the
  // rename-fork and own-before-base tiebreak it introduces.
  // -------------------------------------------------------------------------

  test("coach B does NOT resolve coach A's PROPIO exercise by exact name (layer 3)", async () => {
    const a = await seedCoach();
    const b = await seedCoach();
    const name = 'Vqzxr Only Mine Move';
    const mineId = await makeExercise({ fx: a, name, coachId: a.coachId });

    // Control: the OWNING coach resolves it fine.
    expect(await resolveExercise(a.coachId, name, sql)).toMatchObject({
      exercise_id: mineId,
      via: 'name_exact',
    });

    // The leak: a different coach must NOT resolve into A's private exercise.
    const res = await resolveExercise(b.coachId, name, sql);
    expect(res.exercise_id).toBeNull();
  });

  test("coach B does NOT resolve coach A's PROPIO exercise by substring (layer 4)", async () => {
    const a = await seedCoach();
    const b = await seedCoach();
    const name = 'Wjkpz Substring Only Mine';
    const mineId = await makeExercise({ fx: a, name, coachId: a.coachId });
    const token = 'wjkpz'; // rare token contained in `name`, unique to this test.

    // Control: the OWNING coach resolves it via substring.
    expect(await resolveExercise(a.coachId, token, sql)).toMatchObject({
      exercise_id: mineId,
      via: 'name_substring',
    });

    // The leak: a different coach must NOT resolve into A's private exercise.
    const res = await resolveExercise(b.coachId, token, sql);
    expect(res.exercise_id).toBeNull();
  });

  test('a coach resolves a BASE exercise they renamed, by their NEW name (override on name)', async () => {
    const fx = await seedCoach();
    const baseId = await makeExercise({ fx, name: 'Base Movement Ntrqv' });
    await upsertCoachExerciseOverride(sql, {
      coach_id: BigInt(fx.coachId),
      exercise_id: BigInt(baseId),
      patch: { name: 'Renamed Move Ntrqv' },
    });

    // The coach's Excel says the NEW name — that must resolve.
    expect(await resolveExercise(fx.coachId, 'Renamed Move Ntrqv', sql)).toMatchObject({
      exercise_id: baseId,
      via: 'name_exact',
    });

    // A different coach, who never renamed it, still only knows the BASE name —
    // the new name means nothing to them (per-coach fork, not global).
    const other = await seedCoach();
    const otherRes = await resolveExercise(other.coachId, 'Renamed Move Ntrqv', sql);
    expect(otherRes.exercise_id).toBeNull();
  });

  test('own-before-base tiebreak: renamed base "X" + a separate PROPIO exercise also called "X" resolves to the OWN one', async () => {
    const fx = await seedCoach();
    const baseId = await makeExercise({ fx, name: 'Origin Name Tzvqk' });
    const ownId = await makeExercise({ fx, name: 'Tiebreak Name Tzvqk', coachId: fx.coachId });
    await upsertCoachExerciseOverride(sql, {
      coach_id: BigInt(fx.coachId),
      exercise_id: BigInt(baseId),
      patch: { name: 'Tiebreak Name Tzvqk' },
    });
    expect(ownId).not.toBe(baseId);

    // Both rows now answer to the SAME merged name for this coach — own must win.
    const res = await resolveExercise(fx.coachId, 'Tiebreak Name Tzvqk', sql);
    expect(res).toMatchObject({ exercise_id: ownId, via: 'name_exact' });
  });
});
