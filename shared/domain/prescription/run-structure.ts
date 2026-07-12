// RunStructure — the STRUCTURED running-workout grammar (#61). A run session is
// not "N × X @ ritmo + descanso": it is a PHASED sequence of segments — a
// calentamiento, a principal (steady bout, series, progresivo, fartlek, cuestas,
// pirámide…), and a vuelta a la calma — where each segment carries its own work
// (distancia | tiempo), its own objetivo (ritmo | zona de ritmo | zona FC | RPE),
// and optional cinta/cuesta (inclinación) + cadencia guides. Series nest inside a
// "Repetir ×N". This is what a dedicated running app lets a coach prescribe, and
// what the flat legacy model could not express without free text.
//
// WHERE IT LIVES
// --------------
// `structure` is an OPTIONAL field ON `Prescription` (inside prescription_json) —
// ZERO DB migration. It is ADDITIVE to the wire: a Prescription that carries a
// `structure` ALSO carries the flattened legacy fields (rounds/work_s/rest_s/sets/
// total_s/target) — see run-structure-convert.ts — so the already-installed iOS
// app, which decodes only the legacy shape, keeps showing a sensible workout and
// never breaks. Native structure execution on iOS lands later; the web coach
// editor authors it now.
//
// SCOPE
// -----
// Running only (pace is per km, inclinación + cadencia are run concepts). Reached
// through the STEADY and INTERVALS forms (endurance family). Ergo/metcon blocks
// keep their existing forms.
//
// This file is the TYPES + Zod + tree helpers. Legacy⇄structure conversion lives
// in run-structure-convert.ts; per-segment intensity resolution reuses the zone
// machinery in ../methodology/segment-resolve.ts.

import { z } from 'zod';

// ── Bounds (named, not magic) ────────────────────────────────────────────────
const MIN_PHASES = 1;
const MAX_PHASES = 3; // warmup? · main · cooldown?
const REPEAT_MIN = 2; // a "Repetir" of 1 is just the segment itself
const REPEAT_MAX = 20; // a single set never legitimately repeats more than this
const MAX_REPEAT_DEPTH = 2; // 3×(4×400) enters; a third nested level does not
const PACE_ZONE_MIN = 1;
const PACE_ZONE_MAX = 5; // 5-zone pace model exposed to the coah editor
const HR_ZONE_MIN = 1;
const HR_ZONE_MAX = 5;
const SEG_RPE_MIN = 1; // a prescribed segment RPE is 1..10 (0 is not a target)
const SEG_RPE_MAX = 10;
const INCLINE_MIN = 0;
const INCLINE_MAX = 15; // treadmill / hill grade ceiling (%)
const CADENCE_MIN = 120; // spm floor for a running cadence guide
const CADENCE_MAX = 220; // spm ceiling
const DISTANCE_MAX_M = 100_000; // 100 km — sanity ceiling for one segment
const DURATION_MAX_S = 86_400; // 24 h — sanity ceiling for one segment
const PACE_MAX_S = 36_000; // 10 h/km — a sanity ceiling, not a real pace

// ── Segment measure — how the work is MEASURED (distance | duration) ──────────
// Field names (`m`, `s`) match the closed grammar verbatim so the wire reads as
// specified.
export type SegmentMeasure =
  | { type: 'distance'; m: number } // metres, int > 0
  | { type: 'duration'; s: number }; // seconds, int > 0

// ── Segment target — WHAT intensity the work targets (or null = free) ─────────
// `pace` is always per km (running). `pace_zone` = a coach zona de ritmo (Z1..Z5)
// resolved per-athlete to an absolute pace band; `hr_zone` = a heart-rate zone.
// `rpe` = perceived effort 1..10. A `null` target means "no explicit objetivo"
// (e.g. a recovery jog, or a warm-up done by feel).
export type SegmentTarget =
  | { type: 'pace'; value_s?: number; min_s?: number; max_s?: number } // seconds per km
  | { type: 'pace_zone'; zone: number } // 1..5
  | { type: 'hr_zone'; zone: number } // 1..5
  | { type: 'rpe'; value?: number; min?: number; max?: number }; // 1..10, point OR band

// NOTE (deviation from the first-cut grammar, forced by real data): `rpe` carries
// an OPTIONAL BAND (value | min/max), not a single value. Pablo's real plan is
// full of "RPE 8-9" work targets (the DB stores `{kind:'rpe',min,max}`), and the
// system's own `Target.rpe` is already a band — a single-value structure rpe
// would drop the range on every import and be inconsistent with the rest of the
// model. This mirrors the pace band exactly (carry a point or a min/max range).

export type SegmentKind = 'work' | 'recovery';

// How a recovery is taken. `parado` (standing rest) is measured in TIME, so a
// `parado` recovery must carry a duration measure (enforced below).
export type RecoveryMode = 'trote' | 'caminar' | 'parado';

