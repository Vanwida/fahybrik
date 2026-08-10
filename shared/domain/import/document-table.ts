// document-table — turns ONE parsed GFM table (header + rows, still raw) into
// DocumentCell drafts, by ORIENTATION. This is the fix for the measured bug:
// today's importer reads a "columns = weeks" table by flattening every row
// across every week into one fabricated concatenation (`| Serie | 6×800 m |
// 5×1000 m | 8×600 m |` → "19 repeticiones"). Every builder below instead
// produces one cell per (row × week) — or, for the field-row shape below,
// one cell PER WEEK with that week's fields combined into ONE coherent line —
// and NEVER lets two weeks' text touch inside a single cell.
//
// Orientation is read from the HEADER, never guessed from content:
//   · every non-label column header is "W<n>"              → weeks
//   · header is exactly ["Día", "Sesión"]                   → day_session
//   · header is exactly 3 columns, first is "Serie"          → series (§13 C
//     barbell ramp — heterogeneous sets, the WHOLE table is ONE prescription)
//   · header is exactly 2 columns, first is "Zona"            → unrecognized
//     (a zone→formula REFERENCE table, the twin of the 3-column "Zona | Pace
//     | Uso" right above it — never a schedulable dose; see classifyOrientation)
//   · any other 2-column table                               → name_dose (a
//     reusable protocol: "Ejercicio | Dosis", "Station del día | Priming")
//   · anything else                                          → unrecognized:
//     the whole table goes verbatim to review, never force-fit.
//
// The weeks orientation has ONE more real distinction this document forces:
// ROW semantics. Some weeks-tables have EXERCISE rows (Back Squat, Front
// Squat…) — combine row-label + that week's cell, one cell per (row × week).
// Others have FIELD rows (Serie/Pace/Descanso — three PARTS of the SAME
// interval prescription, not three exercises) — combining those as if they
// were exercises would fabricate three nonsense pseudo-movements named
// "Serie"/"Pace"/"Descanso" (a NEW bug in the opposite direction: fragmenting
// one session into fake exercises instead of merging weeks into one). A
// table is field-rows ONLY when every one of its (non-excluded) rows matches
// a small, closed vocabulary this file owns — never inferred from "no label
// column" alone (the Sáb Largo table below has no label column either and is
// NOT a field-row table, it is a single implicit bout).

import { cleanInlineMarkdown, foldAccents, matchLeadingWeekday } from './document-markdown';
import type { CellSource, DocumentCell } from './document-types';

export interface RawTableRow {
  cells: string[];
  /** Original, UNMODIFIED source line — used verbatim by the unrecognized
   *  path so "va verbatim a revisión" means exactly that. */
  raw: string;
  line: number;
}

export interface RawTable {
  header: string[];
  headerRaw: string;
  rows: RawTableRow[];
  headerLine: number;
}

export type Draft = Omit<DocumentCell, 'id' | 'h2' | 'h3'>;

// ── Header → orientation ─────────────────────────────────────────────────────

type WeeksOrDayOrSeriesOrNameDose = 'weeks' | 'day_session' | 'series' | 'name_dose' | 'unrecognized';

const WEEK_COL_RE = /^w\s?(\d{1,2})$/;

function weekColumnNumber(headerCell: string): number | null {
  const m = foldAccents(cleanInlineMarkdown(headerCell)).match(WEEK_COL_RE);
  return m ? parseInt(m[1]!, 10) : null;
}

export interface OrientationResult {
  kind: WeeksOrDayOrSeriesOrNameDose;
  /** Only meaningful when kind==='weeks': whether column 0 is a row LABEL
   *  (an exercise/field name) or itself already a week column (the Sáb Largo
   *  shape — a single unlabeled row, "| W2 | W3 | W4 |" with no 4th, label
   *  column at all). */
  hasLabelColumn: boolean;
  weekColumns: Array<{ colIndex: number; week: number }>;
}

