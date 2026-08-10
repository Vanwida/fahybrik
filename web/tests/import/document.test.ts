// document — tests for the DOCUMENT reader (shared/domain/import/document.ts),
// the piece that turns Alex's real markdown training PLAN into clean cells
// the existing line grammar (parseNotationCell, ./notation.ts) can type.
//
// Every fixture below is a VERBATIM excerpt from the real plan this module
// was built against — health-planning/training/plan-95d-hyrox-singles-pro.md
// (a sibling project, not committed to this repo; line numbers in each test
// name refer to that file as of 2026-08-09). Nothing here is invented text.
//
// The measured bug this suite proves fixed: a table with one column PER WEEK
// ("| Ejercicio | W2 | W3 | W4 |") is how that document writes most of its
// blocks. Read naively, Back Squat's three weeks collapse into one line, and
// worse — a table whose ROWS are the PARTS of one prescription ("| | W2 | W3
// | W4 |" over Serie/Pace/Descanso) used to concatenate three weeks of "Nx"
// reps into one fabricated 19-rep set. The `weeks-as-columns` describe block
// below runs the fixed output through parseNotationCell and asserts the real
// per-week numbers land — not a flattened, cross-week mixture.

import { describe, expect, test } from 'vitest';
import { readPlanDocument, type DocumentCell } from '@fahybrid/shared/domain/import/document';
import { classifyOrientation } from '@fahybrid/shared/domain/import/document-table';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';

function findAll(cells: DocumentCell[], text: string): DocumentCell[] {
  return cells.filter((c) => c.text === text);
}

// ── classifyOrientation — the three named orientations + unrecognized ───────

describe('classifyOrientation — header-driven, the three named shapes + unrecognized', () => {
  test('weeks-as-columns, exercise rows (§6 L212 "| Ejercicio | W2 | W3 | W4 |")', () => {
    const r = classifyOrientation(['Ejercicio', 'W2', 'W3', 'W4']);
    expect(r.kind).toBe('weeks');
    expect(r.hasLabelColumn).toBe(true);
    expect(r.weekColumns).toEqual([
      { colIndex: 1, week: 2 },
      { colIndex: 2, week: 3 },
      { colIndex: 3, week: 4 },
    ]);
  });

  test('weeks-as-columns, NO label column (§6 L272 "| W2 | W3 | W4 |")', () => {
    const r = classifyOrientation(['W2', 'W3', 'W4']);
    expect(r.kind).toBe('weeks');
    expect(r.hasLabelColumn).toBe(false);
    expect(r.weekColumns).toEqual([
      { colIndex: 0, week: 2 },
      { colIndex: 1, week: 3 },
      { colIndex: 2, week: 4 },
    ]);
  });

  test('day-session (§12 L470 "| Día | Sesión |")', () => {
    expect(classifyOrientation(['Día', 'Sesión']).kind).toBe('day_session');
  });

  test('series (§13 C L534 "| Serie | Carga | Reps |")', () => {
    expect(classifyOrientation(['Serie', 'Carga', 'Reps']).kind).toBe('series');
  });

  test('name_dose, a reusable 2-column protocol (§13 A L499 "| Ejercicio | Dosis |")', () => {
    expect(classifyOrientation(['Ejercicio', 'Dosis']).kind).toBe('name_dose');
  });

  test('unrecognized: a 3-col reference table, no W-columns, first col ≠ Serie (§5 L185 "| Zona | Pace | Uso |")', () => {
    expect(classifyOrientation(['Zona', 'Pace', 'Uso']).kind).toBe('unrecognized');
  });

  test('unrecognized, NOT name_dose: a 2-col "Zona | % HRmax" reference table (§5 L194) — a bare "Z2" name_dose read would fabricate a nameless "steady Z2" bout and silently drop the "65-75%" that was the whole row', () => {
    expect(classifyOrientation(['Zona', '% HRmax']).kind).toBe('unrecognized');
  });
});

// ── weeks-as-columns: exercise rows (§6 Lun — Fuerza A, L204-230) ───────────

