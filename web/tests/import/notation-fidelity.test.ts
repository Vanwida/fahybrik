// Fidelity suite for the grammar-first importer — one describe-block per FAILURE
// CLASS found by sweeping the FULL canonical 12-week xlsx (docs/Plantilla_HYROX_
// 12sem (1) 2.xlsx, 22 sheets, 325 lines). Every string below is VERBATIM from
// that sweep. The sacred contract under test: the grammar types ONLY what it can
// prove and NEVER emits a number that is not in the text — a line it cannot type
// FAITHFULLY (all its bouts, all its movements) falls to `review` whole, verbatim.
//
// Classes:
//   1  '' (double-prime) seconds parsed ×60 as minutes
//   2  "RPE 3-4" swallowed as a strength rep sequence
//   3  distance ladders silently dropping legs
//   4  multi-bout "+" chains fused into one bout of the first modality
//   5  rounds-header strength combos losing reps + the 2nd movement
//   6  parenthesized intervals collapsing to a steady bout
//   7  optimistic typing of loaded metcon lines
//   8  exercise token extraction (dose-first lines, truncated titles, headers)
//   9  trivial housekeeping falling to review (warm-ups, cool-downs, mobility)

import { describe, expect, test } from 'vitest';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';
import { readGroupLabel } from '@fahybrid/shared/domain/import/label';
import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';

describe('class 1 — double-prime seconds are SECONDS, never ×60', () => {
  test(`6x30'' strides → 30s work, not 1800`, () => {
    const [l, ...rest] = parseNotationCell(`6x30'' strides`);
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.scheme).toBe('intervals');
    expect(l!.prescription.rounds).toBe(6);
    expect(l!.prescription.work_s).toBe(30);
    expect(l!.prescription.modality).toBe('run');
  });

  test(`6x20'' strides / 30'' rest → 20s work + 30s rest`, () => {
    const [l] = parseNotationCell(`6x20'' strides / 30'' rest`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.work_s).toBe(20);
    expect(l!.prescription.rest_s).toBe(30);
  });

  test(`90'' float rest clause → 90s, not 5400`, () => {
    const [l] = parseNotationCell(`4x2' Z4 / 90'' float`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.work_s).toBe(120);
    expect(l!.prescription.rest_s).toBe(90);
  });
});

describe('class 2 — a number after RPE/RIR/Z is never a rep sequence', () => {
  test(`5' RPE 3-4 + 1' rest → ONE steady bout, rpe RANGE target, rest 60`, () => {
    const lines = parseNotationCell(`5' RPE 3-4 + 1' rest`);
    expect(lines).toHaveLength(1);
    const [l] = lines;
    expect(l!.confidence).toBe('detected');
    expect(['steady', 'warmup']).toContain(l!.prescription.scheme);
    expect(l!.prescription.total_s).toBe(300);
    expect(l!.prescription.target).toEqual({ kind: 'rpe', min: 3, max: 4 });
    expect(l!.prescription.rest_s).toBe(60);
    // The old bug: strength sets with reps 3 and 4 fabricated from the RPE range.
    expect(l!.prescription.scheme).not.toBe('sets');
    expect(l!.prescription.sets ?? []).toHaveLength(0);
  });
});

describe('class 3 — distance ladders: ALL legs or honest review', () => {
  const LADDER = `2x1200 (1'45'') / 1x1000 / 2x800 / 2x400`;

  test('annotated ladder the grammar cannot fully assign → whole line review', () => {
    const lines = parseNotationCell(LADDER);
    expect(lines).toHaveLength(1);
    const [l] = lines;
    expect(l!.confidence).toBe('review');
    expect(l!.prescription.note).toContain('1x1000'); // nothing silently dropped
    expect(l!.prescription.note).toContain('2x400');
    // No partial typing: never "just the first leg".
    expect(l!.prescription.rounds).toBeUndefined();
    expect(l!.prescription.sets).toBeUndefined();
  });

  test('clean ladder types EVERY leg as a distance interval set', () => {
    const [l, ...rest] = parseNotationCell(`2x1200 / 1x1000 / 2x800 / 2x400`);
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.scheme).toBe('intervals');
    expect(l!.prescription.rounds).toBe(7);
    expect(l!.prescription.sets!.map((s) => s.measure)).toEqual(
      [1200, 1200, 1000, 800, 800, 400, 400].map((meters) => ({ kind: 'distance', meters })),
    );
  });

  test('recovery-column ladder (EVERY leg annotated) types legs + per-set rest', () => {
    // Real corpus: the first leg labels the column "rest"; the rest are clocks.
    const [l, ...rest] = parseNotationCell(
      `2x1200 (1'45'' rest) / 1x1000 (1'30'') / 2x800 (1') / 2x400 (45'')`,
    );
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.rounds).toBe(7);
    expect(l!.prescription.sets!.map((s) => s.measure)).toEqual(
      [1200, 1200, 1000, 800, 800, 400, 400].map((meters) => ({ kind: 'distance', meters })),
    );
    expect(l!.prescription.sets!.map((s) => s.rest_s)).toEqual([105, 105, 90, 60, 60, 45, 45]);

    const [l2] = parseNotationCell(`3x1000 (1'30'') / 2x800 (1'15'') / 4x400 (45'')`);
    expect(l2!.confidence).toBe('detected');
    expect(l2!.prescription.sets!.map((s) => s.rest_s)).toEqual([90, 90, 90, 75, 75, 45, 45, 45, 45]);
  });
});

describe('class 4 — multi-bout "+" chains: one item per bout, NEVER fused', () => {
  test(`10' row + 10' ski + 10' AB + 10' run Z2 → four bouts, four modalities`, () => {
    const lines = parseNotationCell(`10' row + 10' ski + 10' AB + 10' run Z2`);
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.confidence === 'detected')).toBe(true);
    expect(lines.map((l) => l.prescription.modality)).toEqual(['row', 'ski', 'bike', 'run']);
    for (const l of lines) expect(l.prescription.total_s).toBe(600);
    expect(lines[3]!.prescription.target).toEqual({ kind: 'hr_zone', value: 2 });
  });

  test(`10' row + 10' ski + 10' AB + 10' run, todo Z2 → "todo" distributes the target`, () => {
    // The REAL corpus variant: the comma used to trip the multi-station
    // detector and the whole line fell to review.
    const lines = parseNotationCell(`10' row + 10' ski + 10' AB + 10' run, todo Z2`);
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.confidence === 'detected')).toBe(true);
    expect(lines.map((l) => l.prescription.modality)).toEqual(['row', 'ski', 'bike', 'run']);
    for (const l of lines) {
      expect(l.prescription.total_s).toBe(600);
      expect(l.prescription.target).toEqual({ kind: 'hr_zone', value: 2 });
    }
  });

  test(`50' carrera + 25' row/ski → run bout + erg-choice bout (choice preserved)`, () => {
    const lines = parseNotationCell(`50' carrera + 25' row/ski`);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.prescription.modality).toBe('run');
    expect(lines[0]!.prescription.total_s).toBe(3000);
    expect(lines[1]!.prescription.total_s).toBe(1500);
    // "row/ski" is the athlete's choice — the grammar must not pick one.
    expect(lines[1]!.prescription.modality).toBeUndefined();
    expect(lines[1]!.exercise_token).toBe('row/ski');
  });
});

