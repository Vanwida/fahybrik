// document — a DOCUMENT reader: turns a coach's markdown TRAINING PLAN into
// clean CELLS the existing line grammar (parseNotationCell, ./notation.ts)
// can type. This module never parses a dose itself — dose.ts/target.ts/
// measure.ts/structure.ts/strength.ts/result.ts already own that, closed,
// and this file has ZERO dependency on any of them. Its job stops at
// STRUCTURE: headings → week/day, tables → the right per-orientation cells
// (see ./document-table.ts), bullets/prose → one cell per line, fenced code
// blocks → verbatim.
//
// THE BUG THIS FIXES — measured against the real 690-line plan this module
// was built against (health-planning/training/plan-95d-hyrox-singles-pro.md):
// a table with one column PER WEEK ("| Ejercicio | W2 | W3 | W4 |") is how
// that document writes the majority of its blocks. Read naively — flattening
// rows across columns — Back Squat's THREE weeks collapse into whatever
// `detected` grabs first, and worse, a table whose ROWS are the PARTS of one
// prescription ("| | W2 | W3 | W4 |" over Serie/Pace/Descanso) concatenates
// three weeks of "Nx" reps into one fabricated 19-rep set. Every table
// builder below produces one cell PER (row × week) — or, for that field-row
// shape, one cell per week with its fields correctly recombined — and NEVER
// lets two weeks' text touch inside a single cell (see document-table.ts's
// module comment for the row-semantics distinction that fix actually needs).
//
// HONESTY CONTRACT — same spirit as notation.ts's, one level up the pipeline:
//   · a cell's `week`/`day` is set ONLY when the document proves it (a table
//     column, a "SEMANA N" section, a bold "W7 —" lead-in, an unambiguous
//     in-line mention) — NEVER a default, NEVER the "first" of a range;
//   · a cell either carries a row/line WHOLE, or the source goes to
//     `table_unrecognized`/prose verbatim — this module never aplana
//     (flattens) or concatenates two rows/weeks into one text;
//   · non-training material (justifications, citations, nutrition tables,
//     tips) is marked `trainable:false`, never thrown away (`source` +
//     `text` still preserve it — see DocumentCell in ./document-types.ts).
//
// Calling parseNotationCell on the resulting cells, and everything after
// that (exercise resolution, building an EditorSession/proposal) is the
// CALLER's job — same division ./xlsx-reader.ts already has with
// ./build-proposal.ts, one layer over in web/lib/import.

import {
  cleanInlineMarkdown,
  findSingleWeekdayMention,
  findSingleWeekToken,
  foldAccents,
  headingLevel,
  headingText,
  isFenceDelimiter,
  isTableRow,
  isTableSeparatorRow,
  matchDayLabelPrefix,
  matchLeadingWeekday,
  matchLeadingWeekToken,
  splitTableRow,
  stripBulletMarker,
} from './document-markdown';
import { buildTableCells, type RawTable } from './document-table';
import type { DocumentCell } from './document-types';

export type { CellSource, DocumentCell } from './document-types';

// ── Section classification (training vs. context) ───────────────────────────

interface Heading {
  level: number;
  text: string;
  line: number;
}

function scanHeadings(lines: readonly string[]): Heading[] {
  const out: Heading[] = [];
  lines.forEach((raw, i) => {
    const level = headingLevel(raw);
    if (level > 0) out.push({ level, text: headingText(raw), line: i + 1 });
  });
  return out;
}

const PROTOCOL_LETTER_RE = /^\(?([A-H])\)\s*/;

/** A day-scheduled subsection: its H3 names a weekday ("Lun 10 —…", "Vie —…")
 *  or a §13-style reusable-protocol letter ("**A) Base RAMP…**"). */
function isTrainingSubheading(headingRaw: string): boolean {
  const cleaned = cleanInlineMarkdown(headingRaw);
  if (matchLeadingWeekday(cleaned)) return true;
  return PROTOCOL_LETTER_RE.test(cleaned);
}

/** A "- **Sáb**: …" bold day-prefixed bullet (§7/§9/§11/§12's shape). MUST
 *  verify the bolded word is an actual weekday — not just "starts with a
 *  bold marker" (§14's "- **Beta-alanina 5 g/día** — necesita…" also starts
 *  that way and is not a day at all; a loose check here used to flip the
 *  ENTIRE Tips section to `training` and leak its nutrition/metrics tables
 *  into the trainable set). Reuses matchDayLabelPrefix — the exact matcher
 *  the main scan below applies to these same bullets — so this check and
 *  the real day-extraction can never drift apart. */
function isBoldDayBullet(rawLine: string): boolean {
  const bullet = stripBulletMarker(rawLine.trim());
  if (!bullet) return false;
  return matchDayLabelPrefix(cleanInlineMarkdown(bullet.text)) !== null;
}

