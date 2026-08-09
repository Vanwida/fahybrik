// label — WHAT a notation line names: the verbatim exercise token, the modality
// it implies, warm-up/cool-down markers, block TITLES vs work lines, and noise.
// Class-8 owner: the old label reader only looked BEFORE the first digit, so
// dose-first lines ("15' easy run") emitted an EMPTY token and zone-suffixed
// titles truncated at the digit ("DÍA LARGO MIXTO Z"). Here the token comes
// from whatever words remain once every dose/target token is stripped — always
// verbatim, never invented (resolution to the catalog is a later concern).

import type { Modality } from '../prescription/types';
import { foldText, stripTargetTokens } from './dose';
import { paceUnitFrom } from './target';

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

// Connector / rest-cue words that are never part of a movement name. "rec"
// and the bare prefix "r" (arreglo #1's short rest dialects — dose.ts's
// parseRest) join the list for the same reason "rest"/"descanso" are here:
// by the time this runs, stripDoseTokens has already eaten any digit they
// introduced (a clock or a "5r" rounds count), so a standalone survivor is
// the cue word itself, never a real exercise fragment.
const CONNECTOR_WORDS_RE =
  /\b(?:a|al|de|en|x|cada|ritmo|max|rest|descanso|recovery|float|off|est[aá]tico|rec|r)\b/gi;

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

// ── «Opcional» block prefix (fase 2, ago-2026) ───────────────────────────────
// Pablo marks a skippable block by typing the word IN the title itself
// ("OPCIONAL: FUERZA PARTE ALTA (4 × 4)"), with a real typo variant seen in
// production ("OPCIONA: REFUERZO HOMBRO" — microciclo 76, coach 60). This is
// the SAME level of confidence as recognizing "RIR 2" or "%RM": an EXACT
// prefix match, never an inference from tone/content. No prefix → the block
// title is returned untouched and `optional` stays false — the caller
// decides whether to omit the field entirely (see EditorBlock.optional).

const OPTIONAL_TITLE_PREFIX_RE = /^\s*opciona(?:l)?\b\s*:?\s*/i;

export interface OptionalTitleParse {
  /** The title with the prefix removed (unchanged when there was none). */
  title: string;
  optional: boolean;
}

/** Strips a leading "OPCIONAL:"/"OPCIONA:" (typo-tolerant, case-insensitive,
 *  colon and space both optional) from a block title and reports whether it
 *  was there. Guards against emitting an empty title (a block whose ENTIRE
 *  title was the marker keeps it verbatim instead — `weekDayPartSchema.title`
 *  requires ≥1 char, and a title-less block is a worse outcome than one that
 *  still reads "OPCIONAL"). */
export function stripOptionalBlockPrefix(title: string): OptionalTitleParse {
  const m = title.match(OPTIONAL_TITLE_PREFIX_RE);
  if (!m) return { title, optional: false };
  const stripped = title.slice(m[0].length).trim();
  if (!stripped) return { title, optional: false };
  return { title: stripped, optional: true };
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

// arreglo #5 — the TO-FAILURE marker: "máx"/"máximo" (+ "unbroken") (+
// "reps"), or "amrap (de) reps". Exported so strength.ts's to-failure
// reading and isNoiseLine's exception below share ONE source — the same gap
// class the REST_CUE_SRC comment in dose.ts warns about (a dialect taught to
// one reader and never to its sibling).
export const FAILURE_MARKER_RE =
  /\bm[aá]x(?:imo)?(?:\s+unbroken)?(?:\s+reps?)?\b|\bamrap\s+(?:de\s+)?reps?\b/i;

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
  // "16 Sets 8 Exercises" / "0/10 Sets 0/5 Exercises" — a progress COUNTER for
  // the whole card, not a work line. Checked before the digit rules below so
  // it drops CLEANLY (zero lines) instead of surviving into the dose grammar,
  // where a slash-separated pair ("0/10") reads as a rep sequence and types a
  // fabricated exercise literally called "Sets Exercises" — its own counter
  // words are excluded from naming a movement (DOSE_WORD_ONLY_RE, result.ts),
  // but that only downgrades it to a review line, which still clutters the
  // screen with something the coach never wrote as work.
  if (COUNTER_LINE_RE.test(line)) return true;
  // "Pull-ups máximo unbroken" / "Push-ups max reps" / "Burpees AMRAP de
  // reps" carry NO digit of their own — a to-failure dose is still a
  // complete, provable one (arreglo #5), so the blanket "no number → prose"
  // rule right below must not eat it. Guarded the same way a bare movement
  // name is (short, no leading coaching verb) so an unrelated sentence that
  // happens to contain "máximo" ("Recuerda hacer el máximo esfuerzo") stays
  // prose.
  if (
    FAILURE_MARKER_RE.test(line) &&
    !PROSE_VERB_RE.test(n) &&
    line.trim().split(/\s+/).filter(Boolean).length <= 8
  ) {
    return false;
  }
  if (!/\d/.test(line)) return true; // no number anywhere → prose/header
  if (TARGET_ONLY_RE.test(line)) return true; // target with no dose → directive
  return false;
}

