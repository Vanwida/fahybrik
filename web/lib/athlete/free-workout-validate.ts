// ENTRENO LIBRE — the vocabulary + PURE validation for an athlete's own workout.
//
// A free workout targets ONE of two shapes, discriminated by `modality`:
//   • a MEASURED discipline (row | ski | bike | run) — ONE top-level
//     `prescription` on a measured scheme (timed/paced/interval work). Its
//     canonical exercise is resolved by slug (FREE_WORKOUT_MODALITY_SLUGS).
//   • an ITEM-built workout (strength | functional) — N exercise `items`, each
//     with its OWN prescription. Strength items are 'sets' set-tables; functional
//     items are metcon movements that all share ONE metcon scheme (a WOD).
//
// This module is DB-free and side-effect-free so the route can validate before
// touching the database and the unit tests can exercise every branch without a
// connection. The exercise-id integrity + the modality COHERENCE override
// (mig 0053) are DB concerns and live in create-free-workout.ts.

import {
  safeParsePrescription,
  setMeasure,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';

// ── Modality vocabulary (single source) ──────────────────────────────────────
/** MEASURED disciplines — one top-level prescription resolved to a canonical
 *  exercise by slug. */
export const MEASURED_MODALITIES = ['row', 'ski', 'bike', 'run'] as const;
export type MeasuredModality = (typeof MEASURED_MODALITIES)[number];

/** The canonical exercise SLUG each measured modality resolves to (the single
 *  source resolved to an exercise_id at save time). Keyed by MeasuredModality so
 *  the two can never drift. */
export const FREE_WORKOUT_MODALITY_SLUGS: Record<MeasuredModality, string> = {
  row: 'row',
  ski: 'ski-erg',
  bike: 'bike-erg',
  run: 'run',
};

/** ITEM-built modalities — N exercise items, each carrying its own prescription. */
export const ITEM_MODALITIES = ['strength', 'functional'] as const;
export type ItemModality = (typeof ITEM_MODALITIES)[number];

/** Every modality a free workout may declare. */
export const FREE_WORKOUT_MODALITIES = [...MEASURED_MODALITIES, ...ITEM_MODALITIES] as const;
export type FreeWorkoutModality = (typeof FREE_WORKOUT_MODALITIES)[number];

// ── Scheme vocabulary ─────────────────────────────────────────────────────────
/** The MEASURED schemes a measured modality may carry — each is also a valid
 *  `templates.format`, so it maps 1:1. */
export const MEASURED_SCHEMES = [
  'intervals',
  'steady',
  'emom',
  'amrap',
  'for_time',
  'rounds',
] as const;

/** The metcon schemes a FUNCTIONAL workout may carry; every item shares one. */
export const FUNCTIONAL_SCHEMES = ['for_time', 'amrap', 'emom', 'rounds'] as const;

// ── Item-count bounds (named, not magic) ──────────────────────────────────────
export const MIN_ITEMS = 1;
export const MAX_ITEMS = 12;

// ── Shapes ────────────────────────────────────────────────────────────────────
/** One validated item — an exercise_id + its parsed prescription. */
export interface FreeWorkoutItem {
  exercise_id: number;
  prescription: Prescription;
}

/** The validated plan handed to create-free-workout.ts. `scheme` is the
 *  `templates.format` to persist (measured scheme | 'sets' | the shared metcon). */
export type FreeWorkoutPlan =
  | { kind: 'measured'; modality: MeasuredModality; scheme: string; prescription: Prescription }
  | { kind: 'items'; modality: ItemModality; scheme: string; items: FreeWorkoutItem[] };

export type FreeWorkoutValidation =
  | { ok: true; plan: FreeWorkoutPlan }
  | { ok: false; code: string; message: string; details?: unknown };

/** The structurally-parsed request body this validator consumes. `prescription`
 *  is optional at every level (a missing one fails validation as invalid, never
 *  crashes) — `z.unknown()` infers optional, so the type mirrors that. */
export interface FreeWorkoutRawBody {
  modality: FreeWorkoutModality;
  prescription?: unknown;
  items?: Array<{ exercise_id: number; prescription?: unknown }>;
}

function fail(code: string, message: string, details?: unknown): FreeWorkoutValidation {
  return details === undefined ? { ok: false, code, message } : { ok: false, code, message, details };
}

function isMeasured(m: FreeWorkoutModality): m is MeasuredModality {
  return (MEASURED_MODALITIES as readonly string[]).includes(m);
}

/**
 * Validate a free-workout body's structured content: the prescription(s), the
 * per-modality scheme rules, the per-set measures and the item count. Returns a
 * typed plan on success (schemes resolved, prescriptions parsed) or a
 * request-mappable `{ code, message, details? }` on failure. Never touches the DB.
 */
export function validateFreeWorkout(body: FreeWorkoutRawBody): FreeWorkoutValidation {
  // ── MEASURED: one top-level prescription on a measured scheme ────────────────
  if (isMeasured(body.modality)) {
    if (body.prescription === undefined || body.prescription === null) {
      return fail('prescription_required', `A '${body.modality}' free workout requires a prescription`);
    }
    const parsed = safeParsePrescription(body.prescription);
    if (!parsed.success) {
      return fail('invalid_prescription', 'Invalid prescription', parsed.error.flatten());
    }
    const scheme = parsed.data.scheme;
    if (!(MEASURED_SCHEMES as readonly string[]).includes(scheme)) {
      return fail('invalid_format', `Unsupported scheme for a '${body.modality}' free workout: '${scheme}'`);
    }
    return { ok: true, plan: { kind: 'measured', modality: body.modality, scheme, prescription: parsed.data } };
  }

  // ── ITEM-built: strength (sets) | functional (shared metcon) ─────────────────
  const modality = body.modality; // narrowed to ItemModality
  const items = body.items ?? [];
  if (items.length < MIN_ITEMS) {
    return fail('items_required', `A '${modality}' free workout requires at least ${MIN_ITEMS} exercise`);
  }
  if (items.length > MAX_ITEMS) {
    return fail('too_many_items', `A free workout accepts at most ${MAX_ITEMS} exercises (got ${items.length})`);
  }

  const parsedItems: FreeWorkoutItem[] = [];
  const schemes: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const parsed = safeParsePrescription(it.prescription);
    if (!parsed.success) {
      return fail('invalid_prescription', `Invalid prescription for item ${i + 1}`, parsed.error.flatten());
    }
    const pres = parsed.data;

    // Per-modality scheme rule (checked first so a wrong scheme is the reported cause).
    if (modality === 'strength' && pres.scheme !== 'sets') {
      return fail(
        'invalid_format',
        `A strength item must use the 'sets' scheme (item ${i + 1} used '${pres.scheme}')`,
      );
    }
    if (modality === 'functional' && !(FUNCTIONAL_SCHEMES as readonly string[]).includes(pres.scheme)) {
      return fail(
        'invalid_format',
        `A functional item must use a metcon scheme (item ${i + 1} used '${pres.scheme}')`,
      );
    }

    // Every item carries its dose in explicit sets; every set carries a measure
    // (reps | duration | distance | calories — the work done).
    const sets = pres.sets ?? [];
    if (sets.length < 1) {
      return fail('missing_sets', `Item ${i + 1} must carry at least one set`);
    }
    for (let s = 0; s < sets.length; s++) {
      if (setMeasure(sets[s]!) === undefined) {
        return fail(
          'set_without_measure',
          `Item ${i + 1}, set ${s + 1} has no measure (reps/duration/distance/calories)`,
        );
      }
    }

    parsedItems.push({ exercise_id: it.exercise_id, prescription: pres });
    schemes.push(pres.scheme);
  }

  // Functional items must all share ONE metcon scheme (a single WOD, one clock).
  if (modality === 'functional') {
    const first = schemes[0]!;
    if (!schemes.every((s) => s === first)) {
      return fail(
        'mixed_schemes',
        `All functional items must share the same scheme (got ${[...new Set(schemes)].join(', ')})`,
      );
    }
    return { ok: true, plan: { kind: 'items', modality, scheme: first, items: parsedItems } };
  }

  // Strength: the scheme is always 'sets'.
  return { ok: true, plan: { kind: 'items', modality, scheme: 'sets', items: parsedItems } };
}
