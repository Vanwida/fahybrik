// Prescription — the STRUCTURED, typed per-set model for a single exercise's
// dosage (the "how much / how hard" of one line in a workout).
//
// WHY THIS EXISTS
// ---------------
// Until now, per-set detail lived in FREE TEXT: a back squat "5 rounds
// 10/10/8/8/6 @ 60/65/70/70/75% RM" was stored as
// `params_json={sets:5,rest_seconds:150}` + a prose `notes` string and/or a
// `reps_scheme` string ("10/10/8/8/6"). Nothing downstream could READ the
// per-set reps/loads, so the editor couldn't edit cleanly, analytics couldn't
// compute volume/load, and the AI couldn't adapt the set.
//
// This model is the single source of truth for that dosage. It spans EVERY
// modality with ZERO free text:
//
//   - HOW the work is measured (Measure): reps | distance | duration | calories
//   - WHAT intensity it targets (Target): %RM | kg | RPE | RIR | bodyweight |
//     PACE (/km, /500m, /mile) | HR zone (1-5) | HR bpm | calories-as-goal
//   - WHICH modality (Modality): run | row | ski | bike | strength | functional
//     | core | mobility | other
//
// Before this revision the model only carried `load` (strength-only) plus a few
// scalar fields, so cardio/erg/HYROX lost their target to free text: a run's
// pace, a Z2 ride's heart-rate zone, a "15 cal ski sprint" goal were all
// inexpressible. `Target` unifies all of those into one range-capable union so a
// single shape covers every line Pablo writes.
//
// MIXED / "COMPROMISED" BLOCKS (the run-then-wall-balls case): a compromised
// block is NOT nested inside one Prescription. It is multiple block items
// (template_segments / block_exercises rows) sharing one `block_position`, each
// with its OWN `exercise_id`, `modality`, and `prescription_json`. So modality +
// dosage live PER ITEM; the block grouping lives one level up in the row schema.
// This file therefore models exactly one line.

import { z } from 'zod';
import { normalizeFormat, WORKOUT_FORMAT_KEYS, type WorkoutFormat } from './format';
import { runStructureSchema, type RunStructure } from './run-structure';

// ── Bounds (named, not magic) ───────────────────────────────────────────────
const RPE_MIN = 0; // a set can be prescribed at RPE 0 only as a floor; 1-10 is the live range
const RPE_MAX = 10;
const HR_ZONE_MIN = 1;
const HR_ZONE_MAX = 5; // 5-zone model (locked by the model spec)
const HR_BPM_MIN = 20; // physiological floor; below this is a data error
const HR_BPM_MAX = 250; // physiological ceiling
const PERCENT_MAX = 200; // %1RM can exceed 100 for supramaximal/eccentric work
const PACE_MAX_S = 36000; // 10h per unit — a sanity ceiling, not a real pace
// 2h, the same ceiling the race side already uses for roxzone_seconds — a
// transition is seconds, but a capped block can be a whole session.
const TIME_CAP_MAX_S = 7200;
const CAL_MAX = 100000; // sanity ceiling for a single line's calories
const WATTS_MAX = 2000; // erg power ceiling (a single line never exceeds this)

// ── Modality ────────────────────────────────────────────────────────────────
// What discipline the line trains. Drives sensible defaults (an erg line targets
// pace /500m; a run targets pace /km; strength targets %RM/kg) and lets the AI
// and analytics group work by domain. Optional: legacy rows have no modality.
export type Modality =
  | 'run'
  | 'row'
  | 'ski'
  | 'bike'
  | 'strength'
  | 'functional'
  | 'core'
  | 'mobility'
  | 'other';

export const modalitySchema = z.enum([
  'run',
  'row',
  'ski',
  'bike',
  'strength',
  'functional',
  'core',
  'mobility',
  'other',
]);

// ── Target ──────────────────────────────────────────────────────────────────
// The INTENSITY objective of the work — "how hard / against what". A range-
// capable discriminated union that covers every modality's target. A target is
// either a single point (`value`/`value_s`) OR a range (`min`/`max` /
// `min_s`/`max_s`); ranges express "70-80%" or "Z3-Z4" without inventing points
// we don't actually know.
//
// `pace` carries seconds (per the chosen unit) so it stays a pure number for
// analytics; render helpers format it as m:ss. `calories` here means calories AS
// THE GOAL (e.g. "ski until you've burned 15 cal at hard effort") — distinct
// from calories as the unit of WORK measured, which lives on Measure.
export type PaceUnit = 'per_km' | 'per_500m' | 'per_mile';