describe('class 5 — rounds-header strength combos keep reps AND both movements', () => {
  test(`5 rounds c/2': 3 Power Clean 70-80% + 5 high box jump`, () => {
    const lines = parseNotationCell(`5 rounds c/2': 3 Power Clean 70-80% + 5 high box jump`);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.confidence === 'detected')).toBe(true);

    const [pc, bj] = lines;
    expect(pc!.exercise_token).toBe('Power Clean');
    expect(pc!.prescription.scheme).toBe('sets');
    expect(pc!.prescription.sets).toHaveLength(5);
    expect(pc!.prescription.sets![0]).toEqual({
      measure: { kind: 'reps', value: 3 },
      target: { kind: 'percent_rm', min: 70, max: 80 },
      rest_s: 120,
    });

    expect(bj!.exercise_token).toBe('high box jump');
    expect(bj!.prescription.sets).toHaveLength(5);
    expect(bj!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 5 });
    expect(bj!.prescription.sets![0]!.target).toBeUndefined(); // no load given → none invented
    expect(bj!.prescription.sets![0]!.rest_s).toBe(120);
  });

  test(`4 rounds Pull-ups + Dips 10-10-8-8 → BOTH movements share the scheme`, () => {
    const lines = parseNotationCell(`4 rounds Pull-ups + Dips 10-10-8-8`);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.confidence === 'detected')).toBe(true);
    expect(lines.map((l) => l.exercise_token)).toEqual(['Pull-ups', 'Dips']);
    for (const l of lines) {
      expect(l.prescription.sets!.map((s) => s.measure)).toEqual(
        [10, 10, 8, 8].map((value) => ({ kind: 'reps', value })),
      );
      // No load in the text → none invented.
      expect(l.prescription.sets!.every((s) => s.target === undefined)).toBe(true);
    }
  });

  test(`3 rounds RDL 8/lado → 3 sets of 8, side qualifier kept verbatim`, () => {
    const [l, ...rest] = parseNotationCell(`3 rounds RDL 8/lado`);
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('detected');
    expect(l!.exercise_token).toBe('RDL');
    expect(l!.prescription.sets).toHaveLength(3);
    expect(l!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 8 });
    expect(l!.prescription.note).toBe('8/lado');
  });
});

describe('class 6 — parenthesized interval keeps rounds AND the recovery', () => {
  test(`5x(4' Z3-Z4 / 1' Z2) → intervals r5 w240 rest60, zone RANGE target`, () => {
    const [l, ...rest] = parseNotationCell(`5x(4' Z3-Z4 / 1' Z2)`);
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.scheme).toBe('intervals');
    expect(l!.prescription.rounds).toBe(5);
    expect(l!.prescription.work_s).toBe(240);
    expect(l!.prescription.rest_s).toBe(60);
    expect(l!.prescription.target).toEqual({ kind: 'hr_zone', min: 3, max: 4 });
    // The active-recovery quality has no typed field yet — kept verbatim in note.
    expect(l!.prescription.note).toContain(`1' Z2`);
  });
});

describe('class 7 — loaded metcon the grammar cannot represent → review, whole', () => {
  test(`2 rounds: 250m run + 40'' burpee DB 20kg → one review line, nothing typed`, () => {
    const lines = parseNotationCell(`2 rounds: 250m run + 40'' burpee DB 20kg`);
    expect(lines).toHaveLength(1);
    const [l] = lines;
    expect(l!.confidence).toBe('review');
    expect(l!.prescription.note).toContain('burpee DB 20kg'); // verbatim preserved
    expect(l!.prescription.sets).toBeUndefined(); // old bug: strength kg=20 fabricated
    expect(l!.prescription.target).toBeUndefined();
    expect(l!.prescription.total_s).toBeUndefined();
  });
});

describe('class 8 — exercise tokens: dose-first lines, titles, headers', () => {
  test(`15' easy run → token from AFTER the dose`, () => {
    const [l] = parseNotationCell(`15' easy run`);
    expect(l!.confidence).toBe('detected');
    expect(l!.exercise_token).toBe('easy run');
    expect(l!.prescription.scheme).toBe('steady');
    expect(l!.prescription.total_s).toBe(900);
    expect(l!.prescription.modality).toBe('run');
  });

  test(`45' carrera Z2 → token 'carrera', run, 2700s, zone 2`, () => {
    const [l] = parseNotationCell(`45' carrera Z2`);
    expect(l!.exercise_token).toBe('carrera');
    expect(l!.prescription.modality).toBe('run');
    expect(l!.prescription.total_s).toBe(2700);
    expect(l!.prescription.target).toEqual({ kind: 'hr_zone', value: 2 });
  });

  test(`50' Z2 RPE 3-4 → typed steady, zone target, RPE kept (no movement named)`, () => {
    const [l] = parseNotationCell(`50' Z2 RPE 3-4`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.total_s).toBe(3000);
    expect(l!.prescription.target).toEqual({ kind: 'hr_zone', value: 2 });
    expect(l!.prescription.note).toMatch(/RPE 3-4/i);
  });

  test(`1h25' Z2 RPE 3-4 → 5100s`, () => {
    const [l] = parseNotationCell(`1h25' Z2 RPE 3-4`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.total_s).toBe(5100);
  });

  test('all-caps zone headers are block titles, not exercises', () => {
    expect(parseNotationCell(`DÍA LARGO MIXTO Z2`)).toHaveLength(0);
    expect(parseNotationCell(`CARRERA LARGA Z2`)).toHaveLength(0);
    expect(parseNotationCell(`ERGÓMETROS Z2`)).toHaveLength(0);
    expect(parseNotationCell(`TEST`)).toHaveLength(0);
  });

  test('a title never leaks as a truncated token ("DÍA LARGO MIXTO Z")', () => {
    const lines = parseNotationCell(`DÍA LARGO MIXTO Z2\n10' row + 10' ski + 10' AB + 10' run Z2`);
    expect(lines.every((l) => !/D[ÍI]A LARGO/i.test(l.exercise_token))).toBe(true);
    expect(lines).toHaveLength(4);
  });

  test('block title supplies the modality its lines do not carry', () => {
    const lines = parseNotationCell(`CARRERA LARGA Z2\n1h25' Z2 RPE 3-4`);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.prescription.modality).toBe('run');
  });
});

describe('class 9 — housekeeping types instead of falling to review', () => {
  test(`2km warm up → warmup with a 2000m dose`, () => {
    const [l] = parseNotationCell(`2km warm up`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.scheme).toBe('warmup');
    expect(l!.prescription.sets![0]!.measure).toEqual({ kind: 'distance', meters: 2000 });
  });

  test(`1km cool down → cooldown 1000m`, () => {
    const [l] = parseNotationCell(`1km cool down`);
    expect(l!.prescription.scheme).toBe('cooldown');
    expect(l!.prescription.sets![0]!.measure).toEqual({ kind: 'distance', meters: 1000 });
  });

  test(`5' cool down → cooldown 300s`, () => {
    const [l] = parseNotationCell(`5' cool down`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.scheme).toBe('cooldown');
    expect(l!.prescription.total_s).toBe(300);
  });

  test(`10' warm up easy → warmup 600s`, () => {
    const [l] = parseNotationCell(`10' warm up easy`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.scheme).toBe('warmup');
    expect(l!.prescription.total_s).toBe(600);
  });

  test(`10' warm up RPE 5 / 10' cool down RPE 4 → typed with rpe target`, () => {
    const [wu] = parseNotationCell(`10' warm up RPE 5`);
    expect(wu!.prescription.scheme).toBe('warmup');
    expect(wu!.prescription.total_s).toBe(600);
    expect(wu!.prescription.target).toEqual({ kind: 'rpe', value: 5 });
    const [cd] = parseNotationCell(`10' cool down RPE 4`);
    expect(cd!.prescription.scheme).toBe('cooldown');
    expect(cd!.prescription.target).toEqual({ kind: 'rpe', value: 4 });
  });

  test(`10' caminando / 2' caminando → typed walking bouts, not rest`, () => {
    const [walk] = parseNotationCell(`10' caminando`);
    expect(walk!.confidence).toBe('detected');
    expect(walk!.prescription.total_s).toBe(600);
    expect(walk!.prescription.rest_s).toBeUndefined(); // the walk IS the bout
    const [w2] = parseNotationCell(`2' caminando`);
    expect(w2!.prescription.total_s).toBe(120);
  });

  test(`30' movilidad y foam / 10' movilidad cadera → mobility with duration`, () => {
    const [m1] = parseNotationCell(`30' movilidad y foam`);
    expect(m1!.confidence).toBe('detected');
    expect(m1!.prescription.modality).toBe('mobility');
    expect(m1!.prescription.total_s).toBe(1800);
    const [m2] = parseNotationCell(`10' movilidad cadera`);
    expect(m2!.prescription.modality).toBe('mobility');
    expect(m2!.prescription.total_s).toBe(600);
  });

  test(`10' movilidad + 5' técnica → TWO items`, () => {
    const lines = parseNotationCell(`10' movilidad + 5' técnica`);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.prescription.total_s).toBe(600);
    expect(lines[0]!.prescription.modality).toBe('mobility');
    expect(lines[1]!.prescription.total_s).toBe(300);
  });

  test(`— 3' RPE 10 (marcar lap) → steady 180s rpe 10, note verbatim`, () => {
    const [l] = parseNotationCell(`— 3' RPE 10 (marcar lap)`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.total_s).toBe(180);
    expect(l!.prescription.target).toEqual({ kind: 'rpe', value: 10 });
    expect(l!.prescription.note).toContain('marcar lap');
  });

  test(`— 30' RPE 10 (últimos 20' valen) → steady 1800s rpe 10, note kept`, () => {
    const [l] = parseNotationCell(`— 30' RPE 10 (últimos 20' valen)`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.total_s).toBe(1800);
    expect(l!.prescription.target).toEqual({ kind: 'rpe', value: 10 });
    expect(l!.prescription.note).toContain(`últimos 20' valen`);
  });

  test('a bare "RPE 3" line is a continuation of the previous line, not review', () => {
    const lines = parseNotationCell(`50' Z2\nRPE 3`);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.confidence).toBe('detected');
    expect(lines[0]!.prescription.total_s).toBe(3000);
    expect(lines[0]!.prescription.note).toMatch(/RPE 3/i);
  });

  test('legit dense WODs STILL fall to review — housekeeping rules must not eat them', () => {
    const lines = parseNotationCell(`AMRAP 12': 10 burpees + 10 cal row + 100m farmer carry`);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.confidence).toBe('review');
    expect(lines[0]!.prescription.scheme).toBe('amrap');
  });
});

