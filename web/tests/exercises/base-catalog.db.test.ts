/**
 * El catálogo BASE que recibe un coach nuevo resuelve los levantamientos que
 * cualquiera teclea en la línea rápida, en castellano y en inglés.
 *
 * Nada se siembra aquí: el catálogo es el que dejan las migraciones (0247 crea
 * las filas base que 0178 solo traducía). Si una base nueva vuelve a arrancar
 * sin sentadilla, esto falla. Revisión de producto, ola 4.
 */

import { afterAll, beforeAll, expect, test } from 'vitest';
import { BEST_MIN, resolveExercises } from '@/lib/exercises/resolve';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import type { Sql } from '@/lib/db';

// Lo que un coach escribe → el slug del catálogo base.
const LIFTS: Array<[string, string]> = [
  ['sentadilla', 'back-squat'],
  ['sentadilla trasera', 'back-squat'],
  ['back squat', 'back-squat'],
  ['sentadilla frontal', 'front-squat'],
  ['front squat', 'front-squat'],
  ['sentadilla goblet', 'goblet-squat'],
  ['sentadilla búlgara', 'bulgarian-split-squat'],
  ['peso muerto', 'deadlift'],
  ['deadlift', 'deadlift'],
  ['peso muerto rumano', 'romanian-deadlift'],
  ['RDL', 'romanian-deadlift'],
  ['press banca', 'bench-press'],
  ['bench press', 'bench-press'],
  ['press militar', 'overhead-press'],
  ['overhead press', 'overhead-press'],
  ['push press', 'push-press'],
  ['dominadas', 'pull-up'],
  ['pull ups', 'pull-up'],
  ['remo con barra', 'barbell-row'],
  ['barbell row', 'barbell-row'],
  ['hip thrust', 'hip-thrust'],
  ['zancadas', 'walking-lunge'],
  ['walking lunge', 'walking-lunge'],
  ['flexiones', 'push-up'],
  ['fondos en paralelas', 'dip'],
  ['cargada', 'power-clean'],
  ['power clean', 'power-clean'],
  ['arrancada', 'snatch'],
  ['thrusters', 'thruster'],
  ['swing con kettlebell', 'kb-swing'],
  ['wall balls', 'hyrox-wall-balls'],
  ['wall ball', 'hyrox-wall-balls'],
  ['sled push', 'hyrox-sled-push'],
  ['empuje de trineo', 'hyrox-sled-push'],
  ['sled pull', 'hyrox-sled-pull'],
  ['farmers carry', 'hyrox-farmer-carry'],
  ['burpee broad jump', 'hyrox-burpee-broad-jump'],
  ['zancadas con sandbag', 'hyrox-sandbag-lunges'],
  ['burpees', 'burpee'],
  ['box jump', 'box-jump'],
  ['plancha', 'plank'],
  ['toes to bar', 'toes-to-bar'],
  ['remo', 'row'],
  ['skierg', 'ski-erg'],
  ['correr', 'run'],
];

describeWithDb('catálogo base de un coach nuevo (real DB, sin sembrar nada)', () => {
  const sql = getTestSql();
  let club: Fixture;
  const slugId = new Map<string, string>();
  // Filas globales que crean otros tests con el mismo nombre («Back Squat»), a
  // veces EN PARALELO con este fichero: en una base limpia no existen y aquí
  // empatarían con la base. Se apartan dentro de una transacción que se deshace,
  // así ningún otro test las ve archivadas.

  beforeAll(async () => {
    club = await makeCoachAndAthlete(sql);
    const slugs = [...new Set(LIFTS.map(([, s]) => s))];
    const rows = await sql<{ slug: string; id: string }[]>`
      select slug, id::text as id from exercises
      where slug in ${sql(slugs)} and coach_id is null and archived_at is null`;
    for (const r of rows) slugId.set(r.slug, r.id);
  });

  afterAll(async () => {
    await club.cleanup();
    await closeTestSql();
  });

  test('el catálogo base trae los levantamientos principales', () => {
    const missing = [...new Set(LIFTS.map(([, s]) => s))].filter((s) => !slugId.has(s));
    expect(missing).toEqual([]);
  });

  test(`los ${LIFTS.length} nombres más comunes (ES/EN) se enlazan solos al ejercicio correcto`, async () => {
    const ROLLBACK = new Error('rollback');
    let res: Awaited<ReturnType<typeof resolveExercises>> = [];
    await sql
      .begin(async (tx) => {
        await tx`
          update exercises set archived_at = now()
          where coach_id is null and archived_at is null and slug ~ '^ex-[0-9]{13}-[0-9]+-[0-9]+$'`;
        res = await resolveExercises({ coach_id: club.coachId, tokens: LIFTS.map(([t]) => t), client: tx as unknown as Sql });
        throw ROLLBACK;
      })
      .catch((e: unknown) => {
        if (e !== ROLLBACK) throw e;
      });
    const wrong = LIFTS.flatMap(([token, slug], i) => {
      const r = res[i]!;
      const ok = r.best?.id === slugId.get(slug) && r.confidence >= BEST_MIN;
      return ok ? [] : [`${token} → ${r.best?.name ?? '(pregunta)'} [${r.candidates.map((c) => c.name).join(', ')}]`];
    });
    expect(wrong).toEqual([]);
  });
});