export const paceUnitSchema = z.enum(['per_km', 'per_500m', 'per_mile']);

export type Target =
  | { kind: 'percent_rm'; value?: number; min?: number; max?: number } // %1RM, 0-200
  | { kind: 'kg'; value?: number; min?: number; max?: number }
  | { kind: 'rpe'; value?: number; min?: number; max?: number } // 0-10
  | { kind: 'rir'; value?: number; min?: number; max?: number } // >= 0
  | { kind: 'bodyweight' }
  | {
      kind: 'pace';
      unit: PaceUnit;
      value_s?: number;
      min_s?: number;
      max_s?: number;
    } // seconds per unit
  | { kind: 'hr_zone'; value?: number; min?: number; max?: number } // 1-5
  | { kind: 'hr_bpm'; min?: number; max?: number; value?: number }
  | { kind: 'calories'; value?: number; min?: number; max?: number } // target cal as GOAL
  | { kind: 'watts'; value?: number; min?: number; max?: number } // erg power (W)
  // A CLOCK TO BEAT, in absolute seconds — not an intensity. Every other kind
  // answers "how hard"; this one answers "how fast", which is a different
  // question and the reason it needs its own kind rather than reusing a
  // duration Measure. Prescribing `Measure.duration = 8s` says "spend 8
  // seconds"; a roxzone transition needs "be under 8 seconds", which is the
  // opposite instruction. Born for exigencia G (the roxzone) — where 5.5-7.3%
  // of race time is lost and the only variable is elapsed clock — but it also
  // covers any capped effort ("this block, under 20 min").
  //
  // `max_s` is the ceiling to beat, `value_s` a flat target, `min_s`/`max_s` a
  // band (the roxzone progression tightens a band, not a single number).
  | { kind: 'time_cap'; value_s?: number; min_s?: number; max_s?: number }; // seconds

export type TargetKind = Target['kind'];

// A secondary PACE constraint on a line whose PRIMARY target is something else
// (#28, Fork E: "corre en Z2 pero no más lento de 6'/km" = target hr_zone 2 + a
// pace cap). Keeps a dual-objective line FULLY typed instead of dropping the cap
// to a free-text note (Alex's sacred rule: everything typed). `max_s` = slowest
// allowed (seconds/unit not to exceed); `min_s` = fastest allowed (floor).
export interface PaceCap {
  unit: PaceUnit;
  max_s?: number;
  min_s?: number;
}

// Shared refinements for the scalar (value|min|max) targets.
const hasScalar = (t: { value?: number | undefined; min?: number | undefined; max?: number | undefined }) =>
  t.value !== undefined || t.min !== undefined || t.max !== undefined;
const minLeMax = (t: { min?: number | undefined; max?: number | undefined }) =>
  t.min === undefined || t.max === undefined || t.min <= t.max;

// Per-kind numeric bounds for the scalar targets. `z.discriminatedUnion`
// requires plain ZodObject members (no `.refine`/`.transform`), so the
// "must carry a value or range" and "min <= max" checks live in ONE
// `.superRefine` on the union below, keyed by kind.
const SCALAR_BOUNDS: Record<string, { min: number; max: number }> = {
  percent_rm: { min: 0, max: PERCENT_MAX },
  kg: { min: 0, max: 100000 },
  rpe: { min: RPE_MIN, max: RPE_MAX },
  rir: { min: 0, max: 50 },
  hr_zone: { min: HR_ZONE_MIN, max: HR_ZONE_MAX },
  hr_bpm: { min: HR_BPM_MIN, max: HR_BPM_MAX },
  calories: { min: 0, max: CAL_MAX },
  watts: { min: 0, max: WATTS_MAX },
};

function scalarTargetObject(kind: string) {
  const b = SCALAR_BOUNDS[kind]!;
  return z
    .object({
      kind: z.literal(kind),
      value: z.number().min(b.min).max(b.max).optional(),
      min: z.number().min(b.min).max(b.max).optional(),
      max: z.number().min(b.min).max(b.max).optional(),
    })
    .strict();
}

const bodyweightTargetObject = z.object({ kind: z.literal('bodyweight') }).strict();

const paceTargetObject = z
  .object({
    kind: z.literal('pace'),
    unit: paceUnitSchema,
    value_s: z.number().nonnegative().max(PACE_MAX_S).optional(),
    min_s: z.number().nonnegative().max(PACE_MAX_S).optional(),
    max_s: z.number().nonnegative().max(PACE_MAX_S).optional(),
  })
  .strict();