describe('corpus audit — falsehoods found sweeping the full 22-sheet workbook', () => {
  test(`5-8' descanso completo → review (a rest directive, NEVER reps 5 and 8)`, () => {
    const [l] = parseNotationCell(`5-8' descanso completo`);
    expect(l!.confidence).toBe('review');
    expect(l!.prescription.sets).toBeUndefined();
    expect(l!.prescription.note).toContain('descanso completo');
  });

  test(`4-5 strides de 30'' → review (a rep RANGE with an unconsumed clock)`, () => {
    const [l] = parseNotationCell(`4-5 strides de 30''`);
    expect(l!.confidence).toBe('review');
    expect(l!.prescription.sets).toBeUndefined();
  });

  test(`50' Z2 (carrera + bike) → mixed bout: NO modality guessed, mix kept in note`, () => {
    const [l, ...rest] = parseNotationCell(`50' Z2 (carrera + bike)`);
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.total_s).toBe(3000);
    expect(l!.prescription.target).toEqual({ kind: 'hr_zone', value: 2 });
    expect(l!.prescription.modality).toBeUndefined(); // the old parser said "bike"
    expect(l!.prescription.note).toContain('carrera + bike');
  });

  test(`30-25-20-15 Power Clean 40kg → scheme-first line keeps its token`, () => {
    const [l] = parseNotationCell(`30-25-20-15 Power Clean 40kg`);
    expect(l!.confidence).toBe('detected');
    expect(l!.exercise_token).toBe('Power Clean');
    expect(l!.prescription.sets!.map((s) => s.measure)).toEqual(
      [30, 25, 20, 15].map((value) => ({ kind: 'reps', value })),
    );
    expect(l!.prescription.sets![0]!.target).toEqual({ kind: 'kg', value: 40 });
  });

  test(`3 rounds 3' max SB walking lunge 20kg → TIMED sets, duration not dropped`, () => {
    const [l] = parseNotationCell(`3 rounds 3' max SB walking lunge 20kg`);
    expect(l!.confidence).toBe('detected');
    expect(l!.exercise_token).toBe('SB walking lunge');
    expect(l!.prescription.sets).toHaveLength(3);
    expect(l!.prescription.sets![0]!.measure).toEqual({ kind: 'duration', seconds: 180 });
    expect(l!.prescription.sets![0]!.target).toEqual({ kind: 'kg', value: 20 });
  });
});

// ── Cross-class invariant: everything emitted still validates ────────────────

const ALL_CELLS = [
  `6x30'' strides`,
  `6x20'' strides / 30'' rest`,
  `5' RPE 3-4 + 1' rest`,
  `2x1200 (1'45'') / 1x1000 / 2x800 / 2x400`,
  `10' row + 10' ski + 10' AB + 10' run Z2`,
  `50' carrera + 25' row/ski`,
  `5 rounds c/2': 3 Power Clean 70-80% + 5 high box jump`,
  `5x(4' Z3-Z4 / 1' Z2)`,
  `2 rounds: 250m run + 40'' burpee DB 20kg`,
  `15' easy run`,
  `50' Z2 RPE 3-4`,
  `1h25' Z2 RPE 3-4`,
  `45' carrera Z2`,
  `2km warm up`,
  `1km cool down`,
  `5' cool down`,
  `10' warm up easy`,
  `10' warm up RPE 5`,
  `10' cool down RPE 4`,
  `10' caminando`,
  `30' movilidad y foam`,
  `10' movilidad + 5' técnica`,
  `— 3' RPE 10 (marcar lap)`,
];

describe('invariants across the fidelity corpus', () => {
  test('every emitted prescription validates; detected lines carry structure', () => {
    for (const cell of ALL_CELLS) {
      for (const line of parseNotationCell(cell)) {
        const res = safeParsePrescription(line.prescription);
        expect(res.success, `invalid: ${cell} → ${JSON.stringify(line.prescription)}`).toBe(true);
        if (line.confidence === 'review') {
          expect(line.prescription.note && line.prescription.note.length > 0).toBe(true);
        }
      }
    }
  });

  test('no emitted duration is a ×60 artifact of a double-prime', () => {
    // Every '' clock in the corpus is < 120s; a work/rest ≥ 20 minutes on these
    // short lines can only come from the ×60 bug.
    for (const cell of [`6x30'' strides`, `6x20'' strides / 30'' rest`, `4x2' Z4 / 90'' float`]) {
      for (const line of parseNotationCell(cell)) {
        expect(line.prescription.work_s ?? 0).toBeLessThan(1200);
        expect(line.prescription.rest_s ?? 0).toBeLessThan(1200);
      }
    }
  });
});

// ── class 10 — notation the grammar used to get WRONG, not just miss ──────────
// These are regressions, not gaps: every case below used to emit `detected`
// (or vanish) with a silently corrupted result, so nothing in the review screen
// told the coach to look. Sources: a real TrainingPeaks week (calendar view) and
// the group-label notation any coach writes.

describe('class 10 — order labels never become the exercise', () => {
  test('"B:" / "C:" no longer replace the movement name', () => {
    // "A:" escaped by accident (the lone "a" is a Spanish connector that got
    // deleted); every other letter typed an exercise CALLED "B" / "C".
    for (const [cell, name] of [
      ['A: Back Squat 5x5', 'Back Squat'],
      ['B: Deadlift 5x5', 'Deadlift'],
      ['C: Bench Press 5x5', 'Bench Press'],
    ] as const) {
      const [line] = parseNotationCell(cell);
      expect(line!.confidence).toBe('detected');
      expect(line!.exercise_token).toBe(name);
    }
  });

  test('paren and list ordinals are stripped too', () => {
    for (const [cell, name] of [
      ['A) Press Banca 4x4', 'Press Banca'],
      ['A1) Cat Cow 2x10', 'Cat Cow'],
      ['1) Puente de glúteo 3x12', 'Puente de glúteo'],
    ] as const) {
      const [line] = parseNotationCell(cell);
      expect(line!.exercise_token).toBe(name);
    }
  });
});

