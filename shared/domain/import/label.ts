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
  ['bike', /\b(bike|bike-erg|assault|airbike|ab)\b/],
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

/** Leading "LABEL:" form ("ROW:", "Threshold cinta:") → the label, else null. */
export function leadingColonLabel(seg: string): string | null {
  const m = seg.match(/^\s*([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ /+-]*?)\s*:/);
  return m ? m[1]!.trim() : null;
}

/** Name-FIRST label ("Back Squat 5r …"): the run of text before the first digit
 *  — with target tokens (Z2, RPE n) stripped beforehand so a zone never
 *  truncates a name at its digit (class 8). */
export function extractLabel(seg: string): string {
  let s = stripTargetTokens(seg).trim();
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
    .replace(/\d+\s*x\s*\d+\s*(?:''|'|m\b)?/gi, ' ')
    .replace(/\d+\s*h\s*\d+\s*'/g, ' ')
    .replace(/\d+\s*h\b/gi, ' ')
    .replace(/\d+\s*'{1,2}/g, ' ')
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
  let s = seg.replace(/\d+\s*x\s*\([^)]*\)/g, ' '); // paren-intervals are dose, not note
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
  if (/^(descanso|rest day|off)\b/.test(n)) return true;
  if (!/\d/.test(line)) return true; // no number anywhere → prose/header
  if (TARGET_ONLY_RE.test(line)) return true; // target with no dose → directive
  return false;
}
