// Runtime notation vocabulary and normalization shared by both resolvers.
// Catalog aliases live in data; this map preserves historical shorthand.

// ---------------------------------------------------------------------------
// GLOBAL alias seed — normalized term → catalog slug. Mirror of
// infra/scripts/parse_blocks_lib.ts::ALIASES (that module is the source of
// truth; see the header note). Keys are matched AFTER normalization.
// ---------------------------------------------------------------------------
export const GLOBAL_ALIASES: Readonly<Record<string, string>> = {
  // strength
  'front squat': 'front-squat',
  'back squat': 'back-squat',
  'deadlift': 'deadlift',
  'rdl': 'romanian-deadlift',
  'romanian deadlift': 'romanian-deadlift',
  'bench press': 'bench-press',
  'bench press horizontal': 'bench-press',
  'strict shoulder press': 'overhead-press',
  'shoulder press': 'overhead-press',
  'push press': 'push-press',
  'power clean': 'power-clean',
  'hang power clean': 'hang-power-clean',
  'clean': 'power-clean',
  'thruster': 'thruster',
  'thrusters': 'thruster',
  'hip thrust': 'hip-thrust',
  'goblet squat': 'goblet-squat',
  'bulgarian squat': 'bulgarian-split-squat',
  'bulgarian split squat': 'bulgarian-split-squat',
  'reverse lunge': 'reverse-lunge',
  'walking lunge': 'walking-lunge',
  'turkish get-up': 'turkish-get-up',
  'turkish get up': 'turkish-get-up',
  'pull up': 'pull-up',
  'pull ups': 'pull-up',
  // ES↔EN translation, not a new movement (2026-08-05 sweep against the real
  // catalog — "Dominada" IS "Pull-up", same movement in two languages, and a
  // translation is our own mechanism, never a coach's methodology). The
  // "(lastrada)"/qualifier suffix on a real card ("Dominada (lastrada)")
  // still resolves through this key via aliasToSlug's word-window scan — no
  // extra key needed for that; the WEIGHTED form below is a distinct catalog
  // row and needs its own key precisely because it is a different movement.
  'dominada': 'pull-up',
  'dominadas': 'pull-up',
  'dominada lastrada': 'weighted-pullup',
  'dominadas lastradas': 'weighted-pullup',
  'push up': 'push-up',
  'push ups': 'push-up',
  // Caught by verifying, not by inspection: aliasToSlug's word-window scan
  // checks the LONGEST window first, but "push up" (2 words) is a substring
  // of "scapular push up" (3 words) — without its OWN 3-word key, "Scapular
  // Push Up" (migration 0152) silently resolved to the generic push-up
  // instead, a wrong-exercise bug the coach would never notice. The explicit
  // longer key wins the race before the shorter one ever gets a look.
  'scapular push up': 'scapular-push-up',
  'scapular push ups': 'scapular-push-up',
  'dip': 'weighted-dip',
  'dips': 'weighted-dip',
  'lateral raise': 'lateral-raise',
  'elevaciones laterales': 'lateral-raise',
  'cable fly': 'cable-fly',
  'aperturas en polea': 'cable-fly',
  // "Press Banca" IS "Bench Press" — same translation-not-invention rule.
  'press banca': 'bench-press',
  // ergs / cardio
  'row': 'row',
  'rowing': 'row',
  // "Remo" bare is the ERG (cardio) — same word, same "row"/"clean"/"ski"
  // single-word convention already used below; a genuinely different
  // movement that happens to CONTAIN "remo" ("Remo con barra", a barbell row
  // — strength, not cardio) is the coach's to correct once via learnSynonym
  // (layer 1, which always wins next time), exactly like "row"/"clean" today.
  'remo': 'row',
  'skierg': 'ski-erg',
  'ski': 'ski-erg',
  'ab': 'assault-bike',
  'assault bike': 'assault-bike',
  'bike': 'bike-erg',
  'run': 'run',
  'carrera': 'run',
  'correr': 'run',
  // hyrox stations
  'wall balls': 'hyrox-wall-balls',
  'wall ball': 'hyrox-wall-balls',
  'sled push': 'hyrox-sled-push',
  'sled pull': 'hyrox-sled-pull',
  'sled drag': 'sled-drag-backwards',
  'farmer carry': 'hyrox-farmer-carry',
  'farmers carry': 'hyrox-farmer-carry',
  'sb lunge': 'hyrox-sandbag-lunges',
  'sandbag lunge': 'hyrox-sandbag-lunges',
  // plyometric / skill
  'box jump': 'box-jump',
  'high box jump': 'box-jump',
  'broad jump': 'broad-jump',
  'broad jumps': 'broad-jump',
  'depth jump': 'depth-jump',
  'bar zercher jump': 'zercher-squat-jump',
  'zercher jump': 'zercher-squat-jump',
  'jump back squat': 'jump-squat',
  'jump squat': 'jump-squat',
  'burpee': 'burpee',
  'ttb': 'toes-to-bar',
  'toes-to-bar': 'toes-to-bar',
  'db snatch': 'dumbbell-snatch',
  'db box step': 'box-step-up',
  'box step': 'box-step-up',
  // "Step Ups Cajón" IS "Box Step-up" — "cajón" is the box, same movement.
  'step ups cajon': 'box-step-up',
  'step up cajon': 'box-step-up',
  'devil press': 'devil-press',
  // core / mobility
  'side plank': 'side-plank',
  'lateral plank': 'side-plank',
  'plank': 'plank',
  'sit up': 'sit-up',
  'sit ups': 'sit-up',
  // "Forward Leg Swing" is the catalog's generic "Leg Swings" done in the
  // forward/back plane — the SAME drill, direction specified, not a
  // different one (unlike "Puente de glúteo" vs "Hip Thrust", which stay
  // UNALIASED below in the sweep's negative findings — those are genuinely
  // different movements). "Balanceo de pierna(s)" is its Spanish name, added
  // for the same reason "carrera"/"correr" sit next to "run" above.
  'forward leg swing': 'leg-swings',
  'forward leg swings': 'leg-swings',
  'balanceo de pierna': 'leg-swings',
  'balanceo de piernas': 'leg-swings',
  // English equivalents for the Spanish-named rows added by migration 0152
  // (mobility/activation base catalog) — the row's OWN name is the coach's
  // real Spanish wording (per that migration's header), so the catalog-name
  // exact/substring layers already resolve the exact Spanish phrase once the
  // row exists; these are for the English side of the same movement. NOT
  // resolvable yet — 0152 is written but NOT applied (client sign-off
  // pending); these keys become live the moment it runs, safe to ship ahead
  // of it (aliasToSlug finds the slug, the `exercises` lookup just misses
  // until the row exists, same as any other miss).
  'glute bridge': 'glute-bridge',
  // Same race as "Scapular Push Up" above, same fix: "single leg glute
  // bridge" (4 words) CONTAINS "glute bridge" (2 words) as its last two
  // words. Without its own 4-word key here, the scan's first pass (the full
  // 4-word window) misses, and it falls through to the 2-word pass, where
  // "glute bridge" — a real key — wins, resolving to the BILATERAL bridge
  // instead of this single-leg one. Caught the same way: running the real
  // resolver against a real branch, not by reading the code.
  'single leg glute bridge': 'single-leg-glute-bridge',
  'glute bridge march': 'glute-bridge-march',
  'isometric glute bridge': 'glute-bridge-isometric-hold',
  'glute bridge hold': 'glute-bridge-isometric-hold',
  // "90-90"/"90/90" carries no letters at all — the ONLY way it resolves is
  // this exact-string key; the catalog row is named descriptively ("90/90
  // Hip Stretch") for OTHER coaches browsing it, which the bare digits would
  // never usefully be.
  '90-90': 'hip-90-90-stretch',
  '90/90': 'hip-90-90-stretch',
  'quadruped hip extension': 'quadruped-hip-extension',
  'donkey kick': 'quadruped-hip-extension',
  'donkey kicks': 'quadruped-hip-extension',
};