// ── Segment — one indivisible piece of the run ───────────────────────────────
export interface Segment {
  kind: SegmentKind;
  measure: SegmentMeasure;
  target: SegmentTarget | null;
  incline_pct?: number; // 0..15 — cinta / cuesta
  cadence_spm?: number; // 120..220 — optional cadence guide
  recovery_mode?: RecoveryMode; // recovery only; `parado` ⇒ duration measure
}

// ── Repeat — a "Repetir ×N" wrapping a sub-sequence (max nesting depth 2) ──────
export interface Repeat {
  times: number; // 2..20
  elements: Element[]; // Segment | Repeat (one more nesting level allowed)
}

export type Element = Segment | Repeat;

// ── Phase — warmup? · main · cooldown? (fixed order, exactly one main) ─────────
export type PhaseRole = 'warmup' | 'main' | 'cooldown';

export interface Phase {
  role: PhaseRole;
  elements: Element[];
}

/** The whole structured run: 1..3 phases, ordered warmup? · main · cooldown?. */
export type RunStructure = Phase[];

// ── Type guards ───────────────────────────────────────────────────────────────
export function isRepeat(el: Element): el is Repeat {
  return typeof (el as Repeat).times === 'number' && Array.isArray((el as Repeat).elements);
}
export function isSegment(el: Element): el is Segment {
  return !isRepeat(el);
}

// ── Zod ───────────────────────────────────────────────────────────────────────
const segmentMeasureSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('distance'), m: z.number().int().positive().max(DISTANCE_MAX_M) }).strict(),
  z.object({ type: z.literal('duration'), s: z.number().int().positive().max(DURATION_MAX_S) }).strict(),
]);

// Pace bounds/refinements ("carry a value_s or a min_s/max_s band", "min_s<=max_s")
// are validated in the tree walk below (discriminatedUnion members must be plain
// ZodObjects). Here we only bound each field.
const segmentTargetSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('pace'),
      value_s: z.number().positive().max(PACE_MAX_S).optional(),
      min_s: z.number().positive().max(PACE_MAX_S).optional(),
      max_s: z.number().positive().max(PACE_MAX_S).optional(),
    })
    .strict(),
  z.object({ type: z.literal('pace_zone'), zone: z.number().int().min(PACE_ZONE_MIN).max(PACE_ZONE_MAX) }).strict(),
  z.object({ type: z.literal('hr_zone'), zone: z.number().int().min(HR_ZONE_MIN).max(HR_ZONE_MAX) }).strict(),
  z
    .object({
      type: z.literal('rpe'),
      value: z.number().min(SEG_RPE_MIN).max(SEG_RPE_MAX).optional(),
      min: z.number().min(SEG_RPE_MIN).max(SEG_RPE_MAX).optional(),
      max: z.number().min(SEG_RPE_MIN).max(SEG_RPE_MAX).optional(),
    })
    .strict(),
]);

const segmentSchema = z
  .object({
    kind: z.enum(['work', 'recovery']),
    measure: segmentMeasureSchema,
    target: segmentTargetSchema.nullable(),
    incline_pct: z.number().min(INCLINE_MIN).max(INCLINE_MAX).optional(),
    cadence_spm: z.number().int().min(CADENCE_MIN).max(CADENCE_MAX).optional(),
    recovery_mode: z.enum(['trote', 'caminar', 'parado']).optional(),
  })
  .strict();

// Recursive Element = Segment | Repeat. The two are structurally disjoint (a
// Segment has `kind`+`measure`; a Repeat has `times`+`elements`), so a plain
// union is unambiguous. Depth is bounded in the tree walk, not the type.
const elementSchema: z.ZodType<Element> = z.lazy(() =>
  z.union([segmentSchema, repeatSchema]),
) as unknown as z.ZodType<Element>;

const repeatSchema: z.ZodType<Repeat> = z
  .object({
    times: z.number().int().min(REPEAT_MIN).max(REPEAT_MAX),
    elements: z.array(elementSchema).min(1),
  })
  .strict() as unknown as z.ZodType<Repeat>;

const phaseSchema = z
  .object({
    role: z.enum(['warmup', 'main', 'cooldown']),
    elements: z.array(elementSchema).min(1),
  })
  .strict();

const PHASE_ORDER: PhaseRole[] = ['warmup', 'main', 'cooldown'];

// Walk a segment: cross-field rules the flat schema can't express.
function validateSegment(seg: Segment, ctx: z.RefinementCtx, path: (string | number)[]): void {
  // recovery_mode only on recovery segments.
  if (seg.recovery_mode !== undefined && seg.kind !== 'recovery') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, 'recovery_mode'],
      message: 'recovery_mode solo es válido en un segmento de recuperación',
    });
  }
  // `parado` (standing rest) is timed → must be a duration measure.
  if (seg.recovery_mode === 'parado' && seg.measure.type !== 'duration') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, 'measure'],
      message: "una recuperación 'parado' se mide en tiempo (duration)",
    });
  }
  // pace target must carry a value or a band, and min_s<=max_s.
  const t = seg.target;
  if (t && t.type === 'pace') {
    if (t.value_s === undefined && t.min_s === undefined && t.max_s === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'target'],
        message: 'un objetivo de ritmo necesita value_s o una banda min_s/max_s',
      });
    }
    if (t.min_s !== undefined && t.max_s !== undefined && t.min_s > t.max_s) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'target'],
        message: 'el ritmo min_s debe ser <= max_s',
      });
    }
  }
  // rpe target must carry a value or a band, and min<=max.
  if (t && t.type === 'rpe') {
    if (t.value === undefined && t.min === undefined && t.max === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'target'],
        message: 'un objetivo de RPE necesita value o una banda min/max',
      });
    }
    if (t.min !== undefined && t.max !== undefined && t.min > t.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, 'target'],
        message: 'el RPE min debe ser <= max',
      });
    }
  }
}