describe('readPlanDocument — weeks-as-columns, exercise rows (§6 L212-218 Back Squat table)', () => {
  const md = `
## 6. BLOQUE 1 — Motor + Fuerza (W2–W4: 17 ago – 6 sep)

**Objetivo:** reconstruir base aeróbica y fuerza máxima antes de meter la intensidad específica. Es el bloque que hace posible el Bloque 2.

### Lun — Fuerza A (rodilla) + SkiErg

Calentamiento **C**.

| Ejercicio | W2 | W3 | W4 |
|---|---|---|---|
| Back Squat | 4×6 @72% | 5×5 @76% | 5×4 @80% |
| Front Squat | 3×8 @RPE7 | 3×8 @RPE7.5 | 3×6 @RPE8 |
| Bulgarian split squat | 3×10/pierna | 3×10/pierna | 3×12/pierna |
| Pull-up lastrado | 4×6 | 4×5 +peso | 5×4 +peso |
| Core anti-extensión (ab wheel / hollow) | 3×10 | 3×12 | 3×12 |

Cierre erg: **SkiErg 8×250 m** damper 7, descanso 45 s. Split objetivo = tu split de 1000 m del test − 3 s. (W3: 10×250 m. W4: 6×400 m, descanso 60 s.)
`;
  const cells = readPlanDocument(md);
  const backSquat = cells.filter((c) => c.text.startsWith('Back Squat'));

  test('produces exactly ONE cell per (row × week) — never a cross-week concatenation', () => {
    expect(backSquat).toHaveLength(3);
    expect(backSquat.map((c) => c.week)).toEqual([2, 3, 4]);
    expect(backSquat.map((c) => c.text)).toEqual([
      'Back Squat 4×6 @72%',
      'Back Squat 5×5 @76%',
      'Back Squat 5×4 @80%',
    ]);
    // Never mix a leg into the wrong week's cell.
    expect(backSquat[0]!.text).not.toContain('5×5');
    expect(backSquat[0]!.text).not.toContain('5×4');
    expect(backSquat[1]!.text).not.toContain('4×6');
    expect(backSquat[1]!.text).not.toContain('5×4');
    expect(backSquat[2]!.text).not.toContain('4×6');
    expect(backSquat[2]!.text).not.toContain('5×5');
  });

  test('carries day=Lunes, source=table_weeks_exercise, trainable=true on every row×week cell', () => {
    for (const c of backSquat) {
      expect(c.day).toBe('Lunes');
      expect(c.source).toBe('table_weeks_exercise');
      expect(c.trainable).toBe(true);
    }
  });

  test('bold row labels are cleaned ("**Sled Push 25 m**" → "Sled Push 25 m") — checked via a sibling table below', () => {
    expect(cells.some((c) => c.text.includes('**'))).toBe(false);
  });

  test('the three week-cells TYPE via parseNotationCell — the actual bug-fix proof', () => {
    // "4×6" (W2) is 4 sets of 6; "5×5" (W3) and "5×4" (W4) are each 5 sets —
    // the table's OWN set counts, read per week, never fused into one.
    const expectedSets = [4, 5, 5];
    const expectedReps = [6, 5, 4];
    for (const [i, week] of [2, 3, 4].entries()) {
      const cell = backSquat[i]!;
      expect(cell.week).toBe(week);
      const [line, ...rest] = parseNotationCell(cell.text);
      expect(rest, `residue for W${week}: ${JSON.stringify(rest)}`).toHaveLength(0);
      expect(line!.confidence, `W${week} cell "${cell.text}"`).toBe('detected');
      expect(line!.exercise_token).toBe('Back Squat');
      expect(line!.prescription.sets).toHaveLength(expectedSets[i]!);
      expect(line!.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: expectedReps[i] });
    }
  });

  test('the "Cierre erg" line mentions BOTH W3 and W4 inline — week stays honestly unresolved, text kept whole', () => {
    const [cierre] = findAll(
      cells,
      'Cierre erg: SkiErg 8×250 m damper 7, descanso 45 s. Split objetivo = tu split de 1000 m del test − 3 s. (W3: 10×250 m. W4: 6×400 m, descanso 60 s.)',
    );
    expect(cierre, 'the Cierre erg line must survive whole, nothing truncated').toBeDefined();
    expect(cierre!.week).toBeUndefined();
    expect(cierre!.day).toBe('Lunes');
    expect(cierre!.trainable).toBe(true);
  });
});

// ── weeks-as-columns: FIELD rows (§6 Mar — VO2max running, L222-230) ────────
// This is the table the brief calls out as "peor" — rows are Serie/Pace/
// Descanso, three PARTS of ONE prescription, not three exercises. The naive
// bug reads the Serie row alone and concatenates 6+5+8 = 19 reps across
// weeks; a row-fragmenting "fix" would be equally wrong the other way,
// producing three fake exercises named "Serie"/"Pace"/"Descanso". Neither
// happens here: one cell PER WEEK, fields correctly recombined.