// ---------------------------------------------------------------------------
// Normalization.
// ---------------------------------------------------------------------------

// Leading quantity/equipment/qualifier noise — mirrors parse_blocks_lib.ts's
// NOISE_PREFIX: rep/round counts ("8r", "3 rounds", "6 series"), equipment
// shorthand (DB/KB/BW/BB/barbell), "every 2'", "high"/"strict" qualifiers. Each
// alternative must be followed by whitespace (i.e. it decorates a FOLLOWING
// exercise name), so it never eats a bare token that IS the exercise.
const NOISE_PREFIX =
  /^(?:\d+\s*(?:r|rounds|series|rondas|x)?\b|every\s+\d+\s*'?|db|kb|bw|high|strict|barbell|bb)\s+/i;

// Trailing (or embedded) load suffix — "70kg", "22.5 kg", "24 KG". Pure noise
// for identity; stripped everywhere it appears.
const LOAD_SUFFIX = /\s*\d+(?:[.,]\d+)?\s*kg\b/gi;

// Combining diacritical marks (U+0300–U+036F) — removed after NFD decomposition.
const DIACRITICS = /[̀-ͯ]/g;

/**
 * Light normalization only: lowercase, strip accents, collapse whitespace, trim.
 * This is the form the alias window-scan matches (some alias KEYS embed an
 * equipment token, e.g. "db snatch", which the aggressive `normalizeTerm` would
 * strip away).
 */
function lightNormalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The canonical resolver/synonym key: `lightNormalize` PLUS stripping leading
 * quantity/equipment/qualifier noise (repeatedly, until stable) and any `\d+kg`
 * load suffix. This is what `coach_exercise_synonyms.term_normalized` stores and
 * what the equality lookups compare against.
 */
export function normalizeTerm(raw: string): string {
  let s = lightNormalize(raw);
  let prev: string;
  do {
    prev = s;
    s = s.replace(NOISE_PREFIX, '').trim();
  } while (s !== prev);
  s = s.replace(LOAD_SUFFIX, '').replace(/\s+/g, ' ').trim();
  return s;
}

/** Remove quantities and load while keeping identity-bearing qualifiers/material.
 * "8r DB snatch 24kg" stays "db snatch", never the generic barbell "snatch".
 */
export function identityTerm(raw: string): string {
  let s = lightNormalize(raw);
  let previous: string;
  do {
    previous = s;
    s = s.replace(/^(?:\d+\s*(?:r|rounds|series|rondas|x)?\b|every\s+\d+\s*'?)\s+/i, '').trim();
  } while (s !== previous);
  return s.replace(LOAD_SUFFIX, '')
    .replace(/\s*[<>≤≥]?\s*\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*%(?:\s*1?rm)?/gi, '')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Resolve a normalized candidate against the GLOBAL alias map: exact key first,
 * then the longest word-window (up to 4 words) found ANYWHERE in the candidate —
 * so "8r db depth jump" and "db snatch" both resolve. Returns the catalog slug
 * or null. Deterministic (longest window wins, scanned left-to-right).
 *
 * Parenthetical qualifiers ("Dominada (lastrada)", a real card line) are
 * common Spanish notation and must not defeat the window-scan: the ONLY
 * splitter was a literal space, so "dominada (lastrada)" tokenized as
 * `["dominada", "(lastrada)"]` — the 2-word window never matched a
 * "dominada lastrada" key (parens are not spaces), and the loop fell through
 * to the 1-word "dominada" match instead, silently discarding the qualifier.
 * Stripping just the paren CHARACTERS (never their content) before splitting
 * turns it into two clean words, so a 2-word key can still claim the
 * qualified form ahead of the bare 1-word fallback, exactly as the
 * longest-window-wins contract already promises for space-separated input.
 */
export function aliasToSlug(candidate: string): string | null {
  if (!candidate) return null;
  const exact = GLOBAL_ALIASES[candidate];
  if (exact) return exact;
  const words = candidate
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const slug = GLOBAL_ALIASES[words.slice(i, i + len).join(' ')];
      if (slug) return slug;
    }
  }
  return null;
}
