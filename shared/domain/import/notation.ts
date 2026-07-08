// notation — GRAMMAR-FIRST importer for ONE cell of Pablo's real training
// notation (a day's "Capa 2" session text) → typed `Prescription` lines + a
// per-line confidence. This is the DETERMINISTIC half of the #28 importer
// (Fork A): it types ONLY what the grammar can prove, and marks everything else
// `review` with the raw text preserved. It NEVER hallucinates a number.
//
// HONESTY CONTRACT (the whole point of this module)
// -------------------------------------------------
// A cell like "Deadlift 5r 10/10/8/6/4 + Hip thrust 5r 10/10/8/8/6" splits into
// TWO typed strength lines. A dense multi-station WOD/HYROX-sim that the grammar
// cannot confidently decompose becomes ONE line with `confidence:'review'` whose
// verbatim text is kept in the prescription's `note` — NO fabricated sets, reps,
// loads or targets. The LLM fallback (wired later by the endpoint, NOT here) is
// what attempts the dense lines. Everything we DO type is validated against
// `prescriptionSchema`; a validation failure downgrades the line to `review`.
// The only free text that ever survives into a typed result is the model's own
// `note` field (Alex's sacred rule: everything else is structured).
//
// The grammar (rep schemes, %RM ranges, intervals, rest, RPE, zones, durations,
// distances, paces, work/rest) is ported and extended from the existing
// `infra/scripts/parse_blocks_lib.ts` deterministic core.

import {
  type Modality,
  type PaceCap,
  type Prescription,
  type PrescriptionScheme,
  type PrescriptionSet,
  type Target,
  prescriptionSchema,
} from '../prescription/types';

// ── Public API ───────────────────────────────────────────────────────────────

export type NotationConfidence = 'detected' | 'review';

/** One recognized line of a session cell: the exercise label, its typed dosage,
 *  and how sure the grammar is about the typing. `exercise_token` is verbatim
 *  (resolution to a catalog exercise is a LATER concern, not this module's job)
 *  and is empty for a `review` line, which has no single movement. */
export interface ParsedLine {
  exercise_token: string;
  prescription: Prescription;
  confidence: NotationConfidence;
  review_reasons: string[];
}

/**
 * Parse ONE session cell (a day's Capa-2 text, possibly multi-line) into typed
 * prescription lines. Header/prose/coach-note lines are dropped; each remaining
 * work line is typed (`detected`) or preserved for review (`review`).
 */
export function parseNotationCell(text: string): ParsedLine[] {
  const cell = normalizeNotation(text);
  const lines = joinContinuations(cell.split('\n'));
  const out: ParsedLine[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || isNoiseLine(line)) continue;
    out.push(...parseLine(line));
  }
  return out;
}

// ── Normalization ────────────────────────────────────────────────────────────
// Pablo writes seconds as a straight double-quote (45"), two single-quotes
// (45''), or a Unicode double-prime. Unify them so ONE grammar covers all. Also
// unify smart quotes and the minute prime. Dashes are LEFT as-is (they separate
// rep/load schemes and rest clauses, which are parsed independently).

function normalizeNotation(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[′ʹ]/g, "'") // ′ ʹ (prime) → '
    .replace(/[″‶]/g, "''") // ″ ‶ (double prime) → ''
    .replace(/[‘’‛]/g, "'") // ‘ ’ ‛ → '
    .replace(/[“”]/g, "''") // “ ” → ''
    .replace(/"/g, "''"); // straight double-quote → ''
}

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * A prescription can span two physical lines: a header/lead line and a bare
 * continuation carrying just the scheme/load ("10/10/8/8/6 — 60/65/70/70/75% RM"
 * under "5 rounds Back Squat c/2'30\":"). Merge such continuations back onto the
 * previous line so the grammar sees the whole dosage at once.
 */
function joinContinuations(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (out.length > 0 && isContinuation(line)) {
      out[out.length - 1] = `${out[out.length - 1]} ${line}`;
    } else {
      out.push(raw);
    }
  }
  return out;
}

