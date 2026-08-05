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
    expect(line!.prescription.sets!.every((s) => s.measure!.max === undefined)).toBe(true);
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
