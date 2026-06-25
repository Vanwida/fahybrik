// hyrox-template — the canonical "Simulación HYROX" race template: the 16 ORDERED
// items (8 × 1 km run interleaved with the 8 stations in official order) with
// their standard work + the editable default loads per variant.
//
// GROUND TRUTH (locked, not invented):
//   - Order + standard distances/reps: the official HYROX race format (8 runs
//     interleaved with SkiErg → Sled Push → Sled Pull → Burpee Broad Jump → Row
//     → Farmers Carry → Sandbag Lunges → Wall Balls), HYROX Rulebook 25/26.
//   - Variant loads (kg): the official division weights, HYROX 25/26
//     (verified against the PUMA + HyCrew division tables). We ship the two
//     variants the editor offers this pass: OPEN (Open-division reference loads,
//     = Open Men, which also equals Pro Women) and PRO (Pro Men loads). The loads
//     are EDITABLE DEFAULTS — the coach adapts them per athlete (e.g. Open Women
//     sled 102 kg). Dobles + DEKA are a separate follow-up.
//   - exercise_id: the real catalog rows (exercises table). Every item carries a
//     real exercise_id so the block PERSISTS (the serializer drops id-less items).
//
// AGNOSTIC: this is HYROX SPORT vocabulary (our vertical), not a coach's
// methodology. The phase/group tag stays the coach's optional, separate concern.
//
// DRY: this is the single source of truth for the template's structure + loads.
// The form (SimulacionHyroxForm) and the block factory (createHyroxSimBlock) both
// read from here; neither re-encodes the race.

import type {
  Measure,
  Modality,
  Prescription,
  Target,
} from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem, StructureGroup } from '@/lib/dashboard/v2/editor-types';

// ── Variants the editor offers this pass ─────────────────────────────────────
// OPEN = Open-division reference loads (Open Men; = Pro Women). PRO = Pro Men.
// The coach edits any load afterward (Open Women, masters, etc.) — these are the
// standard starting points, not a hard rule.
export type HyroxVariant = 'open' | 'pro';

export const HYROX_VARIANTS: { value: HyroxVariant; label: string; hint: string }[] = [
  { value: 'open', label: 'Open', hint: 'Cargas estándar Open' },
  { value: 'pro', label: 'Pro', hint: 'Cargas estándar Pro' },
];

// ── The catalog rows each leg maps to (verified live in `exercises`) ─────────
// Kept here so a single place owns the id↔station mapping. Slugs documented for
// auditability; the id is what the serializer persists.
const EX = {
  run: { id: 3479, name: 'Run' }, // slug: run · modality run
  ski: { id: 3480, name: 'SkiErg' }, // slug: ski-erg · modality ski
  sledPush: { id: 2, name: 'Sled Push' }, // slug: hyrox-sled-push · functional
  sledPull: { id: 3, name: 'Sled Pull' }, // slug: hyrox-sled-pull · functional
  burpeeBroadJump: { id: 4, name: 'Burpee Broad Jump' }, // slug: hyrox-burpee-broad-jump
  row: { id: 3481, name: 'Rowing' }, // slug: row · modality row
  farmersCarry: { id: 6, name: 'Farmers Carry' }, // slug: hyrox-farmer-carry
  sandbagLunges: { id: 7, name: 'Sandbag Lunges' }, // slug: hyrox-sandbag-lunges
  wallBalls: { id: 8, name: 'Wall Balls' }, // slug: hyrox-wall-balls
} as const;

// ── Standard work measures (division-invariant) ──────────────────────────────
const RUN_M = 1000;
const ERG_M = 1000; // SkiErg + Row
const SLED_M = 50; // push + pull
const BURPEE_BROAD_JUMP_M = 80;
const FARMERS_CARRY_M = 200;
const SANDBAG_LUNGES_M = 100;
const WALL_BALL_REPS = 100;

// ── Per-variant standard loads (kg), HYROX 25/26 official ─────────────────────
// Farmers carry is per-hand (the athlete carries one KB per hand).
interface VariantLoads {
  sledPushKg: number;
  sledPullKg: number;
  farmersCarryKgPerHand: number;
  sandbagLungesKg: number;
  wallBallKg: number;
}