// A continuation is a bare rep/load scheme, i.e. it STARTS with a number-slash
// scheme or a percent list (optionally led by a dash), and carries no exercise
// word of its own. Kept deliberately narrow to avoid swallowing real lines.
const CONTINUATION_RE = /^[\s—–-]*\d+(?:\/\d+)+(?:\s*[—–-].*)?$|^[\s—–-]*\d+(?:[-/]\d+)*\s*%/;

function isContinuation(line: string): boolean {
  if (!line) return false;
  return CONTINUATION_RE.test(line);
}

// A "noise" line carries no dosage to type: a section header ("FUERZA — Tren
// inferior"), a connector ("Directo a:"), a coach note ("*Almacenar ritmos*"),
// a parenthetical aside, or plain prose. Rule: a line with NO digit is prose/
// header; a line that is only a coach note / connector is dropped too.
function isNoiseLine(line: string): boolean {
  const n = normalize(line);
  if (n.startsWith('*')) return true; // coach note
  if (/^\(.*\)$/.test(line.trim())) return true; // "(misma intensidad…)"
  if (/^(directo a|direct to|luego|despues|then|foco|foco en|finisher\s*:)\b/.test(n)) return true;
  if (/^(descanso|rest day|off)\b/.test(n)) return true;
  if (!/\d/.test(line)) return true; // no number anywhere → prose/header
  return false;
}

// ── Line dispatch ────────────────────────────────────────────────────────────

function parseLine(line: string): ParsedLine[] {
  // A clean strength combo ("A 5r <scheme> + B 5r <scheme>") splits on "+" into
  // one typed line per movement. Everything else is parsed as a single segment.
  if (!isDenseWod(line)) {
    const combo = tryStrengthCombo(line);
    if (combo) return combo;
  }
  return [parseSegment(line)];
}

function parseSegment(line: string): ParsedLine {
  if (isDenseWod(line)) {
    return reviewLine(line, 'dense multi-station WOD/sim — verbatim kept for LLM/coach');
  }
  const cardio = parseCardio(line);
  if (cardio) return finalizeDetected(cardio.token, cardio.prescription, line);
  const strength = parseStrength(line);
  if (strength) return finalizeDetected(strength.token, strength.prescription, line);
  const core = parseCoreWorkRest(line);
  if (core) return finalizeDetected(core.token, core.prescription, line);
  return reviewLine(line, 'no confident dose recognized');
}

// ── Dense-WOD detector (route to review, never decompose) ────────────────────
// A line is dense when it names a metcon format, carries a time-cap, chains
// heterogeneous comma-separated stations, runs a distance ladder, or mixes a
// HYROX station with other movements. These are exactly the lines the
// deterministic grammar must NOT try to structure — the LLM fallback owns them.
// (Multi-movement supersets without any of these markers still land in review
// via the "no confident dose" fallback, so they are not enumerated here.)

const HYROX_STATION_RE =
  /\b(sled push|sled pull|sled drag|wall ?ball|farmer|sandbag|burpee bbj|burpee broad)\b/;

