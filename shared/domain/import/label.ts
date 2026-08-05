// label — WHAT a notation line names: the verbatim exercise token, the modality
// it implies, warm-up/cool-down markers, block TITLES vs work lines, and noise.
// Class-8 owner: the old label reader only looked BEFORE the first digit, so
// dose-first lines ("15' easy run") emitted an EMPTY token and zone-suffixed
// titles truncated at the digit ("DÍA LARGO MIXTO Z"). Here the token comes
// from whatever words remain once every dose/target token is stripped — always
// verbatim, never invented (resolution to the catalog is a later concern).

import type { Modality } from '../prescription/types';
import { foldText, paceUnitFrom, stripTargetTokens } from './dose';

// ── Modality ─────────────────────────────────────────────────────────────────
// Order matters: erg/run keywords first so "cinta … walking rest" reads run,
// not walking; the housekeeping families (mobility / walking / technique) come
// last (class-9: "10' movilidad", "2' caminando", "5' técnica" must type).

const CARDIO_MODALITY_TESTS: ReadonlyArray<readonly [Modality, RegExp]> = [
  ['row', /\b(row|rowing|remo)\b/],
  ['ski', /\b(skierg|ski-erg|ski)\b/],
  // Spanish counts: "Bici Libre Z2" is how a coach writes it here, and without
  // `bici` the line typed its zone and duration but came out with NO modality —
  // run and row already carried their Spanish words, bike did not.
  ['bike', /\b(bike|bike-erg|assault|airbike|ab|bici|bicicleta|rodillo)\b/],
  [
    'run',
    /\b(run|carrera|correr|corriendo|cinta|treadmill|pista|threshold|umbral|fartlek|tempo|trote|easy run|strides)\b/,
  ],
];

/** Every DISTINCT cardio modality the text names. >1 ⇒ a mixed/choice bout
 *  ("carrera + bike", "row/ski") whose single modality must NOT be guessed. */
export function cardioModalities(seg: string): Modality[] {
  const n = foldText(seg);
  return CARDIO_MODALITY_TESTS.filter(([, re]) => re.test(n)).map(([m]) => m);
}

export function modalityFrom(seg: string): Modality | undefined {
  const cardio = cardioModalities(seg);
  if (cardio.length > 0) return cardio[0];
  const n = foldText(seg);
  if (/km\s*\/\s*h/.test(n)) return 'run';
  if (/\b(movilidad|mobility|estiramientos?|foam|stretching)\b/.test(n)) return 'mobility';
  if (/\b(caminando|caminar|caminata|andando)\b/.test(n)) return 'other';
  if (/\b(tecnica|technique)\b/.test(n)) return 'other';
  return undefined;
}

/** "row/ski" — an ATHLETE'S CHOICE between modalities. The grammar must not
 *  pick one (class 4): modality stays undefined, the token keeps the choice. */
const ERG_WORD = 'row|rowing|remo|ski|skierg|bike|ab|run|carrera';
const CHOICE_RE = new RegExp(`\\b(?:${ERG_WORD})\\s*/\\s*(?:${ERG_WORD})\\b`, 'i');

export function isModalityChoice(seg: string): boolean {
  return CHOICE_RE.test(foldText(seg));
}

// ── Structural scheme (warm-up / cool-down keywords) ─────────────────────────

export function structuralScheme(seg: string): 'warmup' | 'cooldown' | undefined {
  const n = foldText(seg);
  if (/\b(?:warm[ -]?up|wu|calentamiento)\b/.test(n)) return 'warmup';
  if (/\b(?:cool[ -]?down|cd|vuelta a la calma|enfriamiento)\b/.test(n)) return 'cooldown';
  return undefined;
}

const STRUCTURAL_WORDS_RE =
  /\b(?:warm[ -]?up|wu|calentamiento|cool[ -]?down|cd|vuelta a la calma|enfriamiento)\b/gi;

// ── Labels ───────────────────────────────────────────────────────────────────

// ── Exercise ORDER / GROUP labels ────────────────────────────────────────────
// A coach numbers the movements of a session: "A) Press Banca", "B: Dominada",
// "A1/A2/A3" for a superset, "1) Puente de glúteo" for a plain list. That prefix
// is GROUPING notation — never part of the movement name.
//
// It used to be read as the name itself: `extractLabel` stops at the first colon,
// so "B: Deadlift 5x5" typed CONFIDENTLY as an exercise called "B" and threw
// "Deadlift" away — no review flag, nothing for the coach to notice. "A:" only
// escaped because the lone "a" is in CONNECTOR_WORDS_RE (the Spanish preposition),
// so it got deleted by accident. Stripping the label here is the root fix.

/** A leading order/group marker: letter (+ optional index), or a list ordinal.
 *  The LETTER branch captures its letter (group 1) and index (group 2, empty
 *  string when bare) so readGroupLabel below can read the exact same marker
 *  stripGroupLabel removes — one source, so the two can never drift apart.
 *  The NUMERIC-ordinal branch ("1)", "2)") captures nothing: a plain list is
 *  not a group (see readGroupLabel and docs/DECISIONS.md, 2026-08-05 — a
 *  superset is a block FORMAT, and only a LETTER marker names one). */
