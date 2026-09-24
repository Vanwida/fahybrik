// Un nivel retirado (0259) sale de todo lo que se ELIGE y se queda en quien ya
// lo lleva (DB real): los selectores, las validaciones de «poner este nivel», la
// ficha (con el suyo aunque esté retirado) y el porqué cuando no hay sugerencia.

import { afterAll, expect, test } from 'vitest';
import { createCoachLevel, setLevelCriteria, updateCoachLevel } from '@/lib/coach/levels';
import { checkAssignableLevel, listLevelOptions } from '@/lib/coach/level-options';
import { setAthleteLevel } from '@/lib/dashboard/athletes/level';
import { loadClassification } from '@/lib/dashboard/v2/atleta-detalle';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('niveles retirados: fuera de los selectores, dentro de quien los lleva (DB real)', () => {
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

  async function ladder(fx: Fixture) {
    const base = await createCoachLevel(fx.coachId, { name: 'Base' }, sql);
    const medio = await createCoachLevel(fx.coachId, { name: 'Medio' }, sql);
    const viejo = await createCoachLevel(fx.coachId, { name: 'Viejo' }, sql);
    await updateCoachLevel(fx.coachId, Number(viejo), { archived: true }, sql);
    return { base, medio, viejo };
  }

  test('el selector lista los activos; un retirado solo si es el valor actual, y marcado', async () => {
    const fx = await fresh();
    const { base, medio, viejo } = await ladder(fx);
    expect((await listLevelOptions(fx.coachId, { client: sql })).map((l) => l.id)).toEqual([base, medio]);
    const kept = await listLevelOptions(fx.coachId, { keep: [viejo, null], client: sql });
    expect(kept.map((l) => [l.name, l.archived])).toEqual([
      ['Base', false],
      ['Medio', false],
      ['Viejo', true],
    ]);
  });

  test('poner un nivel: activo sí; retirado no, salvo que ya estuviera puesto; ajeno nunca', async () => {
    const fx = await fresh();
    const other = await fresh();
    const { base, viejo } = await ladder(fx);
    const ajeno = await createCoachLevel(other.coachId, { name: 'Ajeno' }, sql);

    expect(await checkAssignableLevel(sql, fx.coachId, base)).toMatchObject({ ok: true, level: { name: 'Base' } });
    const archived = await checkAssignableLevel(sql, fx.coachId, viejo);
    expect(archived).toMatchObject({ ok: false, reason: 'archived' });
    expect(archived.ok ? '' : archived.message).toBe('«Viejo» está retirado. Puedes elegir: Base, Medio.');
    expect(await checkAssignableLevel(sql, fx.coachId, viejo, [viejo])).toMatchObject({ ok: true });
    expect(await checkAssignableLevel(sql, fx.coachId, ajeno, [ajeno])).toMatchObject({ ok: false, reason: 'not_found' });
  });

  test('cambiar el nivel de un atleta a uno retirado se rechaza; quien ya lo lleva lo conserva', async () => {
    const fx = await fresh();
    const { base, viejo } = await ladder(fx);
    await expect(setAthleteLevel({ coach_id: fx.coachId, athlete_id: fx.athleteId, level_id: Number(viejo), client: sql }))
      .rejects.toMatchObject({ code: 'level_archived', status: 422 });

    await sql`update athletes set level_id = ${Number(viejo)} where id = ${fx.athleteId}`;
    await expect(setAthleteLevel({ coach_id: fx.coachId, athlete_id: fx.athleteId, level_id: Number(viejo), client: sql }))
      .resolves.toMatchObject({ level_name: 'Viejo' });

    // La ficha lo enseña (marcado) junto a los activos, y sin porqué de sugerencia: ya tiene nivel.
    const c = await loadClassification({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(c.level_name).toBe('Viejo');
    expect(c.levels.map((l) => [l.name, l.archived])).toEqual([
      ['Base', false],
      ['Medio', false],
      ['Viejo', true],
    ]);
    expect(c.suggestion_gap).toBeNull();

    await setAthleteLevel({ coach_id: fx.coachId, athlete_id: fx.athleteId, level_id: Number(base), client: sql });
    const after = await loadClassification({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(after.levels.map((l) => l.name)).toEqual(['Base', 'Medio']);
  });

  test('sin nivel ni sugerencia, la ficha dice por qué y dónde se arregla', async () => {
    const fx = await fresh();
    await sql`update athletes set level_id = null, suggested_level_id = null where id = ${fx.athleteId}`;

    // Sin niveles.
    let c = await loadClassification({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(c.suggestion_gap).toMatchObject({ reason: 'no_levels', action: { href: '/ajustes/metodo#niveles' } });

    // Niveles sin marcas (el defecto por posición) y un atleta sin marcas.
    const base = await createCoachLevel(fx.coachId, { name: 'Base' }, sql);
    const alto = await createCoachLevel(fx.coachId, { name: 'Alto' }, sql);
    c = await loadClassification({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(c.suggestion_gap).toMatchObject({ reason: 'no_signals', action: { href: '/programar/tests' } });

    // Ningún nivel se abre por marcas.
    await setLevelCriteria(fx.coachId, Number(base), [], sql);
    await setLevelCriteria(fx.coachId, Number(alto), [], sql);
    c = await loadClassification({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(c.suggestion_gap).toMatchObject({ reason: 'no_criteria', text: 'Sin sugerencia: ningún nivel tuyo se abre por marcas.' });

    // Con cortes y una marca: la sugerencia se lee fresca y no hay porqué.
    await setLevelCriteria(fx.coachId, Number(alto), null, sql);
    await setLevelCriteria(fx.coachId, Number(base), null, sql);
    await sql`insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit) values (${fx.athleteId}, 'run_5k', 1300, 's')`;
    c = await loadClassification({ coach_id: fx.coachId, athlete_id: fx.athleteId, client: sql });
    expect(c.suggestion_gap).toBeNull();
    expect(c.suggested_level_id).toBe(alto);
  });
});
