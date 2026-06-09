/**
 * Unit tests for the PURE block parser (infra/scripts/parse_blocks_lib.ts) — the
 * verbatim → structured layer of the Biblioteca de Bloques (0038). No DB.
 *
 * Locks in the honesty contract: clean prescriptions map to real catalog slugs
 * + canonical params; dense multi-station WODs/sims fall to needs_review with
 * NO fabricated structure.
 */
import { describe, expect, test } from 'vitest';
import {
  parseBlock,
  EXERCISES_TO_CREATE,
  type ParsedBlock,
} from '../../../infra/scripts/parse_blocks_lib';

// methodology_group ids (see 0030 / import_blocks_xlsx GROUP_HINTS).
const G_STRENGTH = 1;
const G_PLYO = 2;
const G_ERG = 3;
const G_RUN = 4;
const G_ZONE = 5;
const G_METCON = 6;
const G_RACESIM = 7;

function first(b: ParsedBlock) {
  return b.exercises[0]!;
}

describe('parseBlock — single strength exercise with %1RM range', () => {
  test('Front squat 5 rounds 10/10/8/8/6 al 65-80%', () => {
    const b = parseBlock(G_STRENGTH, 'Front squat 5 rounds 10/10/8/8/6 al 65-80%');
    expect(b.needs_review).toBe(false);
    expect(b.exercises).toHaveLength(1);
    const ex = first(b);
    expect(ex.slug).toBe('front-squat');
    expect(ex.params).toMatchObject({ sets: 5, reps: 10, load_pct: 65, load_pct_range: '65-80' });
    // per-set scheme preserved verbatim (params.reps holds only the summary).
    expect(ex.reps_scheme).toBe('10/10/8/8/6');
  });
});

describe('parseBlock — multi-exercise chain', () => {
  test('Deadlift + Hip thrust → two exercises, distinct sub-blocks', () => {
    const b = parseBlock(G_STRENGTH, 'Deadlift 5r 10/10/8/6/4 + Hip thrust 5r 10/10/8/8/6');
    expect(b.needs_review).toBe(false);
    expect(b.exercises.map((e) => e.slug)).toEqual(['deadlift', 'hip-thrust']);
    expect(b.exercises.map((e) => e.block_position)).toEqual([0, 1]);
    expect(b.exercises[0]!.params).toMatchObject({ sets: 5, reps: 10 });
    expect(b.exercises[0]!.reps_scheme).toBe('10/10/8/6/4');
  });
});

describe('parseBlock — erg interval', () => {
  test('ROW 5x3\' RPE8 – 45\'\' rest → rounds/duration/rest/rpe', () => {
    const b = parseBlock(G_ERG, "ROW: 5' WU → 5x3' RPE8 – 45'' rest");
    expect(b.needs_review).toBe(false);
    const ex = first(b);
    expect(ex.slug).toBe('row');
    expect(ex.params).toMatchObject({ rounds: 5, duration_seconds: 180, rest_seconds: 45, rpe: 8 });
  });
});

describe('parseBlock — zone-2 run', () => {
  test('Run 1h15\' zona 2 → run with duration + hr_zone', () => {
    const b = parseBlock(G_ZONE, 'Run 1h15\' zona 2');
    expect(b.needs_review).toBe(false);
    const ex = first(b);
    expect(ex.slug).toBe('run');
    expect(ex.params).toMatchObject({ duration_seconds: 4500, hr_zone: 2 });
  });
});

describe('parseBlock — run interval', () => {
  test('Treadmill threshold 5x6\' RPE8 – 2\' rest', () => {
    const b = parseBlock(G_RUN, "Treadmill Threshold: 5' WU → 5x6' RPE8 – 2' estático rest");
    expect(b.needs_review).toBe(false);
    const ex = first(b);
    expect(ex.slug).toBe('run');
    expect(ex.params).toMatchObject({ rounds: 5, duration_seconds: 360, rpe: 8 });
  });
});

describe('parseBlock — created-exercise mapping (plyometric)', () => {
  test('jump back squat maps to the created jump-squat slug', () => {
    const b = parseBlock(G_PLYO, '5r Jump back squat 60% – 6 reps – 2\' rest');
    expect(b.exercises.some((e) => e.slug === 'jump-squat')).toBe(true);
    // the created slug is one we provision in EXERCISES_TO_CREATE
    expect(EXERCISES_TO_CREATE.map((e) => e.slug)).toContain('jump-squat');
  });
});

describe('parseBlock — dense WOD/sim → needs_review, no fabricated structure', () => {
  test('multi-station WOD is flagged, no exercises invented', () => {
    const b = parseBlock(
      G_METCON,
      'WOD 5r: 24 wall balls + 20m SB lunge + 14cal skierg + 8 devil press – TC55\'',
    );
    expect(b.needs_review).toBe(true);
    expect(b.exercises).toHaveLength(0);
  });

  test('HYROX full simulation is flagged, not decomposed', () => {
    const b = parseBlock(G_RACESIM, 'HYROX SIMULATION completo');
    expect(b.needs_review).toBe(true);
    expect(b.exercises).toHaveLength(0);
  });
});
