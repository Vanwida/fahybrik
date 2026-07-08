// Grammar-first notation importer — the DETERMINISTIC half of #28 (Fork A).
//
// These are PURE tests (no DB): `parseNotationCell` turns one cell of Pablo's
// real "Capa 2" session text into typed `Prescription` lines + a per-line
// confidence. The stress corpus is pulled VERBATIM from the real planning
// spreadsheets (docs/Plantilla_HYROX_12sem*.xlsx, sheet "Semana N" row 11 —
// "CAPA 2 · SESIÓN EJEMPLO DETALLADA"). Seconds are written with a straight
// double-quote (45") exactly as in the source; the parser normalizes it.
//
// The honesty contract under test: type ONLY what the grammar can prove; a dense
// multi-station WOD/sim becomes ONE `review` line whose raw text is preserved in
// `note`, with NO fabricated structure. The LLM fallback (endpoint, not here)
// handles the review lines later.

import { describe, expect, test } from 'vitest';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';
import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';

describe('parseNotationCell — required real patterns', () => {
  test('strength pyramid with per-set reps + per-set %RM + rest (S1 Martes)', () => {
    const [line, ...rest] = parseNotationCell(
      `5 rounds Back Squat c/2'30": 10/10/8/8/6 — 60/65/70/70/75% RM`,
    );
    expect(rest).toHaveLength(0);
    expect(line!.confidence).toBe('detected');
    expect(line!.exercise_token).toBe('Back Squat');
    expect(line!.prescription.scheme).toBe('sets');
    expect(line!.prescription.modality).toBe('strength');
    expect(line!.prescription.sets).toHaveLength(5);
    expect(line!.prescription.sets![0]).toEqual({
      measure: { kind: 'reps', value: 10 },
      target: { kind: 'percent_rm', value: 60 },
      rest_s: 150,
    });
    expect(line!.prescription.sets![4]).toEqual({
      measure: { kind: 'reps', value: 6 },
      target: { kind: 'percent_rm', value: 75 },
      rest_s: 150,
    });
  });

  test('strength combo "A + B" splits into two typed lines (S2 Sábado shape)', () => {
    const lines = parseNotationCell('Deadlift 5r 10/10/8/6/4 + Hip thrust 5r 10/10/8/8/6');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.exercise_token)).toEqual(['Deadlift', 'Hip thrust']);
    expect(lines.every((l) => l.confidence === 'detected')).toBe(true);
    expect(lines[0]!.prescription.sets!.map((s) => s.measure)).toEqual(
      [10, 10, 8, 6, 4].map((value) => ({ kind: 'reps', value })),
    );
    // No load given → no fabricated target.
    expect(lines[0]!.prescription.sets!.every((s) => s.target === undefined)).toBe(true);
    expect(lines[1]!.prescription.sets).toHaveLength(5);
  });

  test('erg interval: rounds + work + rest + RPE (S1 Martes ROW)', () => {
    const [row, ...rest] = parseNotationCell(`ROW: 5' WU → 5x3' RPE8 – 45'' rest`);
    expect(rest).toHaveLength(0);
    expect(row!.confidence).toBe('detected');
    expect(row!.exercise_token).toBe('ROW');
    expect(row!.prescription.scheme).toBe('intervals');
    expect(row!.prescription.modality).toBe('row');
    expect(row!.prescription.rounds).toBe(5);
    expect(row!.prescription.work_s).toBe(180);
    expect(row!.prescription.rest_s).toBe(45);
    expect(row!.prescription.target).toEqual({ kind: 'rpe', value: 8 });
  });

  test('run interval: km/h → pace s/km, walking rest (S1 Viernes / S11 shape)', () => {
    const [run, ...rest] = parseNotationCell(
      `Threshold cinta: 4x6' a 15,5km/h – 1'15'' walking rest`,
    );
    expect(rest).toHaveLength(0);
    expect(run!.confidence).toBe('detected');
    expect(run!.prescription.scheme).toBe('intervals');
    expect(run!.prescription.modality).toBe('run');
    expect(run!.prescription.rounds).toBe(4);
    expect(run!.prescription.work_s).toBe(360);
    expect(run!.prescription.rest_s).toBe(75);
    // 15.5 km/h == 3600/15.5 == 232.26 → 232 s/km (rounded, never invented).
    expect(run!.prescription.target).toEqual({ kind: 'pace', unit: 'per_km', value_s: 232 });
  });

  test('zone + dual pace cap: "no más de 6\'/km" → hr_zone 2 + pace_cap max_s', () => {
    const [z, ...rest] = parseNotationCell(`Run 1h15' zona 2 (no más de 6'/km)`);
    expect(rest).toHaveLength(0);
    expect(z!.confidence).toBe('detected');
    expect(z!.exercise_token).toBe('Run');
    expect(z!.prescription.scheme).toBe('steady');
    expect(z!.prescription.modality).toBe('run');
    expect(z!.prescription.total_s).toBe(4500);
    expect(z!.prescription.target).toEqual({ kind: 'hr_zone', value: 2 });
    // "no más (lento) de 6'/km" == slowest allowed == a ceiling on seconds.
    expect(z!.prescription.pace_cap).toEqual({ unit: 'per_km', max_s: 360 });
  });

  test('pace cap OPPOSITE sense: real S3 Sábado "no más rápido de 6\'/km" → min_s', () => {
    const [z] = parseNotationCell(`Run 1h15' Z2 (no más rápido de 6'/km)`);
    expect(z!.confidence).toBe('detected');
    // "no más rápido" == fastest allowed == a floor on seconds.
    expect(z!.prescription.pace_cap).toEqual({ unit: 'per_km', min_s: 360 });
  });

  test('dense multi-station WOD → ONE review line, raw text preserved, no structure', () => {
    const wod = `WOD For Time 4 rounds: 10m KB OH walking lunge 24kg, 5 thrusters 40kg, 3 clean 40kg, 10 TTB (TC 12')`;
    const lines = parseNotationCell(wod);
    expect(lines).toHaveLength(1);
    const [w] = lines;
    expect(w!.confidence).toBe('review');
    expect(w!.exercise_token).toBe('');
    expect(w!.prescription.scheme).toBe('for_time');
    expect(w!.review_reasons.length).toBeGreaterThan(0);
    // Verbatim kept; nothing fabricated.
    expect(w!.prescription.note).toContain('walking lunge');
    expect(w!.prescription.sets).toBeUndefined();
    expect(w!.prescription.rounds).toBeUndefined();
    expect(w!.prescription.target).toBeUndefined();
  });

  test('unknown exercise token still parses the dose', () => {
    const [u, ...rest] = parseNotationCell('Jefferson curl 4 rounds 10/10/8/8 @ 40kg');
    expect(rest).toHaveLength(0);
    expect(u!.confidence).toBe('detected');
    expect(u!.exercise_token).toBe('Jefferson curl'); // NOT in the alias map
    expect(u!.prescription.scheme).toBe('sets');
    expect(u!.prescription.sets).toHaveLength(4);
    expect(u!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 10 });
    expect(u!.prescription.sets![0]!.target).toEqual({ kind: 'kg', value: 40 });
  });
});