const LOADS: Record<HyroxVariant, VariantLoads> = {
  open: {
    sledPushKg: 152, // Open Men (incl. sled)
    sledPullKg: 103,
    farmersCarryKgPerHand: 24,
    sandbagLungesKg: 20,
    wallBallKg: 6,
  },
  pro: {
    sledPushKg: 202, // Pro Men (incl. sled)
    sledPullKg: 153,
    farmersCarryKgPerHand: 32,
    sandbagLungesKg: 30,
    wallBallKg: 9,
  },
};

// ── Leg model — one ordered entry of the race (a run or a station) ───────────
export type HyroxLegKind = 'run' | 'station';

export interface HyroxLeg {
  /** Stable key for the leg's position in the fixed race order (1..16). */
  key: string;
  kind: HyroxLegKind;
  exercise_id: number;
  exercise_name: string;
  /** Station ordinal 1..8 (stations only) — for the "Estación N" label. */
  stationNumber?: number;
}

// The fixed official order: run, station, run, station … ending on Wall Balls.
// (Run 1 → Ski → Run 2 → Push → … → Run 8 → Wall Balls.)
const STATIONS: { ex: { id: number; name: string }; n: number }[] = [
  { ex: EX.ski, n: 1 },
  { ex: EX.sledPush, n: 2 },
  { ex: EX.sledPull, n: 3 },
  { ex: EX.burpeeBroadJump, n: 4 },
  { ex: EX.row, n: 5 },
  { ex: EX.farmersCarry, n: 6 },
  { ex: EX.sandbagLunges, n: 7 },
  { ex: EX.wallBalls, n: 8 },
];

/** The 16 ordered legs of a full HYROX: run before every station, in order. */
export const HYROX_LEGS: HyroxLeg[] = STATIONS.flatMap((s, i) => [
  {
    key: `run-${i + 1}`,
    kind: 'run' as const,
    exercise_id: EX.run.id,
    exercise_name: EX.run.name,
  },
  {
    key: `station-${s.n}`,
    kind: 'station' as const,
    exercise_id: s.ex.id,
    exercise_name: s.ex.name,
    stationNumber: s.n,
  },
]);

// ── Per-leg standard work measure ────────────────────────────────────────────
function legMeasure(leg: HyroxLeg): Measure {
  if (leg.kind === 'run') return { kind: 'distance', meters: RUN_M };
  switch (leg.exercise_id) {
    case EX.ski.id:
    case EX.row.id:
      return { kind: 'distance', meters: ERG_M };
    case EX.sledPush.id:
    case EX.sledPull.id:
      return { kind: 'distance', meters: SLED_M };
    case EX.burpeeBroadJump.id:
      return { kind: 'distance', meters: BURPEE_BROAD_JUMP_M };
    case EX.farmersCarry.id:
      return { kind: 'distance', meters: FARMERS_CARRY_M };
    case EX.sandbagLunges.id:
      return { kind: 'distance', meters: SANDBAG_LUNGES_M };
    case EX.wallBalls.id:
      return { kind: 'reps', value: WALL_BALL_REPS };
    default:
      return { kind: 'distance', meters: 0 };
  }
}

// ── Per-leg modality (intrinsic to the exercise, never a free choice) ────────
function legModality(leg: HyroxLeg): Modality {
  if (leg.kind === 'run') return 'run';
  if (leg.exercise_id === EX.ski.id) return 'ski';
  if (leg.exercise_id === EX.row.id) return 'row';
  return 'functional'; // sled / burpee / carry / lunges / wall balls
}

// ── Per-leg standard target (variant-dependent load) ─────────────────────────
// Only the load-bearing stations carry a kg target by default. Runs and the ergs
// carry NO default target (the coach adds a pace/zone goal if they want one —
// adding it is the form's job, not a fabricated default). The kg target encodes
// the standard division load as an editable starting point.
function legStandardTarget(leg: HyroxLeg, variant: HyroxVariant): Target | undefined {
  const l = LOADS[variant];
  switch (leg.exercise_id) {
    case EX.sledPush.id:
      return { kind: 'kg', value: l.sledPushKg };
    case EX.sledPull.id:
      return { kind: 'kg', value: l.sledPullKg };
    case EX.farmersCarry.id:
      return { kind: 'kg', value: l.farmersCarryKgPerHand };
    case EX.sandbagLunges.id:
      return { kind: 'kg', value: l.sandbagLungesKg };
    case EX.wallBalls.id:
      return { kind: 'kg', value: l.wallBallKg };
    default:
      return undefined; // run / ski / row / burpee broad jump — no default load
  }
}