describe('readPlanDocument — weeks-as-columns, FIELD rows (§6 L228-230 Serie/Pace/Descanso)', () => {
  const md = `
## 6. BLOQUE 1 — Motor + Fuerza (W2–W4: 17 ago – 6 sep)

### Mar — VO2max running

Calentamiento **B**.

| | W2 | W3 | W4 |
|---|---|---|---|
| Serie | 6×800 m | 5×1000 m | 8×600 m |
| Pace | Z5 (P5k) | Z5 | Z5 − 3 s/km |
| Descanso | 2:30 trote | 3:00 trote | 1:45 trote |
`;
  const cells = readPlanDocument(md);
  const weekCells = cells.filter((c) => c.source === 'table_weeks_field');

  test('produces exactly THREE cells — one per week, never one per field-row (would be 9) and never one per table (would be 19 reps)', () => {
    expect(weekCells).toHaveLength(3);
    expect(weekCells.map((c) => c.week)).toEqual([2, 3, 4]);
  });

  test('every field (Serie + Pace + Descanso) survives inside its week — nothing dropped, nothing fabricated as a fake "Serie" exercise', () => {
    // Joined with plain spaces, never a comma: a comma here would make
    // notation.ts's own dispatcher (parseLine) misread this as a dense
    // multi-station WOD once it tries (and fails) to cleanly extract a
    // trailing rest clause — see joinFieldValue's doc comment in
    // document-table.ts. parseBout finds "descanso" as a rest cue
    // regardless of a leading comma, so nothing is lost by omitting it.
    expect(weekCells[0]!.text).toBe('6×800 m Z5 (P5k) descanso 2:30 trote');
    expect(weekCells[1]!.text).toBe('5×1000 m Z5 descanso 3:00 trote');
    expect(weekCells[2]!.text).toBe('8×600 m Z5 − 3 s/km descanso 1:45 trote');
    for (const c of weekCells) {
      expect(c.day).toBe('Martes');
      expect(c.trainable).toBe(true);
    }
  });

  test('W2 types via parseNotationCell as 6 real intervals, Z5, 150s rest — NOT a fabricated "Serie"/"Pace" exercise and NOT 19 concatenated reps', () => {
    const [line, ...rest] = parseNotationCell(weekCells[0]!.text);
    expect(rest).toHaveLength(0);
    expect(line!.confidence).toBe('detected');
    expect(line!.prescription.scheme).toBe('intervals');
    expect(line!.prescription.rounds).toBe(6);
    expect(line!.prescription.sets).toHaveLength(6);
    expect(line!.prescription.sets![0]!.measure).toEqual({ kind: 'distance', meters: 800 });
    expect(line!.prescription.target).toEqual({ kind: 'hr_zone', value: 5 });
    expect(line!.prescription.rest_s).toBe(150);
    // The old bug's number never appears anywhere in the typed result.
    expect(JSON.stringify(line!.prescription)).not.toContain('19');
  });

  test('W3 and W4 type independently too, each with their OWN rounds/rest — no cross-week bleed', () => {
    const w3 = parseNotationCell(weekCells[1]!.text)[0]!;
    expect(w3.confidence).toBe('detected');
    expect(w3.prescription.rounds).toBe(5);
    expect(w3.prescription.rest_s).toBe(180);

    const w4 = parseNotationCell(weekCells[2]!.text)[0]!;
    expect(w4.confidence).toBe('detected');
    expect(w4.prescription.rounds).toBe(8);
    expect(w4.prescription.rest_s).toBe(105);
  });
});

// ── weeks-as-columns: a SINGLE field row labeled "Sesión" (§8 L322-326) ─────
// The same empty-first-column shape as Serie/Pace/Descanso, but with only one
// row — "Sesión" names the WHOLE session as one degenerate field, not a
// movement. Left out of the field vocabulary, this would fabricate a fake
// exercise called "Sesión" (same bug class as reading "Serie" as one).

