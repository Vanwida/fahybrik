// parse — build a typed `Prescription` from the LEGACY storage shape
// (`params_json` + `notes`/`reps_scheme`). Used by the one-shot backfill and by
// future import scripts.
//
// HARD RULE: do NOT guess. When the per-set detail can't be parsed
// unambiguously into the model, we return the best STRUCTURED-from-params
// prescription AND set `needs_review=true`. We never fabricate reps or targets.
// The original text is always preserved by the caller (we never mutate notes).
//
// Emits the CANONICAL model (measure + target). The deprecated scalar aliases
// are not written by the parser; normalization in types.ts handles legacy reads.

import type { Measure, Prescription, PrescriptionScheme, PrescriptionSet, Target } from './types';
import { prescriptionSchema } from './types';

// The two legacy tables disagree on a few key names. The backfill passes the
// table-specific aliases in so this module stays the single parser.
export interface LegacyParamKeys {
  duration: 'duration_seconds' | 'time_seconds';
  loadKg: 'load_kg' | 'weight_kg';
}

export const BLOCK_EXERCISE_KEYS: LegacyParamKeys = {
  duration: 'duration_seconds',
  loadKg: 'load_kg',
};

export const TEMPLATE_SEGMENT_KEYS: LegacyParamKeys = {
  duration: 'time_seconds',
  loadKg: 'weight_kg',
};

export interface LegacyRow {
  params_json: Record<string, unknown> | null;
  reps_scheme?: string | null;
  notes?: string | null;
}

export interface ParseResult {
  prescription: Prescription;
  needs_review: boolean;
  // Human-readable reasons, for the backfill report. Empty when fully parsed.
  review_reasons: string[];
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

// ── Per-set rep scheme: "10/10/8/8/6" → [10,10,8,8,6] ──────────────────────
const REP_SCHEME_RE = /^\s*\d+(?:\s*\/\s*\d+)+\s*$/;

function parseRepSequence(scheme: string): number[] | null {
  if (!REP_SCHEME_RE.test(scheme)) return null;
  const reps = scheme.split('/').map((s) => Number(s.trim()));
  if (reps.some((r) => !Number.isInteger(r) || r < 0)) return null;
  return reps;
}

// ── Per-set load sequence from notes: "@ 60/65/70/70/75%" ──────────────────
const LOAD_SEQUENCE_RE = /@\s*(\d+(?:\s*\/\s*\d+)+)\s*%/;

function parseLoadSequence(notes: string): number[] | null {
  const m = notes.match(LOAD_SEQUENCE_RE);
  if (!m || !m[1]) return null;
  const pcts = m[1].split('/').map((s) => Number(s.trim()));
  if (pcts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  return pcts;
}

// ── Per-set REP sequence from prose notes: "10/10/8/8/6" ───────────────────
function parseRepSequenceFromNotes(notes: string): number[] | null {
  const all = notes.matchAll(/(\d+(?:\/\d+)+)(\s*%)?/g);
  for (const m of all) {
    if (m[2]) continue; // followed by % → load sequence, skip
    const seq = m[1];
    if (!seq) continue;
    const reps = seq.split('/').map((s) => Number(s.trim()));
    if (reps.length < 2) continue;
    if (reps.some((r) => !Number.isInteger(r) || r < 0)) continue;
    return reps;
  }
  return null;
}

// ── %RM range from params_json.load_pct_range ("65-80") ────────────────────
function parsePctRange(raw: unknown): { min: number; max: number } | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (!m || !m[1] || !m[2]) return null;
  const min = Number(m[1]);
  const max = Number(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  return { min, max };
}

// ── Clock token "m:ss" or "mm:ss" → seconds. Conservative. ─────────────────
function clockToSeconds(raw: string): number | null {
  const m = raw.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
  if (!m || !m[1] || !m[2]) return null;
  const mins = Number(m[1]);
  const secs = Number(m[2]);
  if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs >= 60) return null;
  return mins * 60 + secs;
}

// ── Pace target from notes. Conservative — only matches an explicit pace token
// with a recognizable unit (/km, /500m, /mi) OR an erg "1:50/500" form, OR a
// "sub-3:40" / "@3:45-4:00/km" range. Returns null when no clean pace is found.
const PACE_UNIT_RE: Record<string, RegExp> = {
  per_km: /\/\s*km\b/i,
  per_500m: /\/\s*500\s*m?\b/i,
  per_mile: /\/\s*(?:mi|mile)\b/i,
};

function detectPaceUnit(notes: string): 'per_km' | 'per_500m' | 'per_mile' | null {
  for (const [unit, re] of Object.entries(PACE_UNIT_RE)) {
    if (re.test(notes)) return unit as 'per_km' | 'per_500m' | 'per_mile';
  }
  return null;
}

function parsePaceTarget(notes: string): Target | null {
  const unit = detectPaceUnit(notes);
  if (!unit) return null;

  // Range: "@3:45-4:00/km" or "3:45-4:00 /km"
  const range = notes.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (range && range[1] && range[2]) {
    const lo = clockToSeconds(range[1]);
    const hi = clockToSeconds(range[2]);
    if (lo !== null && hi !== null && lo <= hi) {
      return { kind: 'pace', unit, min_s: lo, max_s: hi };
    }
  }

  // "sub-3:40" / "sub 3:40" → a ceiling (max_s).
  const sub = notes.match(/sub[-\s]?(\d{1,2}:\d{2})/i);
  if (sub && sub[1]) {
    const s = clockToSeconds(sub[1]);
    if (s !== null) return { kind: 'pace', unit, max_s: s };
  }

  // Single point: the first clock token near the unit, e.g. "@1:50/500m".
  const point = notes.match(/(\d{1,2}:\d{2})/);
  if (point && point[1]) {
    const s = clockToSeconds(point[1]);
    if (s !== null) return { kind: 'pace', unit, value_s: s };
  }
  return null;
}

// ── HR zone from notes: "Z2", "Z3-Z4", "zona 2". Conservative. ─────────────
function parseZoneTarget(notes: string): Target | null {
  const range = notes.match(/z\s*([1-5])\s*[-–]\s*z?\s*([1-5])/i);
  if (range && range[1] && range[2]) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    if (lo <= hi) return { kind: 'hr_zone', min: lo, max: hi };
  }
  const single = notes.match(/\bz\s*([1-5])\b/i) ?? notes.match(/\bzona\s*([1-5])\b/i);
  if (single && single[1]) return { kind: 'hr_zone', value: Number(single[1]) };
  return null;
}

