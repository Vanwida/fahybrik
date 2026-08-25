// result — the importer's OUTPUT shape and its two constructors, shared by the
// dispatcher (./notation.ts) and the per-family parsers (./bout.ts,
// ./strength.ts). The honesty contract is enforced HERE: everything typed is
// validated against `prescriptionSchema`, and a validation failure downgrades
// the line to `review` with the verbatim text preserved — never a bad number.

import {
  type Measure,
  type Prescription,
  type PrescriptionScheme,
  type Target,
  prescriptionSchema,
} from '../prescription/types';
import { foldText, parseImplementLoad, parseKg, parseRest } from './dose';
import { readGroupLabel, type GroupLabel } from './label';
import {
  OUT_OF_MODEL_PACE_RE,
  parseCaloriesGoalTarget,
  parseHrBpmTarget,
  parseKgRange,
  parsePaceClockTarget,
  parseTimeCapTarget,
  parseWattsTarget,
  PERCENT_MAX_HR_RE,
} from './target';
import {
  absorbRelativeTarget,
  stripRelativePhrases,
  type PhraseDictionary,
} from './relative';

let sessionDictionary: PhraseDictionary | undefined;

/** Parse-session bag for the coach dictionary. Sync, one cell at a time.
 *  Callers of finalizeDetected (command, structure, strength) then see the
 *  same map without a fourth argument on every signature. */
export function runWithImportSession<T>(dictionary: PhraseDictionary | undefined, fn: () => T): T {
  const prev = sessionDictionary;
  sessionDictionary = dictionary;
  try {
    return fn();
  } finally {
    sessionDictionary = prev;
  }
}

// `incomplete`: the exercise itself IS known (a real movement name), its
// dosage is not — never `detected` (that claims full confidence) and never
// `review` (that means nothing structured was provable and the verbatim text
// is all that survives). A photographed TrainingPeaks card lists movements by
// NAME with the dose elsewhere on the card; this is the honest middle ground
// so the coach sees "Cat Cow — needs sets/reps" instead of either a
// fabricated dose or the exercise vanishing outright. Emitted only by
// incompleteExerciseLine below, gated by parseNotationCell's
// `bareNamesAreExercises` option (./notation.ts) — off by default.
export type NotationConfidence = 'detected' | 'review' | 'incomplete';

/** One recognized line of a session cell: the exercise label, its typed dosage,
 *  and how sure the grammar is about the typing. `exercise_token` is verbatim
 *  (resolution to a catalog exercise is a LATER concern, not this module's job)
 *  and is empty for a `review` line or a bout that names no movement.
 *  `group_label` is OPTIONAL and set only when the coach wrote one ("A1) …") —
 *  a line with none simply omits the field. It is import-time-only signal for
 *  whoever draws block boundaries (see readGroupLabel in ./label.ts); nothing
 *  downstream of this module persists it. */
export interface ParsedLine {
  exercise_token: string;
  prescription: Prescription;
  confidence: NotationConfidence;
  review_reasons: string[];
  group_label?: GroupLabel;
}

/** An intermediate parse (pre-validation): the token + its prescription. */
export interface Parsed {
  token: string;
  prescription: Prescription;
}

// Words that COUNT work rather than name it. A line whose movement token is one
// of these named no exercise at all — the counter word got mistaken for the
// movement. "3-4 RONDAS" typed CONFIDENTLY as two sets of 3 and 4 reps of an
// exercise called "RONDAS"; "12-15 repeticiones" as sets of 12 and 15 reps of
// "repeticiones". Both are wrong AND unflagged, which is worse than not typing:
// nothing tells the coach to look. A rounds/rep RANGE has no home in the model
// yet, so the honest answer is `review` with the text intact.
const DOSE_WORD_ONLY_RE =
  /^(?:rounds?|rondas?|vueltas?|series?|sets?|reps?|repeticiones?|veces|ejercicios?|exercises?|min(?:utos?)?|minutes?|seg(?:undos?)?|sec(?:onds?)?)$/;