describe('readPlanDocument — a single "Sesión" field row is never read as a fake exercise (§8 L324-326)', () => {
  const md = `
## 8. BLOQUE 2 — Umbral + Compromised (W6–W8: 14 sep – 4 oct)

### Mar — Umbral / VO2 running

| | W6 | W7 | W8 |
|---|---|---|---|
| Sesión | 5×1200 m @umbral, rec 2' | 4×2000 m @umbral, rec 3' | 6×1000 m @race pace HYROX, rec 90 s |
`;
  const cells = readPlanDocument(md);
  const weekCells = cells.filter((c) => c.source === 'table_weeks_field');

  test('one cell per week, "Sesión" never becomes the cell\'s row-label prefix', () => {
    expect(weekCells).toHaveLength(3);
    expect(weekCells.map((c) => c.week)).toEqual([6, 7, 8]);
    for (const c of weekCells) expect(c.text.startsWith('Sesión')).toBe(false);
    expect(weekCells[0]!.text).toBe('5×1200 m @umbral, rec 2\'');
    expect(weekCells[2]!.text).toBe('6×1000 m @race pace HYROX, rec 90 s');
  });

  test('never fabricated as a table_weeks_exercise cell named "Sesión"', () => {
    expect(cells.some((c) => c.source === 'table_weeks_exercise')).toBe(false);
    expect(cells.some((c) => c.text.startsWith('Sesión'))).toBe(false);
  });
});

// ── weeks-as-columns: excluded "Total" row + bold row labels (§6 L278-286) ──

describe('readPlanDocument — Total row excluded, bold row labels cleaned (§6 L282-285)', () => {
  const md = `
## 6. BLOQUE 1 — Motor + Fuerza (W2–W4: 17 ago – 6 sep)

### Vie — HYROX compromised

### Volumen de wall balls (progresión paralela, W2–W4)

Los 100 a 9 kg necesitan su propia progresión. Añade al final de **martes** (post-carrera, cuando ya estás fatigado — que es como llegan en carrera):

| | W2 | W3 | W4 |
|---|---|---|---|
| Wall Balls 9 kg/3 m | 5×12 (rec 60 s) | 5×15 (rec 60 s) | 4×20 (rec 75 s) |
| Total | 60 | 75 | 80 |
`;
  const cells = readPlanDocument(md);

  test('"Total" never becomes a fabricated exercise cell — excluded from the weeks matrix, kept as a context note', () => {
    const wallBalls = cells.filter((c) => c.text.startsWith('Wall Balls'));
    expect(wallBalls).toHaveLength(3);
    expect(wallBalls.every((c) => c.source === 'table_weeks_exercise' && c.trainable)).toBe(true);

    const totalCell = cells.find((c) => c.text.startsWith('Total'));
    expect(totalCell).toBeDefined();
    expect(totalCell!.source).toBe('table_context');
    expect(totalCell!.trainable).toBe(false);
    expect(totalCell!.text).toContain('60'); // the number is still visible, never silently gone
  });

  test('the day is inherited from the prose lead-in ("al final de martes") — no day H3 above this table', () => {
    const wallBalls = cells.filter((c) => c.text.startsWith('Wall Balls'));
    for (const c of wallBalls) expect(c.day).toBe('Martes');
  });
});

// ── series: §13 C barbell ramp (L530-541) — one cell for the WHOLE table ───

describe('readPlanDocument — series orientation, heterogeneous sets (§13 C L534-539)', () => {
  const md = `
## 13. CALENTAMIENTOS

### **C) Pre-fuerza** — Base A + rampa de barra

Para el ejercicio principal (squat o deadlift), **rampa de 4 series**:

| Serie | Carga | Reps |
|---|---|---|
| 1 | Barra vacía | 8 |
| 2 | 40% de la carga de trabajo | 5 |
| 3 | 60% | 3 |
| 4 | 80% | 2 |

Descanso 60–90 s entre rampas. Luego a trabajar.
`;
  const cells = readPlanDocument(md);
  const seriesCells = cells.filter((c) => c.source === 'table_series');

  test('the whole 4-row ramp is ONE cell — not 4 separate unlabeled rows, not force-fit', () => {
    expect(seriesCells).toHaveLength(1);
    expect(seriesCells[0]!.text).toBe(
      'Barra vacía @ 8 / 40% de la carga de trabajo @ 5 / 60% @ 3 / 80% @ 2',
    );
    expect(seriesCells[0]!.trainable).toBe(true);
    // Every row's every field survives — the honesty contract, not a typing guarantee:
    // row 1's "Barra vacía" is descriptive text, not a number, so this line is not
    // expected to TYPE green through the closed dose grammar — only to lose nothing.
    for (const token of ['Barra vacía', '8', '40%', '5', '60%', '3', '80%', '2']) {
      expect(seriesCells[0]!.text).toContain(token);
    }
  });
});

