// editor-axes — the bridge between the v2 spec's THREE coach-facing selectors
// (MODALIDAD × CÓMO SE MIDE × CONTRA QUÉ OBJETIVO) and the EXISTING shared
// prescription domain model (@fahybrid/shared/domain/prescription). It does NOT
// invent a schema: every axis value resolves to fields already on `Prescription`
// (modality / measure / target / scheme). One source of truth so the SCREEN 5
// session editor, the SCREEN 8 day editor and the SCREEN 9 add-block modal all
// drive the SAME PrescriptionFields component.
//
// WHY a mapping layer: the domain model has 9 modalities (run/row/ski/bike/
// strength/functional/core/mobility/other) and the sketch groups them into 4
// coach tabs (Carrera·Ergómetro·Fuerza·Circuito). The "cómo se mide" tab is the
// domain `Measure.kind`; "contra qué objetivo" is the domain `Target.kind`. We
// translate in both directions so the UI tabs stay simple while persistence
// stays the rich, analytics-readable domain shape.

import type {
  Measure,
  MeasureKind,
  Modality,
  Prescription,
  PrescriptionSet,
  Target,
  TargetKind,
} from '@fahybrid/shared/domain/prescription';
import { setMeasure, setTarget } from '@fahybrid/shared/domain/prescription';
import {
  blockMeasureOf,
  defaultMeasureForModality,
  defaultSchemeForModality,
  defaultTargetForModality,
  emptyTargetOfKind,
  isStrengthModality,
  measureToSchemeFields,
} from '@/lib/programming/prescription-model';
import type { V2Modality } from '@/components/v2/constants';

// ── AXIS 1 · MODALIDAD (4 coach tabs ↔ 9 domain modalities) ──────────────────
export type AxisModalidad = 'carrera' | 'ergo' | 'fuerza' | 'circuito';

export const MODALIDAD_OPTIONS: { value: AxisModalidad; label: string }[] = [
  { value: 'carrera', label: 'Carrera' },
  { value: 'ergo', label: 'Ergómetro' },
  { value: 'fuerza', label: 'Fuerza' },
  { value: 'circuito', label: 'Circuito' },
];

/** The domain modality a coach tab defaults to when first selected. */
const AXIS_TO_DOMAIN_DEFAULT: Record<AxisModalidad, Modality> = {
  carrera: 'run',
  ergo: 'row',
  fuerza: 'strength',
  circuito: 'functional',
};

/** Which concrete domain modalities the "Ergómetro" tab can pick between. */
export const ERGO_SUBMODALITIES: { value: Modality; label: string }[] = [
  { value: 'row', label: 'Remo' },
  { value: 'ski', label: 'SkiErg' },
  { value: 'bike', label: 'Bici' },
];

/** Map a concrete domain modality back to its coach-facing axis tab. */
export function domainToAxisModalidad(m: Modality | undefined): AxisModalidad {
  switch (m) {
    case 'run':
      return 'carrera';
    case 'row':
    case 'ski':
    case 'bike':
      return 'ergo';
    case 'strength':
      return 'fuerza';
    case 'functional':
    case 'core':
    case 'mobility':
    case 'other':
    default:
      return 'circuito';
  }
}

/** The domain modality for an axis tab (carrera→run, ergo→row by default). */
export function axisToDomainModality(
  axis: AxisModalidad,
  prevDomain?: Modality,
): Modality {
  // Preserve the user's erg sub-choice (ski/bike) when staying on the ergo tab.
  if (axis === 'ergo' && prevDomain && ERGO_SUBMODALITIES.some((o) => o.value === prevDomain)) {
    return prevDomain;
  }
  return AXIS_TO_DOMAIN_DEFAULT[axis];
}

