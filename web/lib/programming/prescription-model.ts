// prescription-model — pure, UI-agnostic helpers the PrescriptionEditor and its
// sub-controls share. Keeps the React components thin: every "what shape does a
// run/erg/strength line default to", "what target kinds make sense for this
// modality", and "how do I parse/format a m:ss pace" decision lives here, in one
// place, fully typed against the shared Prescription model.
//
// NOTHING here is free text: a modality maps to a default Measure + Target so a
// coach who picks "Row" immediately gets distance + pace /500m, "Strength" gets
// reps + %RM, etc. The editor only ever edits the canonical fields.

import type {
  Measure,
  MeasureKind,
  Modality,
  PaceUnit,
  Prescription,
  PrescriptionScheme,
  Target,
  TargetKind,
} from '@fahybrid/shared/domain/prescription';
import { isScalarTarget, setMeasure } from '@fahybrid/shared/domain/prescription';

// ── Modality vocab (coach-facing, ordered the way Pablo thinks) ──────────────
export const MODALITY_OPTIONS: { value: Modality; label: string; icon: string }[] = [
  { value: 'run', label: 'Correr', icon: 'directions_run' },
  { value: 'row', label: 'Remo', icon: 'rowing' },
  { value: 'ski', label: 'SkiErg', icon: 'downhill_skiing' },
  { value: 'bike', label: 'Bici', icon: 'directions_bike' },
  { value: 'strength', label: 'Fuerza', icon: 'fitness_center' },
  { value: 'functional', label: 'Funcional', icon: 'sports_gymnastics' },
  { value: 'core', label: 'Core', icon: 'airline_seat_legroom_extra' },
  { value: 'mobility', label: 'Movilidad', icon: 'self_improvement' },
];

const ERG_MODALITIES = new Set<Modality>(['row', 'ski', 'bike']);
const CARDIO_MODALITIES = new Set<Modality>(['run', 'row', 'ski', 'bike']);

export const isErgModality = (m: Modality | undefined): boolean => !!m && ERG_MODALITIES.has(m);
export const isCardioModality = (m: Modality | undefined): boolean =>
  !!m && CARDIO_MODALITIES.has(m);
export const isStrengthModality = (m: Modality | undefined): boolean =>
  m === 'strength' || m === 'functional';

// ── Measure vocab ────────────────────────────────────────────────────────────
export const MEASURE_OPTIONS: { value: MeasureKind; label: string }[] = [
  { value: 'reps', label: 'Reps' },
  { value: 'distance', label: 'Distancia' },
  { value: 'duration', label: 'Tiempo' },
  { value: 'calories', label: 'Calorías' },
];

// ── Target vocab + which targets each modality may use ───────────────────────
// Order matters: the FIRST kind listed is the default when switching modality.
export const TARGET_LABEL: Record<TargetKind, string> = {
  percent_rm: '%RM',
  kg: 'kg',
  rpe: 'RPE',
  rir: 'RIR',
  bodyweight: 'Peso corp.',
  pace: 'Ritmo',
  time_cap: 'Tiempo tope',
  hr_zone: 'Zona FC',
  hr_bpm: 'FC (ppm)',
  calories: 'Calorías',
  watts: 'Vatios',
  // No sale en STRENGTH_TARGETS/CARDIO_TARGETS/BODY_TARGETS (card 130): un
  // objetivo relativo lo escribe la plantilla, no este selector de kind. Llega
  // aquí solo por un dato ya guardado (import/AI); la etiqueta cubre ESE caso.
  relative: 'Relativo',
};

const STRENGTH_TARGETS: TargetKind[] = ['percent_rm', 'kg', 'rpe', 'rir', 'bodyweight'];
const CARDIO_TARGETS: TargetKind[] = ['pace', 'watts', 'hr_zone', 'hr_bpm', 'calories', 'rpe'];
const BODY_TARGETS: TargetKind[] = ['rpe', 'bodyweight', 'hr_zone']; // core / mobility