describe('class 10 — a counter word is not a movement', () => {
  test('"3-4 RONDAS" reviews instead of typing 2 sets of an exercise named RONDAS', () => {
    const [line] = parseNotationCell('3-4 RONDAS');
    expect(line!.confidence).toBe('review');
    expect(line!.prescription.note).toBe('3-4 RONDAS');
  });

  test('"12-15 repeticiones" reviews instead of typing sets of 12 and 15', () => {
    // A rep RANGE is one prescription, not two discrete sets — and the model has
    // no range on `measure` yet, so review is the honest answer.
    const [line] = parseNotationCell('12-15 repeticiones');
    expect(line!.confidence).toBe('review');
  });
});

describe('class 10 — typographic and bilingual coverage', () => {
  test('the × multiplication sign types exactly like an ascii x', () => {
    const [uni] = parseNotationCell('10 × 400m');
    const [ascii] = parseNotationCell('10 x 400m');
    expect(uni!.confidence).toBe('detected');
    expect(uni!.prescription).toEqual(ascii!.prescription);
  });

  test('"Bici" reads as bike, like "carrera" reads as run', () => {
    const [line] = parseNotationCell("45' Bici Libre Z2");
    expect(line!.prescription.modality).toBe('bike');
  });
});

describe('class 10 — RIR is an intensity, not noise', () => {
  test('"RIR 2" types as a rir target on every set', () => {
    // It was only ever STRIPPED (so a rep reader could not eat it) and never
    // read, so every "4x4 | RIR 2" lost its intensity silently.
    const [line] = parseNotationCell('Back Squat 4x4 | RIR 2');
    expect(line!.confidence).toBe('detected');
    expect(line!.exercise_token).toBe('Back Squat');
    expect(line!.prescription.sets).toHaveLength(4);
    for (const s of line!.prescription.sets!) {
      expect(s.target).toEqual({ kind: 'rir', value: 2 });
    }
  });

  test('an explicit %RM still wins the primary slot over RIR', () => {
    const [line] = parseNotationCell('Press Banca 4x4 78-80% RIR 2');
    expect(line!.prescription.sets![0]!.target).toEqual({
      kind: 'percent_rm',
      min: 78,
      max: 80,
    });
  });

  test('RPE keeps working unchanged', () => {
    const [line] = parseNotationCell('Dominada 3x8 RPE 8');
    expect(line!.prescription.sets![0]!.target).toEqual({ kind: 'rpe', value: 8 });
  });
});

// ── class 11 — TrainingPeaks capture vocabulary (colon clocks, word units,
// rep RANGES, rest lines that used to vanish, "+"-chained rep counts) ─────────
// Source: a real TrainingPeaks week (calendar screenshot text) and Pablo's own
// group-label notation. Every case is a NEW grammar surface, not a bugfix to
// an existing one — see shared/domain/import/dose.ts, strength.ts, label.ts.

describe('class 11 — a rep RANGE is a BAND, never two flattened sets', () => {
  test('"Sentadilla 4x12-15" → 4 sets, each a reps band 12-15, not 12 then 15', () => {
    const [line, ...rest] = parseNotationCell('Sentadilla 4x12-15');
    expect(rest).toHaveLength(0);
    expect(line!.confidence).toBe('detected');
    expect(line!.exercise_token).toBe('Sentadilla');
    expect(line!.prescription.sets).toHaveLength(4);
    for (const s of line!.prescription.sets!) {
      expect(s.measure).toEqual({ kind: 'reps', value: 12, max: 15 });
    }
  });

  test('"Sentadilla 4 series de 12-15 repeticiones" → the same band, spelled out', () => {
    const [line] = parseNotationCell('Sentadilla 4 series de 12-15 repeticiones');
    expect(line!.confidence).toBe('detected');
    expect(line!.exercise_token).toBe('Sentadilla');
    expect(line!.prescription.sets).toHaveLength(4);
    expect(line!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 12, max: 15 });
  });

  test('"10/10/8/8/6" stays an exact per-set SEQUENCE, never a range', () => {
    // The disambiguator: a range needs an ASCENDING dash pair beside a reps
    // word or an "Nx" multiplier — a slash-joined list is never a range.
    const [line] = parseNotationCell('Sentadilla 10/10/8/8/6');
    expect(line!.prescription.sets!.map((s) => s.measure)).toEqual(
      [10, 10, 8, 8, 6].map((value) => ({ kind: 'reps', value })),
    );
    expect(
      line!.prescription.sets!.every((s) => {
        const m = s.measure;
        // `reps_to_failure` carries no `max` field at all (see types.ts) —
        // absent is the same "no range fabricated" answer this asserts for
        // every other kind, so it counts as passing too.
        return !m || m.kind === 'reps_to_failure' || m.max === undefined;
      }),
    ).toBe(true);
  });

  test('"12-15 repeticiones" alone still reviews — no exercise, no multiplier to repeat the band over', () => {
    const [line] = parseNotationCell('12-15 repeticiones');
    expect(line!.confidence).toBe('review');
    expect(line!.prescription.sets).toBeUndefined();
  });

  test('"4 series de 12-15 repeticiones" alone (no exercise) reviews too, not "series repeticiones"', () => {
    // A generalization of the counter-word guard: EVERY word in the token is a
    // counter, not just a single bare word — the range grammar makes this
    // multi-word debris reachable where before only single words were.
    const [line] = parseNotationCell('4 series de 12-15 repeticiones');
    expect(line!.confidence).toBe('review');
    expect(line!.prescription.note).toBe('4 series de 12-15 repeticiones');
  });

  test('"3-4 RONDAS" is still a review, not a fabricated rounds range', () => {
    const [line] = parseNotationCell('3-4 RONDAS');
    expect(line!.confidence).toBe('review');
  });
});

describe('class 11 — clock vocabulary: words and colons, not just the prime', () => {
  test('word seconds/minutes/hours read as durations, with a clean token', () => {
    const [min] = parseNotationCell('Carrera 2 min Z2');
    expect(min!.exercise_token).toBe('Carrera');
    expect(min!.prescription.total_s).toBe(120);
    const [minutos] = parseNotationCell('Carrera 2 minutos Z2');
    expect(minutos!.prescription.total_s).toBe(120);
    const [hora] = parseNotationCell('Carrera 1 hora Z2');
    expect(hora!.exercise_token).toBe('Carrera');
    expect(hora!.prescription.total_s).toBe(3600);
  });

  test('a 3-part colon clock reads as h:mm:ss, a 2-part one as m:ss', () => {
    const [hms] = parseNotationCell(`Carrera 1:20:00 Z2`);
    expect(hms!.prescription.total_s).toBe(4800);
    const [ms] = parseNotationCell(`10' movilidad\nRest 1:30`);
    expect(ms!.prescription.rest_s).toBe(90); // never 5400 (misread as h:mm)
  });

  test('pace with a colon clock and unit types the SAME target as the prime form', () => {
    const [colon] = parseNotationCell(`Carrera 5' @ 3:45 min/km`);
    const [prime] = parseNotationCell(`Carrera 5' @ 3'45/km`);
    expect(colon!.prescription.target).toEqual({ kind: 'pace', unit: 'per_km', value_s: 225 });
    expect(colon!.prescription.target).toEqual(prime!.prescription.target);
  });

  test('"1:54 /500m" reads as 114 s/500m pace', () => {
    const [l] = parseNotationCell(`Row 5' @ 1:54 /500m`);
    expect(l!.prescription.target).toEqual({ kind: 'pace', unit: 'per_500m', value_s: 114 });
  });

  test('"4x8" is still 4 sets of 8 reps — the new vocabulary never reads it as a clock', () => {
    const [l] = parseNotationCell('Sentadilla 4x8');
    expect(l!.prescription.sets!.map((s) => s.measure)).toEqual(
      [8, 8, 8, 8].map((value) => ({ kind: 'reps', value })),
    );
  });

  test('a word/colon clock still attached to an unconsumed "Nx" reviews rather than fabricating', () => {
    // "6x90 seg" is a 6-round × 90-second interval; the grammar has no
    // word-interval reader yet, so reading just "90 seg" as a bare duration
    // would silently drop the "6x" repeat count. Honesty: review, not a
    // fabricated single 90s bout (and NOT "6 sets of 90 reps" either).
    const [l] = parseNotationCell('6x90 seg strides');
    expect(l!.confidence).toBe('review');
    expect(l!.prescription.sets).toBeUndefined();
    expect(l!.prescription.total_s).toBeUndefined();
  });
});

