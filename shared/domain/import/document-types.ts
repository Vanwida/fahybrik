// document-types — the output shape of shared/domain/import/document.ts, split
// into its own file so document-table.ts can share it without importing the
// orchestrator (would-be circular: document.ts imports buildTableCells FROM
// document-table.ts).
//
// A DocumentCell is NOT a typed prescription — it is a clean, lossless piece
// of TEXT plus the placement the source document actually proved (never a
// guess; see document.ts's module comment for the full honesty contract).
// Feeding `text` to `parseNotationCell` (./notation.ts) is the caller's job.

/** Where a cell's text came from in the source markdown — the shape of the
 *  match drives HOW cells were assembled (see document-table.ts for the four
 *  table sub-shapes), and matters for anyone triaging `needsReview`. */
export type CellSource =
  | 'table_weeks_exercise' // | Ejercicio | W2 | W3 | W4 | — one cell per (row × week)
  | 'table_weeks_field' // | | W2 | W3 | W4 | with rows = Serie/Pace/Descanso — one cell per week, fields combined
  | 'table_series' // | Serie | Carga | Reps | (the §13 C barbell ramp) — the WHOLE table is one cell
  | 'table_day_session' // | Día | Sesión | — one cell per day row
  | 'table_name_dose' // | Ejercicio | Dosis | (a reusable warm-up/priming protocol) — one cell per row
  | 'table_unrecognized' // orientation not confidently identified — the whole table, verbatim, to review
  | 'table_context' // a table outside any training subsection (targets, macro overview, nutrition…) — never typed
  | 'bullet' // a "- " / "N. " list item, one cell per physical line
  | 'prose' // a plain paragraph physical line, one cell per line
  | 'fence' // a ``` fenced block, verbatim, one cell for the whole block
  | 'blockquote'; // a "> " aside/justification — never typed

export interface DocumentCell {
  /** Stable within one readPlanDocument() call — NOT a persistence id. */
  id: string;
  /** Clean, grammar-ready text. Markdown emphasis/links/bullets are stripped;
   *  nothing the source row/line said is dropped (a cell either carries the
   *  WHOLE row faithfully or the row goes to `table_unrecognized` verbatim —
   *  see document.ts's module comment). */
  text: string;
  source: CellSource;
  /** Whether this cell is even a CANDIDATE for the training grammar. False
   *  for context material (targets, macro overview, tips, nutrition, asides,
   *  citations) — see point 5 of the module contract: "no se tipa", but never
   *  thrown away either. */
  trainable: boolean;
  /** Set ONLY when the document proves a single week — a table's own W-column,
   *  a "SEMANA N" section, a bold "**W7 —…**" lead-in, or an unambiguous
   *  in-line "W12"/"Semana 12" mention. A cell whose week cannot be proven
   *  (a range section with no closer signal, or text naming MORE than one
   *  week) leaves this unset — never a default, never a guess.
   *
   *  Typed `| undefined` (not just `?:`) throughout this interface on
   *  purpose: shared/tsconfig.json turns on `exactOptionalPropertyTypes`,
   *  and the builder code below assembles these fields from `??`-chains
   *  that resolve to `T | undefined` and assigns them directly (rather than
   *  conditionally spreading the key in or out) — the explicit `undefined`
   *  member is what keeps that construction style legal under that flag. */
  week?: number | undefined;
  /** Canonical Spanish weekday name ("Lunes".."Domingo"), set the same
   *  evidence-only way as `week`. */
  day?: string | undefined;
  /** Day-of-month, verbatim, when the source states it ("Lun 10" → "10"). */
  date?: string | undefined;
  /** Breadcrumb: the enclosing H2/H3 heading text (verbatim, for traceability). */
  h2?: string | undefined;
  h3?: string | undefined;
  /** 1-based source line number (the row's own line for a table cell; the
   *  physical line for bullet/prose/blockquote; the opening fence for a fence). */
  line: number;
  /** True when the STRUCTURE itself is uncertain — an unrecognized table
   *  orientation. A human must resolve placement/typing; the text is never
   *  discarded meanwhile. */
  needsReview?: boolean | undefined;
  reviewReason?: string | undefined;
}
