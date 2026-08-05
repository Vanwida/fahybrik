// classify — guess an exercise's CATEGORY (and derived MODALITY) from its bare
// NAME, deterministically, so the coach isn't asked to hand-classify every one
// of thirty new movements a photo import surfaces.
//
// WHY THIS MATTERS (not a nicety): modality/category are not decoration — a
// wrong one silently mis-routes the athlete's live workout. `displayCategoryForModality`
// (web/lib/athlete/assignment-detail.ts:790-809) exists because a "Run"
// catalogued as `cardio` sent iOS down the strength-formatting path and showed
// "1 sets" instead of the pace/distance the athlete actually needed. A "Cat Cow"
// born as `strength` would fail the SAME way, just for a different athlete.
//
// THE RULE, and it is absolute: WRONG IS WORSE THAN UNKNOWN. `guessMovement`
// returns `null` the moment it cannot back a category with a real signal in the
// name — never a default, never "strength because most things are". A coach
// choosing for 20 of 30 new exercises is a minor chore; a coach who has to
// AUDIT 30 silently-wrong ones because the importer guessed is a trust problem,
// and trust problems compound.
//
// MODALITY IS DERIVED, NOT GUESSED SEPARATELY — category → modality is already
// a settled, deterministic mapping (migration 0053_exercise_modality.sql, "the
// exercise is the single source of truth for modality"). Reproduced here (not
// imported: that migration is SQL, not a TS module) rather than re-derived from
// the name a second time, so the two axes can never disagree with each other.
//
// SIGNALS — curated PHRASES first (a name that matches a known, named movement
// almost verbatim), a generic KEYWORD fallback second (a word that leans one
// way but the name isn't a recognized movement). The corpus behind both is the
// 30+ real, unresolved exercise names from a real coach's photographed week
// (web/tests/import/fixtures/screenshot-semana12-*.json) — not invented, not
// guessed from intuition (see classify.test.ts, which asserts every one of
// them). Checked in ORDER, most-specific first, so a compound name like
// "Burpee Broad Jump" (an official HYROX station) is claimed before the bare
// "burpee" fallback (plyometric) ever gets a look, and "remo con barra" (a
// barbell row, strength) is claimed before bare "remo" (the rowing ERG,
// cardio) — the SAME word means two different things depending on how much of
// it is written down, and specificity is the only honest way to resolve that.

import type { Modality } from '../prescription/types';
import type { ExerciseCategory } from '../../schema/_primitives';

export interface MovementGuess {
  modality: Modality;
  category: ExerciseCategory;
  /**
   * `high` — the name matches a specific, named movement in the curated list
   * (e.g. "Cat Cow", "Sled Push", "Push Jerk"): safe to pre-fill.
   * `low` — only a generic keyword fired (e.g. a word containing "band" with
   * no other signal): the UI should show this as PROPOSED, not accepted —
   * same "coach confirms, never ships un-reviewed" contract as
   * `web/lib/import/fill-defaults.ts`.
   */
  confidence: 'high' | 'low';
}

/** Lowercase, NFD accent-fold, collapse whitespace — the same technique as
 *  `foldText` (shared/domain/import/dose.ts) and `lightNormalize`
 *  (web/lib/import/exercise-resolve.ts). Reproduced, not imported: this module
 *  is a foundational shared/domain leaf with no reason to depend on the
 *  import pipeline's internals for three lines of string handling. */