describe('class 11 — "Descanso 1:30" attaches to the line above, never vanishes', () => {
  test('a standalone rest-with-clock line merges onto the previous line as rest_s', () => {
    const lines = parseNotationCell(`45' carrera Z2\nDescanso 1:30`);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.confidence).toBe('detected');
    expect(lines[0]!.prescription.total_s).toBe(2700);
    expect(lines[0]!.prescription.rest_s).toBe(90);
  });

  test('word-clock and reversed-order rest lines merge the same way', () => {
    const [seg] = parseNotationCell(`10' movilidad\nRest 90 seg`);
    expect(seg!.prescription.rest_s).toBe(90);
    const [rev] = parseNotationCell(`10' movilidad\n1:30 descanso`);
    expect(rev!.prescription.rest_s).toBe(90);
  });

  test('an ORPHANED rest line (nothing above to attach to) reviews — never the void', () => {
    const lines = parseNotationCell(`Descanso 1:30`);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.confidence).toBe('review');
    expect(lines[0]!.prescription.note).toBe('Descanso 1:30');
  });

  test('a bare rest DAY ("Descanso" / "off") is still noise — zero lines, as before', () => {
    expect(parseNotationCell(`Descanso`)).toHaveLength(0);
    expect(parseNotationCell(`Rest day`)).toHaveLength(0);
    expect(parseNotationCell(`off`)).toHaveLength(0);
  });
});

describe('class 11 — "+"-chained bare rep counts read as separate sets', () => {
  test('"10+10 Step Ups Cajón" → 2 sets of 10 reps, "+" as a separator not a sum', () => {
    const [line, ...rest] = parseNotationCell('10+10 Step Ups Cajón');
    expect(rest).toHaveLength(0);
    expect(line!.confidence).toBe('detected');
    expect(line!.exercise_token).toBe('Step Ups Cajón');
    // Exactly 2 sets of 10 — never "20 reps" (a fabricated sum) and never a
    // "max" (a fabricated range): each addend is its own set, nothing more.
    expect(line!.prescription.sets!.map((s) => s.measure)).toEqual([
      { kind: 'reps', value: 10 },
      { kind: 'reps', value: 10 },
    ]);
  });

  test('a three-way chain "8+8+8 Curl" also reads as three sets', () => {
    const [line] = parseNotationCell('8+8+8 Curl');
    expect(line!.confidence).toBe('detected');
    expect(line!.exercise_token).toBe('Curl');
    expect(line!.prescription.sets!.map((s) => s.measure)).toEqual([
      { kind: 'reps', value: 8 },
      { kind: 'reps', value: 8 },
      { kind: 'reps', value: 8 },
    ]);
  });

  test('a real multi-bout chain is UNCHANGED — bare rep counts never shadow it', () => {
    const lines = parseNotationCell(`10' row + 10' ski + 10' AB + 10' run Z2`);
    expect(lines).toHaveLength(4);
  });
});

// ── Cross-class invariant, extended with the class 11 corpus ────────────────

describe('invariants across the class 11 corpus', () => {
  const CLASS_11_CELLS = [
    'Sentadilla 4x12-15',
    'Sentadilla 4 series de 12-15 repeticiones',
    'Carrera 2 min Z2',
    'Carrera 1 hora Z2',
    `Carrera 5' @ 3:45 min/km`,
    `Row 5' @ 1:54 /500m`,
    `45' carrera Z2\nDescanso 1:30`,
    '10+10 Step Ups Cajón',
  ];

  test('every emitted prescription validates', () => {
    for (const cell of CLASS_11_CELLS) {
      for (const line of parseNotationCell(cell)) {
        const res = safeParsePrescription(line.prescription);
        expect(res.success, `invalid: ${cell} → ${JSON.stringify(line.prescription)}`).toBe(true);
      }
    }
  });
});

// ── class 12 — the group/order marker is READ, not just stripped ────────────
// docs/DECISIONS.md, 2026-08-05 "La superserie es un FORMATO de bloque": a
// block builder needs to know WHICH lines share a letter (and whether they
// carry an index, meaning "rotate") to draw block boundaries — "A1/A2/A3" is
// one superset block, "A", "B", "C" are three straight-set blocks. The letter
// is import-time-only signal (readGroupLabel), never persisted downstream.

describe('class 12 — readGroupLabel reads exactly what stripGroupLabel removes', () => {
  test('a bare letter ("A:", "A)", "B:", "C:") has no index', () => {
    for (const [cell, letter] of [
      ['A: Back Squat 5x5', 'A'],
      ['B: Deadlift 5x5', 'B'],
      ['C: Bench Press 5x5', 'C'],
      ['A) Press Banca 4x4', 'A'],
    ] as const) {
      expect(readGroupLabel(cell)).toEqual({ letter });
    }
  });

  test('a letter+index ("A1)", "A2)") carries the index — this is the rotate signal', () => {
    expect(readGroupLabel('A1) Cat Cow 2x10')).toEqual({ letter: 'A', index: 1 });
    expect(readGroupLabel('A2) Dominada 3x8')).toEqual({ letter: 'A', index: 2 });
  });

  test('a NUMERIC ordinal ("1)", "2)") is a plain list, not a group — null', () => {
    // Same null as "no marker at all": a block builder must not group these.
    expect(readGroupLabel('1) Puente de glúteo 3x12')).toBeNull();
    expect(readGroupLabel('2) Bird dog 3x10')).toBeNull();
  });

  test('a line with no marker at all returns null', () => {
    expect(readGroupLabel('Sentadilla 4x8')).toBeNull();
    expect(readGroupLabel(`15' easy run`)).toBeNull();
  });

  test('a leading "LABEL:" that is NOT a group marker ("ROW:") is not read as one', () => {
    // leadingColonLabel already treats these as distinct from GROUP_LABEL_RE;
    // readGroupLabel must agree (same shared regex — see label.ts).
    expect(readGroupLabel(`ROW: 5' WU`)).toBeNull();
  });

  test('a chained marker ("A1/A2/A3:") reads its OWN leading letter+index', () => {
    expect(readGroupLabel('A1/A2/A3: Superset')).toEqual({ letter: 'A', index: 1 });
  });
});

describe('class 12 — group_label surfaces on the parsed line, truly optional', () => {
  test('"A1) Cat Cow 2x10" / "A2) Dominada 3x8" carry their own letter+index', () => {
    const [a1] = parseNotationCell('A1) Cat Cow 2x10');
    expect(a1!.confidence).toBe('detected');
    expect(a1!.exercise_token).toBe('Cat Cow');
    expect(a1!.group_label).toEqual({ letter: 'A', index: 1 });

    const [a2] = parseNotationCell('A2) Dominada 3x8');
    expect(a2!.exercise_token).toBe('Dominada');
    expect(a2!.group_label).toEqual({ letter: 'A', index: 2 });
  });

  test('a bare-letter block ("A) Press Banca") carries a label with no index', () => {
    const [a] = parseNotationCell('A) Press Banca 4x4');
    expect(a!.exercise_token).toBe('Press Banca');
    expect(a!.group_label).toEqual({ letter: 'A' });
  });

  test('a numeric-ordinal line ("1) Puente de glúteo") carries NO group_label', () => {
    const [l] = parseNotationCell('1) Puente de glúteo 3x12');
    expect(l!.exercise_token).toBe('Puente de glúteo');
    expect(l!.group_label).toBeUndefined();
    expect('group_label' in l!).toBe(false); // truly optional: the key is absent, not undefined-valued
  });

  test('a line with no marker at all carries no group_label field either', () => {
    const [l] = parseNotationCell('Sentadilla 4x8');
    expect(l!.group_label).toBeUndefined();
    expect('group_label' in l!).toBe(false);
  });
});