// ── Residue guard (arreglo #4) ─────────────────────────────────────────────
// FAITHFUL OR REVIEW only holds when a PARTIAL match is caught too: a line
// that gets its interval right but drops "@160 kg", or its distance right
// but drops "rec 2:30", used to leave `prescriptionSchema` perfectly happy
// (both are optional fields) and ship `detected` with a number silently
// missing. This closes that gap at the ONE chokepoint every successful parse
// already passes through: if the raw text carries a REST clause or an
// "@"/kg LOAD clause the grammar knows how to read, but that value never
// lands anywhere in the typed prescription, the line was faithful to only
// PART of the text — the honesty contract says that is a `review`, not a
// lucky `detected`.
//
// Scoped to these two clauses — not a fully generic "every number must
// reappear" scan — because a generic scan cannot tell a genuinely CONSUMED
// number from a dropped one without reproducing the whole grammar's own
// logic: "10' caminando" legitimately reads its "10" as `total_s`, never
// `rest_s` (the walk IS the bout, see bout.ts), and a naive scanner would
// flag that as residue. Membership is checked BROADLY (anywhere among the
// prescription's numbers, not specifically in `rest_s`/a kg target) so that
// exact case — and any other legitimate repurposing — is never a false
// positive: what matters is that the number is accounted for SOMEWHERE.

function collectPrescriptionNumbers(p: Prescription): Set<number> {
  const nums = new Set<number>();
  const add = (n: number | undefined) => {
    if (n !== undefined) nums.add(n);
  };
  add(p.rounds);
  add(p.rounds_max);
  add(p.work_s);
  add(p.rest_s);
  add(p.total_s);
  add(p.start);
  add(p.increment);
  addTargetNumbers(p.target, nums);
  if (p.pace_cap) {
    add(p.pace_cap.max_s);
    add(p.pace_cap.min_s);
  }
  add(p.hr_zone);
  for (const s of p.sets ?? []) {
    add(s.rest_s);
    addMeasureNumbers(s.measure, nums);
    addTargetNumbers(s.target, nums);
    // Legacy scalar aliases — a set can carry these instead of measure/target
    // pre-normalize; harmless to also scan post-normalize (they are unset).
    add(s.reps);
    add(s.duration_s);
    add(s.distance_m);
    add(s.rpe);
    add(s.rir);
    add(s.hr_zone);
  }
  // An "N rounds/series" header often survives ONLY as the sets array's
  // LENGTH, never a literal `rounds` field (parseStrength never sets one).
  if (p.sets && p.sets.length > 0) nums.add(p.sets.length);
  return nums;
}

function addMeasureNumbers(m: Measure | undefined, nums: Set<number>): void {
  if (!m) return;
  if (m.kind === 'distance') nums.add(m.meters);
  else if (m.kind === 'duration') nums.add(m.seconds);
  else if (m.kind === 'reps' || m.kind === 'calories') nums.add(m.value);
  if ('max' in m && m.max !== undefined) nums.add(m.max);
}

function addTargetNumbers(t: Target | undefined, nums: Set<number>): void {
  if (!t) return;
  if (t.kind === 'bodyweight') return;
  if (t.kind === 'pace' || t.kind === 'time_cap') {
    if (t.value_s !== undefined) nums.add(t.value_s);
    if (t.min_s !== undefined) nums.add(t.min_s);
    if (t.max_s !== undefined) nums.add(t.max_s);
    return;
  }
  // Un objetivo relativo («a peso de competición», «+5 kg») no aporta números
  // de esta clase: su porcentaje/delta son respecto a una marca del atleta que
  // se resuelve al leer, nunca al importar — mezclarlos aquí falsearía el
  // guardia de residuo (un "@150 kg" suelto en el texto pasaría por consumido
  // porque un delta_kg cualquiera coincide con él por casualidad).
  if (t.kind === 'relative') return;
  if (t.value !== undefined) nums.add(t.value);
  if (t.min !== undefined) nums.add(t.min);
  if (t.max !== undefined) nums.add(t.max);
  if (t.kind === 'kg' && t.implement_count !== undefined) nums.add(t.implement_count);
}

/** A rest clause the raw text promises (any of parseRest's dialects) that
 *  never lands anywhere in the typed prescription. */
