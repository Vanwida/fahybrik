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

describe('buildImportProposal — cards: fill-defaults (photo-only proposed values)', () => {
  test('a strength line missing rest + intensity gets both proposed, reported in day.filled with the RATIFIED shape', async () => {
    // "Deadlift 5r 10/10/8/6/4" types 5 sets with reps but NO target and NO
    // rest between them — exactly the gap fillMissingWithDefaults exists for.
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [card({ kind: 'workout', title: 'Fuerza', lines: ['Deadlift 5r 10/10/8/6/4'] })],
      },
    ]);
    const day = wk.days[0]!;
    const itemUid = day.sessions[0]!.blocks[0]!.items[0]!.uid;
    expect(day.filled).toBeDefined();
    // 5 sets → RIR proposed on all 5; rest proposed between them (not after the last) → 4.
    const intensity = day.filled!.filter((f) => f.field === 'intensity');
    const rest = day.filled!.filter((f) => f.field === 'rest');
    expect(intensity).toHaveLength(5);
    expect(rest).toHaveLength(4);
    expect(intensity.map((f) => f.path)).toEqual(['sets[0].target', 'sets[1].target', 'sets[2].target', 'sets[3].target', 'sets[4].target']);
    expect(rest.map((f) => f.path)).toEqual(['sets[0].rest_s', 'sets[1].rest_s', 'sets[2].rest_s', 'sets[3].rest_s']);
    // The RATIFIED shape is exactly {item_uid, field, path} — no `reason` leaks through.
    for (const f of day.filled!) {
      expect(f.item_uid).toBe(itemUid);
      expect(Object.keys(f).sort()).toEqual(['field', 'item_uid', 'path']);
    }
  });

  test('a review-confidence line (dense WOD the grammar cannot type) is excluded from filling', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [
          card({
            kind: 'workout',
            title: 'Metcon',
            lines: [
              'WOD For Time 4 rounds: 10m KB OH walking lunge 24kg, 5 thrusters 40kg, 3 clean 40kg, 10 TTB (TC 12\')',
            ],
          }),
        ],
      },
    ]);
    const day = wk.days[0]!;
    expect(day.flags[0]!.confidence).toBe('review');
    // No sets structure on a review line — nothing for fillMissingWithDefaults
    // to hang a default on, so it must stay untouched.
    expect(day.filled).toBeUndefined();
  });

  test('a fully-specified line (reps + %RM + rest already stated) proposes nothing — day.filled stays absent', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [
          card({
            kind: 'workout',
            title: 'Fuerza',
            lines: [`5 rounds Back Squat c/2'30": 10/10/8/8/6 — 60/65/70/70/75% RM`],
          }),
        ],
      },
    ]);
    expect(wk.days[0]!.filled).toBeUndefined();
  });

  test('the no-cards (Excel/pegado) path NEVER fills defaults — same gap-prone line, day.filled stays absent', async () => {
    // Same exact line as the first test above, which DOES get filled on the
    // cards path — proving the photo-only scoping, not just an absence of gaps.
    const wk = await proposalFor([
      {
        day_of_week: 2,
        dow: 'Martes',
        stimulus: 'Fuerza',
        session_text: 'Deadlift 5r 10/10/8/6/4',
      },
    ]);
    expect(wk.days[0]!.filled).toBeUndefined();
  });
});