/** Does this leg carry a standard kg load that the variant toggle swaps? */
export function legHasVariantLoad(leg: HyroxLeg): boolean {
  return legStandardTarget(leg, 'open') !== undefined;
}

// ── Building the pre-seeded EditorItem for one leg ───────────────────────────
// scheme `for_time`: the whole sim is scored by completion time. Each item is one
// effort → its work on a single representative set, its load as the per-item
// target. exercise_id is REAL so the item persists.
function buildLegItem(leg: HyroxLeg, variant: HyroxVariant, uidSeed: number): EditorItem {
  const measure = legMeasure(leg);
  const target = legStandardTarget(leg, variant);
  const prescription: Prescription = {
    scheme: 'for_time',
    modality: legModality(leg),
    sets: [target ? { measure, target } : { measure }],
  };
  return {
    uid: `hyrox-${leg.key}-${uidSeed}`,
    exercise_id: leg.exercise_id,
    exercise_name: leg.exercise_name,
    prescription,
  };
}

/** Pre-seed the 16 ordered items for a fresh template at the chosen variant. */
export function buildHyroxItems(variant: HyroxVariant): EditorItem[] {
  const seed = Date.now();
  return HYROX_LEGS.map((leg, i) => buildLegItem(leg, variant, seed + i));
}

// ── Variant read/apply on an existing block ──────────────────────────────────
// Apply a variant's standard loads to the load-bearing items of an EXISTING block,
// preserving the coach's other edits (run distances, paces, skipped legs, custom
// reps). Matches items to legs by exercise_id (the load stations have unique ids).
export function applyVariantLoads(items: EditorItem[], variant: HyroxVariant): EditorItem[] {
  return items.map((it) => {
    const leg = HYROX_LEGS.find((l) => l.exercise_id === it.exercise_id && legHasVariantLoad(l));
    if (!leg) return it; // run / erg / burpee — untouched
    const target = legStandardTarget(leg, variant);
    if (!target) return it;
    const sets = it.prescription.sets ?? [{ measure: legMeasure(leg) }];
    const first = sets[0] ?? { measure: legMeasure(leg) };
    return {
      ...it,
      prescription: {
        ...it.prescription,
        sets: [{ ...first, target }, ...sets.slice(1)],
      },
    };
  });
}

/**
 * Best-effort: infer which variant an existing block's loads match, so the form's
 * toggle reflects the loaded state. Returns null when the loads were customized
 * away from both standards (the toggle then shows nothing pre-selected and just
 * acts as "re-apply Open / Pro standards").
 */
export function inferVariant(items: EditorItem[]): HyroxVariant | null {
  for (const variant of ['open', 'pro'] as const) {
    const matches = HYROX_LEGS.filter(legHasVariantLoad).every((leg) => {
      const it = items.find((x) => x.exercise_id === leg.exercise_id);
      if (!it) return true; // skipped leg — doesn't disprove the variant
      const t = it.prescription.sets?.[0]?.target;
      const std = legStandardTarget(leg, variant);
      return t?.kind === 'kg' && std?.kind === 'kg' && t.value === std.value;
    });
    if (matches) return variant;
  }
  return null;
}

// ── Block factory ────────────────────────────────────────────────────────────
const DEFAULT_VARIANT: HyroxVariant = 'open';

/** Build a ready, pre-seeded "Simulación HYROX" block (16 ordered items). */
export function createHyroxSimBlock(group: StructureGroup): EditorBlock {
  return {
    uid: `hyrox-sim-${Date.now()}`,
    title: 'Simulación HYROX',
    format: 'hyrox_sim',
    archetype_id: 'hyrox_sim',
    group,
    items: buildHyroxItems(DEFAULT_VARIANT),
  };
}