// ── Calories-as-goal from notes: "15 cal", "15 calorías". Conservative. ────
function parseCaloriesTarget(notes: string): Target | null {
  const m = notes.match(/\b(\d{1,4})\s*(?:cal|cals|calor[ií]as?|kcal)\b/i);
  if (m && m[1]) {
    const v = Number(m[1]);
    if (Number.isFinite(v) && v > 0) return { kind: 'calories', value: v };
  }
  return null;
}

// Detect a target from prose notes, in priority order. Used to recover a
// cardio/erg/HYROX intensity that the legacy params never carried. Conservative:
// returns the first cleanly-parsed target, else null (→ stays in notes, flagged).
function parseTargetFromNotes(notes: string): Target | null {
  return (
    parsePaceTarget(notes) ?? parseZoneTarget(notes) ?? parseCaloriesTarget(notes) ?? null
  );
}

// Derive a single summary TARGET from params (used when there is no per-set
// sequence to expand). Preference: explicit %RM range → %RM point → kg point.
function summaryTarget(params: Record<string, unknown>, keys: LegacyParamKeys): Target | undefined {
  const range = parsePctRange(params['load_pct_range']);
  if (range) return { kind: 'percent_rm', min: range.min, max: range.max };
  const pct = num(params['load_pct']);
  if (pct !== undefined) return { kind: 'percent_rm', value: pct };
  const kg = num(params[keys.loadKg]);
  if (kg !== undefined) return { kind: 'kg', value: kg };
  return undefined;
}

