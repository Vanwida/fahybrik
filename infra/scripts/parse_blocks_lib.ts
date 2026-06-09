/**
 * parse_blocks_lib.ts — PURE parsing core for the Biblioteca de Bloques
 * structured layer (0038). No DB, no I/O — just verbatim → structured.
 *
 * Imported by:
 *   - parse_blocks_structured.ts (the script that writes block_exercises)
 *   - the parser unit test
 *
 * See parse_blocks_structured.ts for the honesty contract and run docs.
 */

export type Params = {
  sets?: number;
  reps?: number;
  load_pct?: number;
  load_pct_range?: string;
  load_kg?: number;
  rpe?: number;
  rest_seconds?: number;
  duration_seconds?: number;
  distance_meters?: number;
  pace_sec_per_km?: number;
  hr_zone?: number;
  calories?: number;
  rounds?: number;
};

export type ParsedExercise = {
  slug: string; // catalog slug to resolve to exercise_id
  params: Params;
  reps_scheme?: string; // e.g. "10/10/8/8/6" — verbatim per-set scheme
  block_position?: number; // sub-block index (default 0)
  notes?: string;
};

export type ParsedBlock = {
  exercises: ParsedExercise[];
  needs_review: boolean;
  review_reason?: string;
};

// ---------------------------------------------------------------------------
// Exercises missing from the 62-catalog that the corpus genuinely references.
// Real HYROX/hybrid movements only — no junk. Created with source
// 'fahybrik_canonical'. video_url null (inherits later / Pablo fills).
// ---------------------------------------------------------------------------
export const EXERCISES_TO_CREATE: Array<{
  slug: string;
  name: string;
  category: string;
  primary_muscle_groups: string[];
  equipment: string[];
  default_metrics_json: Record<string, boolean>;
}> = [
  {
    slug: 'depth-jump',
    name: 'Depth Jump',
    category: 'plyometric',
    primary_muscle_groups: ['quadriceps', 'glutes', 'calves'],
    equipment: ['box'],
    default_metrics_json: { reps: true, sets: true },
  },
  {
    slug: 'zercher-squat-jump',
    name: 'Zercher Squat Jump',
    category: 'plyometric',
    primary_muscle_groups: ['quadriceps', 'glutes'],
    equipment: ['barbell'],
    default_metrics_json: { reps: true, sets: true, weight: true },
  },
  {
    slug: 'jump-squat',
    name: 'Jump Squat',
    category: 'plyometric',
    primary_muscle_groups: ['quadriceps', 'glutes'],
    equipment: ['barbell', 'bodyweight'],
    default_metrics_json: { reps: true, sets: true, weight: true },
  },
  {
    slug: 'hang-power-clean',
    name: 'Hang Power Clean',
    category: 'strength',
    primary_muscle_groups: ['hamstrings', 'glutes', 'traps', 'shoulders'],
    equipment: ['barbell'],
    default_metrics_json: { reps: true, sets: true, weight: true },
  },
  {
    slug: 'devil-press',
    name: 'Devil Press',
    category: 'strength',
    primary_muscle_groups: ['shoulders', 'chest', 'glutes', 'quadriceps'],
    equipment: ['dumbbell'],
    default_metrics_json: { reps: true, sets: true, weight: true },
  },
  {
    slug: 'lateral-raise',
    name: 'Lateral Raise',
    category: 'strength',
    primary_muscle_groups: ['shoulders'],
    equipment: ['dumbbell'],
    default_metrics_json: { reps: true, sets: true, weight: true },
  },
  {
    slug: 'cable-fly',
    name: 'Cable Fly',
    category: 'strength',
    primary_muscle_groups: ['chest'],
    equipment: ['cable'],
    default_metrics_json: { reps: true, sets: true, weight: true },
  },
  {
    slug: 'side-plank',
    name: 'Side Plank',
    category: 'core',
    primary_muscle_groups: ['obliques', 'core'],
    equipment: ['bodyweight'],
    default_metrics_json: { time: true, sets: true },
  },
];