export function classifyOrientation(rawHeader: string[]): OrientationResult {
  const header = rawHeader.map((h) => cleanInlineMarkdown(h));
  const weekOf = header.map(weekColumnNumber);

  if (header.length >= 1 && weekOf.every((w) => w !== null)) {
    return {
      kind: 'weeks',
      hasLabelColumn: false,
      weekColumns: weekOf.map((w, i) => ({ colIndex: i, week: w! })),
    };
  }
  if (header.length >= 2 && weekOf[0] === null && weekOf.slice(1).every((w) => w !== null)) {
    return {
      kind: 'weeks',
      hasLabelColumn: true,
      weekColumns: weekOf
        .map((w, i) => ({ colIndex: i, week: w as number }))
        .filter((c) => c.colIndex > 0),
    };
  }

  const folded = header.map((h) => foldAccents(h));
  if (header.length === 2 && folded[0] === 'dia' && folded[1] === 'sesion') {
    return { kind: 'day_session', hasLabelColumn: true, weekColumns: [] };
  }
  if (header.length === 3 && folded[0] === 'serie') {
    return { kind: 'series', hasLabelColumn: true, weekColumns: [] };
  }
  // "Zona | % HRmax" (§5) is the 2-column TWIN of "Zona | Pace | Uso" right
  // above it in the same document — both are REFERENCE/lookup tables (a zone
  // NAME mapped to a formula), never a schedulable dose. The 3-column form
  // already misses every other orientation and correctly falls to
  // `unrecognized` below; without this guard the 2-column form would
  // wrongly claim the generic name_dose catch-all instead — and it is not a
  // harmless miss: "Z2 65–75%" DOES type `detected` (parseBout reads "Z2" as
  // a real zone target), silently dropping the "65–75%" that was the row's
  // entire point and fabricating a bare, nameless "steady Z2" bout that was
  // never a session to schedule. `folded[0]==='zona'` is the same header-
  // driven, evidence-grounded signal every other orientation above uses —
  // not a guess from content.
  if (header.length === 2 && folded[0] === 'zona') {
    return { kind: 'unrecognized', hasLabelColumn: false, weekColumns: [] };
  }
  if (header.length === 2) {
    return { kind: 'name_dose', hasLabelColumn: true, weekColumns: [] };
  }
  return { kind: 'unrecognized', hasLabelColumn: false, weekColumns: [] };
}

// ── weeks: exercise-row vs field-row ─────────────────────────────────────────

// A CLOSED vocabulary, grounded in the real document (never speculative): a
// row whose label folds to one of these NAMES A PART of one prescription
// (the interval count, its pace, its rest, or — "sesion" (§8 L326, "Mar —
// Umbral / VO2 running") — the WHOLE session as a single degenerate field,
// same shape as the Sáb Largo table's un-labelled row, just spelled out)
// rather than a movement. "Total"/"Suma" are the OTHER real non-exercise
// shape seen (a computed checksum row, e.g. wall-ball reps summed) —
// excluded from typing entirely, kept as a `table_context` note so the
// number is still visible, never silently gone.
const FIELD_ROW_LABELS = new Set([
  'serie',
  'series',
  'sesion',
  'pace',
  'ritmo',
  'descanso',
  'recuperacion',
  'rest',
  'recovery',
]);
const EXCLUDED_ROW_LABELS = new Set(['total', 'suma', 'subtotal']);
const REST_FIELD_LABELS = new Set(['descanso', 'recuperacion', 'rest', 'recovery']);

type RowLabelKind = 'field' | 'excluded' | 'exercise';

function rowLabelKind(rawLabel: string): RowLabelKind {
  const folded = foldAccents(cleanInlineMarkdown(rawLabel));
  if (!folded) return 'field'; // no label column at all — one implicit field row (Sáb Largo)
  if (EXCLUDED_ROW_LABELS.has(folded)) return 'excluded';
  if (FIELD_ROW_LABELS.has(folded)) return 'field';
  return 'exercise';
}