/** A "| Día | Sesión |" table header — §12's RACE WEEK writes its whole week
 *  this way with NO day H3s and NO bold day-prefixed bullets at all, so
 *  neither of the other two signals below would ever fire for it. */
function isDaySessionTableHeader(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = splitTableRow(line).map((c) => foldAccents(cleanInlineMarkdown(c)));
  return cells.length === 2 && cells[0] === 'dia' && cells[1] === 'sesion';
}

/**
 * TRAINING vs CONTEXT, decided STRUCTURALLY — never from a heading's wording
 * (a title like "Volumen de wall balls" names no day, yet the section it
 * introduces is a real W2–W4 dose table; "Trabajo de RoxZone" names no day
 * either and genuinely is a behavioural aside, not a prescription — a
 * wording-based guess cannot tell these apart, but their STRUCTURE can):
 * an H2 section is `training` when its body contains ANY of — a day/protocol
 * H3, a bold day-prefixed bullet (the §7/§9/§11 shape, no H3s at all), or a
 * "Día | Sesión" table header (§12's shape, no H3s AND no bold bullets
 * either — the whole week lives in table rows). Everything else — targets,
 * macro overview, methodology asides, tips, open questions — is `context`:
 * still captured (see DocumentCell.trainable), never typed.
 */
function classifySectionKind(
  lines: readonly string[],
  bodyStartIdx: number,
  bodyEndIdx: number,
): 'training' | 'context' {
  for (let i = bodyStartIdx; i < bodyEndIdx && i < lines.length; i++) {
    const raw = lines[i]!;
    if (headingLevel(raw) === 3 && isTrainingSubheading(headingText(raw))) return 'training';
    if (headingLevel(raw) === 0) {
      const trimmed = raw.trim();
      if (isBoldDayBullet(trimmed)) return 'training';
      if (isDaySessionTableHeader(trimmed)) return 'training';
    }
  }
  return 'context';
}

/** "SEMANA 1 (10–16 ago)…" / "Semana 5 (7–13 sep)…" → 1 / 5 — a SINGLE week.
 *  Deliberately refuses a "BLOQUE …(W2–W4: …)" range heading: collapsing a
 *  range to one guessed week is exactly what this module must never do. */
function singleWeekFromH2(h2Raw: string): number | undefined {
  if (/\bW\d{1,2}\s*[-–—]\s*W?\d{1,2}\b/i.test(h2Raw)) return undefined;
  const m = cleanInlineMarkdown(h2Raw).match(/\bsemana\s+(\d{1,2})\b/i);
  return m ? parseInt(m[1]!, 10) : undefined;
}

// ── Context carried while scanning ───────────────────────────────────────────

// `| undefined` throughout (not just `?:`): shared/tsconfig.json's
// exactOptionalPropertyTypes flag makes those two subtly different, and
// this scan resets fields by ASSIGNING undefined (e.g. `ctx.h3 = undefined`
// on every new H2), not by deleting the key — see DocumentCell's own doc
// comment in ./document-types.ts for the same reasoning.
interface Ctx {
  h2?: string | undefined;
  h3?: string | undefined;
  sectionKind: 'training' | 'context';
  /** Fixed for the WHOLE section when its H2 names exactly one week. */
  sectionWeek?: number | undefined;
  /** Sticky: sourced from the nearest day-named H3 or a bold day-prefixed
   *  bullet ("**Sáb**:"); persists across lines (and into a table/fence
   *  right after) until the next H2/H3 or a NEW day prefix overrides it. */
  currentDay?: string | undefined;
  currentDate?: string | undefined;
  /** Sticky within the current H3/H2: a bold "**W7 —…**" lead-in applies to
   *  its own line AND to whatever fence immediately follows it. Reset on
   *  every heading change and every new day-prefixed bullet. */
  pendingWeek?: number | undefined;
}

let cellSeq = 0;
function makeId(line: number): string {
  cellSeq += 1;
  return `L${line}-${cellSeq}`;
}

function finishCell(partial: Omit<DocumentCell, 'id' | 'h2' | 'h3'>, ctx: Ctx): DocumentCell {
  return { id: makeId(partial.line), h2: ctx.h2, h3: ctx.h3, ...partial };
}

/**
 * Read the whole markdown plan and return its clean, placement-annotated
 * cells. See this module's header comment for the honesty contract; see
 * ./document-table.ts for how each table orientation is detected and split.
 */