// ── class 13 — bare movement names (photo-import): named, not vanished ──────
// Source: a real TrainingPeaks week sweep (fixtures/screenshot-semana12-*.json
// in web/tests/import/, another session's fixture — every string below is
// VERBATIM from it). 49 of 51 real exercises never reached the resolver
// because a card that lists movements by NAME (dose elsewhere on the card)
// has no digit on the name line, and "no digit → prose" is right for Pablo's
// Excel but wrong here. `bareNamesAreExercises` (default OFF) is the one
// switch that changes this — Excel/pasted text behavior is byte-for-byte
// identical with it off, verified by the option-off tests below and by every
// pre-class-13 test in this file still passing unmodified.

describe('class 13 — bareNamesAreExercises OFF (default): zero behavior change', () => {
  test('a bare name with the option off still vanishes, exactly like before', () => {
    expect(parseNotationCell('A) Cable External Rotation')).toHaveLength(0);
    expect(parseNotationCell('Cat Cow')).toHaveLength(0);
  });

  test('passing {} explicitly is the same as passing nothing', () => {
    expect(parseNotationCell('Cat Cow', {})).toHaveLength(0);
  });
});

describe('class 13 — bareNamesAreExercises ON: a real name types incomplete, not vanished', () => {
  test('"A) Cable External Rotation" → incomplete, token+group_label, NO dose', () => {
    const [l, ...rest] = parseNotationCell('A) Cable External Rotation', {
      bareNamesAreExercises: true,
    });
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('incomplete');
    expect(l!.exercise_token).toBe('Cable External Rotation');
    expect(l!.group_label).toEqual({ letter: 'A' });
    expect(l!.prescription.scheme).toBe('sets');
    expect(l!.prescription.sets).toBeUndefined(); // unset, not [] — never "zero sets prescribed"
  });

  test('a full REFUERZO HOMBRO card: 5 names in, 5 incomplete exercises out, counter dropped', () => {
    const cell = [
      '0/10 Sets 0/5 Exercises',
      'A) Cable External Rotation',
      'B) Band Pull Apart',
      'C) Prone Y Raise',
      'D) Serratus wall slide',
      'E) Band Scapular Retraction',
    ].join('\n');
    const lines = parseNotationCell(cell, { bareNamesAreExercises: true });
    expect(lines).toHaveLength(5); // the counter line contributes ZERO lines
    expect(lines.every((l) => l.confidence === 'incomplete')).toBe(true);
    expect(lines.map((l) => l.exercise_token)).toEqual([
      'Cable External Rotation',
      'Band Pull Apart',
      'Prone Y Raise',
      'Serratus wall slide',
      'Band Scapular Retraction',
    ]);
    expect(lines.map((l) => l.group_label)).toEqual([
      { letter: 'A' },
      { letter: 'B' },
      { letter: 'C' },
      { letter: 'D' },
      { letter: 'E' },
    ]);
  });

  test('an indexed marker ("A1) Cat Cow") still types incomplete — the digit is the label\'s own, not the name\'s', () => {
    // The bug this regresses: isNoiseLine never flags "A1) Cat Cow" as noise
    // (the "1" in "A1" satisfies its digit check), so the bare-name path must
    // not be gated behind isNoiseLine at all.
    const [l] = parseNotationCell('A1) Cat Cow', { bareNamesAreExercises: true });
    expect(l!.confidence).toBe('incomplete');
    expect(l!.exercise_token).toBe('Cat Cow');
    expect(l!.group_label).toEqual({ letter: 'A', index: 1 });
  });

  test('a numeric-ordinal name ("1) Puente de glúteo") types incomplete with NO group_label', () => {
    const [l] = parseNotationCell('1) Puente de glúteo', { bareNamesAreExercises: true });
    expect(l!.confidence).toBe('incomplete');
    expect(l!.exercise_token).toBe('Puente de glúteo');
    expect(l!.group_label).toBeUndefined();
  });

  test('a "- " bulleted name ("- Dominada (lastrada)") strips the bullet, keeps the parenthetical', () => {
    const [l] = parseNotationCell('- Dominada (lastrada)', { bareNamesAreExercises: true });
    expect(l!.confidence).toBe('incomplete');
    expect(l!.exercise_token).toBe('Dominada (lastrada)');
  });

  test('still noise even with the option on: title, coach note', () => {
    for (const cell of [
      'DÍA LARGO MIXTO Z2', // ALL-CAPS title — isBlockTitle owns this, never a bare name
      '*Notas del coach', // coach note marker
    ]) {
      expect(parseNotationCell(cell, { bareNamesAreExercises: true })).toHaveLength(0);
    }
  });

  test('a digit-bearing header ("BLOQUE 1)") is unaffected by the option — it already reviewed', () => {
    // Has a digit, so it never reaches the bare-name path at all; unchanged
    // from option-off behavior (a review line, not a silent drop).
    const off = parseNotationCell('BLOQUE 1)');
    const on = parseNotationCell('BLOQUE 1)', { bareNamesAreExercises: true });
    expect(on).toEqual(off);
    expect(off[0]!.confidence).toBe('review');
  });

  test('a URL/reference note stays noise, never a fabricated exercise called the URL', () => {
    const cell = 'Lanzamiento de disco: https://www.youtube.com/watch';
    expect(parseNotationCell(cell, { bareNamesAreExercises: true })).toHaveLength(0);
  });

  test('a metadata marker ("Video ...", "Notas...") stays noise', () => {
    expect(parseNotationCell('Video ...', { bareNamesAreExercises: true })).toHaveLength(0);
    expect(parseNotationCell('Notas...', { bareNamesAreExercises: true })).toHaveLength(0);
  });

  test('long prose stays noise — "pocas palabras" is not negotiable', () => {
    const cell =
      'Vamos a realizar controles periódicos de salto para observar cómo responde tu sistema neuromuscular';
    expect(parseNotationCell(cell, { bareNamesAreExercises: true })).toHaveLength(0);
  });

  test('a short coaching directive (leading verb) stays noise, not a fake exercise', () => {
    expect(parseNotationCell('Recuerda hidratarte bien', { bareNamesAreExercises: true })).toHaveLength(0);
  });

  test('a real dosed line is completely unaffected by the option', () => {
    const [l] = parseNotationCell('Sentadilla 4x8', { bareNamesAreExercises: true });
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.sets).toHaveLength(4);
  });

  test('a modality CHOICE ("row/ski") is never read as a movement name', () => {
    expect(parseNotationCell('row/ski', { bareNamesAreExercises: true })).toHaveLength(0);
  });
});

describe('class 13 — "N Sets M Exercises" counters drop cleanly, in any confidence mode', () => {
  test('a counter line alone produces ZERO lines, option on or off', () => {
    for (const cell of [
      '0/10 Sets 0/5 Exercises',
      '16 Sets 8 Exercises',
      '21 Sets 7 Exercises',
      '24 Sets 8 Exercises',
    ]) {
      expect(parseNotationCell(cell)).toHaveLength(0);
      expect(parseNotationCell(cell, { bareNamesAreExercises: true })).toHaveLength(0);
    }
  });

  test('the OLD bug: "0/10 Sets 0/5 Exercises" no longer fabricates a 2-set "Sets Exercises" movement', () => {
    // Before the counter-line rule, parseRepSeq read "0/10" as a 2-set
    // sequence and DOSE_WORD_ONLY_RE didn't know the English word
    // "exercises", so this typed CONFIDENTLY as a fake exercise.
    const lines = parseNotationCell('0/10 Sets 0/5 Exercises');
    expect(lines).toHaveLength(0);
  });
});