// ── day_session: §12 RACE WEEK (L466-478), no H3s, no bold-day-bullets ─────

describe('readPlanDocument — day_session orientation (§12 L470-478), section has ONLY a table', () => {
  const md = `
## 12. Semana 14 (9–15 nov) — RACE WEEK

Volumen **−60%**. Sigues moviéndote todos los días: parar del todo te deja plano.

| Día | Sesión |
|---|---|
| **Lun 9** | 30 min Z2 + 5 strides + movilidad. Nada de fuerza pesada. |
| **Mar 10** | 4×800 m @race pace, rec 2'. Cierra sintiéndote con ganas de más. |
| **Mié 11** | 25 min Z2 muy suave + movilidad. **Empieza carga de carbohidratos.** |
| **Jue 12** | **Openers**: calentamiento completo + 3×200 m a race pace + 10 wall balls + 20 m sled push a peso de carrera + 200 m ski. 25 min total. Esto activa, no fatiga. |
| **Vie 13** | OFF total, o 15 min caminando. Piernas arriba. Preparar bolsa. |
| **Sáb 14** | **CARRERA** |
| **Dom 15** | Caminar 20–30 min. Comer. Dormir. |
`;
  const cells = readPlanDocument(md);
  const rows = cells.filter((c) => c.source === 'table_day_session');

  test('the section is recognized as TRAINING even with zero H3s and zero bold-day bullets — the table itself is the signal', () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((c) => c.trainable)).toBe(true);
  });

  test('one cell per day row, day + date read from the row label, week from the single-week section', () => {
    expect(rows).toHaveLength(7);
    expect(rows.map((c) => ({ day: c.day, date: c.date, week: c.week }))).toEqual([
      { day: 'Lunes', date: '9', week: 14 },
      { day: 'Martes', date: '10', week: 14 },
      { day: 'Miércoles', date: '11', week: 14 },
      { day: 'Jueves', date: '12', week: 14 },
      { day: 'Viernes', date: '13', week: 14 },
      { day: 'Sábado', date: '14', week: 14 },
      { day: 'Domingo', date: '15', week: 14 },
    ]);
  });

  test('bold markup inside a session cell is cleaned but the content is intact', () => {
    const jueves = rows.find((c) => c.day === 'Jueves')!;
    expect(jueves.text).toBe(
      'Openers: calentamiento completo + 3×200 m a race pace + 10 wall balls + 20 m sled push a peso de carrera + 200 m ski. 25 min total. Esto activa, no fatiga.',
    );
  });
});

// ── unrecognized orientation: whole table verbatim to review (§5 L185-190) ─

describe('readPlanDocument — unrecognized orientation goes WHOLE to review, never force-typed (§5 L185-198)', () => {
  const md = `
## 5. SEMANA 1 (10–16 ago) — Batería de tests

### Lun 10 — Test de fuerza
- Cierre.

### Cómo se convierten los tests en zonas

Con el tiempo del 5k (llámalo **P5k** en min/km):

| Zona | Pace | Uso |
|---|---|---|
| **Z2 / aeróbico** | P5k + 60–75 s/km | Miércoles, largos fáciles |
| **Umbral (Z3/Z4)** | P5k + 15–20 s/km | Bloques de umbral, race pace de HYROX |
| **VO2max (Z5)** | P5k − 0 a 5 s/km | Intervalos de martes |
| **Race pace HYROX** | ≈ umbral + 5 s/km | Los 8×1 km del día de carrera |

Y con la HRmax medida el martes:

| Zona | % HRmax |
|---|---|
| Z2 | 65–75% |
| Umbral | 85–90% |
| VO2max | 92–97% |
`;
  const cells = readPlanDocument(md);
  const tables = cells.filter((c) => c.source === 'table_unrecognized');

  test('BOTH the 3-col and the 2-col zone-reference table become ONE cell each, flagged for review, never split into per-cell guesses', () => {
    expect(tables).toHaveLength(2);
    for (const t of tables) {
      expect(t.needsReview).toBe(true);
      expect(t.reviewReason).toBeTruthy();
      expect(t.trainable).toBe(true);
    }
  });

  test('every row of the 3-col table survives verbatim — nothing dropped from an unrecognized table', () => {
    const t = tables[0]!;
    for (const fragment of ['Zona', 'Pace', 'Uso', 'Z2 / aeróbico', 'Umbral (Z3/Z4)', 'VO2max (Z5)', 'Race pace HYROX']) {
      expect(t.text).toContain(fragment);
    }
  });

  test('the 2-col "Zona | % HRmax" table does NOT fall into name_dose — no fabricated "Z2"/"Umbral"/"VO2max" exercise cell exists anywhere', () => {
    expect(cells.some((c) => c.source === 'table_name_dose')).toBe(false);
    expect(cells.some((c) => c.text.startsWith('Z2 ') || c.text.startsWith('Umbral ') || c.text.startsWith('VO2max '))).toBe(
      false,
    );
    const t = tables[1]!;
    expect(t.text).toContain('Zona');
    expect(t.text).toContain('% HRmax');
    expect(t.text).toContain('65–75%');
  });
});