/** Map a domain modality to the v2 modality color axis (left-border / dot). */
export function modalityColorSlug(m: Modality | undefined): V2Modality {
  switch (m) {
    case 'run':
      return 'carrera';
    case 'row':
    case 'ski':
    case 'bike':
      return 'ergo';
    case 'strength':
      return 'fuerza';
    case 'core':
    case 'mobility':
      return 'calentamiento';
    case 'functional':
    case 'other':
    default:
      return 'circuito';
  }
}

// ── AXIS 2 · CÓMO SE MIDE (Measure.kind) ─────────────────────────────────────
export const MEDIDA_OPTIONS: { value: MeasureKind; label: string }[] = [
  { value: 'distance', label: 'Distancia' },
  { value: 'duration', label: 'Tiempo' },
  { value: 'reps', label: 'Reps' },
  { value: 'calories', label: 'Calorías' },
];

/** Which measure kinds make sense per coach tab (drives the segmented control). */
export function medidasForModalidad(axis: AxisModalidad): MeasureKind[] {
  switch (axis) {
    case 'carrera':
      return ['distance', 'duration'];
    case 'ergo':
      return ['distance', 'duration', 'calories'];
    case 'fuerza':
      return ['reps', 'duration'];
    case 'circuito':
      return ['reps', 'duration', 'distance', 'calories'];
  }
}

// ── AXIS 3 · CONTRA QUÉ OBJETIVO (Target.kind) ───────────────────────────────
export const OBJETIVO_LABEL: Record<TargetKind, string> = {
  pace: 'Ritmo',
  hr_zone: 'Zona',
  rpe: 'RPE',
  percent_rm: '%máx',
  rir: 'RIR',
  kg: 'kg',
  bodyweight: 'Peso corp.',
  time_cap: 'Tiempo tope',
  hr_bpm: 'FC',
  calories: 'Cal',
  watts: 'Vatios',
};

/** Objective kinds per coach tab — order = default-first (sketch ① ② ③ axes). */
export function objetivosForModalidad(axis: AxisModalidad): TargetKind[] {
  switch (axis) {
    case 'carrera':
      return ['pace', 'hr_zone', 'rpe'];
    case 'ergo':
      return ['pace', 'rpe', 'hr_zone'];
    case 'fuerza':
      return ['percent_rm', 'kg', 'rir', 'rpe', 'bodyweight'];
    case 'circuito':
      return ['rpe', 'hr_zone', 'pace', 'percent_rm', 'time_cap'];
  }
}

// ── Reading the current axes off a Prescription ──────────────────────────────
export interface ResolvedAxes {
  modalidad: AxisModalidad;
  domain_modality: Modality;
  medida: MeasureKind;
  objetivo: TargetKind;
}

/** Derive the 3 axis values from a prescription (for initial control state). */
export function axesOf(p: Prescription): ResolvedAxes {
  const domain_modality = p.modality ?? 'strength';
  const modalidad = domainToAxisModalidad(domain_modality);
  const measure = isSetScheme(p) ? firstSetMeasure(p) : blockMeasureOf(p);
  const target = isSetScheme(p) ? firstSetTarget(p) : prescriptionBlockTarget(p);
  return {
    modalidad,
    domain_modality,
    medida: measure?.kind ?? medidasForModalidad(modalidad)[0]!,
    objetivo: target?.kind ?? objetivosForModalidad(modalidad)[0]!,
  };
}

function isSetScheme(p: Prescription): boolean {
  return p.scheme === 'sets';
}
function firstSetMeasure(p: Prescription): Measure | undefined {
  return p.sets && p.sets[0] ? setMeasure(p.sets[0]) : undefined;
}
function firstSetTarget(p: Prescription): Target | undefined {
  return p.sets && p.sets[0] ? setTarget(p.sets[0]) : undefined;
}
function prescriptionBlockTarget(p: Prescription): Target | undefined {
  if (p.target) return p.target;
  if (p.hr_zone !== undefined) return { kind: 'hr_zone', value: p.hr_zone };
  return undefined;
}

// ── Applying an axis change to a Prescription (re-renders CAMPOS) ─────────────
// Each setter returns a NEW prescription so React re-renders the adaptive fields.
// We delegate defaults to the shared prescription-model (no duplicated rules).