const COUNTER_LINE_RE = /^\d+(?:\/\d+)?\s+sets?\s+\d+(?:\/\d+)?\s+exercises?\s*$/i;

// ── Bare movement names (photo-import only) ──────────────────────────────────
// A photographed TrainingPeaks card lists its movements by NAME, one per line,
// with the dose living elsewhere on the card (a shared header, or not captured
// at all) — unlike Pablo's Excel/pasted notation, where every real work line
// carries its own dose and a dose-less line really is a header. So "no digit
// anywhere" cannot mean "prose" unconditionally; parseNotationCell's
// `bareNamesAreExercises` option (default OFF — Excel/pasted text never sets
// it) asks THIS module to also try reading a noise line as a plain name.
//
// Ground truth: a real 22-card TrainingPeaks week sweep (fixtures/screenshot-
// semana12-*.json). Every string below in the exclusion lists is VERBATIM
// from that sweep — a prose note, a URL reference, or a metadata marker that
// must stay noise even with the option on.

/** A leading "- "/"– "/"— " bullet is list notation, never part of the name. */
function stripLeadingBullet(line: string): string {
  return line.replace(/^[-–—]\s+/, '');
}

// Coaching-note DIRECTIVES a short dose-less line can open with — never a
// movement name. Curated from real captures, not a general verb parser: a
// false NEGATIVE here (a real name wrongly kept as noise) costs the coach one
// manual add; a false POSITIVE (an instruction typed as a fabricated
// exercise) costs a fake catalog entry, which this function must never risk.
const PROSE_VERB_RE =
  /^(?:recuerda|recordar|manda|env[ií]a|avisa|revisa|procura|intenta|evita|sube|baja|aumenta|reduce|mant[eé]n|hidr[aá]tate|descansa|realiza|haz|confirma|comprueba|vamos)\b/i;

// A line that IS just a metadata marker ("Video ...", "Notas...") rather than
// content, optionally trailed by the vision-reader's truncation ellipsis.
const METADATA_MARKER_RE = /^(?:video|notas?|fotos?|link|enlace|url)\s*\.{0,3}$/i;

/** A dose-less line that READS as a movement name ("Cat Cow", "Cable External
 *  Rotation") rather than a header, a coach note, a URL reference, or a short
 *  instruction. Takes the RAW line — its own group/order marker (readGroup
 *  Label/stripGroupLabel) is stripped first, same as bareMovementToken below,
 *  so the two always agree on what they are judging. "Pocas palabras, sin
 *  verbo conjugado, sin dos puntos finales": ≤6 words (a real name in the
 *  sweep tops out at 6 — "Side Plank with Clam Shell Hold"; longer is prose,
 *  the same call isBlockTitle/isNoiseLine already make for an ALL-CAPS or
 *  long dose-less line), no trailing colon (that labels something ELSE), and
 *  no leading coaching-note verb. A digit anywhere disqualifies it outright —
 *  a NAME never carries a dose fragment, and this is also what keeps a
 *  counter line ("16 Sets 8 Exercises") from reaching here even if
 *  COUNTER_LINE_RE's exact shape ever drifts from a future capture. */
export function looksLikeBareMovementName(line: string): boolean {
  const trimmed = stripGroupLabel(line).trim();
  if (!trimmed || /\d/.test(trimmed)) return false;
  const n = foldText(trimmed);
  if (n.startsWith('*')) return false; // coach note marker
  if (/^\(.*\)$/.test(trimmed)) return false; // parenthetical aside
  if (/^(directo a|direct to|luego|despues|then|foco|foco en|finisher\s*:)\b/.test(n)) return false;
  if (/^(rest day|off|descanso)\b/.test(n)) return false;
  if (isModalityChoice(trimmed)) return false; // "row/ski" is a CHOICE annotation, not a name
  if (/https?:\/\/|www\./i.test(trimmed)) return false; // a link/reference note
  if (METADATA_MARKER_RE.test(trimmed)) return false;
  if (/:\s*$/.test(trimmed)) return false; // a trailing colon labels something else
  // Sentence-final punctuation excludes it — but the vision reader's
  // truncation ellipsis ("Extension de cadera en cuadrúp...") is a CUT-OFF
  // real name, not a sentence, so a "." only excludes when it is NOT part of
  // "...".
  if (/[!?]\s*$/.test(trimmed) || /(?<!\.)\.\s*$/.test(trimmed)) return false;
  const body = stripLeadingBullet(trimmed);
  if (!body) return false;
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false; // "prosa larga"
  if (PROSE_VERB_RE.test(body)) return false;
  return true;
}

/** The verbatim name a bare-movement line carries, once its group/order
 *  marker and any leading list bullet are gone. Caller's job to have already
 *  confirmed looksLikeBareMovementName. */
export function bareMovementToken(line: string): string {
  return stripLeadingBullet(stripGroupLabel(line).trim()).trim();
}
