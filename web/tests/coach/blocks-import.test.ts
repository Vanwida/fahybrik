/**
 * Blocks library (Biblioteca de Bloques, 0037) — import + endpoint coverage.
 *
 * Two layers:
 *   1) Pure parsing (no DB): the xlsx layout → ParsedBlock mapping. Verifies
 *      group headers map to methodology_group_id 1..10, focus/header rows are
 *      skipped, descriptions are kept VERBATIM, titles are derived, and slugs
 *      are stable (idempotency relies on deterministic slugs).
 *   2) Real DB (describeWithDb): parsed blocks written into ONE coach's library
 *      come back through listBlocks — all ten groups, verbatim, filterable by
 *      group, never mixed with another coach's — with the group mapping intact.
 */
import { describe, expect, test, afterAll, beforeAll } from 'vitest';
import {
  parseBlocks,
  deriveTitle,
  slugify,
  GROUP_HINTS,
} from '../../../infra/scripts/import_blocks_xlsx';
import { listBlocks } from '@/lib/dashboard/coach/blocks';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeLibraryBlock, type Fixture } from '../utils/db-fixtures';

type Row = (string | number | null)[];

// A minimal slice of the real sheet: title, header, then two groups each with a
// GRUPO header, an ENFOQUE row, and data rows.
const SAMPLE_ROWS: Row[] = [
  ['CLASIFICACIÓN DE ENTRENAMIENTOS POR GRUPOS', null, null, null],
  ['#', 'Sesión (Semana – Día)', 'Descripción del Entrenamiento', 'Grupo'],
  ['  GRUPO 1  —  🏋️ FUERZA BASE', null, null, null],
  ['📌 ENFOQUE: Desarrollar fuerza máxima…', null, null, null],
  [1, 'S1 – Martes', 'Front squat 5 rounds 10/10/8/8/6 al 65-80%', '🏋️ FUERZA BASE'],
  [2, 'S1 – Miércoles', 'Strict shoulder press 5 rounds 10/8/8/6/4 al 65-85%', '🏋️ FUERZA BASE'],
  [null, null, null, null],
  ['  GRUPO 8  —  🧘 CORE, MOVILIDAD Y PREVENTIVOS', null, null, null],
  ['📌 ENFOQUE: Prevenir lesiones…', null, null, null],
  [79, 'S1 – Viernes', "Side plank 4x40''/20'' + Lateral plank 6x40''/20'' + Turkish get-up 4r", '🧘 CORE'],
  [null, null, null, null],
];