/** A field row's VALUE, prefixed with its own rest cue when needed so the
 *  grammar's own rest reader (parseRest, ./dose.ts) can find it once the
 *  fields are joined into one line — a plain "2:30 trote" cell carries no
 *  "descanso" word of its own (only the ROW LABEL said "Descanso"; that label
 *  is dropped once combined), so the cue has to travel WITH the value or the
 *  rest is silently lost the moment the three fields become one sentence.
 *
 *  Joined with a plain SPACE, never a comma: notation.ts's own dispatcher
 *  (parseLine) reads a comma as a candidate "trailing clause" boundary and,
 *  when it can't fully resolve that clause (e.g. a REST it cannot itself
 *  parse — a real, separate gap in dose.ts's parseRest, see the fidelity
 *  suite), falls back to counting comma-separated segments as an
 *  isDenseWod signal — turning a perfectly typeable recombined interval into
 *  a spurious "dense multi-station WOD" review. parseBout (./bout.ts) finds
 *  a rest cue anywhere in its input regardless of a leading comma, so the
 *  space join loses nothing and sidesteps that trap entirely. */
function joinFieldValue(rawLabel: string, rawValue: string): string {
  const folded = foldAccents(cleanInlineMarkdown(rawLabel));
  const value = cleanInlineMarkdown(rawValue);
  if (!value) return '';
  return REST_FIELD_LABELS.has(folded) ? `descanso ${value}` : value;
}

const BLANK_CELL_RE = /^[-—–]$/;

function buildWeeksCells(table: RawTable, orient: OrientationResult): Draft[] {
  const out: Draft[] = [];
  const labeled = table.rows.map((row) => ({
    row,
    label: orient.hasLabelColumn ? (row.cells[0] ?? '') : '',
    kind: orient.hasLabelColumn ? rowLabelKind(row.cells[0] ?? '') : ('field' as RowLabelKind),
  }));

  for (const { row, label, kind } of labeled) {
    if (kind !== 'excluded') continue;
    const text = cleanInlineMarkdown([label, ...row.cells.slice(1)].filter(Boolean).join(' — '));
    if (text) out.push({ text, source: 'table_context', trainable: false, line: row.line });
  }

  const considered = labeled.filter((r) => r.kind !== 'excluded');
  const isFieldTable = considered.length > 0 && considered.every((r) => r.kind === 'field');

  if (isFieldTable) {
    for (const { colIndex, week } of orient.weekColumns) {
      const parts = considered
        .map((r) => joinFieldValue(r.label, r.row.cells[colIndex] ?? ''))
        .filter(Boolean);
      if (parts.length === 0) continue;
      out.push({
        text: parts.join(' '),
        source: 'table_weeks_field' satisfies CellSource,
        trainable: true,
        week,
        line: considered[0]!.row.line,
      });
    }
    return out;
  }

  // considered is already excluded-filtered above, and this branch (NOT a
  // field table) treats every remaining row as an exercise row — kind isn't
  // needed again per-row here.
  for (const { row, label } of considered) {
    const name = cleanInlineMarkdown(label);
    for (const { colIndex, week } of orient.weekColumns) {
      const raw = row.cells[colIndex];
      if (raw === undefined || !raw.trim() || BLANK_CELL_RE.test(raw.trim())) continue;
      const dose = cleanInlineMarkdown(raw);
      if (!dose) continue;
      out.push({
        text: name ? `${name} ${dose}` : dose,
        source: 'table_weeks_exercise' satisfies CellSource,
        trainable: true,
        week,
        line: row.line,
      });
    }
  }
  return out;
}

// ── day_session: | Día | Sesión | ───────────────────────────────────────────