describe('class 13 — a "sets" scheme always needs a REAL movement name', () => {
  test('"A2) 90-90" reviews — the exercise\'s own numeric name is not a fabricated rep sequence', () => {
    // "90-90" (the hip-mobility drill) is indistinguishable from a genuine
    // "90 then 90" rep sequence without a catalog lookup — which is a LATER
    // concern, not this module's. Honest answer: review, never a confident
    // but wrong 2-set dose with an EMPTY exercise name.
    const [l] = parseNotationCell('A2) 90-90');
    expect(l!.confidence).toBe('review');
    expect(l!.prescription.sets).toBeUndefined();
    expect(l!.prescription.note).toBe('A2) 90-90');
  });

  test('a "P:" note prefix with a rep-range-shaped sentence reviews, not a fake exercise named "P"', () => {
    // extractLabel has no exclusion list for short pre-colon prefixes the way
    // GROUP_LABEL_RE excludes A–H group markers — "P:" (Pablo's note prefix)
    // used to read as a name-first label and fabricate a strength line.
    const cell =
      'P: Realiza 4 series de entre 12 - 15 repeticiones por ejercicio con 1 minuto de descanso entre series.';
    const [l] = parseNotationCell(cell);
    expect(l!.confidence).toBe('review');
    expect(l!.prescription.sets).toBeUndefined();
    expect(l!.prescription.note).toBe(cell);
  });

  test('a real short (multi-letter) movement token is unaffected — the guard is length <= 1, not "short"', () => {
    const [l] = parseNotationCell('3 rounds RDL 8/lado');
    expect(l!.confidence).toBe('detected');
    expect(l!.exercise_token).toBe('RDL');
  });
});

// ── class 14 — rest dialects: seven spellings, six clock vocabularies ────────
// Measured against the SAME real corpus line before this class's fix: only
// "c/2'30\"" captured the rest; every other coach spelling ("cada", "r",
// "rec", parenthesized, comma-led) either lost the 150s recovery outright or
// tripped isDenseWod's multi-station heuristic on the comma and reviewed the
// whole line. A 6x800 VO2max rep and a 6x800 threshold rep are the same
// distance with a different rest — dropping it is not a cosmetic loss.

describe('class 14 — rest dialects all resolve to the SAME 150s, any spelling', () => {
  test.each([
    [`6x800 m Z5 c/2'30"`, 'c/ + mm\'ss" (control — already worked)'],
    [`6x800 m Z5 cada 2'30"`, 'cada + mm\'ss"'],
    [`6x800 m Z5 r 2'30"`, 'r + mm\'ss"'],
    [`6x800 m Z5 rec 150s`, 'rec + bare seconds word'],
    [`6x800 m Z5 (rec 2:30)`, 'rec, parenthesized, colon clock'],
    [`6x800 m Z5, rec 2:30`, 'rec, comma-led, colon clock'],
    [`6x800 m Z5, descanso 2:30`, 'descanso, comma-led, colon clock'],
  ])('%s (%s) → detected, rest_s 150, distance/rounds untouched', (cell) => {
    const [l, ...rest] = parseNotationCell(cell);
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.scheme).toBe('intervals');
    expect(l!.prescription.rounds).toBe(6);
    expect(l!.prescription.sets!.map((s) => s.measure)).toEqual(
      Array.from({ length: 6 }, () => ({ kind: 'distance', meters: 800 })),
    );
    expect(l!.prescription.rest_s).toBe(150);
    expect(l!.prescription.target).toEqual({ kind: 'hr_zone', value: 5 });
  });

  test('the comma no longer trips isDenseWod\'s multi-station heuristic for a trailing rest clause', () => {
    // Direct regression check for the exact old failure: a comma followed by
    // ANY letter used to split the line into ">=2 comma stations" and review
    // it whole — the rest annotation is not a second station.
    const [l] = parseNotationCell(`6x800 m Z5, rec 2:30`);
    expect(l!.confidence).toBe('detected');
    expect(l!.review_reasons).toHaveLength(0);
  });

  test('a comma-led SECOND STATION (not a rest clause) still reviews — the extraction is not "any comma-tail"', () => {
    const [l] = parseNotationCell(`10 wall balls, 5 burpees`);
    expect(l!.confidence).toBe('review');
  });

  test('the bare "r"/"rec" prefix never eats an UNRELATED preceding digit ("Z5") as a rounds count', () => {
    // "Z5 r 2'30\"" used to fail closed (guarded too hard against the digit
    // right before "r") — confirm the zone survives alongside the rest.
    const [l] = parseNotationCell(`6x800 m Z5 r 2'30"`);
    expect(l!.prescription.target).toEqual({ kind: 'hr_zone', value: 5 });
    expect(l!.prescription.rest_s).toBe(150);
  });

  test('"c/" keeps its EXISTING prime-only form working, unmodified by the new cada/rec/r dialects', () => {
    // "c/" is deliberately NOT extended to colon/word clocks here (out of
    // scope — no case in evidence needs it); this guards the original,
    // narrower `cada` branch stays intact alongside the new sibling one.
    expect(parseNotationCell(`4x400m c/1'30"`)[0]!.prescription.rest_s).toBe(90);
  });
});

// ── class 15 — loaded distance/duration sets, plain and per-implement ────────
// Measured before this class's fix: bout.ts's distance-interval fallback
// silently claimed every one of these lines and dropped the "@" entirely
// ("Sled Push 5x25 m @160 kg" → 5×25m with the load gone); "Farmers hold
// 3x45 s @2x32" was the worst of the four — parseSetsByReps hijacked the
// LOAD's own "2x32" fragment and typed it as its own "2 sets of 32 reps"
// scheme, discarding the 45s duration and the sled/carry nature entirely.

describe('class 15 — sled/sandbag/carry sets keep BOTH the measure and the load', () => {
  test('"Sled Push 5x25 m @160 kg" → 5 sets of 25m, kg 160 (not lost)', () => {
    const [l, ...rest] = parseNotationCell(`Sled Push 5x25 m @160 kg`);
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('detected');
    expect(l!.exercise_token).toBe('Sled Push');
    expect(l!.prescription.scheme).toBe('sets');
    expect(l!.prescription.modality).toBe('functional');
    expect(l!.prescription.sets).toHaveLength(5);
    for (const s of l!.prescription.sets!) {
      expect(s.measure).toEqual({ kind: 'distance', meters: 25 });
      expect(s.target).toEqual({ kind: 'kg', value: 160 });
    }
  });

  test('"Sled Push 5x25 m 160 kg" (no "@") → the SAME load, still typed — @ is not required for a plain kg', () => {
    const [l] = parseNotationCell(`Sled Push 5x25 m 160 kg`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.sets![0]!.target).toEqual({ kind: 'kg', value: 160 });
  });

  test('"Sandbag Lunges 4x50 m @30 kg" → 4 sets of 50m at 30kg', () => {
    const [l] = parseNotationCell(`Sandbag Lunges 4x50 m @30 kg`);
    expect(l!.confidence).toBe('detected');
    expect(l!.exercise_token).toBe('Sandbag Lunges');
    expect(l!.prescription.sets).toHaveLength(4);
    expect(l!.prescription.sets![0]!.measure).toEqual({ kind: 'distance', meters: 50 });
    expect(l!.prescription.sets![0]!.target).toEqual({ kind: 'kg', value: 30 });
  });

  test('"Farmers Carry 4x100 m @2x28" → PER-IMPLEMENT: 28 kg, implement_count 2 — never 56, never bare 28', () => {
    const [l] = parseNotationCell(`Farmers Carry 4x100 m @2x28`);
    expect(l!.confidence).toBe('detected');
    expect(l!.exercise_token).toBe('Farmers Carry');
    expect(l!.prescription.sets).toHaveLength(4);
    for (const s of l!.prescription.sets!) {
      expect(s.measure).toEqual({ kind: 'distance', meters: 100 });
      expect(s.target).toEqual({ kind: 'kg', value: 28, implement_count: 2 });
    }
    // The dishonest readings this guards against, spelled out:
    expect(l!.prescription.sets![0]!.target).not.toEqual({ kind: 'kg', value: 56 }); // never the sum
    expect(l!.prescription.sets![0]!.target).not.toEqual({ kind: 'kg', value: 28 }); // never bare (loses the "2")
  });

  test('"Farmers hold 3x45 s @2x32" → the worst bug: duration 45s × 3, NOT "2 sets of 32 reps"', () => {
    const [l, ...rest] = parseNotationCell(`Farmers hold 3x45 s @2x32`);
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('detected');
    expect(l!.exercise_token).toBe('Farmers hold');
    expect(l!.prescription.scheme).toBe('sets');
    expect(l!.prescription.sets).toHaveLength(3);
    for (const s of l!.prescription.sets!) {
      expect(s.measure).toEqual({ kind: 'duration', seconds: 45 });
      expect(s.target).toEqual({ kind: 'kg', value: 32, implement_count: 2 });
    }
  });

  test('a bare "Nx<seconds>" cardio interval with NO load stays review — this family never over-reaches', () => {
    // The exact old regression this class's fix caused and then closed: a
    // word-second interval the grammar cannot type yet must stay honest, not
    // be rescued into a fabricated "functional" set just because a sibling
    // reader learned "Nx<duration word>".
    const [l] = parseNotationCell(`6x90 seg strides`);
    expect(l!.confidence).toBe('review');
    expect(l!.prescription.sets).toBeUndefined();
    expect(l!.prescription.total_s).toBeUndefined();
  });

  test('"Sled Push 5x25 m @160 kg, rec 90 s" → load AND rest both survive together', () => {
    const [l] = parseNotationCell(`Sled Push 5x25 m @160 kg, rec 90 s`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.rest_s).toBe(90);
    expect(l!.prescription.sets![0]!.target).toEqual({ kind: 'kg', value: 160 });
  });

  test('"Wall Balls 100 reps @9 kg for time" still reviews whole — a rep-counted metcon, not this family\'s shape', () => {
    const [l] = parseNotationCell(`Wall Balls 100 reps @9 kg for time`);
    expect(l!.confidence).toBe('review');
    expect(l!.prescription.sets).toBeUndefined();
  });
});