function hasUnconsumedRest(raw: string, p: Prescription): boolean {
  const restSeconds = parseRest(raw);
  if (restSeconds === undefined) return false;
  return !collectPrescriptionNumbers(p).has(restSeconds);
}

/** A LOAD clause the raw text promises — a kg BAND ("@150-170 kg"), a plain
 *  "160 kg", or a PER-IMPLEMENT "@2x32" — that never lands anywhere in the
 *  typed prescription. Tried in that order (band, then per-implement, then
 *  plain) because a range's own upper bound would otherwise satisfy the
 *  plain-kg check on its own and mask a dropped lower bound. */
function hasUnconsumedLoad(raw: string, p: Prescription): boolean {
  const nums = collectPrescriptionNumbers(p);
  const kgRange = parseKgRange(raw);
  if (kgRange) {
    return !nums.has(kgRange.min) || !nums.has(kgRange.max);
  }
  const implement = parseImplementLoad(raw);
  if (implement) {
    return !nums.has(implement.value) || !nums.has(implement.implement_count);
  }
  const kg = parseKg(raw);
  if (kg === undefined) return false;
  return !nums.has(kg);
}

/**
 * The SAME class of guard as `hasUnconsumedLoad`, extended to the intensity
 * axes ./target.ts taught this grammar: a ritmo, a pulso, unos vatios, una
 * meta de calorías, o un tope de tiempo that the raw text plainly carries but
 * the typed prescription's target — wherever it ended up, block-level or
 * per-set — never absorbed. Without this, a line with a STRONG bout signal
 * (a modality word) could win the `target` slot with something else entirely
 * (or nothing), and the pace/pulse/watts the coach actually wrote vanished
 * with the line still shipping `detected` — the exact "vatios: verde,
 * OBJETIVO PERDIDO" failure the baseline measured. Reuses
 * `addTargetNumbers` — already generic over every Target kind — so no kind
 * needed its own bespoke comparison here.
 */
function hasUnconsumedNewAxisTarget(raw: string, p: Prescription): boolean {
  const consumed = collectPrescriptionNumbers(p);
  const candidates: Array<Target | null> = [
    parsePaceClockTarget(raw),
    parseHrBpmTarget(raw),
    parseWattsTarget(raw),
    parseCaloriesGoalTarget(raw),
    parseTimeCapTarget(raw),
  ];
  for (const t of candidates) {
    if (!t) continue;
    const need = new Set<number>();
    addTargetNumbers(t, need);
    for (const n of need) {
      if (!consumed.has(n)) return true;
    }
  }
  return false;
}

/**
 * Un objetivo que el texto promete POR REFERENCIA, sin número: «a split de
 * carrera», «@race pace», «a ritmo de carrera», «a umbral», «a peso de
 * carrera», «all-out». Los dos guardias de arriba comparan NÚMEROS, así que
 * estas frases se les escapan enteras — y el resultado es peor que un fallo:
 * `SkiErg 3x1000 m a split de carrera` salía verde como «3×1000 m» a secas,
 * sin intensidad ninguna y sin rastro en la nota. El coach escribió a qué
 * ritmo; el atleta recibía una distancia y nada más.
 *
 * Estas referencias son objetivos DERIVADOS. Las formas que piece 4 ya lee
 * (ritmo HYROX, peso de competición, % corporal) aterrizan en `Target.relative`
 * antes de este guardia. Aquí quedan las que el tipo no cubre (all-out, a tope).
 *
 * Curado a propósito, NO un detector genérico de prosa, y con dos frenos:
 *   · sólo dispara si la prescripción tipada no tiene NINGÚN objetivo (ni de
 *     bloque ni de serie) — si ya capturó uno, la frase suelta es casi siempre
 *     redundancia del coach y bajar la línea sería ruido;
 *   · ancla en la PREPOSICIÓN («a split de», «@…»), jamás en la palabra
 *     suelta: «Bulgarian split squat» lleva «split» en su propio nombre y es
 *     una línea perfectamente honesta.
 */
