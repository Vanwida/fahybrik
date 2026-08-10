// document-markdown — GENERIC markdown line utilities for the document reader
// (./document.ts, ./document-table.ts). Nothing here knows about training,
// weeks, or the dose grammar — it only knows markdown syntax (headings, list
// markers, table rows, fences, inline emphasis) plus a small, closed weekday
// vocabulary the plan itself uses ("Lun", "Mar", "Sáb 14"…). Kept separate so
// the domain-specific modules stay focused on STRUCTURE, not syntax.

// ── Accent/case folding (local — document.ts stays decoupled from dose.ts) ──

/** Lowercase + strip accents + trim — the comparison form used throughout
 *  this file and document-table.ts. Deliberately NOT imported from
 *  ../dose.ts's `foldText`: the document reader has zero coupling to the
 *  dose grammar by design (it structures the document; the grammar types
 *  cells — see document.ts's module comment), and this is a one-line, fully
 *  generic string utility, not "dose logic". */
export function foldAccents(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// ── Inline markdown cleaning ─────────────────────────────────────────────────

/** Strip a leading GFM checkbox marker ("- [ ] " already had its "- " bullet
 *  removed by the caller; this handles the "[ ] "/"[x] " that remains). */
const CHECKBOX_RE = /^\[[ xX]\]\s*/;

/**
 * "**negrita**", "- ", "#", links, code spans → plain readable text, with
 * NOTHING lost — the encargo's own example list. Order matters: bold (2
 * markers) is stripped BEFORE italic (1 marker) so a bold span never leaves a
 * stray single "*" behind for the italic pass to mis-pair with an unrelated
 * one elsewhere in the line.
 */
export function cleanInlineMarkdown(s: string): string {
  let out = s;
  out = out.replace(CHECKBOX_RE, '');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1'); // [text](url) → text
  out = out.replace(/\*\*(.+?)\*\*/g, '$1'); // **bold**
  out = out.replace(/__(.+?)__/g, '$1'); // __bold__
  out = out.replace(/~~(.+?)~~/g, '$1'); // ~~strike~~
  out = out.replace(/`([^`]+)`/g, '$1'); // `code`
  // Single-marker emphasis: guarded so a digit-adjacent "*" (never used in
  // this plan — multiplication is always "×") is left alone rather than risk
  // eating a stray asterisk as an unmatched emphasis marker.
  out = out.replace(/(?<![\w*])\*(?!\*)([^*]+?)\*(?!\*)(?![\w*])/g, '$1');
  out = out.replace(/(?<!_)_(?!_)([^_]+?)_(?!_)(?!_)/g, '$1');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

// ── Headings ─────────────────────────────────────────────────────────────────

export function headingLevel(line: string): number {
  const m = line.match(/^(#{1,6})\s+/);
  return m ? m[1]!.length : 0;
}

/** The heading's raw text (still carrying any inline markdown — callers that
 *  need to pattern-match a bold "**A) …**" protocol letter clean it THEMSELVES
 *  after this, same as any other line). */
export function headingText(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').trim();
}

// ── List markers ─────────────────────────────────────────────────────────────

const BULLET_RE = /^(?:[-*•]\s+|\d{1,3}[.)]\s+)/;

/** A "- "/"* "/"• " or "N. "/"N) " list marker stripped from the front, or
 *  null when the line isn't a list item at all. */
export function stripBulletMarker(line: string): { text: string; ordered: boolean } | null {
  const m = line.match(BULLET_RE);
  if (!m) return null;
  return { text: line.slice(m[0].length), ordered: /\d/.test(m[0]) };
}

// ── Fences ───────────────────────────────────────────────────────────────────

export function isFenceDelimiter(line: string): boolean {
  return line.trim().startsWith('```');
}

// ── GFM tables ───────────────────────────────────────────────────────────────

export function isTableRow(line: string): boolean {
  return line.trim().startsWith('|');
}

const TABLE_SEP_RE = /^\|?[\s:|-]+\|?$/;

/** The "|---|---|---|" divider row every GFM table carries right under its
 *  header. Required by the caller to CONFIRM a `|`-leading line is really a
 *  table header and not, say, a coach writing a literal "|" in prose. */
export function isTableSeparatorRow(line: string): boolean {
  const t = line.trim();
  return t.includes('-') && TABLE_SEP_RE.test(t);
}

/** One table row's cells, trimmed, with the outer pipes and any escaped
 *  "\|" resolved. Splits on UNESCAPED pipes only. */
export function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

// ── Weekday vocabulary ───────────────────────────────────────────────────────
// The plan's own closed set: Lunes..Domingo, each with a 3-letter abbreviation
// ("Lun", "Mar", "Mié"…). Matching REQUIRES an exact fold match against one of
// these two forms — never a loose prefix — so an unrelated word ("Marca",
// "Marzo") is never mistaken for a day label.