function fold(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Which cardio machine/mode a NAME points to — ski/row/bike/run. The ONE place
// that knows this, shared by `modalityForCategory` below (mirroring migration
// 0053's cardio derivation) AND `suggestModality` (web/lib/dashboard/exercises/
// catalog-ui.ts — the coach's create-exercise form), which used to carry its
// OWN, slightly different word list. Reconciled here on request (two
// classifiers that could silently drift apart is exactly the failure mode
// this module exists to prevent): the Spanish running vocabulary
// ("sprint"/"rodaje"/"tirada") and treating "airbike" as its own compound
// word came from `suggestModality`'s list and would otherwise have been lost
// by deleting it in favor of this one.
const CARDIO_MODALITY_HINTS: ReadonlyArray<readonly [RegExp, Modality]> = [
  [/\bski(?:erg)?\b/, 'ski'],
  [/\brow(?:ing)?\b|\bremo\b/, 'row'],
  [/\bbike\b|\bbici\w*\b|air[\s-]?bikes?|assault|\becho\b|\bcycl\w*\b/, 'bike'],
  [
    /\brun\b|\btreadmill\b|\bjog\w*\b|\bcarrera\b|\bcorrer\b|\bcinta\b|\btrote\b|\bsprints?\b|\brodajes?\b|\btiradas?\b/,
    'run',
  ],
];

/** Which cardio machine/mode `name` points to, or `null` when nothing does —
 *  the caller decides what "nothing matched" means: this module's own
 *  `modalityForCategory` falls back to `'other'` (migration 0053's exact
 *  rule), while `suggestModality`'s form always has to suggest SOMETHING and
 *  falls back to `'run'` instead. Same knowledge, two legitimately different
 *  fallback policies — not a fork of the knowledge itself. */
export function detectCardioModality(name: string): Modality | null {
  const folded = fold(name);
  return CARDIO_MODALITY_HINTS.find(([re]) => re.test(folded))?.[1] ?? null;
}

/**
 * category → modality, mirroring migration 0053's backfill rule exactly (see
 * file header). `cardio` still reads the NAME (via `detectCardioModality`)
 * for which cardio modality applies; `hyrox_station` does its OWN narrower
 * ski/row/run check (never bike — no official HYROX station is a bike leg,
 * unlike the general cardio case) per 0053's separate hyrox_station branch.
 */
function modalityForCategory(category: ExerciseCategory, folded: string): Modality {
  switch (category) {
    case 'strength':
      return 'strength';
    case 'core':
      return 'core';
    case 'mobility':
      return 'mobility';
    case 'plyometric':
    case 'skill':
      return 'functional';
    case 'cardio':
      return detectCardioModality(folded) ?? 'other';
    case 'hyrox_station':
      if (/\bski\b/.test(folded)) return 'ski';
      if (/\brow(ing)?\b|\bremo\b/.test(folded)) return 'row';
      if (/\brun\b|\bcarrera\b/.test(folded)) return 'run';
      return 'functional';
  }
}

interface Rule {
  re: RegExp;
  category: ExerciseCategory;
  confidence: 'high' | 'low';
}

// ── Curated phrases (HIGH) — checked FIRST, most-specific before generic ──────
// A phrase here is a recognizably NAMED movement, not a bare word — the level
// of confidence this module is willing to pre-fill without the coach's eyes.
const CURATED: Rule[] = [
  // Official HYROX stations + close named variants — checked before the
  // generic plyometric "burpee" rule below, so an official-shaped name wins.
  {
    re: /\b(sled push|empuje de trineo|sled pull|arrastre de trineo|sled drag|wall balls?|farmers? carry|paseo del granjero|sandbag lunges?|zancada(?:s)? con saco|burpee broad jumps?)\b/,
    category: 'hyrox_station',
    confidence: 'high',
  },
  // Mobility — yoga/stretch poses and dynamic drills, named as such. These are
  // the class of trap the corpus surfaced: "Cobra Pose" and "Hip Flexor
  // Stretch" carry no generic strength/cardio word at all, so they only
  // resolve if the POSE'S OWN NAME is in this list.
  {
    re: /\b(cat[\s-]?cow|cobra( pose)?|pigeon( pose)?|postura del ni[nñ]o|child'?s pose|downward dog|perro boca abajo|hip flexor stretch|estiramiento (?:de |del )?flexor de cadera|forward leg swing|balanceo de pierna|world'?s greatest stretch|pike stretch|couch stretch|thoracic rotation|rotaci[oó]n tor[aá]cica|foam roll(?:ing)?|rodillo(?: de espuma)?|shoulder dislocates?|cossack squats?)\b/,
    category: 'mobility',
    confidence: 'high',
  },
  // Core / activation — corrective, low-load stability work. Glute
  // bridge/march/isometric variants land here (not strength): the real card
  // this was built against titles the whole block "COMPENSATORIO GLÚTEO"
  // (compensatory glute work) — corrective activation, not a loaded lift.
  {
    re: /\b(bird dog|dead ?bug|hollow (?:hold|body)|russian twists?|(?:hanging )?leg raises?|elevaci[oó]n(?:es)? de piernas?|sit[\s-]?ups?|abdominales|crunch(?:es)?|pallof press|ab wheel|rueda abdominal|side plank|plancha lateral|planks?|planchas?|puente de gl[uú]teo|glute bridges?|marcha desde puente|isometr[ií]a en puente|extensi[oó]n de cadera en cuadr[uú]p\w*|single leg glute bridge)\b/,
    category: 'core',
    confidence: 'high',
  },
  // Shoulder/rotator-cuff accessory work — light band/cable isolation, always
  // programmed as STRENGTH accessory (injury-prevention blocks like "REFUERZO
  // HOMBRO" in the real card this was built against). Grouped as one rule so
  // the whole family stays consistent rather than splitting hairs per name.
  {
    re: /\b(cable external rotation|band pull[\s-]?aparts?|prone [ty] raises?|serratus wall slides?|wall slides?|band scapular retractions?|diagonal band pull[\s-]?apart|banded (?:front|lateral) raises?|scapular push[\s-]?ups?)\b/,
    category: 'strength',
    confidence: 'high',
  },
  // Named barbell/dumbbell/kettlebell lifts and their common Spanish names.
  // "row"/"remo" is DELIBERATELY specific here (barbell/dumbbell/cable row,
  // "remo con barra") — the bare word is cardio (the ERG), see CARDIO below,
  // and this rule is checked first so the qualified form wins.
  {
    re: /\b(press banca|bench press|back squats?|front squats?|sentadillas?(?: trasera| frontal)?|deadlifts?|peso muertos?|romanian deadlifts?|\brdl\b|push press|push jerks?|jerks?|power cleans?|hang power cleans?|cleans?|snatch(?:es)?|thrusters?|pull[\s-]?ups?|dominadas?( lastradas?)?|chin[\s-]?ups?|push[\s-]?ups?|flexiones( de brazo)?|(?:barbell|dumbbell|cable|seal|pendlay|db) rows?|remo con barra|bicep curls?|hammer curls?|hip thrusts?|lunges?|zancadas?|split squats?|bulgarian split squats?|walking lunges?|shrugs?|encogimientos?(?: ktb| kettlebell)?|goblet squats?)\b/,
    category: 'strength',
    confidence: 'high',
  },
  // Cardio — pure conditioning modalities, run/row/ski/bike/swim words.
  {
    re: /\b(runs?|jog(?:ging)?|treadmills?|carreras?|correr|cintas?|trotes?|sprints?|rodajes?|tiradas?|rows?|rowing|remos?|ski(?:erg)?|bikes?|bicis?|cycling|assault bikes?|echo bikes?|air[\s-]?bikes?|swims?|nadar|nataci[oó]n)\b/,
    category: 'cardio',
    confidence: 'high',
  },
  // Plyometric — explosive bodyweight/jump work. "burpee" alone (not the more
  // specific "burpee broad jump" caught above) is the exact trap the corpus
  // surfaced: it carries an implement mention elsewhere in a longer name
  // ("Burpee con salto a disco") but the movement family is still explosive
  // conditioning, not "skill" just because a discus is involved.
  {
    re: /\b(box jumps?|salto(?:s)? al caj[oó]n|broad jumps?|salto(?:s)? de longitud|depth jumps?|jump squats?|sentadillas? con salto|burpees?|boundings?|step[\s-]?ups?|cajones?)\b/,
    category: 'plyometric',
    confidence: 'high',
  },
  // Skill — technique/gymnastics/balance movements with no better home.
  {
    re: /\b(muscle[\s-]?ups?|handstands?( walks?)?|pinos?|double[\s-]?unders?|dobles? saltos? de comba|rope climbs?|subidas? de cuerda|pistol squats?)\b/,
    category: 'skill',
    confidence: 'high',
  },
];

// ── Generic keyword fallback (LOW) — a lone word that leans one way but the
// name is not a recognized movement. Checked only when nothing curated hit. ──
const GENERIC: Rule[] = [
  { re: /\b(band|banda|cable|polea)\b/, category: 'strength', confidence: 'low' },
  { re: /\b(stretch|estiramiento|movilidad|mobility)\b/, category: 'mobility', confidence: 'low' },
  { re: /\b(plank|plancha|abdominal|core|ab)\b/, category: 'core', confidence: 'low' },
  { re: /\b(jump|salto)\b/, category: 'plyometric', confidence: 'low' },
];

/**
 * Guess an exercise's category + modality from its bare NAME. Deterministic,
 * synchronous, no I/O — pure by contract, same as `fillMissingWithDefaults`.
 * `null` when nothing in the name backs a guess (a numeric-only name like
 * "90-90" — an OWN separate mobility drill this corpus DOES carry — has no
 * word for either list to catch, and is correctly `null`, not a coin flip).
 */
export function guessMovement(name: string): MovementGuess | null {
  const folded = fold(name);
  if (!folded) return null;

  for (const rule of CURATED) {
    if (rule.re.test(folded)) {
      return {
        category: rule.category,
        modality: modalityForCategory(rule.category, folded),
        confidence: rule.confidence,
      };
    }
  }
  for (const rule of GENERIC) {
    if (rule.re.test(folded)) {
      return {
        category: rule.category,
        modality: modalityForCategory(rule.category, folded),
        confidence: rule.confidence,
      };
    }
  }
  return null;
}