// ── Full real cells (multi-line, verbatim from the spreadsheet) ───────────────

const S1_MARTES = `FUERZA — Tren inferior
5 rounds Back Squat c/2'30":
10/10/8/8/6 — 60/65/70/70/75% RM
Directo a:
ROW 5' warm up + 5x3' RPE 8 / 45" rest
10' easy run cool down (sumar km)`;

const S2_SABADO = `FUERZA — Cadena posterior + Plio
5 rounds Deadlift 10/10/8/6/4 / 2' rest
5 rounds Hip Thrust 10/10/8/8/6
8 rounds: 1 DB depth jump → 4 broad jump / 30" rest`;

const S3_LUNES = `WOD LARGO (TC 55')
For time 3 rounds: 25m sled push 170kg + 500m ski
3 rounds: 25m sled pull 140kg + 500m row
1200m / 800m / 400m run intercalando KB OH lunge y farmer carry
Finisher 75 wall ball 9kg`;

describe('parseNotationCell — full real Capa-2 cells', () => {
  test('S1 Martes: header/connector dropped, continuation joined → 3 detected', () => {
    const lines = parseNotationCell(S1_MARTES);
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.confidence === 'detected')).toBe(true);
    // The two-physical-line Back Squat is stitched back into one prescription.
    const squat = lines[0]!;
    expect(squat.exercise_token).toBe('Back Squat');
    expect(squat.prescription.sets).toHaveLength(5);
    // The chained "ROW … + 5x3'" is an erg interval, not a strength combo.
    const rowLine = lines.find((l) => l.exercise_token === 'ROW')!;
    expect(rowLine.prescription.scheme).toBe('intervals');
    expect(rowLine.prescription.modality).toBe('row');
    expect(rowLine.prescription.rounds).toBe(5);
  });

  test('S2 Sábado: two clean strength lines detected, plyo superset → review', () => {
    const lines = parseNotationCell(S2_SABADO);
    const detected = lines.filter((l) => l.confidence === 'detected');
    const review = lines.filter((l) => l.confidence === 'review');
    expect(detected.map((l) => l.exercise_token)).toEqual(['Deadlift', 'Hip Thrust']);
    expect(review).toHaveLength(1); // "1 DB depth jump → 4 broad jump" superset
    expect(review[0]!.prescription.note).toContain('broad jump');
  });

  test('S3 Lunes: whole dense WOD cell → every line review, nothing fabricated', () => {
    const lines = parseNotationCell(S3_LUNES);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.confidence === 'review')).toBe(true);
    // Honesty: not a single review line invents sets/rounds/targets.
    for (const l of lines) {
      expect(l.prescription.sets).toBeUndefined();
      expect(l.prescription.rounds).toBeUndefined();
      expect(l.prescription.target).toBeUndefined();
      expect(typeof l.prescription.note).toBe('string');
    }
  });
});

// ── Invariants across the whole real corpus ──────────────────────────────────

const REAL_CELLS = [S1_MARTES, S2_SABADO, S3_LUNES];

describe('parseNotationCell — invariants', () => {
  test('every emitted prescription validates against prescriptionSchema', () => {
    for (const cell of REAL_CELLS) {
      for (const line of parseNotationCell(cell)) {
        const res = safeParsePrescription(line.prescription);
        expect(res.success, `invalid: ${JSON.stringify(line.prescription)}`).toBe(true);
      }
    }
  });

  test('detected lines carry real structure; review lines carry the raw text', () => {
    for (const cell of REAL_CELLS) {
      for (const line of parseNotationCell(cell)) {
        if (line.confidence === 'detected') {
          const p = line.prescription;
          const hasStructure =
            (p.sets?.length ?? 0) > 0 ||
            p.rounds !== undefined ||
            p.total_s !== undefined ||
            p.target !== undefined ||
            p.pace_cap !== undefined;
          expect(hasStructure, `empty detected line: ${JSON.stringify(p)}`).toBe(true);
          expect(line.review_reasons).toHaveLength(0);
        } else {
          expect(line.prescription.note && line.prescription.note.length > 0).toBe(true);
          expect(line.review_reasons.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