// ---------------------------------------------------------------------------
// Alias map: normalized verbatim term → catalog slug. Keys are matched after
// normalization (lowercase, accent-stripped). Order doesn't matter; longest
// match wins in the tokenizers below where relevant.
// ---------------------------------------------------------------------------
export const ALIASES: Record<string, string> = {
  // strength
  'front squat': 'front-squat',
  'back squat': 'back-squat',
  'deadlift': 'deadlift',
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
  'push up': 'push-up',
  'push ups': 'push-up',
  'dip': 'weighted-dip',
  'dips': 'weighted-dip',
  'lateral raise': 'lateral-raise',
  'elevaciones laterales': 'lateral-raise',
  'cable fly': 'cable-fly',
  'aperturas en polea': 'cable-fly',
  // ergs / cardio
  'row': 'row',
  'rowing': 'row',
  'skierg': 'ski-erg',
  'ski': 'ski-erg',
  'ab': 'assault-bike',
  'assault bike': 'assault-bike',
  'bike': 'bike-erg',
  'run': 'run',
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
  'devil press': 'devil-press',
  // core / mobility
  'side plank': 'side-plank',
  'lateral plank': 'side-plank',
  'plank': 'plank',
  'sit up': 'sit-up',
  'sit ups': 'sit-up',
};

// Catalog slugs whose default metric set is duration-based (erg/run/zone work):
// these never get a reps_scheme, and a bare number is a duration not reps.
const CARDIO_SLUGS = new Set(['row', 'ski-erg', 'assault-bike', 'bike-erg', 'run']);

// ---------------------------------------------------------------------------
// Small parsing helpers.
// ---------------------------------------------------------------------------
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Capture group `i` of a successful match as a guaranteed string. Use only for
 * NON-optional groups (the regex guarantees them once the overall match
 * succeeds); satisfies `noUncheckedIndexedAccess` without scattering `!`.
 */
function cap(m: RegExpMatchArray, i: number): string {
  const v = m[i];
  if (v === undefined) throw new Error(`expected capture group ${i} in match "${m[0]}"`);
  return v;
}

function resolveAlias(term: string): string | null {
  const n = normalize(term);
  if (ALIASES[n]) return ALIASES[n];
  // try progressively shorter prefixes (e.g. "front squat plio" → "front squat")
  const words = n.split(' ');
  for (let len = words.length; len >= 1; len--) {
    const candidate = words.slice(0, len).join(' ');
    if (ALIASES[candidate]) return ALIASES[candidate];
  }
  return null;
}

/** "10/10/8/8/6" or "10-10-8-8-6" → { sets, reps, scheme }. */
function parseRepScheme(raw: string): { sets: number; reps: number; scheme: string } | null {
  const m = raw.match(/(\d+(?:\s*[\/\-]\s*\d+){1,})/);
  if (!m) return null;
  const parts = cap(m, 1).split(/[\/\-]/).map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));
  if (parts.length < 2) return null;
  const scheme = parts.join('/');
  // reps summary = top (first) set; sets = count of listed schemes.
  return { sets: parts.length, reps: parts[0]!, scheme };
}

/** "65-80%" → { load_pct: 65, load_pct_range: "65-80" }. "70%" → { load_pct: 70 }. */
function parseLoadPct(raw: string): { load_pct?: number; load_pct_range?: string } {
  const range = raw.match(/(\d{1,3})\s*-\s*(\d{1,3})\s*%/);
  if (range) return { load_pct: parseInt(cap(range, 1), 10), load_pct_range: `${cap(range, 1)}-${cap(range, 2)}` };
  const single = raw.match(/(\d{1,3})\s*%/);
  if (single) return { load_pct: parseInt(cap(single, 1), 10) };
  return {};
}