function isDenseWod(seg: string): boolean {
  const n = normalize(seg);
  if (/\b(wod|for ?time|amrap|emom|chipper|afap|hyrox|simulaci|death by|tabata|complex|intercal)\b/.test(n)) {
    return true;
  }
  if (/\btc\b|\(tc\b/.test(n)) return true; // time cap "(TC 12')"
  // >=2 comma-separated stations that each carry a dose → multi-station WOD.
  // Split on a comma that is NOT a decimal separator ("15,5km/h" is one number).
  const commaStations = seg.split(/,(?!\d)/).filter((p) => /\d/.test(p) && /[a-záéíóúñ]/i.test(p));
  if (commaStations.length >= 2) return true;
  // A distance LADDER ("1200m / 800m / 400m …") — heterogeneous legs we won't
  // collapse into one bout (typing only the first would silently drop the rest).
  const distTokens = seg.match(/\d+\s*k?m\b(?!\s*\/?\s*h)/gi) ?? [];
  if (distTokens.length >= 3) return true;
  if (distTokens.length >= 2 && seg.includes('/')) return true;
  // A HYROX station chained (+ / comma) with anything else → simulation piece.
  if (HYROX_STATION_RE.test(n) && /[+,]/.test(seg)) return true;
  return false;
}

// ── Strength combo ("A + B") ─────────────────────────────────────────────────

function tryStrengthCombo(line: string): ParsedLine[] | null {
  if (!line.includes('+')) return null;
  const segs = line.split('+').map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return null;
  const parsed = segs.map((s) => parseStrength(s));
  if (parsed.some((p) => p === null)) return null; // not a clean all-strength chain
  return parsed.map((p, i) => finalizeDetected(p!.token, p!.prescription, segs[i]!));
}

// ── Grammar helpers (ported/extended from parse_blocks_lib.ts) ────────────────

/** Per-set rep scheme "10/10/8/8/6" or "10-10-8-6" → [10,10,8,8,6]. Intra-list
 *  separators carry NO spaces, so a spaced " / " between reps and loads never
 *  bleeds the two lists together. */
function parseRepSeq(raw: string): number[] | null {
  const m = raw.match(/(\d+(?:[/\-]\d+)+)/);
  if (!m) return null;
  const parts = m[1]!.split(/[/\-]/).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
  return parts.length >= 2 ? parts : null;
}

/** A load list ending in "%": "60/65/70/70/75%" → [60,65,70,70,75];
 *  "65-85%" → [65,85] (a RANGE); "75%" → [75]. Intra-list separators are
 *  space-free so the reps↔loads " / " boundary is respected. */
function parseLoadPctList(raw: string): number[] | null {
  const m = raw.match(/(\d+(?:[/\-]\d+)*)\s*%/);
  if (!m) return null;
  const parts = m[1]!.split(/[/\-]/).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
  return parts.length >= 1 ? parts : null;
}

/** "5x3'" / "5x3'30''" / "4x6'" → rounds + per-interval work seconds. */
function parseInterval(raw: string): { rounds: number; work_s: number } | null {
  const m = raw.match(/(\d+)\s*x\s*(\d+)\s*'(?:\s*(\d+)\s*'')?/);
  if (!m) return null;
  const sec = m[3] ? parseInt(m[3], 10) : 0;
  return { rounds: parseInt(m[1]!, 10), work_s: parseInt(m[2]!, 10) * 60 + sec };
}

/** Count distinct "NxM'" or "NxMm" interval groups — >=2 ⇒ heterogeneous
 *  ladder we won't fuse into one prescription. */
function countIntervalGroups(raw: string): number {
  const m = raw.match(/\d+\s*x\s*\d+\s*(?:'|m\b)/g);
  return m ? m.length : 0;
}

/** "8x400m" / "12 rounds x 400m" → rounds + per-interval distance (meters). */
function parseDistanceInterval(raw: string): { rounds: number; meters: number } | null {
  const m =
    raw.match(/(\d+)\s*(?:rounds|x)\s*x?\s*(\d+)\s*m\b/i) ?? raw.match(/(\d+)\s*x\s*(\d{3,4})\b/);
  if (!m) return null;
  return { rounds: parseInt(m[1]!, 10), meters: parseInt(m[2]!, 10) };
}

/** Rest: "45'' rest", "1'15'' walking rest", "2' rest", "90'' float",
 *  "/ 2' rest", "c/2'30''" → seconds. Conservative: needs an explicit rest cue
 *  OR the "c/" (cada) / leading "/" strength-rest form. */
function parseRest(raw: string): number | undefined {
  const cada = raw.match(/c\/\s*(\d+)\s*'\s*(\d+)?\s*(?:'')?/i);
  if (cada) return parseInt(cada[1]!, 10) * 60 + (cada[2] ? parseInt(cada[2], 10) : 0);
  const cue = /(?:rest|descanso|walking|float|trote|est[aá]tico|off|caminando)/i;
  const mm = raw.match(/(\d+)\s*'\s*(\d+)\s*''\s*[^,.\n]*?/);
  if (mm && cue.test(raw)) return parseInt(mm[1]!, 10) * 60 + parseInt(mm[2]!, 10);
  const min = raw.match(/[/\-]?\s*(\d+)\s*'\s*(?:rest|descanso|trote|caminando|off|float|est[aá]tico)/i);
  if (min) return parseInt(min[1]!, 10) * 60;
  const sec = raw.match(/(\d+)\s*''\s*(?:rest|descanso|walking|float|trote|est[aá]tico|off)/i);
  if (sec) return parseInt(sec[1]!, 10);
  return undefined;
}

/** "RPE 8" / "RPE8" → 8. */
function parseRpe(raw: string): number | undefined {
  const m = raw.match(/rpe\s*(\d{1,2})/i);
  return m ? parseInt(m[1]!, 10) : undefined;
}

/** "Z2" / "zona 2" → 2. */
function parseHrZone(raw: string): number | undefined {
  const m = normalize(raw).match(/\bz(?:ona)?\s*([1-5])\b/);
  return m ? parseInt(m[1]!, 10) : undefined;
}

/** "1h15'" → 4500, "45'" → 2700, "1h" → 3600. A single continuous duration in
 *  minutes — never a rest clock ("1'15''", guarded by `(?!\s*\d)`/`(?!')`) nor a
 *  pace ("6'/km", guarded by the unit lookahead). */
function parseDuration(raw: string): number | undefined {
  const hm = raw.match(/(\d+)\s*h\s*(\d+)\s*'/);
  if (hm) return parseInt(hm[1]!, 10) * 3600 + parseInt(hm[2]!, 10) * 60;
  const h = raw.match(/(\d+)\s*h(?!\d)/);
  if (h) return parseInt(h[1]!, 10) * 3600;
  const min = raw.match(/(\d+)\s*'(?!')(?!\s*\d)(?!\s*\/\s*(?:km|500|mi|milla))/);
  if (min) return parseInt(min[1]!, 10) * 60;
  return undefined;
}

/** "4km" → 4000, "500m" → 500. Never matches "15,5km/h" (a pace, guarded). */
function parseDistanceMeters(raw: string): number | undefined {
  const km = raw.match(/(\d+(?:[.,]\d+)?)\s*km(?!\s*\/?\s*h)/i);
  if (km) return Math.round(parseFloat(km[1]!.replace(',', '.')) * 1000);
  const m = raw.match(/(\d+)\s*m(?![a-z])/i);
  if (m) return parseInt(m[1]!, 10);
  return undefined;
}

const SECONDS_PER_HOUR = 3600;

/** "15,5km/h" / "17 km/h" → seconds-per-km pace. */
function parsePaceKmh(raw: string): { unit: PaceUnitLocal; value_s: number } | null {
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*km\s*\/\s*h/i);
  if (!m) return null;
  const kmh = parseFloat(m[1]!.replace(',', '.'));
  if (!(kmh > 0)) return null;
  return { unit: 'per_km', value_s: Math.round(SECONDS_PER_HOUR / kmh) };
}

type PaceUnitLocal = 'per_km' | 'per_500m' | 'per_mile';

function paceUnitFrom(raw: string): PaceUnitLocal | null {
  if (/\/\s*500\s*m?/i.test(raw)) return 'per_500m';
  if (/\/\s*(?:mi|mile|milla)/i.test(raw)) return 'per_mile';
  if (/\/\s*km/i.test(raw)) return 'per_km';
  return null;
}

/** An explicit clock pace with a unit: "3'50/km" → 230 s/km;
 *  "3'40-3'50/km" → a min/max range. Returns a pace Target or null. */
function parsePaceClockTarget(raw: string): Target | null {
  const unit = paceUnitFrom(raw);
  if (!unit) return null;
  const range = raw.match(/(\d+)\s*'\s*(\d+)\s*''?\s*[-–]\s*(\d+)\s*'\s*(\d+)/);
  if (range) {
    const lo = parseInt(range[1]!, 10) * 60 + parseInt(range[2]!, 10);
    const hi = parseInt(range[3]!, 10) * 60 + parseInt(range[4]!, 10);
    if (lo <= hi) return { kind: 'pace', unit, min_s: lo, max_s: hi };
  }
  const point = raw.match(/(\d+)\s*'\s*(\d+)\s*(?:'')?\s*\/\s*(?:km|500|mi|milla)/i);
  if (point) {
    return { kind: 'pace', unit, value_s: parseInt(point[1]!, 10) * 60 + parseInt(point[2]!, 10) };
  }
  return null;
}

/**
 * A secondary PACE CAP stated as a constraint: "(no más de 6'/km)" ⇒ a slowest-
 * allowed ceiling (max_s); "(no más rápido de 6'/km)" ⇒ a fastest-allowed floor
 * (min_s). Only fires when a cap PHRASE sits near a clock+unit pace; a bare
 * "a 6'/km" is a target, not a cap.
 */
function parsePaceCap(raw: string): PaceCap | null {
  const unit = paceUnitFrom(raw);
  if (!unit) return null;
  const clock = raw.match(/(\d+)\s*'\s*(?:(\d+)\s*(?:'')?)?\s*\/\s*(?:km|500|mi|milla)/i);
  if (!clock) return null;
  const seconds = parseInt(clock[1]!, 10) * 60 + (clock[2] ? parseInt(clock[2], 10) : 0);
  if (!(seconds > 0)) return null;
  const n = normalize(raw);
  const faster = /no m[aá]s rapido|no bajar de|minimo|mas rapido que/.test(n);
  const slower = /no m[aá]s lento|no m[aá]s de|maximo|sin pasar de|no pasar de|no superar/.test(n);
  if (faster) return { unit, min_s: seconds };
  if (slower) return { unit, max_s: seconds };
  return null; // a plain pace with a unit but no cap phrase → not a cap
}

/** Number of sets from "N rounds/rondas/series" or "Nr" anywhere in the seg. */
function parseSetCount(raw: string): number | undefined {
  const m = raw.match(/(\d+)\s*(?:rounds|rondas|series|r)\b/i);
  return m ? parseInt(m[1]!, 10) : undefined;
}

// ── Exercise label extraction (verbatim; no alias resolution required) ────────
// An exercise NAME carries no digits (Pablo's movements never do); the dosage
// begins at the first digit. So: drop a leading "N rounds/series/r" count, then
// take the run of text up to the first digit or colon, and clean trailing
// connector junk ("c/", "a", "al", "@", stray punctuation).

function extractLabel(seg: string): string {
  let s = seg.trim();
  // Leading "N rounds/series/r/x" count before the movement name.
  s = s.replace(/^\s*\d+\s*(?:rounds|rondas|series|reps?|x|r)\b[:.\s]*/i, '');
  // Everything up to the first digit or colon is the candidate name.
  const head = s.match(/^([^\d:]*)/);
  let label = head ? head[1]! : s;
  label = label
    .replace(/\b(?:c\/|cada|al?|@|de|en|x|a ritmo)\s*$/i, '')
    .replace(/[\s:,.\-—–(/+]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  return label;
}

/** Leading "LABEL:" form ("ROW:", "Threshold cinta:") → the label, else null. */
function leadingColonLabel(seg: string): string | null {
  const m = seg.match(/^\s*([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ /+-]*?)\s*:/);
  return m ? m[1]!.trim() : null;
}

// ── Modality inference ───────────────────────────────────────────────────────

function modalityFrom(seg: string): Modality | undefined {
  const n = normalize(seg);
  if (/\b(row|rowing|remo)\b/.test(n)) return 'row';
  if (/\b(skierg|ski-erg|ski)\b/.test(n)) return 'ski';
  if (/\b(bike|bike-erg|assault|airbike|ab)\b/.test(n)) return 'bike';
  if (/\b(run|carrera|correr|corriendo|cinta|treadmill|pista|threshold|umbral|fartlek|tempo|trote|easy run|strides)\b/.test(n))
    return 'run';
  if (/km\s*\/\s*h/.test(n)) return 'run';
  return undefined;
}

// ── Cardio parser (run / erg / zone — interval OR steady) ─────────────────────

interface Parsed {
  token: string;
  prescription: Prescription;
}

function parseCardio(seg: string): Parsed | null {
  const modality = modalityFrom(seg);
  const zone = parseHrZone(seg);
  const interval = parseInterval(seg);
  const distInterval = parseDistanceInterval(seg);
  const kmh = parsePaceKmh(seg);
  const clockPace = parsePaceClockTarget(seg);
  const dur = parseDuration(seg);
  const dist = parseDistanceMeters(seg);
  const cap = parsePaceCap(seg);
  const rest = parseRest(seg);
  const rpe = parseRpe(seg);

  // A cardio line needs a cardio signal — otherwise let strength claim it.
  const isCardio =
    modality !== undefined ||
    zone !== undefined ||
    interval !== null ||
    distInterval !== null ||
    kmh !== null;
  if (!isCardio) return null;

  // Heterogeneous ladder (>=2 interval groups) → we won't fuse it; send to review.
  if (countIntervalGroups(seg) >= 2) return null;

  const token = leadingColonLabel(seg) ?? extractLabel(seg);
  const paceTarget: Target | null = kmh
    ? { kind: 'pace', unit: kmh.unit, value_s: kmh.value_s }
    : clockPace;

  // INTERVAL scheme: rounds + work window (time or distance) + rest + target.
  if (interval || distInterval) {
    const rounds = interval ? interval.rounds : distInterval!.rounds;
    const p: Prescription = { scheme: 'intervals', rounds };
    if (interval) p.work_s = interval.work_s;
    if (rest !== undefined) p.rest_s = rest;
    if (modality) p.modality = modality;
    if (distInterval) {
      p.sets = Array.from({ length: rounds }, () => ({
        measure: { kind: 'distance', meters: distInterval.meters },
      }));
    }
    const target = paceTarget ?? (rpe !== undefined ? { kind: 'rpe', value: rpe } : zoneTarget(zone));
    if (target) p.target = target;
    else if (rpe !== undefined) p.note = `RPE ${rpe}`;
    return { token, prescription: p };
  }

  // STEADY scheme: one continuous bout (duration and/or distance) + target/cap.
  const p: Prescription = { scheme: 'steady' };
  if (dur !== undefined) p.total_s = dur;
  if (dist !== undefined && modality === 'run') {
    p.sets = [{ measure: { kind: 'distance', meters: dist } }];
  }
  const target = zoneTarget(zone) ?? paceTarget ?? undefined;
  if (target) p.target = target;
  if (cap) p.pace_cap = cap;
  if (rpe !== undefined) p.note = p.note ? `${p.note} · RPE ${rpe}` : `RPE ${rpe}`;
  if (modality) p.modality = modality;

  // Must carry SOME concrete dose, else it is just a header we mis-read.
  if (p.total_s === undefined && !p.sets && !p.target && !p.pace_cap) return null;
  return { token, prescription: p };
}

function zoneTarget(zone: number | undefined): Target | undefined {
  return zone !== undefined ? { kind: 'hr_zone', value: zone } : undefined;
}

// ── Strength parser ──────────────────────────────────────────────────────────
// "5 rounds Back Squat c/2'30\": 10/10/8/8/6 — 60/65/70/70/75% RM"
// "Deadlift 5r 10/10/8/6/4"   "Jefferson curl 4 rounds 10/10/8/8 @ 40kg"

function parseStrength(seg: string): Parsed | null {
  const reps = parseRepSeq(stripLoadPct(seg));
  const nxm = reps ? null : parseSetsByReps(seg);
  const setCount = parseSetCount(seg);
  const loadList = parseLoadPctList(seg);
  const kg = parseKg(seg);
  const rest = parseRest(seg);

  const perSetReps = reps ?? (nxm ? Array.from({ length: nxm.sets }, () => nxm.reps) : null);
  // Needs a real dosing signal: a per-set/NxM rep scheme, OR a set count with a
  // load. Otherwise it is not a confidently-typed strength line.
  if (!perSetReps && !(setCount !== undefined && (loadList || kg !== undefined))) return null;

  const p: Prescription = { scheme: 'sets', modality: 'strength' };
  const nSets = perSetReps?.length ?? setCount ?? 1;
  const sets: PrescriptionSet[] = [];
  for (let i = 0; i < nSets; i++) {
    const s: PrescriptionSet = {};
    if (perSetReps) s.measure = { kind: 'reps', value: perSetReps[i]! };
    const target = strengthTargetForSet(loadList, kg, i, nSets);
    if (target) s.target = target;
    if (rest !== undefined) s.rest_s = rest;
    sets.push(s);
  }
  p.sets = sets;
  return { token: extractLabel(seg), prescription: p };
}

/** "4x8" (sets × uniform reps) — but NOT "4x6'" (interval) or "4x400m" (dist). */
function parseSetsByReps(seg: string): { sets: number; reps: number } | null {
  const m = seg.match(/(\d+)\s*x\s*(\d+)(?!\s*(?:'|''|m\b|km|cal|kg))/i);
  if (!m) return null;
  return { sets: parseInt(m[1]!, 10), reps: parseInt(m[2]!, 10) };
}

/** Remove the "…% " load group so the rep-scheme reader can't grab load numbers. */
function stripLoadPct(seg: string): string {
  return seg.replace(/\d+(?:[/\-]\d+)*\s*%/g, ' ');
}

function parseKg(seg: string): number | undefined {
  const m = seg.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  return m ? parseFloat(m[1]!.replace(',', '.')) : undefined;
}

/** Intensity for set `i`: a per-set %RM list (len==sets), a 2-value %RM RANGE,
 *  a single %RM, or a kg load. */
function strengthTargetForSet(
  loadList: number[] | null,
  kg: number | undefined,
  i: number,
  nSets: number,
): Target | undefined {
  if (loadList) {
    if (loadList.length === nSets && nSets >= 2) return { kind: 'percent_rm', value: loadList[i]! };
    if (loadList.length >= 3) {
      // more graded values than sets — clamp to available, else use last.
      return { kind: 'percent_rm', value: loadList[Math.min(i, loadList.length - 1)]! };
    }
    if (loadList.length === 2) return { kind: 'percent_rm', min: loadList[0]!, max: loadList[1]! };
    if (loadList.length === 1) return { kind: 'percent_rm', value: loadList[0]! };
  }
  if (kg !== undefined) return { kind: 'kg', value: kg };
  return undefined;
}

// ── Core work/rest parser ("Side plank 4x40''/20''") ─────────────────────────

function parseCoreWorkRest(seg: string): Parsed | null {
  const m = seg.match(/(\d+)\s*x\s*(\d+)\s*''\s*\/\s*(\d+)\s*''/);
  if (!m) return null;
  const rounds = parseInt(m[1]!, 10);
  const p: Prescription = {
    scheme: 'intervals',
    rounds,
    work_s: parseInt(m[2]!, 10),
    rest_s: parseInt(m[3]!, 10),
  };
  const modality = modalityFrom(seg) ?? 'core';
  p.modality = modality;
  return { token: extractLabel(seg), prescription: p };
}

// ── Result construction ──────────────────────────────────────────────────────

/** Validate a typed prescription; on failure, downgrade the line to review with
 *  the raw text preserved (honesty contract). */
function finalizeDetected(token: string, prescription: Prescription, raw: string): ParsedLine {
  const parsed = prescriptionSchema.safeParse(prescription);
  if (!parsed.success) {
    return reviewLine(raw, `typed prescription failed validation: ${parsed.error.message}`);
  }
  return {
    exercise_token: token,
    prescription: parsed.data as Prescription,
    confidence: 'detected',
    review_reasons: [],
  };
}

/** A review line keeps the verbatim text in `note` (the ONLY allowed free text)
 *  and never fabricates structure. The scheme is a labeled best-guess from any
 *  metcon keyword present (acknowledged by `confidence:'review'`). */
function reviewLine(raw: string, reason: string): ParsedLine {
  const text = raw.trim().slice(0, 2000);
  const prescription = prescriptionSchema.parse({
    scheme: detectMetconScheme(raw),
    note: text,
  }) as Prescription;
  return { exercise_token: '', prescription, confidence: 'review', review_reasons: [reason] };
}

function detectMetconScheme(raw: string): PrescriptionScheme {
  const n = normalize(raw);
  if (/\bamrap\b/.test(n)) return 'amrap';
  if (/\bemom\b/.test(n)) return 'emom';
  if (/\btabata\b/.test(n)) return 'tabata';
  if (/\bdeath by\b/.test(n)) return 'death_by';
  if (/\b(hyrox|simulaci)\b/.test(n)) return 'hyrox_sim';
  if (/\bchipper\b/.test(n)) return 'chipper';
  if (/\bladder\b/.test(n)) return 'ladder';
  return 'for_time'; // generic metcon fallback (dense, unstructured)
}