export function readPlanDocument(markdown: string): DocumentCell[] {
  cellSeq = 0; // deterministic ids per call — this function is otherwise pure
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const h2s = scanHeadings(lines).filter((h) => h.level === 2);

  const cells: DocumentCell[] = [];
  const ctx: Ctx = { sectionKind: 'context' };
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (!trimmed) {
      i++;
      continue;
    }

    const level = headingLevel(trimmed);
    if (level === 1) {
      i++;
      continue;
    }
    if (level === 2) {
      const text = headingText(trimmed);
      ctx.h2 = text;
      ctx.h3 = undefined;
      ctx.currentDay = undefined;
      ctx.currentDate = undefined;
      ctx.pendingWeek = undefined;
      ctx.sectionWeek = singleWeekFromH2(text);
      const idx = h2s.findIndex((h) => h.line === i + 1);
      const nextH2Line = idx >= 0 && h2s[idx + 1] ? h2s[idx + 1]!.line - 1 : lines.length;
      ctx.sectionKind = classifySectionKind(lines, i + 1, nextH2Line);
      i++;
      continue;
    }
    if (level >= 3) {
      const text = headingText(trimmed);
      ctx.h3 = text;
      ctx.pendingWeek = undefined;
      const wd = matchLeadingWeekday(cleanInlineMarkdown(text));
      ctx.currentDay = wd?.day;
      ctx.currentDate = wd?.date;
      i++;
      continue;
    }

    if (isFenceDelimiter(trimmed)) {
      const startLine = i + 1;
      const body: string[] = [];
      i++;
      while (i < lines.length && !isFenceDelimiter(lines[i]!.trim())) {
        body.push(lines[i]!.trim());
        i++;
      }
      i++; // skip the closing fence (or EOF — an unterminated fence still ends here)
      const text = body.join('\n').trim();
      if (text) {
        cells.push(
          finishCell(
            {
              text,
              source: 'fence',
              trainable: ctx.sectionKind === 'training',
              week: ctx.sectionKind === 'training' ? (ctx.sectionWeek ?? ctx.pendingWeek) : undefined,
              day: ctx.sectionKind === 'training' ? ctx.currentDay : undefined,
              date: ctx.sectionKind === 'training' ? ctx.currentDate : undefined,
              line: startLine,
            },
            ctx,
          ),
        );
      }
      continue;
    }

    if (trimmed.startsWith('>')) {
      const text = cleanInlineMarkdown(trimmed.replace(/^>+\s?/, ''));
      if (text) {
        cells.push(finishCell({ text, source: 'blockquote', trainable: false, line: i + 1 }, ctx));
      }
      i++;
      continue;
    }

    if (isTableRow(trimmed) && isTableSeparatorRow(lines[i + 1]?.trim() ?? '')) {
      const headerRaw = raw;
      const header = splitTableRow(trimmed);
      const headerLine = i + 1;
      i += 2; // header + separator
      const rows: RawTable['rows'] = [];
      while (i < lines.length && isTableRow(lines[i]!.trim())) {
        rows.push({ cells: splitTableRow(lines[i]!), raw: lines[i]!, line: i + 1 });
        i++;
      }
      const table: RawTable = { header, headerRaw, rows, headerLine };
      const drafts = buildTableCells(table, ctx.sectionKind === 'training');
      for (const d of drafts) {
        cells.push(
          finishCell(
            {
              ...d,
              week: d.week ?? (d.trainable ? ctx.sectionWeek : undefined),
              day: d.day ?? (d.trainable ? ctx.currentDay : undefined),
              date: d.date ?? (d.trainable ? ctx.currentDate : undefined),
            },
            ctx,
          ),
        );
      }
      continue;
    }

    // Bullet or prose — one cell per physical line.
    const bullet = stripBulletMarker(trimmed);
    const cleaned = cleanInlineMarkdown(bullet ? bullet.text : trimmed);

    let body = cleaned;
    const dayMatch = matchDayLabelPrefix(body);
    if (dayMatch) {
      // A bold day-prefixed bullet ("**Sáb**: 45 min Z2." → "Sáb: 45 min
      // Z2." once cleaned) — the §7/§9/§11/§12 shape that compresses a
      // whole day's content into one line with no H3 of its own.
      ctx.currentDay = dayMatch.day;
      ctx.currentDate = dayMatch.date;
      ctx.pendingWeek = undefined;
      body = dayMatch.rest;
    }
    const weekMatch = matchLeadingWeekToken(body);
    if (weekMatch) {
      ctx.pendingWeek = weekMatch.week;
      body = weekMatch.rest;
    }

    if (body) {
      const trainable = ctx.sectionKind === 'training';
      let week: number | undefined;
      let day: string | undefined;
      if (trainable) {
        week = ctx.sectionWeek ?? ctx.pendingWeek ?? findSingleWeekToken(body);
        if (ctx.currentDay === undefined) {
          const inline = findSingleWeekdayMention(body);
          if (inline) ctx.currentDay = inline; // sticky — seeds a table/fence right after too
        }
        day = ctx.currentDay;
      }
      cells.push(
        finishCell(
          {
            text: body,
            source: bullet ? 'bullet' : 'prose',
            trainable,
            week,
            day,
            date: trainable ? ctx.currentDate : undefined,
            line: i + 1,
          },
          ctx,
        ),
      );
    }
    i++;
  }

  return cells;
}
