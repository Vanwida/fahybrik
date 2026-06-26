/**
 * Blocks library (Biblioteca de Bloques, 0037) — import + endpoint coverage.
 *
 * Two layers:
 *   1) Pure parsing (no DB): the xlsx layout → ParsedBlock mapping. Verifies
 *      group headers map to methodology_group_id 1..10, focus/header rows are
 *      skipped, descriptions are kept VERBATIM, titles are derived, and slugs
 *      are stable (idempotency relies on deterministic slugs).
 *   2) Real DB (describeWithDb): the seeded 97 blocks are queryable via
 *      listBlocks, filtered by group, with the group mapping intact.
 */
import { describe, expect, test, afterAll } from 'vitest';
import {
  parseBlocks,
  deriveTitle,
  slugify,
  GROUP_HINTS,
} from '../../../infra/scripts/import_blocks_xlsx';
import { listBlocks } from '@/lib/dashboard/coach/blocks';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

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

// Real-DB layer: the seeded blocks (97) are queryable and correctly grouped.
// The library is PER-COACH: blocks belong to their owning coach. We resolve the
// coach who owns the bulk of the seeded library and assert against THEIR list.
// Skipped (loud) when TEST_DATABASE_URL is unset — never a false green.
describeWithDb('listBlocks (real DB — seeded library)', () => {
  const sql = getTestSql();

  /** The coach that owns the seeded library (most blocks). */
  async function libraryOwnerId(): Promise<number> {
    const rows = await sql<Array<{ coach_id: string }>>`
      select coach_id::text as coach_id
      from blocks
      where coach_id is not null
      group by coach_id
      order by count(*) desc
      limit 1
    `;
    return Number(rows[0]!.coach_id);
  }

  afterAll(async () => {
    await closeTestSql();
  });

  test("returns the owning coach's full library across all 10 groups", async () => {
    const coachId = await libraryOwnerId();
    const all = await listBlocks(coachId, null, sql);
    expect(all.length).toBeGreaterThanOrEqual(97);
    const groups = new Set(all.map((b) => b.methodology_group_id));
    expect([...groups].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // every block carries the verbatim description (non-empty) + a title
    for (const b of all) {
      expect(b.description.length).toBeGreaterThan(0);
      expect(b.title.length).toBeGreaterThan(0);
    }
  });

  test('filters to a single methodology group', async () => {
    const coachId = await libraryOwnerId();
    const g1 = await listBlocks(coachId, 1, sql);
    expect(g1.length).toBeGreaterThan(0);
    expect(g1.every((b) => b.methodology_group_id === 1)).toBe(true);
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