const REFERENCE_TARGET_RE =
  /(?:^|\s)(?:@\s*(?:race\s*pace|ritmo|split|umbral|threshold)\b|a\s+(?:split|ritmo|race\s*pace|umbral|peso)\s+de\b|a\s+(?:race\s*pace|umbral)\b|al\s+umbral\b|all[\s-]?out\b|a\s+tope\b)/;

function hasAnyTarget(p: Prescription): boolean {
  if (p.target !== undefined) return true;
  return (p.sets ?? []).some((s) => s.target !== undefined);
}

function hasUnconsumedReferenceTarget(raw: string, p: Prescription): boolean {
  if (hasAnyTarget(p)) return false;
  return REFERENCE_TARGET_RE.test(foldText(raw));
}

/** "72% FCmax" with NO target captured anywhere — same two brakes as
 *  `hasUnconsumedReferenceTarget` (only fires with zero target already, never
 *  overrides a target that DID land). See target.ts's PERCENT_MAX_HR_RE doc
 *  comment for why this is recognized but never typed. */
function hasUnconsumedPercentMaxHr(raw: string, p: Prescription): boolean {
  if (hasAnyTarget(p)) return false;
  return PERCENT_MAX_HR_RE.test(raw);
}

/** "3:50/1000m" — a pace clock in a unit outside the model (PaceUnit is only
 *  per_km/per_500m/per_mile). Same two brakes again: only fires with zero
 *  target already captured, and only when the KNOWN-unit reader
 *  (`parsePaceClockTarget`) found nothing — a recognized unit that DID land
 *  is `hasUnconsumedNewAxisTarget`'s job, not this one's. */
function hasUnconsumedOutOfModelPace(raw: string, p: Prescription): boolean {
  if (hasAnyTarget(p)) return false;
  if (parsePaceClockTarget(raw)) return false;
  return OUT_OF_MODEL_PACE_RE.test(raw);
}

/** Validate a typed prescription; on failure, downgrade the line to review with
 *  the raw text preserved (honesty contract). */
export function finalizeDetected(
  token: string,
  prescription: Prescription,
  raw: string,
): ParsedLine {
  const bare = foldText(token);
  // Every word counts work rather than names it ("series repeticiones" is the
  // debris left behind by a bare "N series de X-Y repeticiones" with no
  // exercise attached — as wrong a "movement" as "RONDAS" alone).
  const words = bare.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.every((w) => DOSE_WORD_ONLY_RE.test(w))) {
    return reviewLine(raw, `counter word "${token.trim()}" read as the movement — no exercise named`);
  }
  // A `sets` scheme is always "N sets OF something" — unlike a bout (steady/
  // intervals CAN legitimately be un-named, e.g. "50' Z2"), a strength scheme
  // with no real name is unprovable. Two shapes slip past the counter-word
  // check above because neither IS a word: an EMPTY token ("A2) 90-90" — a
  // real exercise whose own numeric-looking NAME gets misread as a rep
  // sequence; the grammar cannot tell it apart from a genuine "90 then 90"
  // without a catalog, so honest is to stop here) and a single bare LETTER
  // ("P: Realiza 4 series de 12-15 repeticiones…" — a coach's note prefix
  // that extractLabel reads as a name-first label because it has no group-
  // label-style exclusion of its own, only A–H letters do via GROUP_LABEL_RE).
  if (prescription.scheme === 'sets' && bare.length <= 1) {
    return reviewLine(raw, 'sets scheme with no real movement name — token too short to be one');
  }
  const absorbed = absorbRelativeTarget(prescription, raw, token, sessionDictionary);
  if ('review' in absorbed) return reviewLine(raw, absorbed.review);
  prescription = absorbed;
  const residueRaw = stripRelativePhrases(raw);
  const parsed = prescriptionSchema.safeParse(prescription);
  if (!parsed.success) {
    return reviewLine(raw, `typed prescription failed validation: ${parsed.error.message}`);
  }
  const typed = parsed.data as Prescription;
  // arreglo #4 — the residue guard: a rest clause or an "@"/kg load clause
  // the text promises but the typed prescription never captured means this
  // line was faithful to only PART of the text. See the module comment above
  // `collectPrescriptionNumbers`.
  if (hasUnconsumedRest(raw, typed)) {
    return reviewLine(raw, 'a rest clause in the text was not captured in the typed prescription');
  }
  if (hasUnconsumedLoad(residueRaw, typed)) {
    return reviewLine(raw, 'a load ("@"/kg) clause in the text was not captured in the typed prescription');
  }
  if (hasUnconsumedNewAxisTarget(raw, typed)) {
    return reviewLine(
      raw,
      'un ritmo, pulso, vatiaje, meta de calorías o tope de tiempo del texto no aterrizó en la prescripción tipada',
    );
  }
  if (hasUnconsumedOutOfModelPace(raw, typed)) {
    return reviewLine(
      raw,
      'un ritmo escrito en una unidad fuera del modelo (solo /km, /500m, /mile) — nunca se convierte a otra, se revisa',
    );
  }
  if (hasUnconsumedReferenceTarget(raw, typed)) {
    return reviewLine(
      raw,
      'el texto fija el objetivo por referencia («a split de carrera», «@race pace») y la prescripción quedó sin ninguno',
    );
  }
  if (hasUnconsumedPercentMaxHr(raw, typed)) {
    return reviewLine(
      raw,
      '% de FC máxima requiere la FC máxima medida del atleta — no derivable del texto, y la prescripción quedó sin objetivo',
    );
  }
  const groupLabel = readGroupLabel(raw);
  return {
    exercise_token: token,
    prescription: typed,
    confidence: 'detected',
    review_reasons: [],
    ...(groupLabel ? { group_label: groupLabel } : {}),
  };
}