/** Switch the MODALIDAD tab — reshapes the line to that modality's natural form. */
export function applyModalidad(p: Prescription, axis: AxisModalidad): Prescription {
  const next = axisToDomainModality(axis, p.modality);
  if (next === p.modality) return p;
  const scheme = defaultSchemeForModality(next);
  if (scheme === 'sets') {
    const seedSet: PrescriptionSet = {
      measure: defaultMeasureForModality(next),
      ...(defaultTargetForModality(next) ? { target: defaultTargetForModality(next)! } : {}),
    };
    return {
      scheme: 'sets',
      modality: next,
      sets: p.sets && p.sets.length > 0 ? p.sets : [seedSet],
    };
  }
  const blockTarget = defaultTargetForModality(next);
  return {
    scheme,
    modality: next,
    ...(blockTarget ? { target: blockTarget } : {}),
    ...measureToSchemeFields(scheme, defaultMeasureForModality(next)),
  };
}

/** Pick a concrete erg sub-modality (Remo / SkiErg / Bici) within the ergo tab. */
export function applyErgSubmodality(p: Prescription, m: Modality): Prescription {
  if (m === p.modality) return p;
  const blockTarget = defaultTargetForModality(m);
  return {
    scheme: p.scheme === 'sets' ? 'steady' : p.scheme,
    modality: m,
    ...(blockTarget ? { target: blockTarget } : {}),
    ...measureToSchemeFields(p.scheme === 'sets' ? 'steady' : p.scheme, defaultMeasureForModality(m)),
  };
}

/** Switch CÓMO SE MIDE — reshape the measure on the set(s) / block fields. */
export function applyMedida(p: Prescription, kind: MeasureKind): Prescription {
  const measure = defaultMeasureOfKind(kind);
  if (p.scheme === 'sets') {
    const sets = p.sets && p.sets.length > 0 ? p.sets : [{}];
    return { ...p, sets: sets.map((s, i) => (i === 0 ? { ...s, measure } : s)) };
  }
  return { ...p, ...measureToSchemeFields(p.scheme, measure) };
}

/** Switch CONTRA QUÉ OBJETIVO — reshape the target, carrying any numeric value. */
export function applyObjetivo(p: Prescription, kind: TargetKind): Prescription {
  const target = emptyTargetOfKind(kind, p.modality, currentScalar(p));
  if (p.scheme === 'sets') {
    const sets = p.sets && p.sets.length > 0 ? p.sets : [{}];
    return { ...p, sets: sets.map((s, i) => (i === 0 ? { ...s, target } : s)) };
  }
  return { ...p, target };
}

function currentScalar(p: Prescription): number | undefined {
  const t = p.scheme === 'sets' ? firstSetTarget(p) : prescriptionBlockTarget(p);
  if (!t || t.kind === 'bodyweight') return undefined;
  if (t.kind === 'pace' || t.kind === 'time_cap') return t.value_s ?? t.min_s ?? t.max_s;
  return t.value ?? t.min ?? t.max;
}

function defaultMeasureOfKind(kind: MeasureKind): Measure {
  switch (kind) {
    case 'reps':
      return { kind: 'reps', value: 8 };
    case 'distance':
      return { kind: 'distance', meters: 1000 };
    case 'duration':
      return { kind: 'duration', seconds: 600 };
    case 'calories':
      return { kind: 'calories', value: 15 };
  }
}

// ── Seeding an empty prescription for a fresh block of a chosen type ──────────
/** A sensible starting prescription for the SCREEN 9 "Crear desde cero" tiles. */
export function seedPrescription(axis: AxisModalidad): Prescription {
  // Seed from a neutral base, then apply the tab so defaults come from the
  // shared prescription-model (no duplicated seeding rules here).
  return applyModalidad({ scheme: 'sets', modality: 'other' }, axis);
}

export { isStrengthModality };