// Choose the scheme from the structured params shape.
function chooseScheme(params: Record<string, unknown>, keys: LegacyParamKeys): PrescriptionScheme {
  if (num(params['rounds']) !== undefined) return 'rounds';
  const dur = num(params[keys.duration]);
  const sets = num(params['sets']);
  if (sets !== undefined && (dur !== undefined || num(params['distance_meters']) !== undefined)) {
    return 'interval';
  }
  if (sets !== undefined) return 'sets';
  if (dur !== undefined || num(params['distance_meters']) !== undefined) return 'steady';
  return 'sets';
}

interface ExplicitSetsResult {
  sets?: PrescriptionSet[];
  reason?: string;
}

/**
 * Try to build EXPLICIT per-set `sets[]` from a rep sequence — sourced from the
 * `reps_scheme` column (block_exercises) OR, when that column is absent, from
 * the prose `notes` (template_segments). A matching per-set load sequence in
 * notes is paired in when its length lines up. Emits canonical measure/target.
 */
function tryExplicitSets(
  row: LegacyRow,
  params: Record<string, unknown>,
  keys: LegacyParamKeys,
): ExplicitSetsResult {
  let reps: number[] | null = null;
  let source = '';
  if (typeof row.reps_scheme === 'string' && row.reps_scheme.trim() !== '') {
    reps = parseRepSequence(row.reps_scheme);
    source = `reps_scheme "${row.reps_scheme.trim()}"`;
    if (!reps) return { reason: `${source} is not a clean rep sequence` };
  } else if (typeof row.notes === 'string') {
    reps = parseRepSequenceFromNotes(row.notes);
    if (reps) source = `notes rep sequence "${reps.join('/')}"`;
  }

  if (!reps || reps.length < 2) return {}; // no per-set sequence to expand

  const setsCount = num(params['sets']);
  if (setsCount !== undefined && setsCount !== reps.length) {
    return { reason: `${source} (${reps.length} sets) disagrees with params.sets=${setsCount}` };
  }

  const restS = num(params['rest_seconds']);

  let loadSeq: number[] | null = null;
  if (typeof row.notes === 'string') {
    const seq = parseLoadSequence(row.notes);
    if (seq && seq.length === reps.length) loadSeq = seq;
  }

  const uniformTarget = loadSeq ? undefined : summaryTarget(params, keys);

  const sets: PrescriptionSet[] = reps.map((r, i) => {
    const set: PrescriptionSet = { measure: { kind: 'reps', value: r } };
    const seqLoad = loadSeq?.[i];
    if (seqLoad !== undefined) set.target = { kind: 'percent_rm', value: seqLoad };
    else if (uniformTarget) set.target = uniformTarget;
    if (restS !== undefined) set.rest_s = restS;
    return set;
  });

  return { sets };
}

/**
 * Convert one legacy row into a typed Prescription.
 */