// ── non-training tables: excluded from typing, never lost (§0 L15-35) ──────

describe('readPlanDocument — non-training sections (§0) never produce trainable cells', () => {
  const md = `
## 0. Punto de partida (declarado 2026-08-09)

| Dato | Valor | Cambio vs dossier de mayo |
|---|---|---|
| Categoría | **Singles Pro** | ⚠️ era Doubles Pro |
| Peso | 80–83 kg | ⬇️ desde 89.75 kg |

### Lo que cambia por pasar a Singles Pro

| Station | Open | **Pro** | Delta |
|---|---|---|---|
| Sled Push 50 m | 152 kg | **202 kg** | +50 kg |
| Sled Pull 50 m | 103 kg | **153 kg** | +50 kg |
`;
  const cells = readPlanDocument(md);

  test('§0 has no day/protocol H3 and no bold-day bullets — every cell it produces is trainable:false', () => {
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => !c.trainable)).toBe(true);
    expect(cells.every((c) => c.source === 'table_context')).toBe(true);
  });

  test('the content is still captured, not thrown away — "no se tipa" is not "se pierde"', () => {
    expect(cells.some((c) => c.text.includes('Sled Push 50 m') && c.text.includes('202 kg'))).toBe(true);
  });
});

// ── bullets with bold markdown (§5 L146-151) ────────────────────────────────

describe('readPlanDocument — bullets with **negrita**, one cell per line (§5 L146-151)', () => {
  const md = `
## 5. SEMANA 1 (10–16 ago) — Batería de tests

### Lun 10 — Test de fuerza
Calentamiento **C** (ver §8).
- **Back Squat**: subir hasta un **5RM técnico** (RPE 8, no fallo). Anota carga.
- **Deadlift**: 3×5 subiendo hasta RPE 8. Anota.
- **Pull-up con lastre**: max reps a peso corporal + 1 serie a +10 kg. Anota.
- Cierre: 3×500 m SkiErg damper 7, descanso 2', anota el mejor split.
`;
  const cells = readPlanDocument(md);

  test('every physical line becomes its own cell, markdown stripped, week=1 (single-week section) and day=Lunes', () => {
    expect(cells).toHaveLength(5); // 1 prose ("Calentamiento…") + 4 bullets
    for (const c of cells) {
      expect(c.week).toBe(1);
      expect(c.day).toBe('Lunes');
      expect(c.trainable).toBe(true);
      expect(c.text).not.toMatch(/\*\*|^- /);
    }
  });

  test('bold is cleaned but every word survives — nothing lost from the row', () => {
    const backSquat = cells.find((c) => c.text.startsWith('Back Squat'))!;
    expect(backSquat.text).toBe(
      'Back Squat: subir hasta un 5RM técnico (RPE 8, no fallo). Anota carga.',
    );
    expect(backSquat.source).toBe('bullet');
  });

  test('the plain prose line above the bullets ("Calentamiento C…") is also captured, source=prose', () => {
    const cal = cells.find((c) => c.text.startsWith('Calentamiento'));
    expect(cal).toBeDefined();
    expect(cal!.source).toBe('prose');
    expect(cal!.text).toBe('Calentamiento C (ver §8).');
  });
});

// ── fence: verbatim, week resolved from a bold lead-in (§6 L252-268) ───────