// Same seconds-based shape as pace (so analytics reads one numeric field), but
// with no unit: a clock is absolute, it isn't "per" anything.
const timeCapTargetObject = z
  .object({
    kind: z.literal('time_cap'),
    value_s: z.number().nonnegative().max(TIME_CAP_MAX_S).optional(),
    min_s: z.number().nonnegative().max(TIME_CAP_MAX_S).optional(),
    max_s: z.number().nonnegative().max(TIME_CAP_MAX_S).optional(),
  })
  .strict();

const targetUnion = z.discriminatedUnion('kind', [
  scalarTargetObject('percent_rm'),
  scalarTargetObject('kg'),
  scalarTargetObject('rpe'),
  scalarTargetObject('rir'),
  bodyweightTargetObject,
  paceTargetObject,
  scalarTargetObject('hr_zone'),
  scalarTargetObject('hr_bpm'),
  scalarTargetObject('calories'),
  scalarTargetObject('watts'),
  timeCapTargetObject,
]);

export const targetSchema: z.ZodType<Target> = targetUnion.superRefine((raw, ctx) => {
  const t = raw as Target;
  if (t.kind === 'bodyweight') return;
  if (t.kind === 'pace' || t.kind === 'time_cap') {
    if (t.value_s === undefined && t.min_s === undefined && t.max_s === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${t.kind} target must carry value_s or a min_s/max_s range`,
      });
    }
    if (t.min_s !== undefined && t.max_s !== undefined && t.min_s > t.max_s) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${t.kind} target min_s must be <= max_s` });
    }
    return;
  }
  // scalar kinds
  if (!hasScalar(t)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${t.kind} target must carry a value or a min/max range` });
  }
  if (!minLeMax(t)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${t.kind} target min must be <= max` });
  }
}) as unknown as z.ZodType<Target>;

// #28 — the typed secondary pace cap (see PaceCap). Same pace bounds as a pace
// target; must carry at least one bound, and min_s <= max_s.
export const paceCapSchema = z
  .object({
    unit: paceUnitSchema,
    max_s: z.number().positive().max(PACE_MAX_S).optional(),
    min_s: z.number().positive().max(PACE_MAX_S).optional(),
  })
  .strict()
  .refine((c) => c.max_s !== undefined || c.min_s !== undefined, {
    message: 'pace_cap must carry max_s or min_s',
  })
  .refine((c) => c.min_s === undefined || c.max_s === undefined || c.min_s <= c.max_s, {
    message: 'pace_cap min_s must be <= max_s',
  });

// ── Load (DEPRECATED back-compat alias) ─────────────────────────────────────
// `Load` was the strength-only predecessor of `Target`. It is retained ONLY so
// existing call-sites (the editor) keep compiling while they migrate. A `Load`
// is a subset of `Target`: every LoadType is also a TargetKind. Prefer `Target`.
/** @deprecated use Target — Load only covers strength intensity. */
export type LoadType = 'percent_rm' | 'kg' | 'rir' | 'rpe' | 'bodyweight';

/** @deprecated use Target — `{ type }` maps onto Target `{ kind }`. */
export interface Load {
  type: LoadType;
  value?: number;
  min?: number;
  max?: number;
}

/** @deprecated use targetSchema. */
export const loadTypeSchema = z.enum(['percent_rm', 'kg', 'rir', 'rpe', 'bodyweight']);

/** @deprecated use targetSchema. */
export const loadSchema = z
  .object({
    type: loadTypeSchema,
    value: z.number().nonnegative().max(PERCENT_MAX).optional(),
    min: z.number().nonnegative().max(PERCENT_MAX).optional(),
    max: z.number().nonnegative().max(PERCENT_MAX).optional(),
  })
  .strict()
  .refine((l) => l.value !== undefined || l.min !== undefined || l.max !== undefined, {
    message: 'load must carry a value or a min/max range',
  })
  .refine((l) => l.min === undefined || l.max === undefined || l.min <= l.max, {
    message: 'load.min must be <= load.max',
  });

/** Lift a legacy Load onto the unified Target union (bodyweight stays kindless). */
export function loadToTarget(load: Load): Target {
  if (load.type === 'bodyweight') return { kind: 'bodyweight' };
  const base: { value?: number; min?: number; max?: number } = {};
  if (load.value !== undefined) base.value = load.value;
  if (load.min !== undefined) base.min = load.min;
  if (load.max !== undefined) base.max = load.max;
  return { kind: load.type, ...base } as Target;
}