/** "5x3'" / "5x3'30''" / "5x4'" → duration_seconds per interval + rounds. */
function parseInterval(raw: string): { rounds?: number; duration_seconds?: number } {
  // minutes group required (N'); optional seconds group (M'').
  const m = raw.match(/(\d+)\s*x\s*(\d+)\s*'(?:\s*(\d+)\s*'')?/);
  if (!m) return {};
  const rounds = parseInt(cap(m, 1), 10);
  const min = parseInt(cap(m, 2), 10);
  const sec = m[3] ? parseInt(m[3], 10) : 0;
  return { rounds, duration_seconds: min * 60 + sec };
}

/** "45'' rest" / "1' rest" / "90'' rest" → rest_seconds. */
function parseRest(raw: string): number | undefined {
  const m = raw.match(/(\d+)\s*'\s*(\d+)?\s*''?\s*(?:rest|estático rest|walking rest|trote)/i)
    ?? raw.match(/(\d+)\s*''\s*(?:rest|estático rest|walking rest)/i);
  if (m) {
    const a = parseInt(cap(m, 1), 10);
    if (m[2]) return a * 60 + parseInt(m[2], 10);
    // a' rest vs a'' rest: if matched with single-quote it's minutes
    return raw.includes(`${a}'`) && !raw.includes(`${a}''`) ? a * 60 : a;
  }
  const ss = raw.match(/(\d+)\s*''\s*rest/i);
  if (ss) return parseInt(cap(ss, 1), 10);
  return undefined;
}

/** "RPE8" → 8. */
function parseRpe(raw: string): number | undefined {
  const m = raw.match(/rpe\s*(\d{1,2})/i);
  return m ? parseInt(cap(m, 1), 10) : undefined;
}

/** "z2" / "zona 2" → 2. */
function parseHrZone(raw: string): number | undefined {
  const m = normalize(raw).match(/z(?:ona)?\s*(\d)/);
  return m ? parseInt(cap(m, 1), 10) : undefined;
}

/** "1h20'" / "1h25'" / "20'" / "30'" → duration_seconds. */
function parseDuration(raw: string): number | undefined {
  const hm = raw.match(/(\d+)\s*h\s*(\d+)\s*'/);
  if (hm) return parseInt(cap(hm, 1), 10) * 3600 + parseInt(cap(hm, 2), 10) * 60;
  const h = raw.match(/(\d+)\s*h(?!\d)/);
  if (h) return parseInt(cap(h, 1), 10) * 3600;
  const min = raw.match(/(\d+)\s*'(?!\d)(?!')/);
  if (min) return parseInt(cap(min, 1), 10) * 60;
  return undefined;
}

/** "4km" → 4000m, "1000" (in a run context) → 1000m, "500m" → 500. */
function parseDistanceMeters(raw: string): number | undefined {
  const km = raw.match(/(\d+(?:[.,]\d+)?)\s*km/i);
  if (km) return Math.round(parseFloat(cap(km, 1).replace(',', '.')) * 1000);
  const m = raw.match(/(\d+)\s*m(?![a-z])/i);
  if (m) return parseInt(cap(m, 1), 10);
  return undefined;
}

/** "1'45''" / "1'30''" / "45''" → pace/rest seconds. */
function parseClock(raw: string): number | undefined {
  const ms = raw.match(/(\d+)\s*'\s*(\d+)\s*''/);
  if (ms) return parseInt(cap(ms, 1), 10) * 60 + parseInt(cap(ms, 2), 10);
  const s = raw.match(/(\d+)\s*''/);
  if (s) return parseInt(cap(s, 1), 10);
  return undefined;
}

// ---------------------------------------------------------------------------
// Per-pattern parsers. Each returns ParsedExercise[] or null (not its pattern).
// ---------------------------------------------------------------------------

/**
 * Strength sub-block: "Front squat 5 rounds 10/10/8/8/6 al 65-80%".
 * Handles "Nr"/"N rounds"/"N series", rep schemes, %1RM ranges. Used for g1
 * and the strength parts of chained blocks.
 */
function parseStrengthExpr(expr: string, blockPosition: number): ParsedExercise | null {
  const slug = leadingExerciseSlug(expr);
  if (!slug) return null;
  const params: Params = {};
  const scheme = parseRepScheme(expr);
  // sets count from "5r"/"5 rounds"/"6 series" if present (overrides scheme count)
  const setsM = expr.match(/(\d+)\s*(?:r|rounds|series|rondas)\b/i);
  if (scheme) {
    params.reps = scheme.reps;
    params.sets = setsM ? parseInt(cap(setsM, 1), 10) : scheme.sets;
  } else if (setsM) {
    params.sets = parseInt(cap(setsM, 1), 10);
  }
  const load = parseLoadPct(expr);
  if (load.load_pct !== undefined) params.load_pct = load.load_pct;
  if (load.load_pct_range) params.load_pct_range = load.load_pct_range;
  const kg = expr.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (kg) params.load_kg = parseFloat(cap(kg, 1).replace(',', '.'));
  const repsScheme = scheme && !CARDIO_SLUGS.has(slug) ? scheme.scheme : undefined;
  return {
    slug,
    params,
    ...(repsScheme !== undefined ? { reps_scheme: repsScheme } : {}),
    block_position: blockPosition,
  };
}

// Tokens that prefix/decorate an exercise name without changing it: rep/round
// counts ("8r", "20", "4 rounds"), equipment shorthand ("DB", "KB", "BW"),
// "every 2'", "high"/"strict" qualifiers. Stripped before alias resolution.
const NOISE_PREFIX =
  /^(?:\d+\s*(?:r|rounds|series|rondas|x)?\b|every\s+\d+\s*'?|db|kb|bw|high|strict|barbell|bb)\s+/i;

function stripNoise(expr: string): string {
  let s = expr.trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(NOISE_PREFIX, '').trim();
  } while (s !== prev);
  return s;
}

/**
 * First catalog-resolvable exercise found by scanning the expression: tries the
 * cleaned leading phrase first, then any window of up to 4 words anywhere in
 * the segment. Tolerates equipment/quantity prefixes ("8r DB Depth Jump").
 */
function leadingExerciseSlug(expr: string): string | null {
  const direct = matchPhrase(stripNoise(expr));
  if (direct) return direct;
  // scan windows anywhere (handles "to 4 broad jumps", "DB box step")
  const words = normalize(expr).split(' ');
  for (let i = 0; i < words.length; i++) {
    for (let len = Math.min(4, words.length - i); len >= 1; len--) {
      const slug = resolveAlias(words.slice(i, i + len).join(' '));
      if (slug) return slug;
    }
  }
  return null;
}

/** Resolve the leading phrase of a cleaned string (longest window first). */
function matchPhrase(cleaned: string): string | null {
  const words = normalize(cleaned).split(' ');
  for (let len = Math.min(words.length, 4); len >= 1; len--) {
    const slug = resolveAlias(words.slice(0, len).join(' '));
    if (slug) return slug;
  }
  return null;
}

/**
 * Erg interval: "ROW: 5' WU → 5x3' RPE8 – 45'' rest".
 * Emits the erg exercise with rounds/duration/rest/rpe.
 */
function parseErgInterval(desc: string): ParsedExercise[] | null {
  const head = desc.match(/^(ROW|SKIERG|SKI|AB|ASSAULT BIKE|BIKE)\s*:/i);
  if (!head) return null;
  const slug = resolveAlias(cap(head, 1));
  if (!slug) return null;
  const params: Params = {};
  const iv = parseInterval(desc);
  if (iv.rounds) params.rounds = iv.rounds;
  if (iv.duration_seconds) params.duration_seconds = iv.duration_seconds;
  const rest = parseRest(desc);
  if (rest !== undefined) params.rest_seconds = rest;
  const rpe = parseRpe(desc);
  if (rpe !== undefined) params.rpe = rpe;
  return [{ slug, params, block_position: 0 }];
}

/**
 * Zone-2 steady work: "Run 1h15' zona 2", "10' row z2 + 10' skierg z2 …".
 * Emits one exercise per "<dur> <ergslug> z2" segment.
 */
function parseZone(desc: string): ParsedExercise[] | null {
  const z = parseHrZone(desc);
  // accept blocks that mention a zone OR are plainly a single steady run with duration
  const segs = desc.split('+').map((s) => s.trim());
  const out: ParsedExercise[] = [];
  for (const seg of segs) {
    let slug = leadingExerciseSlug(seg) ?? trailingErgSlug(seg);
    // A zone segment with a distance/duration but no erg keyword is a RUN
    // ("4km zona 2", "Run zona 2 1h25'" where the leading word resolves anyway).
    if ((!slug || !CARDIO_SLUGS.has(slug)) && (parseHrZone(seg) ?? z) !== undefined) {
      slug = 'run';
    }
    if (!slug || !CARDIO_SLUGS.has(slug)) continue;
    const params: Params = {};
    const dur = parseDuration(seg);
    if (dur !== undefined) params.duration_seconds = dur;
    const dist = parseDistanceMeters(seg);
    if (dist !== undefined && slug === 'run') params.distance_meters = dist;
    const zoneSeg = parseHrZone(seg) ?? z;
    if (zoneSeg !== undefined) params.hr_zone = zoneSeg;
    if (Object.keys(params).length === 0) continue;
    out.push({ slug, params, block_position: out.length });
  }
  return out.length > 0 ? out : null;
}

/** "10' row" / "14cal skierg": erg slug may trail the duration/cal. */
function trailingErgSlug(seg: string): string | null {
  const n = normalize(seg);
  for (const key of ['skierg', 'ski', 'row', 'ab', 'bike', 'run']) {
    if (n.includes(key)) return ALIASES[key] ?? null;
  }
  return null;
}

/**
 * Run interval: "Treadmill Threshold: 5' WU → 5x6' RPE8 – 2' rest",
 * "12 rounds x 400m run – 1' rest", "Run z2 1h20'", "4km easy run".
 */
function parseRunBlock(desc: string): ParsedExercise[] | null {
  if (!/\brun\b|cinta|treadmill|pista|tempo|threshold|fartlek|series|km\/h|easy run|trote/i.test(desc)) {
    return null;
  }
  const params: Params = {};
  const iv = parseInterval(desc);
  if (iv.rounds) params.rounds = iv.rounds;
  if (iv.duration_seconds) params.duration_seconds = iv.duration_seconds;
  // "12 rounds x 400m" / "3x1000" → rounds + per-rep distance (first interval).
  const distRounds =
    desc.match(/(\d+)\s*(?:rounds|x)\s*x?\s*(\d+)\s*m\b/i) ??
    desc.match(/(\d+)\s*x\s*(\d{3,4})\b/);
  if (distRounds) {
    params.rounds = parseInt(cap(distRounds, 1), 10);
    params.distance_meters = parseInt(cap(distRounds, 2), 10);
  } else {
    const dist = parseDistanceMeters(desc);
    if (dist !== undefined) params.distance_meters = dist;
  }
  const rest = parseRest(desc);
  if (rest !== undefined) params.rest_seconds = rest;
  const rpe = parseRpe(desc);
  if (rpe !== undefined) params.rpe = rpe;
  const zone = parseHrZone(desc);
  if (zone !== undefined) params.hr_zone = zone;
  if (params.duration_seconds === undefined) {
    const dur = parseDuration(desc);
    if (dur !== undefined) params.duration_seconds = dur;
  }
  if (Object.keys(params).length === 0) return null;
  return [{ slug: 'run', params, block_position: 0 }];
}

// ---------------------------------------------------------------------------
// Group-level orchestration: choose the parser by methodology_group_id, fall
// back to needs_review honestly.
// ---------------------------------------------------------------------------
export function parseBlock(groupId: number, desc: string): ParsedBlock {
  switch (groupId) {
    case 1: // strength base — split "+" chains, parse each strength expr
    case 9: // functional circuits — strength-ish chains where mappable
      return parseChained(desc, groupId);
    case 2: // plyometric — chains of clean/jump/box-jump
      return parseChained(desc, groupId);
    case 3: {
      const erg = parseErgInterval(desc);
      if (erg) return { exercises: erg, needs_review: false };
      const chained = parseChained(desc, groupId);
      return chained;
    }
    case 4: {
      const run = parseRunBlock(desc);
      if (run) return { exercises: run, needs_review: false };
      return { exercises: [], needs_review: true, review_reason: 'run format not parsed' };
    }
    case 5: {
      const zone = parseZone(desc) ?? parseRunBlock(desc);
      if (zone && zone.length > 0) return { exercises: zone, needs_review: false };
      return { exercises: [], needs_review: true, review_reason: 'zone format not parsed' };
    }
    case 8: // core / mobility — only map plank/sit-up/TGU/erg-warmup confidently
      return parseCoreMobility(desc);
    case 6: // metcons / WODs
    case 7: // race simulations
    case 10: // tapering (mix of run/zone/sim)
      return parseMixedOrReview(desc, groupId);
    default:
      return { exercises: [], needs_review: true, review_reason: `unknown group ${groupId}` };
  }
}

/**
 * Chain parser: split on "+" and parse each segment as a strength expression.
 * Segments that resolve become exercises (own block_position); segments that
 * don't are tolerated as long as at least one resolves. If NONE resolve → review.
 */
function parseChained(desc: string, groupId: number): ParsedBlock {
  const segs = desc.split('+').map((s) => s.trim()).filter(Boolean);
  const out: ParsedExercise[] = [];
  let unresolved = 0;
  for (const seg of segs) {
    const ex = parseStrengthExpr(seg, out.length);
    if (ex) out.push(ex);
    else unresolved++;
  }
  if (out.length === 0) {
    return { exercises: [], needs_review: true, review_reason: 'no exercise resolved from chain' };
  }
  // partial resolution on dense plyo/functional chains → still usable but flag
  const needsReview = unresolved > out.length;
  return {
    exercises: out,
    needs_review: needsReview,
    ...(needsReview ? { review_reason: `${unresolved}/${segs.length} segments unresolved` } : {}),
  };
}

/** Core/mobility: map plank/side-plank/sit-up/TGU/pull-up/push-up + erg warmups. */
function parseCoreMobility(desc: string): ParsedBlock {
  // split on "+" (chained pieces) and "/" (EMOM alternations like
  // "pull ups / push ups"). "''/'' " work/rest is handled before splitting.
  const workRest = /\d+\s*x\s*\d+\s*''\s*\/\s*\d+\s*''/.test(desc);
  const segs = (workRest ? desc.split('+') : desc.split(/[+/]/))
    .map((s) => s.trim())
    .filter(Boolean);
  const out: ParsedExercise[] = [];
  for (const seg of segs) {
    const slug = leadingExerciseSlug(seg) ?? trailingErgSlug(seg);
    if (!slug) continue;
    const params: Params = {};
    // "4x40''/20''" → sets + work/rest seconds (store as duration + rest)
    const setsM = seg.match(/(\d+)\s*x\s*(\d+)\s*''\s*\/\s*(\d+)\s*''/);
    if (setsM) {
      params.sets = parseInt(cap(setsM, 1), 10);
      params.duration_seconds = parseInt(cap(setsM, 2), 10);
      params.rest_seconds = parseInt(cap(setsM, 3), 10);
    } else {
      const r = seg.match(/(\d+)\s*r\b/i);
      if (r) params.sets = parseInt(cap(r, 1), 10);
      const dur = parseDuration(seg);
      if (dur !== undefined) params.duration_seconds = dur;
      const zone = parseHrZone(seg);
      if (zone !== undefined) params.hr_zone = zone;
    }
    // Core/mobility movements are valid even with no explicit params (coach
    // fills volume on use). Skip only pure "mobility/foam" prose (no exercise).
    out.push({ slug, params, block_position: out.length });
  }
  if (out.length === 0) {
    return { exercises: [], needs_review: true, review_reason: 'mobility/foam — no mappable exercise' };
  }
  return { exercises: out, needs_review: false };
}

/**
 * Metcons / race sims / tapering: these are dense, multi-station, often
 * non-decomposable. HONEST policy: only emit structure when the block is a
 * clean single-modality piece we already parse (a plain run/zone/erg in g10).
 * Everything genuinely multi-station → needs_review with NO fabricated
 * structure (verbatim is the truth; the materializer degrades to a note).
 */
function parseMixedOrReview(desc: string, groupId: number): ParsedBlock {
  // g10 tapering sometimes is a plain run/zone block → reuse those parsers.
  if (groupId === 10) {
    const zone = parseZone(desc);
    if (zone && zone.length === 1) return { exercises: zone, needs_review: false };
    const run = parseRunBlock(desc);
    if (run && run.length === 1) return { exercises: run, needs_review: false };
  }
  return {
    exercises: [],
    needs_review: true,
    review_reason: 'dense multi-station WOD/sim — verbatim kept, needs Pablo review',
  };
}