// Walk elements enforcing max Repeat nesting depth and per-segment rules.
// `repeatDepth` = how many Repeats we are currently inside (phase elements = 0).
function validateElements(
  elements: Element[],
  repeatDepth: number,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  elements.forEach((el, i) => {
    const elPath = [...path, i];
    if (isRepeat(el)) {
      if (repeatDepth + 1 > MAX_REPEAT_DEPTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: elPath,
          message: `anidamiento de "Repetir" máximo ${MAX_REPEAT_DEPTH} niveles`,
        });
        return; // don't descend further into an over-deep branch
      }
      validateElements(el.elements, repeatDepth + 1, ctx, [...elPath, 'elements']);
    } else {
      validateSegment(el, ctx, elPath);
    }
  });
}

/** The RunStructure schema: 1..3 ordered phases + tree-level cross-field rules. */
export const runStructureSchema: z.ZodType<RunStructure> = z
  .array(phaseSchema)
  .min(MIN_PHASES)
  .max(MAX_PHASES)
  .superRefine((phases, ctx) => {
    // Roles: exactly one `main`, at most one warmup/cooldown, in fixed order.
    const roles = phases.map((p) => p.role);
    const mainCount = roles.filter((r) => r === 'main').length;
    if (mainCount !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'la estructura necesita exactamente una fase principal' });
    }
    if (roles.filter((r) => r === 'warmup').length > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'solo puede haber un calentamiento' });
    }
    if (roles.filter((r) => r === 'cooldown').length > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'solo puede haber una vuelta a la calma' });
    }
    // Fixed order: the sequence of distinct roles must follow warmup < main < cooldown.
    const rank = (r: PhaseRole) => PHASE_ORDER.indexOf(r);
    for (let i = 1; i < roles.length; i++) {
      if (rank(roles[i]!) <= rank(roles[i - 1]!)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'role'],
          message: 'las fases deben ir en orden: calentamiento → principal → vuelta',
        });
      }
    }
    phases.forEach((p, i) => validateElements(p.elements, 0, ctx, [i, 'elements']));
  }) as unknown as z.ZodType<RunStructure>;

/** Parse-or-throw. */
export function parseRunStructure(value: unknown): RunStructure {
  return runStructureSchema.parse(value);
}
export function safeParseRunStructure(value: unknown) {
  return runStructureSchema.safeParse(value);
}

// ── Tree helpers (shared by conversion, resolution, summary, tests) ───────────
/** The `main` phase (there is always exactly one in a valid structure). */
export function mainPhase(s: RunStructure): Phase | undefined {
  return s.find((p) => p.role === 'main');
}
export function phaseByRole(s: RunStructure, role: PhaseRole): Phase | undefined {
  return s.find((p) => p.role === role);
}

/**
 * Expand a structure into its FLAT, ordered list of segments — each Repeat's body
 * emitted `times` times, depth-first. Used by the legacy flatten, the athlete
 * summary, and analytics (total distance/time, first work, etc.).
 */
export function flattenSegments(s: RunStructure): Segment[] {
  const out: Segment[] = [];
  const walk = (elements: Element[]) => {
    for (const el of elements) {
      if (isRepeat(el)) {
        for (let i = 0; i < el.times; i++) walk(el.elements);
      } else {
        out.push(el);
      }
    }
  };
  for (const p of s) walk(p.elements);
  return out;
}

/** Flatten just one phase's elements (ordered, repeats expanded). */
export function flattenPhase(phase: Phase): Segment[] {
  const out: Segment[] = [];
  const walk = (elements: Element[]) => {
    for (const el of elements) {
      if (isRepeat(el)) for (let i = 0; i < el.times; i++) walk(el.elements);
      else out.push(el);
    }
  };
  walk(phase.elements);
  return out;
}

/** First WORK segment anywhere in the structure (for the legacy flatten). */
export function firstWorkSegment(s: RunStructure): Segment | undefined {
  return flattenSegments(s).find((seg) => seg.kind === 'work');
}

/** Total number of expanded segments of a kind (e.g. total work bouts). */
export function countSegments(s: RunStructure, kind?: SegmentKind): number {
  const all = flattenSegments(s);
  return kind ? all.filter((seg) => seg.kind === kind).length : all.length;
}