function buildDaySessionCells(table: RawTable): Draft[] {
  const out: Draft[] = [];
  for (const row of table.rows) {
    const text = cleanInlineMarkdown(row.cells[1] ?? '');
    if (!text) continue;
    const wd = matchLeadingWeekday(cleanInlineMarkdown(row.cells[0] ?? ''));
    out.push({
      text,
      source: 'table_day_session',
      trainable: true,
      day: wd?.day,
      date: wd?.date,
      line: row.line,
    });
  }
  return out;
}

// ── series: | Serie | Carga | Reps | (§13 C) — the WHOLE table is one cell ──
// A heterogeneous ramp ("barra vacía x8", "40% x5", "60% x3", "80% x2") has no
// single-line shorthand the closed dose grammar is guaranteed to type (row 1's
// load is descriptive text, not a number) — that is a real, honest limit of
// notation.ts, not something this reader invents around. The job here is only
// to lose NOTHING: every row's every field, faithfully joined into one cell.

function buildSeriesCell(table: RawTable): Draft[] {
  const parts = table.rows
    .map((r) => {
      const [, ...fields] = r.cells;
      return cleanInlineMarkdown(fields.filter((f) => f && f.trim()).join(' @ '));
    })
    .filter(Boolean);
  if (parts.length === 0) return [];
  return [
    {
      text: parts.join(' / '),
      source: 'table_series',
      trainable: true,
      line: table.rows[0]?.line ?? table.headerLine,
    },
  ];
}

// ── name_dose: | Ejercicio | Dosis | / | Station del día | Priming | ───────

// The race-day warm-up timeline (§13 E) labels its rows with COUNTDOWN marks
// ("T−40'", "T−20'") — not a movement name. Concatenating "T−40'" onto its own
// row's dose text would hand the grammar a SECOND clock it never wrote
// ("T−40' Trote muy suave 10 min…"), corrupting the one real duration with a
// fabricated extra one. A timestamp label is metadata, not part of the dose.
const TIMESTAMP_LABEL_RE = /^t\s*[−-]\s*\d+'?$/;

function buildNameDoseCells(table: RawTable): Draft[] {
  const out: Draft[] = [];
  for (const row of table.rows) {
    const dose = cleanInlineMarkdown(row.cells[1] ?? '');
    if (!dose) continue;
    const rawLabel = cleanInlineMarkdown(row.cells[0] ?? '');
    const isTimestamp = TIMESTAMP_LABEL_RE.test(foldAccents(rawLabel));
    const text = !rawLabel || isTimestamp ? dose : `${rawLabel} ${dose}`;
    out.push({ text, source: 'table_name_dose', trainable: true, line: row.line });
  }
  return out;
}

// ── unrecognized: whole table, verbatim, to review ──────────────────────────

function buildUnrecognizedCell(table: RawTable): Draft[] {
  const text = [table.headerRaw, ...table.rows.map((r) => r.raw)].join('\n');
  return [
    {
      text,
      source: 'table_unrecognized',
      trainable: true,
      needsReview: true,
      reviewReason: 'orientación de tabla no reconocible con seguridad — verbatim para revisión humana',
      line: table.headerLine,
    },
  ];
}

// ── context: a table outside any training subsection ───────────────────────

function buildContextCells(table: RawTable): Draft[] {
  const out: Draft[] = [];
  for (const r of table.rows) {
    const text = cleanInlineMarkdown(r.cells.join(' — '));
    if (text) out.push({ text, source: 'table_context', trainable: false, line: r.line });
  }
  return out;
}

// ── entry point ──────────────────────────────────────────────────────────────

export function buildTableCells(table: RawTable, trainableSection: boolean): Draft[] {
  if (!trainableSection) return buildContextCells(table);

  const orient = classifyOrientation(table.header);
  switch (orient.kind) {
    case 'weeks':
      return buildWeeksCells(table, orient);
    case 'day_session':
      return buildDaySessionCells(table);
    case 'series':
      return buildSeriesCell(table);
    case 'name_dose':
      return buildNameDoseCells(table);
    case 'unrecognized':
      return buildUnrecognizedCell(table);
  }
}
