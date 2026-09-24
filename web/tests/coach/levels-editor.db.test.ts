// El editor de niveles y la sugerencia de nivel leen la MISMA escalera (DB real):
// crear, ordenar, retirar, borrar solo lo que nadie usa, qué marca abre cada
// nivel — y la sugerencia sobre los niveles del coach, con sus nombres y su
// orden, diciendo por qué cuando no puede sugerir.

import { afterAll, expect, test } from 'vitest';
import {
  createCoachLevel,
  deleteCoachLevel,
  listCoachLevels,
  loadCoachLadder,
  LevelError,
  reorderCoachLevels,
  setLevelCriteria,
  updateCoachLevel,
} from '@/lib/coach/levels';
import { computeAndStoreLevelSuggestion } from '@/lib/coach/level-proposal';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('niveles del coach: editor y sugerencia (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    for (const fx of fixtures) {
      await sql`update athletes set level_id = null, suggested_level_id = null where coach_id = ${fx.coachId}`;
      await sql`delete from athlete_benchmarks where athlete_id = ${fx.athleteId}`;
      await sql`delete from athlete_levels where coach_id = ${fx.coachId}`;
    }
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  async function fresh(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    return fx;
  }

  test('un coach nuevo no tiene niveles, y la sugerencia lo dice en vez de callarse', async () => {
    const fx = await fresh();
    expect(await listCoachLevels(fx.coachId, sql)).toEqual([]);
    const s = await computeAndStoreLevelSuggestion(fx.athleteId, fx.coachId, sql);
    expect(s?.status).toBe('no_levels');
  });

  test('crear, ordenar y retirar: la escalera es la de los activos, en su orden', async () => {
    const fx = await fresh();
    const a = await createCoachLevel(fx.coachId, { name: 'Base' }, sql);
    const b = await createCoachLevel(fx.coachId, { name: 'Medio', label: 'Intermedio' }, sql);
    const c = await createCoachLevel(fx.coachId, { name: 'Alto' }, sql);
    await expect(createCoachLevel(fx.coachId, { name: 'Base' }, sql)).rejects.toBeInstanceOf(LevelError);

    await reorderCoachLevels(fx.coachId, [Number(c), Number(a), Number(b)], sql);
    expect((await loadCoachLadder(fx.coachId, sql)).map((r) => r.name)).toEqual(['Alto', 'Base', 'Medio']);
    await expect(reorderCoachLevels(fx.coachId, [Number(a)], sql)).rejects.toBeInstanceOf(LevelError);

    await updateCoachLevel(fx.coachId, Number(c), { archived: true }, sql);
    expect((await loadCoachLadder(fx.coachId, sql)).map((r) => r.name)).toEqual(['Base', 'Medio']);
    const listed = await listCoachLevels(fx.coachId, sql);
    expect(listed.find((l) => l.id === c)?.archived_at).not.toBeNull();

    // Recuperar lo deja al final de los activos.
    await updateCoachLevel(fx.coachId, Number(c), { archived: false }, sql);
    expect((await loadCoachLadder(fx.coachId, sql)).map((r) => r.name)).toEqual(['Base', 'Medio', 'Alto']);
  });

  test('borrar solo lo que nadie usa; lo usado se retira', async () => {
    const fx = await fresh();
    const used = await createCoachLevel(fx.coachId, { name: 'Usado' }, sql);
    const free = await createCoachLevel(fx.coachId, { name: 'Libre' }, sql);
    await sql`update athletes set level_id = ${Number(used)} where id = ${fx.athleteId}`;
    await expect(deleteCoachLevel(fx.coachId, Number(used), sql)).rejects.toThrow(/1 atleta.*Retíralo/);
    await deleteCoachLevel(fx.coachId, Number(free), sql);
    expect((await listCoachLevels(fx.coachId, sql)).map((l) => l.name)).toEqual(['Usado']);
    await sql`update athletes set level_id = null where id = ${fx.athleteId}`;
  });

  test('otro coach no toca mis niveles', async () => {
    const mine = await fresh();
    const other = await fresh();
    const id = await createCoachLevel(mine.coachId, { name: 'Mío' }, sql);
    await expect(updateCoachLevel(other.coachId, Number(id), { name: 'Robado' }, sql)).rejects.toMatchObject({ code: 'not_found' });
    await expect(setLevelCriteria(other.coachId, Number(id), [], sql)).rejects.toMatchObject({ code: 'not_found' });
  });

  test('la sugerencia usa los niveles del coach (sin N1…N5) y sus cortes, y la guarda', async () => {
    const fx = await fresh();
    await sql`update athletes set sex = 'male', weight_kg = 80, level_id = null where id = ${fx.athleteId}`;
    const base = await createCoachLevel(fx.coachId, { name: 'Base' }, sql);
    const alto = await createCoachLevel(fx.coachId, { name: 'Alto' }, sql);
    await sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit)
      values (${fx.athleteId}, 'run_5k', 1300, 's')
    `;
    // Sin tocar: defectos por posición (2.º escalón = 5K ≤ 28′) → Alto.
    let s = await computeAndStoreLevelSuggestion(fx.athleteId, fx.coachId, sql);
    expect(s).toMatchObject({ status: 'suggested', level_id: alto });

    // Sus cortes: Alto se abre a 20′ → este 5K se queda en Base.
    await setLevelCriteria(fx.coachId, Number(alto), [{ metric: 'run_5k_s', sex: null, threshold: 1200 }], sql);
    s = await computeAndStoreLevelSuggestion(fx.athleteId, fx.coachId, sql);
    expect(s).toMatchObject({ status: 'suggested', level_id: base });
    const [row] = await sql<Array<{ suggested: string | null; conf: string | null }>>`
      select suggested_level_id::text as suggested, level_confidence as conf from athletes where id = ${fx.athleteId}
    `;
    expect(row).toEqual({ suggested: base, conf: 'low' });

    // Un eje que no va por marcas: vacía los dos → sin sugerencia, y se borra la vieja.
    await setLevelCriteria(fx.coachId, Number(base), [], sql);
    await setLevelCriteria(fx.coachId, Number(alto), [], sql);
    s = await computeAndStoreLevelSuggestion(fx.athleteId, fx.coachId, sql);
    expect(s?.status).toBe('no_criteria');
    const [after] = await sql<Array<{ suggested: string | null }>>`
      select suggested_level_id::text as suggested from athletes where id = ${fx.athleteId}
    `;
    expect(after!.suggested).toBeNull();

    // Volver al defecto (null) recupera la sugerencia.
    await setLevelCriteria(fx.coachId, Number(alto), null, sql);
    await setLevelCriteria(fx.coachId, Number(base), null, sql);
    expect((await computeAndStoreLevelSuggestion(fx.athleteId, fx.coachId, sql))?.status).toBe('suggested');
  });

  test('un nivel retirado no se sugiere', async () => {
    const fx = await fresh();
    const a = await createCoachLevel(fx.coachId, { name: 'A' }, sql);
    const b = await createCoachLevel(fx.coachId, { name: 'B' }, sql);
    await sql`insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit) values (${fx.athleteId}, 'run_5k', 1000, 's')`;
    expect(await computeAndStoreLevelSuggestion(fx.athleteId, fx.coachId, sql)).toMatchObject({ level_id: b });
    await updateCoachLevel(fx.coachId, Number(b), { archived: true }, sql);
    expect(await computeAndStoreLevelSuggestion(fx.athleteId, fx.coachId, sql)).toMatchObject({ status: 'no_criteria' });
    expect(a).toBeTruthy();
  });
});