const GROUP_LABEL_RE =
  /^\s*(?:([A-H])(\d{0,2})(?:\s*\/\s*[A-H]?\d{0,2})*\s*[):.–—-]|\d{1,2}\s*[).])\s+(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])/;

/** The line with its order/group marker removed ("B: Deadlift 5x5" → "Deadlift
 *  5x5"). Idempotent and safe on lines that carry none. */
export function stripGroupLabel(seg: string): string {
  return seg.replace(GROUP_LABEL_RE, '');
}

/** A coach's leading group marker, READ rather than discarded: "A1" →
 *  {letter:'A', index:1}; a bare "A" (or "A:", "A)") → {letter:'A'} (no
 *  index). `index` is what tells a block builder to ROTATE ("A1/A2/A3" is one
 *  superset block, format `superset`) instead of running straight sets
 *  ("A", "B", "C" are three separate `sets` blocks) — see docs/DECISIONS.md,
 *  2026-08-05. A chained marker ("A1/A2/A3:") reads only its OWN leading
 *  letter+index — the one naming THIS line — not the whole chain: in real
 *  notation each movement carries its own line with its own single marker
 *  ("A1) Press Banca", "A2) Dominada", …), so that is the case this exists
 *  to serve. A NUMERIC ordinal ("1)", "2)") is a plain list, never a group —
 *  it returns null, same as a line with no marker at all. This is import-time
 *  notation only: it is never persisted onto a PrescriptionSet or a
 *  WeekDayPartItem, it dies once the block boundaries are drawn. */
export interface GroupLabel {
  letter: string;
  index?: number;
}

export function readGroupLabel(seg: string): GroupLabel | null {
  const m = seg.match(GROUP_LABEL_RE);
  if (!m || m[1] === undefined) return null; // no marker, or a numeric ordinal
  const index = m[2] ? parseInt(m[2], 10) : undefined;
  return index !== undefined ? { letter: m[1], index } : { letter: m[1] };
}

/** Leading "LABEL:" form ("ROW:", "Threshold cinta:") → the label, else null.
 *  An order/group marker is NOT a label — see GROUP_LABEL_RE above. */
export function leadingColonLabel(seg: string): string | null {
  if (GROUP_LABEL_RE.test(seg)) return null;
  const m = seg.match(/^\s*([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ /+-]*?)\s*:/);
  return m ? m[1]!.trim() : null;
}

/** Name-FIRST label ("Back Squat 5r …"): the run of text before the first digit
 *  — with target tokens (Z2, RPE n) stripped beforehand so a zone never
 *  truncates a name at its digit (class 8). */