/** The target kinds that make sense for a given modality (drives the kind select). */
export function targetKindsForModality(modality: Modality | undefined): TargetKind[] {
  if (isStrengthModality(modality)) return STRENGTH_TARGETS;
  if (isCardioModality(modality)) return CARDIO_TARGETS;
  if (modality === 'core' || modality === 'mobility') return BODY_TARGETS;
  // Unknown / legacy: offer everything so nothing is unreachable.
  return [...STRENGTH_TARGETS, 'pace', 'hr_zone', 'hr_bpm', 'calories', 'time_cap'];
}

/** A modality's natural pace unit (run → /km, erg → /500m). */
export function defaultPaceUnit(modality: Modality | undefined): PaceUnit {
  return modality === 'run' ? 'per_km' : 'per_500m';
}

export const PACE_UNIT_OPTIONS: { value: PaceUnit; label: string }[] = [
  { value: 'per_km', label: '/km' },
  { value: 'per_500m', label: '/500m' },
  { value: 'per_mile', label: '/mi' },
];

// ── Defaults per modality (zero free text — every pick yields a typed shape) ──
// Returns the sensible default Measure + Target a fresh line of this modality
// gets. Used both when the coach switches modality and when seeding the block-
// level (non-set) conditioning target.
export function defaultMeasureForModality(modality: Modality | undefined): Measure {
  switch (modality) {
    case 'run':
      return { kind: 'distance', meters: 1000 };
    case 'row':
    case 'ski':
      return { kind: 'distance', meters: 500 };
    case 'bike':
      return { kind: 'duration', seconds: 600 };
    case 'core':
    case 'mobility':
      return { kind: 'duration', seconds: 60 };
    case 'functional':
      return { kind: 'reps', value: 10 };
    case 'strength':
    default:
      return { kind: 'reps', value: 8 };
  }
}

export function defaultTargetForModality(modality: Modality | undefined): Target | undefined {
  switch (modality) {
    case 'run':
      return { kind: 'pace', unit: 'per_km', value_s: 270 }; // 4:30/km
    case 'row':
    case 'ski':
      return { kind: 'pace', unit: 'per_500m', value_s: 110 }; // 1:50/500m
    case 'bike':
      return { kind: 'hr_zone', value: 2 };
    case 'strength':
      return { kind: 'percent_rm', value: 70 };
    case 'functional':
      return { kind: 'rpe', value: 7 };
    case 'core':
    case 'mobility':
      return undefined; // bodyweight is implicit; coach opts in if needed
    default:
      return undefined;
  }
}

/** The scheme a fresh line of this modality defaults to (strength → sets, cardio → steady). */
export function defaultSchemeForModality(modality: Modality | undefined): PrescriptionScheme {
  if (isStrengthModality(modality) || modality === 'core' || modality === 'mobility') return 'sets';
  return 'steady';
}

// ── Building an empty target of a chosen kind (preserving a numeric value) ───
// When the coach switches target KIND we carry any existing numeric value across
// so they don't lose what they typed. Pace keeps its unit + seconds.
export function emptyTargetOfKind(
  kind: TargetKind,
  modality: Modality | undefined,
  carry?: number,
): Target {
  switch (kind) {
    case 'bodyweight':
      return { kind: 'bodyweight' };
    case 'pace':
      return { kind: 'pace', unit: defaultPaceUnit(modality), value_s: carry ?? 270 };
    case 'hr_zone':
      return { kind: 'hr_zone', value: carry ?? 2 };
    case 'hr_bpm':
      return { kind: 'hr_bpm', value: carry ?? 150 };
    case 'percent_rm':
      return { kind: 'percent_rm', value: carry ?? 70 };
    case 'kg':
      return { kind: 'kg', value: carry ?? 60 };
    case 'rpe':
      return { kind: 'rpe', value: carry ?? 7 };
    case 'rir':
      return { kind: 'rir', value: carry ?? 2 };
    case 'calories':
      return { kind: 'calories', value: carry ?? 15 };
    case 'watts':
      return { kind: 'watts', value: carry ?? 200 };
    // A cap is a ceiling by nature, so it is born on max_s. The 8s default is
    // the roxzone entry target — the case this kind exists for.
    case 'time_cap':
      return { kind: 'time_cap', max_s: carry ?? 8 };
    // Un objetivo relativo (card 130) no nace de "cambiar de tipo arrastrando un
    // número": no tiene value/min/max, lleva una REFERENCIA (a peso de
    // competición, a ritmo, a peso corporal) que el coach elige explícitamente.
    // Por eso ningún selector de kind lo ofrece — no está en STRENGTH_TARGETS,
    // CARDIO_TARGETS, BODY_TARGETS ni en OBJECTIVE_OPTIONS del compositor de
    // fuerza. Si esta rama se ejecuta, un selector nuevo lo añadió sin dar la
    // referencia: avisa en vez de inventar una.
    case 'relative':
      throw new Error('emptyTargetOfKind: "relative" needs an explicit TargetReference, not a carried number');
  }
}