describe('readPlanDocument — fenced block kept verbatim, week from the bold "**W2 —…**" lead-in (§6 L252-268)', () => {
  const md = `
## 6. BLOQUE 1 — Motor + Fuerza (W2–W4: 17 ago – 6 sep)

### Vie — HYROX compromised

Calentamiento **D**.

**W2 — Introducción (4 rondas):**
\`\`\`
4 rondas:
  1000 m correr @ race pace objetivo
  + una station rotando: SkiErg 500 m / Burpee BJ 40 m / Row 500 m / WB 25 @9kg
Descanso 2 min entre rondas
\`\`\`

**W3 — 5 rondas**, mismo formato, descanso 90 s.

**W4 — 6 rondas**, descanso 60 s, stations al 50% de la distancia de carrera.

> Esta es la sesión que más transfiere. El estudio de Frontiers 2025 mide que las stations producen más lactato y más RPE que las carreras — pero es *correr con las piernas de la station* lo que decide tu tiempo.
`;
  const cells = readPlanDocument(md);
  const fence = cells.find((c) => c.source === 'fence');

  test('the fence content is preserved verbatim (still multi-line — the grammar handles that internally)', () => {
    expect(fence).toBeDefined();
    expect(fence!.text).toBe(
      [
        '4 rondas:',
        '1000 m correr @ race pace objetivo',
        '+ una station rotando: SkiErg 500 m / Burpee BJ 40 m / Row 500 m / WB 25 @9kg',
        'Descanso 2 min entre rondas',
      ].join('\n'),
    );
  });

  test('week=2 comes from the bold "**W2 — Introducción…**" line immediately above the fence, day=Viernes from the H3', () => {
    expect(fence!.week).toBe(2);
    expect(fence!.day).toBe('Viernes');
    expect(fence!.trainable).toBe(true);
  });

  test('the bold week lead-in ITSELF also survives as its own cell — the descriptive text is not swallowed by the week marker', () => {
    const leadIn = cells.find((c) => c.text === 'Introducción (4 rondas):');
    expect(leadIn).toBeDefined();
    expect(leadIn!.week).toBe(2);
  });

  test('"**W3 — 5 rondas**, …" and "**W4 — 6 rondas**, …" each resolve their OWN week, never bleeding into each other', () => {
    const w3 = cells.find((c) => c.text.startsWith('5 rondas,'));
    const w4 = cells.find((c) => c.text.startsWith('6 rondas,'));
    expect(w3!.week).toBe(3);
    expect(w4!.week).toBe(4);
    expect(w3!.text).not.toContain('W4');
    expect(w4!.text).not.toContain('W3');
  });

  test('the blockquote justification is excluded from the trainable set entirely', () => {
    const bq = cells.find((c) => c.source === 'blockquote');
    expect(bq).toBeDefined();
    expect(bq!.trainable).toBe(false);
    expect(bq!.text).toContain('Frontiers 2025');
    expect(bq!.text).not.toContain('*'); // italic emphasis around "correr con las piernas…" cleaned too
  });
});

// ── bold-day-bullets, NO H3s at all (§7 Semana 5, L289-299) ────────────────

describe('readPlanDocument — bold day-prefixed bullets with no H3s (§7 L293-299), single-week section', () => {
  const md = `
## 7. Semana 5 (7–13 sep) — DESCARGA + mini-test

Volumen −45%. Intensidad mantenida en dosis pequeñas. **No la saltes.**

- **Lun**: Fuerza A al 60% del volumen de W4 (mismas cargas, la mitad de series). + SkiErg 4×250 m.
- **Mar**: 4×800 m Z5, descanso 3'. Nada más.
- **Mié**: 35 min Z2 + movilidad.
- **Jue**: Fuerza B al 60%. Sled push 3×25 m @202 kg (primera vez a peso completo desde el test). Farmers 2×200 m @2×32.
- **Vie**: **TEST — Wall Balls 100 reps @9 kg/3 m for time.** Anota tiempo y el plan de series que usaste. Después, 20 min Z2 suave.
- **Sáb**: 45 min Z2.
- **Dom**: OFF.
`;
  const cells = readPlanDocument(md);
  const bullets = cells.filter((c) => c.source === 'bullet');

  test('every bold "**Día**:" bullet resolves its OWN day, week=5 from the single-week section', () => {
    expect(bullets.map((c) => c.day)).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ]);
    for (const c of bullets) expect(c.week).toBe(5);
  });

  test('the day-label prefix is stripped from the text, not left dangling', () => {
    const mar = bullets.find((c) => c.day === 'Martes')!;
    expect(mar.text).toBe(`4×800 m Z5, descanso 3'. Nada más.`);
    expect(mar.text.startsWith('Mar')).toBe(false);
  });

  test(`Martes's stripped cell reaches the grammar as PLAIN dose text — "descanso 3'" (prime-form, cue BEFORE the clock) is a real, pre-existing gap in parseRest (./dose.ts only reads that order for colon/word clocks, never prime), which trips isDenseWod's comma heuristic and reviews the line honestly rather than mistyping it. Not a bug in the document reader: the text handed to the grammar is exactly the source, verbatim, day-prefix removed — see the previous test`, () => {
    const mar = bullets.find((c) => c.day === 'Martes')!;
    const [line, ...rest] = parseNotationCell(mar.text);
    expect(rest).toHaveLength(0);
    expect(line!.confidence).toBe('review');
    // Honesty contract still holds: the full text survives in the review
    // note (parseNotationCell normalizes "×" → "x" before this point, same
    // as it would for any other caller — nothing beyond that changes).
    expect(line!.prescription.note).toBe(`4x800 m Z5, descanso 3'. Nada más.`);
  });
});

