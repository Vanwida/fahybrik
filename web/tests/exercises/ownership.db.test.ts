/**
 * Ownership + fork of the exercise catalog (migration 0132) — REAL DB.
 *
 * Nothing is mocked (project rule): two real coaches, real rows, the real
 * loaders the API serves. This pins the model Alex approved:
 *
 *   • BASE (coach_id null) — our catalog, every coach sees it.
 *   • PERSONALIZADO — a BASE exercise + THIS coach's override. Same id, so it
 *     reaches the sessions they already built. The base row is never mutated, so
 *     the other coaches keep theirs.
 *   • PROPIO (coach_id set) — the coach made it. NO other coach may see, resolve
 *     or edit it.
 *
 * The forkable axis is what the coach AUTHORS (name/cues/description/video_url).
 * The identity (slug/modality/category/…) is shared and is NOT tested here as
 * forkable — the API refuses it (tests/exercises/patch.test.ts).
 *
 * Skips loudly without TEST_DATABASE_URL (`describeWithDb`).
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import {
  loadCoachExerciseRow,
  loadExerciseScope,
  upsertCoachExerciseOverride,
} from '@/lib/exercises/coach-override';
import { loadCoachCatalog } from '@/lib/dashboard/exercises/list-exercises';
import { loadAthleteExerciseCatalog } from '@/lib/athlete/exercise-catalog';
import { updateExercise } from '@/lib/dashboard/exercises/update-exercise';
import { createExercise } from '@/lib/dashboard/exercises/create-exercise';
import { deleteExercise } from '@/lib/dashboard/exercises/delete-exercise';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('exercise ownership + fork (real DB)', () => {
  const sql = getTestSql();
  // Two independent coaches, each with their own athlete — the whole point.
  let a: Fixture;
  let b: Fixture;
  let baseId: number;
  let ownOfA: number;

  beforeAll(async () => {
    a = await makeCoachAndAthlete(sql);
    b = await makeCoachAndAthlete(sql);
    // Our product: no owner.
    baseId = await makeExercise({ fx: a, name: 'Wall Balls', category: 'hyrox_station' });
    // Coach A's own movement.
    ownOfA = await makeExercise({ fx: a, name: 'Complejo Fabrik', coachId: a.coachId });
  });

  afterEach(async () => {
    // Each test starts from an unforked catalog.
    await sql`delete from coach_exercise_overrides where exercise_id in (${baseId}, ${ownOfA})`;
  });

  afterAll(async () => {
    await a.cleanup();
    await b.cleanup();
    await closeTestSql();
  });

  const names = (rows: { name: string }[]) => rows.map((r) => r.name);
  const find = <T extends { id: string }>(rows: T[], id: number) =>
    rows.find((r) => r.id === String(id));
  /** The coach's fork of a base exercise, in one line. */
  const fork = (coachId: number, exerciseId: number, patch: Record<string, string | null>) =>
    upsertCoachExerciseOverride(sql, {
      coach_id: BigInt(coachId),
      exercise_id: BigInt(exerciseId),
      patch,
    });

  // ── Visibility ─────────────────────────────────────────────────────────────
  test('a coach sees the BASE catalog plus their own — never another coach\'s', async () => {
    const forA = await loadCoachCatalog(sql, BigInt(a.coachId), { limit: 2000 });
    const forB = await loadCoachCatalog(sql, BigInt(b.coachId), { limit: 2000 });

    expect(find(forA, baseId)).toBeDefined();
    expect(find(forA, ownOfA)).toBeDefined();

    // B sees the shared base…
    expect(find(forB, baseId)).toBeDefined();
    // …and NOT A's own exercise. This is the whole feature.
    expect(find(forB, ownOfA)).toBeUndefined();
    expect(names(forB)).not.toContain('Complejo Fabrik');
  });

  test('origin labels each row, and the filter agrees with the label', async () => {
    await fork(a.coachId, baseId, { name: 'Wall Ball Shots' });

    const all = await loadCoachCatalog(sql, BigInt(a.coachId), { limit: 2000 });
    expect(find(all, baseId)?.origin).toBe('customized');
    expect(find(all, ownOfA)?.origin).toBe('own');

    // The filter must return exactly the rows carrying that label.
    const own = await loadCoachCatalog(sql, BigInt(a.coachId), { origin: 'own', limit: 2000 });
    expect(find(own, ownOfA)).toBeDefined();
    expect(find(own, baseId)).toBeUndefined();

    const customized = await loadCoachCatalog(sql, BigInt(a.coachId), {
      origin: 'customized',
      limit: 2000,
    });
    expect(find(customized, baseId)).toBeDefined();
    expect(find(customized, ownOfA)).toBeUndefined();

    // For B the same base row is untouched — plain Base.
    const baseForB = await loadCoachCatalog(sql, BigInt(b.coachId), { origin: 'base', limit: 2000 });
    expect(find(baseForB, baseId)).toBeDefined();
  });

  // ── The fork ───────────────────────────────────────────────────────────────
  test('renaming a BASE exercise forks it for THAT coach only', async () => {
    await fork(a.coachId, baseId, { name: 'Wall Ball Shots' });

    const rowA = await loadCoachExerciseRow(sql, BigInt(a.coachId), BigInt(baseId));
    const rowB = await loadCoachExerciseRow(sql, BigInt(b.coachId), BigInt(baseId));

    // A sees their name; the shared base name is still underneath (the editor's
    // "heredado" reference).
    expect(rowA?.name).toBe('Wall Ball Shots');
    expect(rowA?.override_name).toBe('Wall Ball Shots');
    expect(rowA?.base_name).toBe('Wall Balls');

    // B is untouched — the base row was never mutated.
    expect(rowB?.name).toBe('Wall Balls');
    expect(rowB?.override_name).toBeNull();
    expect(rowB?.origin).toBe('base');
  });

  test('clearing the override restores the base name (a fork you can undo)', async () => {
    await fork(a.coachId, baseId, { name: 'Wall Ball Shots' });
    await fork(a.coachId, baseId, { name: null });

    const row = await loadCoachExerciseRow(sql, BigInt(a.coachId), BigInt(baseId));
    expect(row?.name).toBe('Wall Balls');
    expect(row?.override_name).toBeNull();
    // An override row that exists but is all-null is NOT a fork.
    expect(row?.origin).toBe('base');
  });

  test('a partial fork never wipes the fields the coach did not touch', async () => {
    await fork(a.coachId, baseId, { name: 'Wall Ball Shots', cues: 'Codos altos' });
    await fork(a.coachId, baseId, { video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });

    const row = await loadCoachExerciseRow(sql, BigInt(a.coachId), BigInt(baseId));
    expect(row?.name).toBe('Wall Ball Shots');
    expect(row?.cues).toBe('Codos altos');
    expect(row?.video_url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  test('the coach finds their renamed exercise by the name THEY use', async () => {
    await fork(a.coachId, baseId, { name: 'Lanzamiento de balón' });

    const hit = await loadCoachCatalog(sql, BigInt(a.coachId), { search: 'balón', limit: 2000 });
    expect(find(hit, baseId)).toBeDefined();

    // …and B, who never renamed it, does not find it under A's name.
    const missB = await loadCoachCatalog(sql, BigInt(b.coachId), { search: 'balón', limit: 2000 });
    expect(find(missB, baseId)).toBeUndefined();
  });

  // ── The athlete sees what THEIR coach sees ────────────────────────────────
  test("an athlete sees their own coach's override, not the base or a rival's", async () => {
    await fork(a.coachId, baseId, { name: 'Wall Ball Shots' });

    // The athlete catalog is loaded with the ATHLETE's coach (athletes.coach_id).
    const forAthleteOfA = await loadAthleteExerciseCatalog(sql, { coachId: a.coachId, limit: 2000 });
    const forAthleteOfB = await loadAthleteExerciseCatalog(sql, { coachId: b.coachId, limit: 2000 });

    expect(forAthleteOfA.find((r) => r.id === baseId)?.name).toBe('Wall Ball Shots');
    expect(forAthleteOfB.find((r) => r.id === baseId)?.name).toBe('Wall Balls');
    // A's athlete may use A's own movement; B's athlete must not even see it.
    expect(forAthleteOfA.find((r) => r.id === ownOfA)).toBeDefined();
    expect(forAthleteOfB.find((r) => r.id === ownOfA)).toBeUndefined();
  });

  // ── The write guard ───────────────────────────────────────────────────────
  test('loadExerciseScope routes the write: base | own | invisible', async () => {
    expect(await loadExerciseScope(sql, BigInt(a.coachId), BigInt(baseId))).toBe('base');
    expect(await loadExerciseScope(sql, BigInt(a.coachId), BigInt(ownOfA))).toBe('own');
    // For B, A's exercise doesn't exist. Same answer as a bogus id.
    expect(await loadExerciseScope(sql, BigInt(b.coachId), BigInt(ownOfA))).toBeNull();
    expect(await loadExerciseScope(sql, BigInt(a.coachId), BigInt(2147483647))).toBeNull();
  });

  test('a coach edits their OWN exercise directly', async () => {
    const row = await updateExercise(
      BigInt(ownOfA),
      { name: 'Complejo Fabrik v2' },
      BigInt(a.coachId),
      sql,
    );
    expect(row.name).toBe('Complejo Fabrik v2');

    // Restore, so the suite stays order-independent.
    await updateExercise(BigInt(ownOfA), { name: 'Complejo Fabrik' }, BigInt(a.coachId), sql);
  });

  // ── Modality is DECLARED, not guessed ─────────────────────────────────────
  test('the coach declares the modality — a Spanish name no longer lands in `other`', async () => {
    // The old rule derived modality from regexes over the ENGLISH name
    // (`like '%row%'`), so "Remo 500m" became `other` and the analytics that route
    // on modality broke silently. The coach says what it is.
    const created = await createExercise(
      { name: 'Remo 500m', category: 'cardio', modality: 'row' },
      BigInt(a.coachId),
      sql,
    );
    expect(created.modality).toBe('row');

    // And renaming it does NOT re-guess: the movement is still a row.
    const renamed = await updateExercise(
      BigInt(created.id),
      { name: 'Remo quinientos' },
      BigInt(a.coachId),
      sql,
    );
    expect(renamed.modality).toBe('row');

    await sql`delete from exercises where id = ${created.id}`;
  });

  // ── Delete: the undo for "lo creé sin querer" ─────────────────────────────
  test('the coach deletes their own unused exercise', async () => {
    const created = await createExercise(
      { name: 'Error de dedo', category: 'strength', modality: 'strength' },
      BigInt(a.coachId),
      sql,
    );
    await deleteExercise(BigInt(created.id), BigInt(a.coachId), sql);

    const gone = await loadCoachCatalog(sql, BigInt(a.coachId), { search: 'error de dedo' });
    expect(gone).toHaveLength(0);
    expect(await loadExerciseScope(sql, BigInt(a.coachId), BigInt(created.id))).toBeNull();
  });

  test('an exercise in use is NOT deleted — the refusal names where', async () => {
    const created = await createExercise(
      { name: 'En uso', category: 'strength', modality: 'strength' },
      BigInt(a.coachId),
      sql,
    );
    const templateId = await makeTemplate({ fx: a, name: 'Sesión con el ejercicio' });
    await sql`
      insert into template_segments (template_id, exercise_id, position, block_position)
      values (${templateId}, ${created.id}, 1, 1)
    `;

    await expect(
      deleteExercise(BigInt(created.id), BigInt(a.coachId), sql),
    ).rejects.toMatchObject({ code: 'in_use', status: 409 });

    // Ground truth: it's still there. A refusal that half-deletes would be worse
    // than no refusal.
    expect(await loadExerciseScope(sql, BigInt(a.coachId), BigInt(created.id))).toBe('own');

    await sql`delete from template_segments where exercise_id = ${created.id}`;
    await sql`delete from exercises where id = ${created.id}`;
  });

  test("a coach cannot delete another coach's exercise", async () => {
    await expect(deleteExercise(BigInt(ownOfA), BigInt(b.coachId), sql)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
    expect(await loadExerciseScope(sql, BigInt(a.coachId), BigInt(ownOfA))).toBe('own');
  });

  test('nobody deletes a BASE exercise, not even by going around the route', async () => {
    // The route answers 409 for BASE, but the writer must refuse too: its guard is
    // `coach_id = <coach>`, and a base row has none — so it matches nothing.
    await expect(deleteExercise(BigInt(baseId), BigInt(a.coachId), sql)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(await loadExerciseScope(sql, BigInt(a.coachId), BigInt(baseId))).toBe('base');
  });

  test("updateExercise refuses another coach's exercise AND the base row", async () => {
    // The guard is the WHERE clause: no match → not_found. No TOCTOU window.
    await expect(
      updateExercise(BigInt(ownOfA), { name: 'Robado' }, BigInt(b.coachId), sql),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });

    // And a BASE row is nobody's to mutate — not even the coach who forked it.
    await expect(
      updateExercise(BigInt(baseId), { name: 'Global rename' }, BigInt(a.coachId), sql),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });

    // Ground truth: the rows are exactly as they were.
    const rows = await sql<{ name: string }[]>`
      select name from exercises where id in (${ownOfA}, ${baseId}) order by id
    `;
    expect(names(rows).sort()).toEqual(['Complejo Fabrik', 'Wall Balls']);
  });
});