/** Pull a representative numeric value out of a target, for carry-on-kind-switch. */
export function targetScalar(t: Target | undefined): number | undefined {
  if (!t) return undefined;
  if (t.kind === 'pace' || t.kind === 'time_cap') return t.value_s ?? t.min_s ?? t.max_s;
  // bodyweight y relative no llevan cifra propia que arrastrar.
  if (!isScalarTarget(t)) return undefined;
  return t.value ?? t.min ?? t.max;
}

// ── Time / pace parse + format (m:ss) ────────────────────────────────────────
// One source of truth for the mm:ss <-> seconds round-trip used by pace inputs
// and duration inputs. Parsing is forgiving (accepts "430" → 4:30, "90" → 1:30
// only when it contains a colon; bare numbers are treated as seconds).
const TIME_RE = /^(\d{1,3}):([0-5]?\d)$/;

/** "4:30" → 270. A bare number string is read as raw seconds. "" → null. */
export function parseClock(raw: string): number | null {
  const s = raw.trim();
  if (s === '') return null;
  const m = TIME_RE.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** 270 → "4:30". undefined/null → "". */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Distance helpers: the coach enters meters or km; storage is always meters.
export function metersToKm(meters: number): number {
  return Math.round((meters / 1000) * 1000) / 1000;
}
export function kmToMeters(km: number): number {
  return Math.round(km * 1000);
}

// ── Conditioning block-measure plumbing ──────────────────────────────────────
// Conditioning schemes carry their primary measure in scalar fields (work_s for
// timed work, total_s for steady/amrap). Distance + calories have no native
// scheme field, so they live on a single representative set so the canonical
// model + prescriptionToText/Params still read them. These two helpers translate
// between a Measure and the prescription's scheme fields. Shared by the legacy
// PrescriptionEditor and the session-drawer PrescriptionEditorV2.
export function blockMeasureOf(p: Prescription): Measure | undefined {
  // A stashed distance/cal measure on the representative set wins.
  if (p.sets && p.sets.length === 1) {
    const m = setMeasure(p.sets[0]!);
    if (m && (m.kind === 'distance' || m.kind === 'calories')) return m;
  }
  if (p.scheme === 'steady' || p.scheme === 'amrap') {
    if (p.total_s !== undefined) return { kind: 'duration', seconds: p.total_s };
  }
  if (p.work_s !== undefined) return { kind: 'duration', seconds: p.work_s };
  return undefined;
}

export function measureToSchemeFields(
  scheme: PrescriptionScheme,
  m: Measure | undefined,
): Partial<Prescription> {
  // Reset the measure-carrying fields, then set the one this measure implies.
  const out: Partial<Prescription> = { sets: undefined };
  if (!m) {
    if (scheme === 'steady' || scheme === 'amrap') out.total_s = undefined;
    else out.work_s = undefined;
    return out;
  }
  switch (m.kind) {
    case 'duration':
      if (scheme === 'steady' || scheme === 'amrap') {
        out.total_s = m.seconds;
        out.work_s = undefined;
      } else {
        out.work_s = m.seconds;
      }
      break;
    case 'distance':
    case 'calories':
      // No native scheme field — carry on a single representative set so the
      // canonical model + summary keep it (interval/round bouts of Xm/Xcal).
      out.sets = [{ measure: m }];
      break;
    case 'reps':
      out.sets = [{ measure: m }];
      break;
  }
  return out;
}