/** Narrow a Target back to a legacy Load when it is strength-shaped (else null). */
export function targetToLoad(target: Target): Load | null {
  switch (target.kind) {
    case 'bodyweight':
      return { type: 'bodyweight' };
    case 'percent_rm':
    case 'kg':
    case 'rpe':
    case 'rir': {
      const out: Load = { type: target.kind };
      if (target.value !== undefined) out.value = target.value;
      if (target.min !== undefined) out.min = target.min;
      if (target.max !== undefined) out.max = target.max;
      return out;
    }
    default:
      return null; // pace / hr_zone / hr_bpm / calories have no legacy Load form
  }
}

// ── Measure ─────────────────────────────────────────────────────────────────
// The unit of WORK DONE in a set — "how much". Discriminated by kind so a run
// segment (distance), a plank (duration), a squat (reps) and a cal-row
// (calories) all carry their work in a typed, analytics-readable field.
//
// RANGES (`max`). A coach who writes "4 series de 12-15" is prescribing a BAND,
// not two sets: the athlete autoregulates inside it. Without this the importer
// flattened it into one set of 12 and another of 15 — a different workout. The
// base field is always the LOWER bound and stays REQUIRED, so every existing
// reader (the live engine's rep prefill, prescriptionToParams, iOS) keeps
// working unchanged and simply shows the floor; `max` is additive.
// One name for all four kinds: the `kind` already says the unit.
export type Measure =
  | { kind: 'reps'; value: number; max?: number }
  | { kind: 'distance'; meters: number; max?: number }
  | { kind: 'duration'; seconds: number; max?: number }
  | { kind: 'calories'; value: number; max?: number };

export type MeasureKind = Measure['kind'];

/** The lower bound of a measure, whatever its kind names the field. */
export function measureFloor(m: Measure): number {
  return m.kind === 'distance' ? m.meters : m.kind === 'duration' ? m.seconds : m.value;
}

/** True when the measure prescribes a band ("12-15 reps") rather than a point. */
export function measureIsRange(m: Measure): boolean {
  return m.max !== undefined && m.max > measureFloor(m);
}

const maxReps = z.number().int().nonnegative().optional();
const maxAmount = z.number().nonnegative().optional();

// `max` must sit at or above the floor — a "15-12" band is a typo, not a range.
export const measureSchema: z.ZodType<Measure> = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('reps'), value: z.number().int().nonnegative(), max: maxReps })
      .strict(),
    z
      .object({ kind: z.literal('distance'), meters: z.number().nonnegative(), max: maxAmount })
      .strict(),
    z
      .object({ kind: z.literal('duration'), seconds: z.number().nonnegative(), max: maxAmount })
      .strict(),
    z
      .object({
        kind: z.literal('calories'),
        value: z.number().nonnegative().max(CAL_MAX),
        max: maxAmount.and(z.number().max(CAL_MAX).optional()),
      })
      .strict(),
  ])
  .superRefine((m, ctx) => {
    const measure = m as Measure;
    if (measure.max !== undefined && measure.max < measureFloor(measure)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'measure.max must be at or above the measure floor',
        path: ['max'],
      });
    }
  }) as unknown as z.ZodType<Measure>;

// ── Scheme ──────────────────────────────────────────────────────────────────
// A prescription's scheme IS its block's FORMAT — the same axis (a block has one
// format, shared by its lines). So `PrescriptionScheme` is exactly the canonical
// format catalog (`shared/domain/prescription/format.ts`), the single source of
// truth shared coach↔athlete↔DB. The scheme drives which top-level Prescription
// fields are meaningful (e.g. `emom` uses work_s/rounds; `steady` uses total_s;
// `death_by` uses start/increment) — see each format's `params` in the catalog.
export type PrescriptionScheme = WorkoutFormat;

// Canonical-only enum (the OUTPUT type): use for `.options`/exhaustive switches.
export const prescriptionSchemeSchema = z.enum(
  WORKOUT_FORMAT_KEYS as [WorkoutFormat, ...WorkoutFormat[]],
);

