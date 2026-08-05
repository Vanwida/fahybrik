/**
 * build-proposal.ts — the #28 import ORCHESTRATOR, PURE unit tests (no DB: the
 * exercise resolver is faked to always MISS via `createFakeSql`, since these
 * tests are about the day/card/block/notes SPLITTING logic, not resolution —
 * the resolve cascade itself already has real-DB coverage in
 * exercise-resolve.test.ts, and every item here resolving to `exercise_id: null`
 * doesn't affect any assertion below).
 *
 * Two contracts under test:
 *   · CARDS (ImportedDay.cards) — one EditorBlock PER workout card, in order,
 *     with the CARD's own title; note/metrics/rest cards never produce a block;
 *     a truncated card's `hidden_count` must surface in review, not vanish;
 *     `cards` + `session_text` together must NOT double the blocks (the vision
 *     reader fills both — session_text is the workout cards' own concatenation).
 *   · NO CARDS (the Excel/pegado path, `cards` undefined) — byte-for-byte the
 *     pre-cards behaviour. Innegociable: this is what the real 12-week workbook
 *     and 174 existing import tests exercise.
 */
import { describe, expect, test } from 'vitest';
import { buildImportProposal } from '@/lib/import/build-proposal';
import type { ImportedCard, ImportedWeek } from '@/lib/import/imported-week';
import { createFakeSql } from '../utils/fake-sql';

// Every resolveExercise call misses deterministically (empty result set at
// every step of the cascade) — see file header.
const NO_MATCH_SQL = createFakeSql(() => []);
const COACH_ID = 1;

type Day = ImportedWeek['days'][number];

function card(overrides: Partial<ImportedCard> & Pick<ImportedCard, 'kind'>): ImportedCard {
  return { title: null, lines: [], ...overrides };
}

function week(days: Day[]): ImportedWeek {
  return { week: 1, sheet: 'test', fell_back: false, days };
}

async function proposalFor(days: Day[]) {
  const p = await buildImportProposal({ coach_id: COACH_ID, weeks: [week(days)], client: NO_MATCH_SQL });
  return p.weeks[0]!;
}

describe('buildImportProposal — no cards (legacy path, must stay byte-identical)', () => {
  test('one session_text blob → exactly one block, one am session, titled/formatted from the day', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 2,
        dow: 'Martes',
        stimulus: 'Fuerza tren inferior',
        session_text: 'Deadlift 5r 10/10/8/6/4',
      },
    ]);
    const day = wk.days[0]!;
    expect(day.sessions).toHaveLength(1);
    expect(day.sessions[0]!.slot).toBe('am');
    expect(day.sessions[0]!.focus).toBe('Fuerza tren inferior');
    expect(day.sessions[0]!.blocks).toHaveLength(1);
    const block = day.sessions[0]!.blocks[0]!;
    expect(block.title).toBe('Fuerza tren inferior');
    expect(block.group).toBe('principal');
    expect(block.format).toBe('sets');
    expect(block.items).toHaveLength(1);
    expect(block.items[0]!.exercise_name).toBe('Deadlift');
    expect(day.notes).toBeUndefined();
    // 'review', not 'detected': NO_MATCH_SQL makes every item unresolved on
    // purpose (see file header) — that alone forces the day to review,
    // independent of the grammar's own 'detected' confidence on this line.
    expect(day.state).toBe('review');
  });

  test('empty session_text → rest day, no sessions', async () => {
    const wk = await proposalFor([
      { day_of_week: 3, dow: 'Miércoles', stimulus: null, session_text: '' },
    ]);
    expect(wk.days[0]!.state).toBe('rest');
    expect(wk.days[0]!.sessions).toEqual([]);
  });

  test('"Descanso" session_text → rest day (REST_RE), unaffected by cards being absent', async () => {
    const wk = await proposalFor([
      { day_of_week: 4, dow: 'Jueves', stimulus: 'Recuperación', session_text: 'Descanso' },
    ]);
    expect(wk.days[0]!.state).toBe('rest');
    expect(wk.days[0]!.sessions).toEqual([]);
  });
});