describe('buildImportProposal — cards: bare movement names (confidence "incomplete")', () => {
  test('a dose-less line that reads as a movement name types incomplete on the cards path (name known, dose not)', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [card({ kind: 'workout', title: 'MOVILIDAD GENERAL', lines: ['Cat Cow', 'Bird Dog'] })],
      },
    ]);
    const day = wk.days[0]!;
    const items = day.sessions[0]!.blocks[0]!.items;
    expect(items.map((it) => it.exercise_name)).toEqual(['Cat Cow', 'Bird Dog']);
    expect(day.flags.every((f) => f.confidence === 'incomplete')).toBe(true);
    expect(day.flags.every((f) => f.review_reasons.length > 0)).toBe(true); // "needs sets/reps"
    expect(day.state).toBe('review'); // incomplete blocks green same as review
  });

  test('the SAME dose-less names on the no-cards path are dropped as noise, exactly like before (bareNamesAreExercises is OFF there)', async () => {
    const wk = await proposalFor([
      { day_of_week: 1, dow: 'Lunes', stimulus: 'Movilidad', session_text: 'Cat Cow\nBird Dog' },
    ]);
    const day = wk.days[0]!;
    // No dose anywhere → the block ends up with zero items, exactly the
    // pre-existing Excel/pegado behavior (a dose-less line there IS a header).
    expect(day.sessions[0]!.blocks[0]!.items).toEqual([]);
  });

  test('a card whose TITLE is itself a bare-name-shaped string ("Running" — real fixture title) never fabricates a fake exercise', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [card({ kind: 'workout', title: 'Running', lines: ["30' Z2"] })],
      },
    ]);
    const day = wk.days[0]!;
    const items = day.sessions[0]!.blocks[0]!.items;
    // Exactly the ONE real work line — no second item fabricated from the title.
    expect(items).toHaveLength(1);
    expect(items.every((it) => it.exercise_name !== 'Running')).toBe(true);
    expect(day.sessions[0]!.blocks[0]!.title).toBe('Running'); // the block title is still correct
  });
});

describe('buildImportProposal — cards: orphan block-level dose redistribution', () => {
  test('team-lead\'s exact card — COMPENSATORIO GLÚTEO: 1 block, 3 exercises, all 4×12-15 @ 60s rest, zero "P" exercises', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [
          card({
            kind: 'workout',
            title: 'COMPENSATORIO GLÚTEO',
            lines: [
              '1) Puente de glúteo',
              '2) Marcha desde puente de glúteo',
              '3) Isometría en puente de glúteo',
              'P: Realiza 4 series de entre 12-15 repeticiones por ejercicio con 1 minuto de descanso entre series.',
            ],
          }),
        ],
      },
    ]);
    const day = wk.days[0]!;
    expect(day.sessions[0]!.blocks).toHaveLength(1);
    const items = day.sessions[0]!.blocks[0]!.items;
    expect(items).toHaveLength(3); // the orphan "P" line is gone, not a 4th item
    expect(items.map((it) => it.exercise_name)).toEqual([
      'Puente de glúteo',
      'Marcha desde puente de glúteo',
      'Isometría en puente de glúteo',
    ]);
    expect(items.some((it) => it.exercise_name === 'P')).toBe(false);
    for (const it of items) {
      expect(it.prescription.scheme).toBe('sets');
      expect(it.prescription.sets).toHaveLength(4);
      for (const s of it.prescription.sets!) {
        expect(s.measure).toEqual({ kind: 'reps', value: 12, max: 15 });
        expect(s.rest_s).toBe(60);
      }
    }
    // All three are now fully typed — 'detected', not 'incomplete'/'review'.
    const flags = day.flags.filter((f) => items.some((it) => it.uid === f.uid));
    expect(flags.every((f) => f.confidence === 'detected')).toBe(true);
    expect(flags.every((f) => f.review_reasons.length === 0)).toBe(true);
    // The orphan's own phrasing survives too — as the block's coach_note, not
    // silently gone once its dose is redistributed.
    expect(day.sessions[0]!.blocks[0]!.coach_note).toBe(
      'P: Realiza 4 series de entre 12-15 repeticiones por ejercicio con 1 minuto de descanso entre series.',
    );
  });

  test('TWO orphan dose candidates → ambiguous, nothing redistributed, both stay as the grammar produced them', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [
          card({
            kind: 'workout',
            title: 'AMBIGUO',
            lines: [
              '1) Puente de glúteo',
              'P: Realiza 4 series de entre 12-15 repeticiones por ejercicio con 1 minuto de descanso entre series.',
              'Q: Realiza 3 series de entre 8-10 repeticiones por ejercicio con 90 segundos de descanso entre series.',
            ],
          }),
        ],
      },
    ]);
    const day = wk.days[0]!;
    const items = day.sessions[0]!.blocks[0]!.items;
    // The bare name stays incomplete — no dose to safely pick.
    const puente = items.find((it) => it.exercise_name === 'Puente de glúteo')!;
    expect(puente.prescription.sets).toBeUndefined();
    const puenteFlag = day.flags.find((f) => f.uid === puente.uid)!;
    expect(puenteFlag.confidence).toBe('incomplete');
    // Both orphan lines survive too (as their own review items, empty token).
    expect(items.filter((it) => it.exercise_name === '')).toHaveLength(2);
  });

  test('zero incomplete lines → an orphan-shaped review line is left exactly as the grammar produced it (nothing to redistribute to)', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [
          card({
            kind: 'workout',
            title: 'Fuerza',
            lines: [
              'P: Realiza 4 series de entre 12-15 repeticiones por ejercicio con 1 minuto de descanso entre series.',
            ],
          }),
        ],
      },
    ]);
    const day = wk.days[0]!;
    const items = day.sessions[0]!.blocks[0]!.items;
    expect(items).toHaveLength(1);
    expect(items[0]!.exercise_name).toBe('');
    expect(day.flags[0]!.confidence).toBe('review');
  });
});