const MAX_NOTE_CHARS = 2000; // prescriptionSchema's note ceiling

/** A review line keeps the verbatim text in `note` (the ONLY allowed free text)
 *  and never fabricates structure. The scheme is a labeled best-guess from any
 *  metcon keyword present (acknowledged by `confidence:'review'`). */
export function reviewLine(raw: string, reason: string): ParsedLine {
  const text = raw.trim().slice(0, MAX_NOTE_CHARS);
  const prescription = prescriptionSchema.parse({
    scheme: detectMetconScheme(raw),
    note: text,
  }) as Prescription;
  const groupLabel = readGroupLabel(raw);
  return {
    exercise_token: '',
    prescription,
    confidence: 'review',
    review_reasons: [reason],
    ...(groupLabel ? { group_label: groupLabel } : {}),
  };
}

/** A movement NAME with no dose captured on its line — `confidence:
 *  'incomplete'` (see NotationConfidence above). `scheme:'sets'` because
 *  every OTHER `sets`-scheme line in this grammar already means "reps of a
 *  named movement"; `sets` itself is left UNSET rather than an empty array —
 *  unset says "the coach must add it", an empty array would say "zero sets
 *  prescribed", which is not what an un-dosed name means. */
export function incompleteExerciseLine(
  token: string,
  raw: string,
  groupLabel: GroupLabel | null,
): ParsedLine {
  const prescription: Prescription = { scheme: 'sets' };
  const parsed = prescriptionSchema.safeParse(prescription);
  if (!parsed.success) {
    return reviewLine(raw, `incomplete-exercise prescription failed validation: ${parsed.error.message}`);
  }
  return {
    exercise_token: token,
    prescription: parsed.data as Prescription,
    confidence: 'incomplete',
    review_reasons: ['exercise named with no dose captured on this line — needs sets/reps from the coach'],
    ...(groupLabel ? { group_label: groupLabel } : {}),
  };
}

function detectMetconScheme(raw: string): PrescriptionScheme {
  const n = foldText(raw);
  if (/\bamrap\b/.test(n)) return 'amrap';
  if (/\bemom\b/.test(n)) return 'emom';
  if (/\btabata\b/.test(n)) return 'tabata';
  if (/\bdeath by\b/.test(n)) return 'death_by';
  if (/\b(hyrox|simulaci)\b/.test(n)) return 'hyrox_sim';
  if (/\bchipper\b/.test(n)) return 'chipper';
  if (/\bladder\b/.test(n)) return 'ladder';
  return 'for_time'; // generic metcon fallback (dense, unstructured)
}