// Input-tolerant scheme: accepts every legacy alias (e.g. the old singular
// `interval`, or a `tempo`/`circuit`/`strength_block`/`test` that leaked into a
// prescription) and NORMALIZES it to its canonical member before validating, so
// old `prescription_json` still parses while new data is always canonical.
export const prescriptionSchemeInputSchema = z.preprocess(
  (v) => (typeof v === 'string' ? (normalizeFormat(v) ?? v) : v),
  prescriptionSchemeSchema,
);

// ── PrescriptionSet ─────────────────────────────────────────────────────────
// One explicit set/round. Carries its work (`measure`) and its intensity
// (`target`), plus rest/tempo/modality/note.
//
// The legacy scalar fields (`reps`/`duration_s`/`distance_m`/`rpe`/`rir`/
// `hr_zone`/`load`) are RETAINED as DEPRECATED back-compat aliases so old data
// still reads. New writers use `measure` + `target`. The schema mirrors any
// legacy alias onto its canonical field after parse (see preprocessing below),
// so a row written either way validates and normalizes identically.
export interface PrescriptionSet {
  measure?: Measure; // canonical: the work done
  target?: Target; // canonical: the intensity objective
  modality?: Modality; // per-set modality (a block item is one modality; rarely overridden per set)
  rest_s?: number;
  tempo?: string; // e.g. "3-1-1-0"
  note?: string;

  // ── DEPRECATED back-compat aliases (map onto measure/target) ──────────────
  /** @deprecated use measure {kind:'reps'} */ reps?: number;
  /** @deprecated use measure {kind:'duration'} */ duration_s?: number;
  /** @deprecated use measure {kind:'distance'} */ distance_m?: number;
  /** @deprecated use target {kind:'rpe'} */ rpe?: number;
  /** @deprecated use target {kind:'rir'} */ rir?: number;
  /** @deprecated use target {kind:'hr_zone'} */ hr_zone?: number;
  /** @deprecated use target — strength load */ load?: Load;
}

// Normalize a raw set: lift any legacy alias onto measure/target so downstream
// code only has to read the canonical fields. Canonical fields win if both are
// present. Idempotent: applying twice is a no-op.
function normalizeSet(raw: PrescriptionSet): PrescriptionSet {
  const out: PrescriptionSet = { ...raw };

  // Work: measure wins; otherwise lift reps/duration_s/distance_m (in that
  // precedence — only one legacy work field is ever expected on a legacy set).
  if (!out.measure) {
    if (raw.reps !== undefined) out.measure = { kind: 'reps', value: raw.reps };
    else if (raw.duration_s !== undefined) out.measure = { kind: 'duration', seconds: raw.duration_s };
    else if (raw.distance_m !== undefined) out.measure = { kind: 'distance', meters: raw.distance_m };
  }

  // Intensity: target wins; otherwise lift load → rpe → rir → hr_zone.
  if (!out.target) {
    if (raw.load) out.target = loadToTarget(raw.load);
    else if (raw.rpe !== undefined) out.target = { kind: 'rpe', value: raw.rpe };
    else if (raw.rir !== undefined) out.target = { kind: 'rir', value: raw.rir };
    else if (raw.hr_zone !== undefined) out.target = { kind: 'hr_zone', value: raw.hr_zone };
  }

  return out;
}

const prescriptionSetObjectSchema = z
  .object({
    measure: measureSchema.optional(),
    target: targetSchema.optional(),
    modality: modalitySchema.optional(),
    rest_s: z.number().nonnegative().optional(),
    tempo: z.string().max(20).optional(),
    note: z.string().max(400).optional(),
    // Deprecated aliases — validated with the same bounds as before.
    reps: z.number().int().nonnegative().optional(),
    duration_s: z.number().nonnegative().optional(),
    distance_m: z.number().nonnegative().optional(),
    load: loadSchema.optional(),
    rpe: z.number().min(RPE_MIN).max(RPE_MAX).optional(),
    rir: z.number().min(0).optional(),
    hr_zone: z.number().int().min(HR_ZONE_MIN).max(HR_ZONE_MAX).optional(),
  })
  .strict();

export const prescriptionSetSchema = prescriptionSetObjectSchema.transform((s) =>
  normalizeSet(s as PrescriptionSet),
);