// ── class 16 — the residue guard: a partial match must review, not ship green ─
// Not the same failure mode as class 14/15 (those are DIALECTS the grammar
// did not yet know) — this is the STRUCTURAL backstop for when a line trips
// TWO independent readers at once and only one of them wins: the winning
// parser types happily, `prescriptionSchema` validates happily (both fields
// are optional), and a real number from the text is silently gone. Scoped to
// the two clauses parseRest/parseKg/parseImplementLoad can find but the
// WINNING parser has no slot for — not a generic "every number must
// reappear" scan (see result.ts's module comment on why that would false-
// positive on "10' caminando").

describe('class 16 — residue guard: an unconsumed rest or load clause forces review', () => {
  test('a load parseBout has no slot for ("@5kg" on a plain steady zone bout) → review, not silently dropped', () => {
    const [l] = parseNotationCell(`10' carrera Z2 @5kg`);
    expect(l!.confidence).toBe('review');
    expect(l!.review_reasons[0]).toMatch(/load/);
    expect(l!.prescription.note).toContain('@5kg');
  });

  test('a rest clause the winning parser never looked at (parseCoreWorkRest ignores anything past its own pattern) → review', () => {
    const [l] = parseNotationCell(`Plancha lateral 4x40'' / 20'' rec 90''`);
    expect(l!.confidence).toBe('review');
    expect(l!.review_reasons[0]).toMatch(/rest/);
  });

  test('invariant: the guard never fires on a number the grammar legitimately repurposed', () => {
    // "10' caminando" reads its "10" as total_s, deliberately never rest_s
    // (the walk IS the bout — bout.ts's own self-referential guard). The
    // residue guard must not re-flag that as a "dropped" rest.
    const [w] = parseNotationCell(`10' caminando`);
    expect(w!.confidence).toBe('detected');
    expect(w!.prescription.total_s).toBe(600);
    expect(w!.prescription.rest_s).toBeUndefined();
  });
});

// ── class 17 — to-failure reps: no clock, never a fabricated count ───────────
// "4x max" used to fall to review for lack of a rep number — but "go until
// you fail" IS the complete instruction, same honesty-contract standing as a
// bodyweight movement with no %RM. Distinct from the PRE-EXISTING "3' max"
// (timedMax, class 9's corpus audit) which IS time-capped — that stays a
// duration measure, unchanged.

describe('class 17 — to-failure reps type as reps_to_failure, never review or a fake count', () => {
  test('"Dead hangs 4x max" → 4 sets, each reps_to_failure', () => {
    const [l, ...rest] = parseNotationCell(`Dead hangs 4x max`);
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('detected');
    expect(l!.exercise_token).toBe('Dead hangs');
    expect(l!.prescription.sets).toHaveLength(4);
    for (const s of l!.prescription.sets!) {
      expect(s.measure).toEqual({ kind: 'reps_to_failure' });
    }
  });

  test.each([
    [`Pull-ups máximo unbroken`, 'Pull-ups'],
    [`Push-ups max reps`, 'Push-ups'],
    [`Burpees AMRAP de reps`, 'Burpees'],
  ])('%s → ONE to-failure set, token is JUST the movement (%s)', (cell, token) => {
    const [l, ...rest] = parseNotationCell(cell);
    expect(rest).toHaveLength(0);
    expect(l!.confidence).toBe('detected');
    expect(l!.exercise_token).toBe(token);
    expect(l!.prescription.sets).toHaveLength(1);
    expect(l!.prescription.sets![0]!.measure).toEqual({ kind: 'reps_to_failure' });
  });

  test('a standalone to-failure marker is never dropped as noise for lacking a digit', () => {
    // Before isNoiseLine's exception, "no number anywhere → prose" ate these
    // three cases outright — parseNotationCell returned [], not a review
    // line, not a detected line: the coach's line vanished with zero trace.
    expect(parseNotationCell(`Pull-ups máximo unbroken`)).toHaveLength(1);
  });

  test('the pre-existing TIME-capped "max" (timedMax, class 9) is untouched: still a DURATION, not reps_to_failure', () => {
    const [l] = parseNotationCell(`3 rounds 3' max SB walking lunge 20kg`);
    expect(l!.confidence).toBe('detected');
    expect(l!.prescription.sets![0]!.measure).toEqual({ kind: 'duration', seconds: 180 });
  });

  test('"AMRAP 12\': 10 burpees + 10 cal row + …" is still a WOD announcement, never a to-failure qualifier', () => {
    // The hasMetconKeyword carve-out is scoped to "amrap (de) reps" exactly —
    // a real AMRAP format (a time cap on the whole block) must keep review-
    // ing whole, unaffected by arreglo #5.
    const [l] = parseNotationCell(`AMRAP 12': 10 burpees + 10 cal row + 100m farmer carry`);
    expect(l!.confidence).toBe('review');
    expect(l!.prescription.scheme).toBe('amrap');
  });

  test('prose that merely CONTAINS "máximo" stays prose, not a fabricated to-failure exercise', () => {
    expect(parseNotationCell(`Recuerda hacer el máximo esfuerzo posible hoy`)).toHaveLength(0);
  });
});

// ── Cross-class invariant: every new line still validates end-to-end ─────────

describe('classes 14-17 — invariants', () => {
  test('every detected line from the new dialects validates against prescriptionSchema', () => {
    const cells = [
      `6x800 m Z5 cada 2'30"`,
      `6x800 m Z5 r 2'30"`,
      `6x800 m Z5 rec 150s`,
      `6x800 m Z5 (rec 2:30)`,
      `6x800 m Z5, rec 2:30`,
      `Sled Push 5x25 m @160 kg`,
      `Farmers Carry 4x100 m @2x28`,
      `Farmers hold 3x45 s @2x32`,
      `Dead hangs 4x max`,
      `Pull-ups máximo unbroken`,
    ];
    for (const cell of cells) {
      for (const line of parseNotationCell(cell)) {
        const res = safeParsePrescription(line.prescription);
        expect(res.success, `invalid: ${cell} → ${JSON.stringify(line.prescription)}`).toBe(true);
        expect(line.confidence).toBe('detected');
      }
    }
  });
});