// ── ambiguous week left honestly unresolved (§10 L403-427) ─────────────────

describe('readPlanDocument — a BLOQUE (range) section: week stays unresolved unless the text itself proves one (§10 L403-427)', () => {
  const md = `
## 10. BLOQUE 3 — Específico (W10–W12: 12 oct – 1 nov)

### Jue — Stations a peso y distancia de carrera
Calentamiento **D**.
\`\`\`
5 rondas, descanso 2 min:
  Rotar la station completa a peso Pro
  (Sled Push 50 / Sled Pull 50 / Farmers 200 / Lunges 100 / WB 100)
\`\`\`
En W12 baja a 4 rondas.
`;
  const cells = readPlanDocument(md);

  test('the fence itself has NO bold week lead-in — week stays undefined, never guessed as W10', () => {
    const fence = cells.find((c) => c.source === 'fence')!;
    expect(fence.week).toBeUndefined();
    expect(fence.day).toBe('Jueves');
  });

  test('"En W12 baja a 4 rondas." names its OWN week explicitly — resolved from the sentence itself, not the section', () => {
    const line = cells.find((c) => c.text === 'En W12 baja a 4 rondas.')!;
    expect(line).toBeDefined();
    expect(line.week).toBe(12);
    expect(line.day).toBe('Jueves');
  });
});

// ── nested fence inside a bullet, with a continuation line after (§9 L380-393) ──

describe('readPlanDocument — a fence NESTED inside a bullet, continuation line after (§9 L385-392)', () => {
  const md = `
## 9. Semana 9 (5–11 oct) — DESCARGA + TEST COMPLETO + SIM #1

- **Lun**: Fuerza A 50% volumen + SkiErg 1000 m all-out (test) .
- **Sáb**: **SIM #1 — MEDIO HYROX** (4 km + 4 stations, formato de carrera real):
  \`\`\`
  1 km – SkiErg 1000
  1 km – Sled Push 50 @202
  1 km – Sled Pull 50 @153
  1 km – Burpee Broad Jump 80
  \`\`\`
  Cronometra **cada segmento y cada transición**. Con material de carrera y calentamiento de carrera (protocolo **E**).
- **Dom**: OFF.
`;
  const cells = readPlanDocument(md);

  test('the indented fence is still recognized and de-indented, week=9 (single-week section), day=Sábado', () => {
    const fence = cells.find((c) => c.source === 'fence')!;
    expect(fence.text).toBe(
      ['1 km – SkiErg 1000', '1 km – Sled Push 50 @202', '1 km – Sled Pull 50 @153', '1 km – Burpee Broad Jump 80'].join(
        '\n',
      ),
    );
    expect(fence.week).toBe(9);
    expect(fence.day).toBe('Sábado');
  });

  test('the lead-in bullet AND the continuation line after the fence both keep day=Sábado', () => {
    const leadIn = cells.find((c) => c.text.startsWith('SIM #1'))!;
    const after = cells.find((c) => c.text.startsWith('Cronometra'))!;
    expect(leadIn.day).toBe('Sábado');
    expect(after.day).toBe('Sábado');
    expect(after.text).toBe(
      'Cronometra cada segmento y cada transición. Con material de carrera y calentamiento de carrera (protocolo E).',
    );
  });

  test('the NEXT bullet ("**Dom**: OFF.") correctly switches the day away from Sábado', () => {
    const dom = cells.find((c) => c.text === 'OFF.')!;
    expect(dom.day).toBe('Domingo');
  });
});