// ── Prescription ────────────────────────────────────────────────────────────
export interface Prescription {
  scheme: PrescriptionScheme;
  modality?: Modality; // block/default modality for the line
  sets?: PrescriptionSet[]; // explicit per-set (strength pyramids / waves / interval bouts)
  rounds?: number; // circuits / minutes (rounds, emom, intervals, tabata)
  work_s?: number; // emom/interval/tabata work window
  rest_s?: number; // round/interval/tabata rest
  total_s?: number; // amrap/steady total, or for_time/chipper/ladder time CAP
  start?: number; // death_by — starting amount (reps|cal) in round 1
  increment?: number; // death_by — amount added each round
  target?: Target; // block-level intensity (e.g. a steady Z2 ride / @4:00/km tempo)
  pace_cap?: PaceCap; // #28 — typed secondary pace bound alongside `target`
  hr_zone?: number; // DEPRECATED — use target {kind:'hr_zone'}; lifted on normalize
  // #61 — the STRUCTURED running workout (phased warmup/main/cooldown sequence of
  // segments with nested repeats). ADDITIVE: when present, the legacy fields above
  // (scheme/rounds/work_s/rest_s/sets/total_s/target) are ALSO emitted as a
  // best-effort flatten (run-structure-convert.ts) so the installed iOS app keeps
  // decoding. Running only; see run-structure.ts.
  structure?: RunStructure;
  note?: string;
}

const MAX_SETS = 60; // a single line never legitimately has more sets than this

function normalizePrescription(raw: Prescription): Prescription {
  const out: Prescription = { ...raw };
  if (!out.target && raw.hr_zone !== undefined) out.target = { kind: 'hr_zone', value: raw.hr_zone };
  return out;
}

const prescriptionObjectSchema = z
  .object({
    scheme: prescriptionSchemeInputSchema,
    modality: modalitySchema.optional(),
    sets: z.array(prescriptionSetSchema).max(MAX_SETS).optional(),
    rounds: z.number().int().positive().optional(),
    work_s: z.number().nonnegative().optional(),
    rest_s: z.number().nonnegative().optional(),
    total_s: z.number().nonnegative().optional(),
    start: z.number().nonnegative().optional(),
    increment: z.number().nonnegative().optional(),
    target: targetSchema.optional(),
    pace_cap: paceCapSchema.optional(),
    hr_zone: z.number().int().min(HR_ZONE_MIN).max(HR_ZONE_MAX).optional(), // deprecated alias
    structure: runStructureSchema.optional(), // #61 — structured running workout
    note: z.string().max(2000).optional(),
  })
  .strict();

export const prescriptionSchema = prescriptionObjectSchema.transform((p) =>
  normalizePrescription(p as Prescription),
);

// The pre-transform object schema, exposed for callers that need the raw input
// shape (e.g. composing it inside a larger Zod object via `.extend`).
export const prescriptionObjectSchemaRaw = prescriptionObjectSchema;

export type PrescriptionInput = z.input<typeof prescriptionObjectSchema>;

// Parse-or-throw helper for callers that want a typed value (used by the
// import/backfill scripts and any future server-side writer).
export function parsePrescription(value: unknown): Prescription {
  return prescriptionSchema.parse(value) as Prescription;
}

// Safe variant for request validation paths that prefer a result object.
export function safeParsePrescription(value: unknown) {
  return prescriptionSchema.safeParse(value);
}

// ── Read helpers (canonical accessors) ──────────────────────────────────────
// Centralize the "canonical-or-legacy-alias" read so consumers never have to
// know about the deprecated fields. Always go through these.

/** The work done in a set, preferring the canonical Measure over legacy aliases. */
export function setMeasure(s: PrescriptionSet): Measure | undefined {
  if (s.measure) return s.measure;
  if (s.reps !== undefined) return { kind: 'reps', value: s.reps };
  if (s.duration_s !== undefined) return { kind: 'duration', seconds: s.duration_s };
  if (s.distance_m !== undefined) return { kind: 'distance', meters: s.distance_m };
  return undefined;
}

/** The intensity target of a set, preferring canonical Target over legacy aliases. */
export function setTarget(s: PrescriptionSet): Target | undefined {
  if (s.target) return s.target;
  if (s.load) return loadToTarget(s.load);
  if (s.rpe !== undefined) return { kind: 'rpe', value: s.rpe };
  if (s.rir !== undefined) return { kind: 'rir', value: s.rir };
  if (s.hr_zone !== undefined) return { kind: 'hr_zone', value: s.hr_zone };
  return undefined;
}

/** The block-level intensity target, preferring canonical Target over hr_zone. */
export function prescriptionTarget(p: Prescription): Target | undefined {
  if (p.target) return p.target;
  if (p.hr_zone !== undefined) return { kind: 'hr_zone', value: p.hr_zone };
  return undefined;
}
