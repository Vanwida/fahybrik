/**
 * Card 128 · hueco 4. El importador resuelve los nombres del ciclo contra
 * `exercise_aliases` y el catálogo. Una fila es un movimiento. El puente
 * unilateral no puede acabar en el bilateral.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, test } from 'vitest';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';
import { resolveExercise, termMarksLaterality } from '@/lib/import/exercise-resolve';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise } from '../utils/db-fixtures';
import {
  BOX_JUMP_LANDING_ALIASES,
  CYCLE_ALIAS_ONLY,
  CYCLE_ALIAS_ONLY_COUNT,
  CYCLE_ALTAS,
  CYCLE_ALTAS_ALREADY_IN_0205,
  CYCLE_ALTAS_THIS_PR,
  CYCLE_RESOLVE_CASES,
  FORBIDDEN_NEW_SLUGS,
} from './cycle-catalog-names';

const MIGRATION_0210 = readFileSync(
  join(__dirname, '../../../infra/migrations/0210_cycle_catalog_aliases.sql'),
  'utf8',
);

const CORPUS = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/macrociclo-hyrox-12-semanas.json'), 'utf8'),
) as { semanas: Array<{ dias: Array<{ bloques?: Array<{ contenido: string }> }> }> };

describe('ciclo · catálogo y alias (puro)', () => {
  test('los 35 que solo necesitan alias son 35, y no inventan una fila', () => {
    expect(CYCLE_ALIAS_ONLY).toHaveLength(CYCLE_ALIAS_ONLY_COUNT);
    const slugs = new Set(CYCLE_ALIAS_ONLY.map((c) => c.slug));
    for (const forbidden of FORBIDDEN_NEW_SLUGS) {
      expect(slugs.has(forbidden), forbidden).toBe(false);
    }
  });

  test('después de la 0205 queda una alta de movimiento: hollow rocks', () => {
    expect(CYCLE_ALTAS_ALREADY_IN_0205).toBe(29);
    expect(CYCLE_ALTAS_THIS_PR).toBe(1);
    expect(CYCLE_ALTAS).toEqual([{ term: 'Hollow rocks', slug: 'hollow-rocks', kind: 'alta' }]);
  });

  test('el salto al cajón a una pierna no entra como fila nueva', () => {
    expect(MIGRATION_0210).toContain("('hollow-rocks'");
    for (const slug of FORBIDDEN_NEW_SLUGS) {
      expect(MIGRATION_0210.includes(`('${slug}'`), slug).toBe(false);
    }
    for (const row of BOX_JUMP_LANDING_ALIASES) {
      expect(row.slug).toBe('box-jump');
    }
  });

  test('un calificador de lado se ve en el término', () => {
    expect(termMarksLaterality('puente de gluteo unilateral')).toBe(true);
    expect(termMarksLaterality('puente de gluteo a una pierna')).toBe(true);
    expect(termMarksLaterality('puente de gluteo')).toBe(false);
    expect(termMarksLaterality('hip thrust unilateral')).toBe(true);
  });

  test('el trinquete de gramática del corpus no baja (71 %)', () => {
    const bloques = CORPUS.semanas.flatMap((s) => s.dias.flatMap((d) => d.bloques ?? []));
    let detected = 0;
    let total = 0;
    for (const b of bloques) {
      const suyas = b.contenido.split('\n').map((x) => x.trim()).filter(Boolean);
      total += suyas.length;
      const parsed = parseNotationCell(b.contenido, { bareNamesAreExercises: true });
      const fieles = parsed.filter((p) => p.confidence === 'detected').length;
      detected += Math.min(suyas.length, fieles);
    }
    expect(total).toBe(1238);
    const pct = Math.floor((detected / total) * 100);
    expect(pct).toBeGreaterThanOrEqual(71);
  });
});

describeWithDb('ciclo · resolveExercise lee exercise_aliases (DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  test('«Puente de glúteo unilateral» resuelve al unilateral, nunca al bilateral', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const [uni] = await sql<Array<{ id: string }>>`
      select id::text as id from exercises where slug = 'single-leg-glute-bridge'
    `;
    const [bi] = await sql<Array<{ id: string }>>`
      select id::text as id from exercises where slug = 'glute-bridge'
    `;
    expect(uni, 'falta single-leg-glute-bridge').toBeTruthy();
    expect(bi, 'falta glute-bridge').toBeTruthy();
    for (const term of ['Puente de glúteo unilateral', 'puente de gluteo a una pierna']) {
      const res = await resolveExercise(fx.coachId, term, sql);
      expect(res.exercise_id, `"${term}" es el UNILATERAL`).toBe(Number(uni!.id));
      expect(res.exercise_id, `"${term}" jamás el bilateral`).not.toBe(Number(bi!.id));
    }
  });

  test('un calificador de lado no se traga en el bilateral por subcadena', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const bi = await makeExercise({ fx, name: `Puente Qmzxw ${fx.coachId}` });
    await makeExercise({ fx, name: `Puente Qmzxw ${fx.coachId} a una pierna` });
    const res = await resolveExercise(fx.coachId, `Puente Qmzxw ${fx.coachId} unilateral`, sql);
    expect(res.exercise_id, 'el bilateral no puede ganar por ser el nombre más corto').not.toBe(bi);
  });

  test('los nombres literales del ciclo resuelven al slug esperado', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const missing: string[] = [];
    const wrong: string[] = [];
    for (const { term, slug } of CYCLE_RESOLVE_CASES) {
      const res = await resolveExercise(fx.coachId, term, sql);
      if (res.exercise_id == null) {
        missing.push(`${term} → ${slug}`);
        continue;
      }
      const [row] = await sql<Array<{ slug: string }>>`
        select slug from exercises where id = ${res.exercise_id}
      `;
      if (row?.slug !== slug) wrong.push(`${term} → ${row?.slug} (esperado ${slug})`);
    }
    expect(missing, `sin resolver: ${missing.join('; ')}`).toEqual([]);
    expect(wrong, `slug equivocado: ${wrong.join('; ')}`).toEqual([]);
  });

  test('Air bike no acaba en el BikeErg; sandbag walking lunge no acaba en walking lunge', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const air = await resolveExercise(fx.coachId, 'Air bike', sql);
    const [airRow] = await sql<Array<{ slug: string }>>`
      select slug from exercises where id = ${air.exercise_id}
    `;
    expect(airRow?.slug).toBe('assault-bike');
    expect(airRow?.slug).not.toBe('bike-erg');

    const sb = await resolveExercise(fx.coachId, 'Sandbag walking lunge', sql);
    const [sbRow] = await sql<Array<{ slug: string }>>`
      select slug from exercises where id = ${sb.exercise_id}
    `;
    expect(sbRow?.slug).toBe('hyrox-sandbag-lunges');
    expect(sbRow?.slug).not.toBe('walking-lunge');
  });

  test('READOUT: cobertura de nombres del ciclo (trinquete: no baja)', async () => {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    let resolved = 0;
    for (const { term } of CYCLE_RESOLVE_CASES) {
      const res = await resolveExercise(fx.coachId, term, sql);
      if (res.exercise_id != null) resolved += 1;
    }
    const pct = Math.floor((resolved / CYCLE_RESOLVE_CASES.length) * 100);
    // 0 → este número. Sube si entra más del ciclo. Si baja, algo se desconectó.
    expect(resolved).toBe(CYCLE_RESOLVE_CASES.length);
    expect(pct).toBe(100);
  });
});