export function legacyRowToPrescription(row: LegacyRow, keys: LegacyParamKeys): ParseResult {
  const params = row.params_json ?? {};
  const reasons: string[] = [];
  const notes = typeof row.notes === 'string' ? row.notes : '';

  const dur = num(params[keys.duration]);
  const distance = num(params['distance_meters']);
  const restS = num(params['rest_seconds']);
  const rpe = num(params['rpe']);
  const hrZone = num(params['hr_zone']);
  const rounds = num(params['rounds']);
  const sets = num(params['sets']);

  // A target recovered from prose (pace/zone/calories) — the cardio/erg/HYROX
  // intensity the legacy params never carried.
  const notesTarget = parseTargetFromNotes(notes);

  // 1) Explicit per-set sequence (strength pyramids / waves).
  const explicit = tryExplicitSets(row, params, keys);
  if (explicit.sets) {
    const p: Prescription = { scheme: 'sets', sets: explicit.sets };
    applyScalarTarget(p, { rpe, hrZone, notesTarget });
    return finalize(p, reasons);
  }

  if (explicit.reason) {
    reasons.push(`could not expand into explicit sets: ${explicit.reason}`);
  }

  // 2) Params-only structured prescription.
  const scheme = chooseScheme(params, keys);
  const p: Prescription = { scheme };

  switch (scheme) {
    case 'rounds': {
      if (rounds !== undefined) p.rounds = rounds;
      if (dur !== undefined) p.work_s = dur;
      if (restS !== undefined) p.rest_s = restS;
      break;
    }
    case 'interval': {
      if (sets !== undefined) p.rounds = sets;
      if (dur !== undefined) p.work_s = dur;
      if (restS !== undefined) p.rest_s = restS;
      break;
    }
    case 'steady': {
      if (dur !== undefined) p.total_s = dur;
      // Distance-defined steady work (e.g. "5000m Z2"): one continuous bout
      // carried as a single set with a distance measure.
      if (distance !== undefined) {
        const bout: PrescriptionSet = { measure: { kind: 'distance', meters: distance } };
        p.sets = [bout];
      }
      break;
    }
    case 'sets':
    default: {
      const reps = num(params['reps']);
      const target = summaryTarget(params, keys);
      if (sets !== undefined || reps !== undefined || target !== undefined) {
        const set: PrescriptionSet = {};
        if (reps !== undefined) set.measure = { kind: 'reps', value: reps };
        if (target) set.target = target;
        if (restS !== undefined) set.rest_s = restS;
        const count = sets ?? 1;
        p.sets = Array.from({ length: count }, () => ({ ...set }));
      }
      break;
    }
  }

  // Distance-based interval work: attach distance to each implied bout.
  if (distance !== undefined && scheme === 'interval' && p.rounds) {
    p.sets = Array.from({ length: p.rounds }, () => ({
      measure: { kind: 'distance', meters: distance },
    }));
  }

  applyScalarTarget(p, { rpe, hrZone, notesTarget });
  return finalize(p, reasons);
}

// Attach the best block-level / per-set target from the scalar signals, in
// priority: an explicit prose target (pace/zone/cal) → hr_zone param → rpe.
// hr_zone/pace/cal attach as a structured block-level `target`; rpe (which has
// no clean structural home when there are no sets) stays as a note, matching
// prior behavior, so we never silently drop it.
function applyScalarTarget(
  p: Prescription,
  signals: { rpe?: number | undefined; hrZone?: number | undefined; notesTarget: Target | null },
): void {
  const { rpe, hrZone, notesTarget } = signals;

  // If steady-distance produced a single bout, prefer attaching the target to
  // the bout so per-set readers see it; else attach at block level.
  const attach = (t: Target) => {
    if (p.sets && p.sets.length > 0 && p.scheme === 'steady') {
      for (const s of p.sets) if (!s.target) s.target = t;
    } else if (p.sets && p.sets.length > 0 && !p.sets.some((s) => s.target)) {
      for (const s of p.sets) s.target = t;
    } else {
      p.target = t;
    }
  };

  if (notesTarget) attach(notesTarget);
  else if (hrZone !== undefined) attach({ kind: 'hr_zone', value: hrZone });

  if (rpe !== undefined) p.note = p.note ? `${p.note} · RPE ${rpe}` : `RPE ${rpe}`;
}

/**
 * Convenience wrapper for the WEB STUDIO: derive a Prescription from a slots
 * item's legacy `params_json` + `notes`, using the block_exercises param names.
 */
export function legacyItemToPrescription(item: {
  params_json?: Record<string, unknown> | null;
  notes?: string | null;
}): Prescription {
  return legacyRowToPrescription(
    { params_json: item.params_json ?? null, notes: item.notes ?? null },
    BLOCK_EXERCISE_KEYS,
  ).prescription;
}

function finalize(p: Prescription, reasons: string[]): ParseResult {
  const parsed = prescriptionSchema.safeParse(p);
  if (!parsed.success) {
    return {
      prescription: p,
      needs_review: true,
      review_reasons: [
        ...reasons,
        `produced prescription failed validation: ${parsed.error.message}`,
      ],
    };
  }
  return {
    prescription: parsed.data as Prescription,
    needs_review: reasons.length > 0,
    review_reasons: reasons,
  };
}

// Re-export the Measure type usage so tree-shaking keeps it (no runtime effect).
export type { Measure };