interface Weekday {
  full: string;
  abbrev: string;
}

const WEEKDAYS: readonly Weekday[] = [
  { full: 'Lunes', abbrev: 'lun' },
  { full: 'Martes', abbrev: 'mar' },
  { full: 'Miércoles', abbrev: 'mie' },
  { full: 'Jueves', abbrev: 'jue' },
  { full: 'Viernes', abbrev: 'vie' },
  { full: 'Sábado', abbrev: 'sab' },
  { full: 'Domingo', abbrev: 'dom' },
];

function weekdayFromToken(token: string): Weekday | undefined {
  const folded = foldAccents(token);
  return WEEKDAYS.find((w) => folded === w.abbrev || folded === foldAccents(w.full));
}

/** A weekday token (full name OR 3-letter abbreviation) leading `text`,
 *  optionally followed by a day-of-month and/or a "—"/":" separator —
 *  "Lun 10 —", "Mar —", "Sáb" (bare, nothing after — a real §10 heading
 *  shape). Used for HEADINGS, where a bare day name with no trailing content
 *  is valid on its own. Returns the matched day + optional date + whatever
 *  follows; null when the leading word isn't a real day name. For a bullet's
 *  "Día: …" LABEL prefix (which must always have real content after the
 *  colon), use matchDayLabelPrefix instead — a bare match here would wrongly
 *  treat "Vie" alone as a strippable prefix of an empty rest. */
export function matchLeadingWeekday(
  text: string,
): { day: string; date?: string | undefined; rest: string } | null {
  const m = text.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ]+)\.?\s*(\d{1,2})?\s*(?:[-—–:]\s*)?/);
  if (!m) return null;
  const wd = weekdayFromToken(m[1]!);
  if (!wd) return null;
  return { day: wd.full, date: m[2], rest: text.slice(m[0].length) };
}

/** A "Día:" / "Día N:" LABEL prefix — the shape a bold day-prefixed bullet
 *  takes once cleaned ("**Sáb**: 45 min Z2." → "Sáb: 45 min Z2."). Unlike
 *  matchLeadingWeekday, this REQUIRES the trailing colon: a bullet's day
 *  label always introduces real content, so a match with nothing (or no
 *  colon) after the day token is not this shape at all. */
export function matchDayLabelPrefix(
  text: string,
): { day: string; date?: string | undefined; rest: string } | null {
  const m = text.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ]+)\.?\s*(\d{1,2})?\s*:\s*/);
  if (!m) return null;
  const wd = weekdayFromToken(m[1]!);
  if (!wd) return null;
  return { day: wd.full, date: m[2], rest: text.slice(m[0].length) };
}

/** Scans free text for a weekday MENTION anywhere (full names only — "al
 *  final de martes" — abbreviations are reserved for structural positions,
 *  see matchLeadingWeekday). Returns the day ONLY when exactly one DISTINCT
 *  weekday is named; two or more (or zero) is ambiguous/absent and returns
 *  null — never a guess between them. */
export function findSingleWeekdayMention(text: string): string | undefined {
  const folded = foldAccents(text);
  const found = new Set<string>();
  for (const wd of WEEKDAYS) {
    if (new RegExp(`\\b${foldAccents(wd.full)}\\b`).test(folded)) found.add(wd.full);
  }
  return found.size === 1 ? [...found][0] : undefined;
}

/** Scans free text for an explicit week mention ("W12", "Semana 12"). Same
 *  single-unambiguous-match discipline as findSingleWeekdayMention: a line
 *  naming TWO different weeks ("W3: … W4: …") is honestly ambiguous. */
export function findSingleWeekToken(text: string): number | undefined {
  const nums = new Set<number>();
  for (const m of text.matchAll(/\bW\s?(\d{1,2})\b/gi)) nums.add(parseInt(m[1]!, 10));
  for (const m of text.matchAll(/\bsemana\s+(\d{1,2})\b/gi)) nums.add(parseInt(m[1]!, 10));
  return nums.size === 1 ? [...nums][0] : undefined;
}

/** A LEADING "W2", "W2 —", "W2:" week marker — Pablo's own way of labelling
 *  which week a fenced WOD or a standalone sentence belongs to ("**W2 —
 *  Introducción (4 rondas):**", already inline-cleaned by the caller before
 *  this runs so the bold markers never have to be matched here). */
export function matchLeadingWeekToken(text: string): { week: number; rest: string } | null {
  const m = text.match(/^W\s?(\d{1,2})\b\s*(?:[-—–:]\s*)?/i);
  if (!m) return null;
  return { week: parseInt(m[1]!, 10), rest: text.slice(m[0].length) };
}