describe('buildImportProposal — cards', () => {
  test('3 workout cards → 3 blocks, IN ORDER, each keeping its OWN title (the bug this fixes)', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: 'Día completo',
        session_text: null,
        cards: [
          card({ kind: 'workout', title: 'Movilidad', lines: ["10' movilidad de cadera"] }),
          card({ kind: 'workout', title: 'Ergómetros', lines: ["Row: 10x250m RPE7 – 1' rest"] }),
          card({ kind: 'workout', title: 'Carrera', lines: ['Deadlift 5r 10/10/8/6/4'] }),
        ],
      },
    ]);
    const day = wk.days[0]!;
    expect(day.sessions).toHaveLength(1);
    const blocks = day.sessions[0]!.blocks;
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.title)).toEqual(['Movilidad', 'Ergómetros', 'Carrera']);
  });

  test('a metrics card never becomes a block; a note card lands in day.notes, not a block', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [
          card({ kind: 'workout', title: 'Fuerza', lines: ['Deadlift 5r 10/10/8/6/4'] }),
          card({ kind: 'metrics', title: 'Peso', lines: ['82.4 kg'] }),
          card({ kind: 'note', title: null, lines: ['Recuerda hidratar bien hoy'] }),
        ],
      },
    ]);
    const day = wk.days[0]!;
    expect(day.sessions[0]!.blocks).toHaveLength(1);
    expect(day.sessions[0]!.blocks[0]!.title).toBe('Fuerza');
    expect(day.notes).toBe('Recuerda hidratar bien hoy');
  });

  test('a day with only a rest card (zero workout cards) falls to the legacy empty-text path → state rest', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 2,
        dow: 'Martes',
        stimulus: null,
        session_text: null, // the vision reader concatenates ZERO workout cards → ''
        cards: [card({ kind: 'rest', title: 'Descanso', lines: [] })],
      },
    ]);
    const day = wk.days[0]!;
    expect(day.state).toBe('rest');
    expect(day.sessions).toEqual([]);
  });

  test('a note-only day (no workout cards) still surfaces its note even though the block path never runs', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 5,
        dow: 'Viernes',
        stimulus: null,
        session_text: null,
        cards: [card({ kind: 'note', title: null, lines: ['Pesaje semanal el viernes'] })],
      },
    ]);
    const day = wk.days[0]!;
    expect(day.state).toBe('rest');
    expect(day.sessions).toEqual([]);
    expect(day.notes).toBe('Pesaje semanal el viernes');
  });

  test('cards + session_text together → cards win EXCLUSIVELY, session_text is ignored (no duplicate blocks)', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        // Exactly what the vision reader also fills — the concatenation of the
        // ONE workout card below. If both paths ran, this would double the block.
        session_text: 'Fuerza\nDeadlift 5r 10/10/8/6/4',
        cards: [card({ kind: 'workout', title: 'Fuerza', lines: ['Deadlift 5r 10/10/8/6/4'] })],
      },
    ]);
    const day = wk.days[0]!;
    expect(day.sessions).toHaveLength(1);
    expect(day.sessions[0]!.blocks).toHaveLength(1);
    expect(day.sessions[0]!.blocks[0]!.items).toHaveLength(1);
  });

  test('a truncated card reports block_uid + hidden_count in day.truncations — the SAME channel import-review.ts reads', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [
          card({
            kind: 'workout',
            title: 'Fuerza parte alta',
            lines: ['Deadlift 5r 10/10/8/6/4'],
            truncated: true,
            hidden_count: 4,
          }),
          card({ kind: 'workout', title: 'Ergómetros', lines: ["Row: 10x250m RPE7 – 1' rest"] }), // NOT truncated
        ],
      },
    ]);
    const day = wk.days[0]!;
    const [fuerza, ergo] = day.sessions[0]!.blocks;
    expect(day.truncations).toEqual([{ block_uid: fuerza!.uid, hidden_count: 4 }]);
    expect(day.truncations!.some((t) => t.block_uid === ergo!.uid)).toBe(false);
    expect(day.state).toBe('review');
  });

  test('a truncated card with NO stated count still reports the block, with hidden_count null (never invents a number)', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [
          card({ kind: 'workout', title: 'Notas…', lines: ['Deadlift 5r 10/10/8/6/4'], truncated: true }),
        ],
      },
    ]);
    const day = wk.days[0]!;
    expect(day.truncations).toEqual([{ block_uid: day.sessions[0]!.blocks[0]!.uid, hidden_count: null }]);
  });

  test('a fully-hidden card (title only, zero readable lines) still gets its block AND its truncation entry — nothing vanishes', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [card({ kind: 'workout', title: null, lines: [], truncated: true, hidden_count: 6 })],
      },
    ]);
    const day = wk.days[0]!;
    const block = day.sessions[0]!.blocks[0]!;
    expect(block.items).toEqual([]); // nothing readable — an honest empty block, not a fabricated line
    expect(day.truncations).toEqual([{ block_uid: block.uid, hidden_count: 6 }]);
    expect(day.state).toBe('review'); // truncation alone forces review, even with zero flags
  });

  test('no truncated cards → day.truncations is absent, not an empty array', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [card({ kind: 'workout', title: 'Fuerza', lines: ['Deadlift 5r 10/10/8/6/4'] })],
      },
    ]);
    expect(wk.days[0]!.truncations).toBeUndefined();
  });

  test('a card carrying an unexpected extra field (e.g. performed[], not part of ImportedCard) never crashes', async () => {
    const withExtra = {
      ...card({ kind: 'workout', title: 'Con extra', lines: ['Deadlift 5r 10/10/8/6/4'] }),
      performed: ['5x5 @100kg'], // what a vision-reader card MAY carry alongside lines[] — must be ignored, not read
    } as unknown as ImportedCard;
    await expect(
      proposalFor([{ day_of_week: 1, dow: 'Lunes', stimulus: null, session_text: null, cards: [withExtra] }]),
    ).resolves.toBeTruthy();
  });
});