export function extractLabel(seg: string): string {
  let s = stripTargetTokens(stripGroupLabel(seg)).trim();
  s = s.replace(/^\s*\d+\s*(?:rounds|rondas|series|reps?|x|r)\b[:.\s]*/i, '');
  const head = s.match(/^([^\d:]*)/);
  let label = head ? head[1]! : s;
  label = label
    .replace(/\b(?:c\/|cada|al?|@|de|en|x|a ritmo)\s*$/i, '')
    .replace(/[\s:,.\-—–(/+]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  return label;
}

// Everything a dose-first line can carry BESIDES its name: interval groups,
// clocks, distances, paces, loads, counts. Stripped (with targets) to leave the
// exercise words. Names carry no digits (Pablo's movements never do), so any
// surviving number is dose debris and is dropped too.
function stripDoseTokens(raw: string): string {
  return raw
    .replace(/\d+\s*x\s*\([^)]*\)/g, ' ') // 5x(4' Z3 / 1' Z2) — consumed by the paren-interval parser
    .replace(/\d+(?:[.,]\d+)?\s*km\s*\/\s*h/gi, ' ')
    .replace(/\d+\s*'\s*\d*\s*'{0,2}\s*\/\s*(?:km|500\s*m?|mi|milla)/gi, ' ')
    .replace(/\d+:[0-5]?\d\s*(?:min\s*)?\/\s*(?:km|500\s*m?|mi|milla)/gi, ' ') // colon pace: "3:45 min/km"
    .replace(/\d+\s*x\s*\d+\s*(?:''|'|m\b)?/gi, ' ')
    .replace(/\d+\s*h\s*\d+\s*'/g, ' ')
    .replace(/\d+\s*h\b/gi, ' ')
    .replace(/\d+\s*'{1,2}/g, ' ')
    .replace(/\d+:[0-5]?\d(?::[0-5]?\d)?\b/g, ' ') // colon clock: "1:30", "1:20:00"
    .replace(/\d+\s*(?:horas?|min(?:utos?)?|segundos?|seg\.?|s)\b/gi, ' ') // word clock: "2 min", "90 seg", "90s"
    .replace(/\d+(?:[.,]\d+)?\s*km\b/gi, ' ')
    .replace(/\d+\s*m\b/gi, ' ')
    .replace(/\d+(?:[.,]\d+)?\s*kg\b/gi, ' ')
    .replace(/\d+(?:[/\-]\d+)*\s*%(\s*rm)?/gi, ' ')
    .replace(/\bc\/\s*/gi, ' ')
    .replace(/^\s*\d+\s*(?:rounds|rondas|series|r)\b[:.]?/i, ' ')
    .replace(/\d+/g, ' ');
}

// Rest-cue COMPOUNDS stripped as a unit ("walking rest") — "walking" alone is
// part of movement names ("walking lunge") and must survive.
const REST_COMPOUND_RE = /\b(?:walking|caminando|trote)\s+(?:rest|descanso|recovery)\b/gi;

// Connector / rest-cue words that are never part of a movement name.
const CONNECTOR_WORDS_RE =
  /\b(?:a|al|de|en|x|cada|ritmo|max|rest|descanso|recovery|float|off|est[aá]tico)\b/gi;

export interface DoseFirstLabel {
  token: string;
  note?: string;
}

/** Dose-FIRST label ("15' easy run", "45' carrera Z2"): strip every dose and
 *  target token; the remaining words are the verbatim token. Parentheticals
 *  that are NOT pace constraints (those are typed as cap/target) are coach
 *  notes, kept verbatim ("(marcar lap)", "(sumar km)"). For structural lines
 *  (warm-up/cool-down) leftover words that name no modality are qualifiers
 *  ("easy"), not an exercise — they go to the note. */
export function doseFirstLabel(seg: string, opts?: { structural?: boolean }): DoseFirstLabel {
  const notes: string[] = [];
  let s = stripGroupLabel(seg).replace(/\d+\s*x\s*\([^)]*\)/g, ' '); // paren-intervals are dose, not note
  s = s.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    if (!paceUnitFrom(inner)) notes.push(inner.trim()); // pace parens are typed elsewhere
    return ' ';
  });
  // Targets BEFORE doses: the generic digit sweep in stripDoseTokens would
  // otherwise eat the "2" of "Z2" and leave a dangling "Z" in the token.
  s = stripDoseTokens(stripTargetTokens(s));
  if (opts?.structural) s = s.replace(STRUCTURAL_WORDS_RE, ' ');
  let token = s
    .replace(REST_COMPOUND_RE, ' ')
    .replace(CONNECTOR_WORDS_RE, ' ')
    .replace(/\s+\/\s*|\s*\/\s+/g, ' ') // a SPACED slash is a separator; "row/ski" survives
    .replace(/[()@:;.,·']+/g, ' ')
    .replace(/(?:^|\s)[—–•+-]+(?=\s|$)/g, ' ')
    .replace(/^[\s—–•+-]+|[\s—–•+-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (opts?.structural && token && modalityFrom(token) === undefined) {
    notes.push(token); // a qualifier ("easy"), not a movement
    token = '';
  }
  const note = notes.filter(Boolean).join(' · ');
  return note ? { token, note } : { token };
}

// ── Titles, noise, continuations ─────────────────────────────────────────────

/** An ALL-CAPS line with no dose ("DÍA LARGO MIXTO Z2", "CARRERA LARGA Z2",
 *  "TEST") is a block TITLE, not an exercise: it is not emitted, but its
 *  modality (if any) contextualizes the lines under it (class 8). */
export function isBlockTitle(line: string): boolean {
  if (/\d/.test(stripTargetTokens(line))) return false; // carries a dose → work line
  const letters = line.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  if (!letters) return false;
  return letters === letters.toLocaleUpperCase('es');
}

/** A bare target-only line ("RPE 3", "Z2") — joined onto the previous line as a
 *  continuation; if it survives standalone it is a directive, not a dose. */
export const TARGET_ONLY_RE =
  /^[\s—–-]*(?:(?:rpe|rir)\s*\d{1,2}(?:\s*[-–—]\s*\d{1,2})?|z(?:ona)?\s*[1-5](?:\s*[-–—]\s*z?[1-5])?)\s*$/i;

/** A "noise" line carries no dosage to type: a header, a connector, a coach
 *  note, a parenthetical aside, prose, or a bare target directive. */
export function isNoiseLine(line: string): boolean {
  const n = foldText(line);
  if (n.startsWith('*')) return true; // coach note
  if (/^\(.*\)$/.test(line.trim())) return true; // "(misma intensidad…)"
  if (/^(directo a|direct to|luego|despues|then|foco|foco en|finisher\s*:)\b/.test(n)) return true;
  // A whole rest DAY is noise regardless of digits ("off"/"rest day"). A bare
  // "Descanso" header (no clock) falls to the no-digit rule right below. A
  // "Descanso 1:30" that DOES carry a clock must NOT be dropped here — it is
  // data (joinContinuations already tried to attach it to the previous line;
  // orphaned, it needs to reach parseLine so it reviews instead of vanishing).
  if (/^(rest day|off)\b/.test(n)) return true;
  if (!/\d/.test(line)) return true; // no number anywhere → prose/header
  if (TARGET_ONLY_RE.test(line)) return true; // target with no dose → directive
  return false;
}