describe('parseBlocks (pure)', () => {
  const blocks = parseBlocks(SAMPLE_ROWS);

  test('skips title/header/group/focus/blank rows — only data rows become blocks', () => {
    expect(blocks).toHaveLength(3);
  });

  test('maps GRUPO N header to methodology_group_id', () => {
    expect(blocks.map((b) => b.methodology_group_id)).toEqual([1, 1, 8]);
  });

  test('keeps description VERBATIM (never reworded)', () => {
    expect(blocks[0].description).toBe('Front squat 5 rounds 10/10/8/8/6 al 65-80%');
    expect(blocks[2].description).toBe(
      "Side plank 4x40''/20'' + Lateral plank 6x40''/20'' + Turkish get-up 4r",
    );
  });

  test('derives a short title (verbatim slashes tidied, compound trimmed)', () => {
    expect(blocks[0].title).toBe('Front squat 5 rounds 10-10-8-8-6 al 65-80%');
    // compound "+ Lateral plank …" cut off; title is just the first clause
    expect(blocks[2].title).toBe("Side plank 4x40''/20''");
  });

  test('applies per-group format', () => {
    expect(blocks[0].format).toBe('strength_block');
    expect(blocks[2].format).toBe('core_mobility');
  });

  test('source_ref carries the session hint', () => {
    expect(blocks[0].source_ref).toBe('S1 – Martes');
  });

  test('slugs are deterministic + unique (idempotency depends on this)', () => {
    const slugs = blocks.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    // re-parsing the same rows yields identical slugs (no random/timestamp)
    expect(parseBlocks(SAMPLE_ROWS).map((b) => b.slug)).toEqual(slugs);
    expect(slugs[0]).toMatch(/^g1-1-/);
  });

  test('GROUP_HINTS covers exactly groups 1..10', () => {
    expect(Object.keys(GROUP_HINTS).map(Number).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });
});

describe('deriveTitle / slugify helpers', () => {
  test('deriveTitle tidies rep schemes and truncates long text', () => {
    expect(deriveTitle('Deadlift 5r 10/10/8/6/4')).toBe('Deadlift 5r 10-10-8-6-4');
  });
  test('slugify strips accents and lowercases', () => {
    expect(slugify('Pliométrica Explosiva')).toBe('pliometrica-explosiva');
  });
});

/** A sheet in the importer's layout with two data rows in EACH group 1..10. */
function libraryRows(): Row[] {
  const rows: Row[] = [
    ['CLASIFICACIÓN DE ENTRENAMIENTOS POR GRUPOS', null, null, null],
    ['#', 'Sesión (Semana – Día)', 'Descripción del Entrenamiento', 'Grupo'],
  ];
  for (let g = 1; g <= 10; g += 1) {
    rows.push([`  GRUPO ${g}  —  GRUPO ${g}`, null, null, null]);
    rows.push(['📌 ENFOQUE: …', null, null, null]);
    rows.push([g * 10, `S${g} – Lunes`, `Bloque ${g}A 5 rounds 10/8/6 + accesorio ${g}`, `GRUPO ${g}`]);
    rows.push([g * 10 + 1, `S${g} – Jueves`, `Bloque ${g}B 4x40''/20''`, `GRUPO ${g}`]);
    rows.push([null, null, null, null]);
  }
  return rows;
}

// Real-DB layer: what the importer parses, written into ONE coach's library,
// comes back through listBlocks — all ten groups, verbatim, filterable by group.
// The library is PER-COACH: a second coach's block sits in the same group and
// must never show up in the first coach's list.
//
// Self-contained: the coaches and both libraries are this suite's own fixtures,
// torn down after it. It used to read "the coach who owns the most blocks" —
// the ~97-block Excel import living only on the demo Neon branch — so it could
// only ever run there.
// Skipped (loud) when TEST_DATABASE_URL is unset — never a false green.
describeWithDb("listBlocks (real DB — the coach's own library)", () => {
  const sql = getTestSql();
  const parsed = parseBlocks(libraryRows());
  const cleanups: Array<() => Promise<void>> = [];
  let owner: Fixture;
  let otherCoach: Fixture;

  beforeAll(async () => {
    owner = await makeCoachAndAthlete(sql);
    cleanups.push(owner.cleanup);
    otherCoach = await makeCoachAndAthlete(sql);
    cleanups.push(otherCoach.cleanup);

    // Each parsed block lands as the importer writes it: in its group, with the
    // description verbatim, the derived title, the group's format hint and the
    // session reference.
    for (const b of parsed) {
      await makeLibraryBlock({
        fx: owner,
        title: b.title,
        description: b.description,
        methodologyGroupId: b.methodology_group_id,
        format: b.format,
        sourceRef: b.source_ref,
      });
    }
    await makeLibraryBlock({
      fx: otherCoach,
      title: 'Bloque de otro club',
      description: 'Fuerza de otro coach, mismo grupo',
      methodologyGroupId: 1,
    });
  });

  afterAll(async () => {
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test("returns the owning coach's full library across all 10 groups", async () => {
    expect(parsed).toHaveLength(20);
    const all = await listBlocks(owner.coachId, null, sql);
    // The whole library and nothing else: every block written for this coach
    // (the demo branch asserted `>= 97`, the size of its one import).
    expect(all).toHaveLength(parsed.length);
    expect(all.map((b) => b.id).sort((a, b) => a - b)).toEqual(
      [...owner.blockIds].sort((a, b) => a - b),
    );
    const groups = new Set(all.map((b) => b.methodology_group_id));
    expect([...groups].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // every block carries the verbatim description (non-empty) + a title
    for (const b of all) {
      expect(b.description.length).toBeGreaterThan(0);
      expect(b.title.length).toBeGreaterThan(0);
    }
    // ...and each one is the parsed block, untouched on its way through the DB.
    const byDescription = new Map(all.map((b) => [b.description, b]));
    for (const p of parsed) {
      expect(byDescription.get(p.description)).toMatchObject({
        title: p.title,
        methodology_group_id: p.methodology_group_id,
        format: p.format,
        source_ref: p.source_ref,
      });
    }
  });

  test('filters to a single methodology group', async () => {
    const g1 = await listBlocks(owner.coachId, 1, sql);
    expect(g1.length).toBeGreaterThan(0);
    expect(g1.every((b) => b.methodology_group_id === 1)).toBe(true);
    // Exactly this coach's group-1 blocks: the other coach's one never leaks in.
    expect(g1).toHaveLength(parsed.filter((p) => p.methodology_group_id === 1).length);
    expect(g1.some((b) => otherCoach.blockIds.includes(b.id))).toBe(false);
  });

  test('group mapping matches methodology_groups by name', async () => {
    const rows = await sql<{ id: number; name_es: string }[]>`
      select id, name_es from methodology_groups order by id
    `;
    expect(Number(rows[0].id)).toBe(1);
    expect(rows[0].name_es).toBe('Fuerza Base');
    expect(Number(rows[9].id)).toBe(10);
    expect(rows[9].name_es).toContain('Tapering');
  });
});