describe('buildImportProposal — cards: lost prose lands in block.coach_note, not nowhere', () => {
  test('real fixture card ("Bici Libre Z2") keeps its prose aside as coach_note alongside the real work the title itself types', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [
          card({
            kind: 'workout',
            title: 'Bici Libre Z2',
            lines: ['Hora y media de rodar libre soltando piernas, tranquilo.'],
          }),
        ],
      },
    ]);
    const day = wk.days[0]!;
    const block = day.sessions[0]!.blocks[0]!;
    // The title "Bici Libre Z2" is ITSELF a compact prescription (bike, Z2) —
    // it types as a real item, same as before this change (untouched here).
    expect(block.items).toHaveLength(1);
    expect(block.items[0]!.prescription).toMatchObject({ scheme: 'steady', modality: 'bike' });
    // What is NEW: the descriptive line under it no longer vanishes.
    expect(block.coach_note).toBe('Hora y media de rodar libre soltando piernas, tranquilo.');
  });

  test('counters ("16 Sets 8 Exercises") and metadata markers ("Video ...", "Notas...") are NOT captured as notes — they say nothing', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [
          card({
            kind: 'workout',
            title: 'Fuerza',
            lines: [
              'Deadlift 5r 10/10/8/6/4',
              '16 Sets 8 Exercises',
              '0/10 Sets 0/5 Exercises',
              'Video ...',
              'Notas...',
            ],
          }),
        ],
      },
    ]);
    const day = wk.days[0]!;
    expect(day.sessions[0]!.blocks[0]!.coach_note).toBeUndefined();
  });

  test('a short bare fragment (< 3 words) is not captured — too little to be a real note', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [card({ kind: 'workout', title: 'Fuerza', lines: ['Deadlift 5r 10/10/8/6/4', 'listo ya'] })],
      },
    ]);
    // "listo ya" is 2 words — below the 3-word floor.
    expect(wk.days[0]!.sessions[0]!.blocks[0]!.coach_note).toBeUndefined();
  });

  test('a genuine coach aside alongside real work IS captured, without swallowing the real exercise', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: null,
        session_text: null,
        cards: [
          card({
            kind: 'workout',
            title: 'Fuerza',
            lines: ['Deadlift 5r 10/10/8/6/4', 'Recuerda hidratar bien entre series hoy'],
          }),
        ],
      },
    ]);
    const day = wk.days[0]!;
    const block = day.sessions[0]!.blocks[0]!;
    expect(block.items).toHaveLength(1);
    expect(block.items[0]!.exercise_name).toBe('Deadlift');
    expect(block.coach_note).toBe('Recuerda hidratar bien entre series hoy');
  });

  test('the no-cards (Excel/pegado) path never sets coach_note — same prose, no cards structure', async () => {
    const wk = await proposalFor([
      {
        day_of_week: 1,
        dow: 'Lunes',
        stimulus: 'Rodaje',
        session_text: 'Hora y media de rodar libre soltando piernas, tranquilo.',
      },
    ]);
    expect(wk.days[0]!.sessions[0]!.blocks[0]!.coach_note).toBeUndefined();
  });
});
