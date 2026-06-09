// prescription-presets — typed 1-click presets per modality for the session
// drawer's PrescriptionEditorV2 (UX redesign §4), plus the natural-Spanish
// vocabulary the editor surfaces instead of the internal scheme/measure/target
// names. ZERO free text: every preset builds a canonical Prescription.
//
// This file is the single source of truth for:
//   - the modality segmented control (order + coach-facing labels per mockup)
//   - the preset chips per modality ("5×5 @ 70%", "4×1000m umbral", "Z2 45'"…)
//   - the natural field labels (Distancia, Ritmo objetivo, Descanso…)
//   - the "last used" recents persistence (localStorage, per modality)

import type {
  MeasureKind,
  Modality,
  Prescription,
  PrescriptionScheme,
  PrescriptionSet,
  TargetKind,
} from '@fahybrid/shared/domain/prescription';

// ── Modality segmented control (mockup order + labels) ───────────────────────
export const MODALITY_SEGMENT: { value: Modality; label: string }[] = [
  { value: 'strength', label: 'Fuerza' },
  { value: 'run', label: 'Run' },
  { value: 'row', label: 'Row' },
  { value: 'ski', label: 'Ski' },
  { value: 'bike', label: 'Bike' },
  { value: 'functional', label: 'Funcional' },
  { value: 'core', label: 'Core' },
  { value: 'mobility', label: 'Movilidad' },
];

export function modalityLabel(m: Modality | undefined): string {
  return MODALITY_SEGMENT.find((o) => o.value === m)?.label ?? 'ejercicio';
}

// ── Natural field labels (the words esquema/medida/target NEVER reach the UI) ─
export const MEASURE_FIELD_LABEL: Record<MeasureKind, string> = {
  reps: 'Reps',
  distance: 'Distancia',
  duration: 'Tiempo',
  calories: 'Calorías',
};

export function targetFieldLabel(kind: TargetKind | undefined): string {
  switch (kind) {
    case 'percent_rm':
    case 'kg':
    case 'bodyweight':
      return 'Carga';
    case 'rpe':
      return 'Esfuerzo';
    case 'rir':
      return 'RIR';
    case 'pace':
      return 'Ritmo objetivo';
    case 'hr_zone':
      return 'Zona FC';
    case 'hr_bpm':
      return 'FC objetivo';
    case 'calories':
      return 'Calorías objetivo';
    default:
      return 'Objetivo';
  }
}

/** Coach-natural label for the structure select ("Formato"). */
export const SCHEME_NATURAL_LABEL: Record<PrescriptionScheme, string> = {
  sets: 'Series',
  interval: 'Intervalos',
  rounds: 'Rondas',
  emom: 'EMOM',
  amrap: 'AMRAP',
  for_time: 'For Time',
  steady: 'Continuo',
};

// ── Presets ──────────────────────────────────────────────────────────────────
export interface RxPreset {
  id: string;
  /** Chip label, terse and mono ("5×5 @ 70%"). */
  label: string;
  build: () => Prescription;
}

/** N identical sets (helper so presets stay declarative). */
function uniformSets(n: number, set: PrescriptionSet): PrescriptionSet[] {
  return Array.from({ length: n }, () => ({ ...set }));
}

export const PRESETS_BY_MODALITY: Record<Modality, RxPreset[]> = {
  strength: [
    {
      id: 'strength-5x5-70',
      label: '5×5 @ 70%',
      build: () => ({
        scheme: 'sets',
        modality: 'strength',
        sets: uniformSets(5, {
          measure: { kind: 'reps', value: 5 },
          target: { kind: 'percent_rm', value: 70 },
          rest_s: 120,
        }),
      }),
    },
    {
      id: 'strength-4x8-rpe8',
      label: '4×8 @ RPE8',
      build: () => ({
        scheme: 'sets',
        modality: 'strength',
        sets: uniformSets(4, {
          measure: { kind: 'reps', value: 8 },
          target: { kind: 'rpe', value: 8 },
          rest_s: 90,
        }),
      }),
    },
    {
      id: 'strength-3x3-90',
      label: '3×3 @ 90%',
      build: () => ({
        scheme: 'sets',
        modality: 'strength',
        sets: uniformSets(3, {
          measure: { kind: 'reps', value: 3 },
          target: { kind: 'percent_rm', value: 90 },
          rest_s: 180,
        }),
      }),
    },
  ],
  run: [
    {
      id: 'run-4x1000-umbral',
      label: '4×1000m umbral',
      build: () => ({
        scheme: 'interval',
        modality: 'run',
        rounds: 4,
        rest_s: 120,
        sets: uniformSets(4, {
          measure: { kind: 'distance', meters: 1000 },
          target: { kind: 'pace', unit: 'per_km', value_s: 250 },
        }),
      }),
    },
    {
      id: 'run-6x400',
      label: '6×400m',
      build: () => ({
        scheme: 'interval',
        modality: 'run',
        rounds: 6,
        rest_s: 90,
        sets: uniformSets(6, {
          measure: { kind: 'distance', meters: 400 },
          target: { kind: 'pace', unit: 'per_km', value_s: 240 },
        }),
      }),
    },
    {
      id: 'run-z2-45',
      label: "Z2 45'",
      build: () => ({
        scheme: 'steady',
        modality: 'run',
        total_s: 2700,
        target: { kind: 'hr_zone', value: 2 },
      }),
    },
  ],
  row: [
    {
      id: 'row-3x3-rpe8',
      label: "3×3' RPE8 r2'",
      build: () => ({
        scheme: 'interval',
        modality: 'row',
        rounds: 3,
        rest_s: 120,
        sets: uniformSets(3, {
          measure: { kind: 'duration', seconds: 180 },
          target: { kind: 'rpe', value: 8 },
        }),
      }),
    },
    {
      id: 'row-4x500-150',
      label: '4×500m @ 1:50',
      build: () => ({
        scheme: 'interval',
        modality: 'row',
        rounds: 4,
        rest_s: 90,
        sets: uniformSets(4, {
          measure: { kind: 'distance', meters: 500 },
          target: { kind: 'pace', unit: 'per_500m', value_s: 110 },
        }),
      }),
    },
    {
      id: 'row-z2-30',
      label: "Z2 30'",
      build: () => ({
        scheme: 'steady',
        modality: 'row',
        total_s: 1800,
        target: { kind: 'hr_zone', value: 2 },
      }),
    },
  ],
  ski: [
    {
      id: 'ski-3x3-rpe8',
      label: "3×3' RPE8 r2'",
      build: () => ({
        scheme: 'interval',
        modality: 'ski',
        rounds: 3,
        rest_s: 120,
        sets: uniformSets(3, {
          measure: { kind: 'duration', seconds: 180 },
          target: { kind: 'rpe', value: 8 },
        }),
      }),
    },
    {
      id: 'ski-4x500-155',
      label: '4×500m @ 1:55',
      build: () => ({
        scheme: 'interval',
        modality: 'ski',
        rounds: 4,
        rest_s: 90,
        sets: uniformSets(4, {
          measure: { kind: 'distance', meters: 500 },
          target: { kind: 'pace', unit: 'per_500m', value_s: 115 },
        }),
      }),
    },
    {
      id: 'ski-z2-20',
      label: "Z2 20'",
      build: () => ({
        scheme: 'steady',
        modality: 'ski',
        total_s: 1200,
        target: { kind: 'hr_zone', value: 2 },
      }),
    },
  ],
  bike: [
    {
      id: 'bike-z2-45',
      label: "Z2 45'",
      build: () => ({
        scheme: 'steady',
        modality: 'bike',
        total_s: 2700,
        target: { kind: 'hr_zone', value: 2 },
      }),
    },
    {
      id: 'bike-4x5-z4',
      label: "4×5' Z4 r3'",
      build: () => ({
        scheme: 'interval',
        modality: 'bike',
        rounds: 4,
        rest_s: 180,
        sets: uniformSets(4, {
          measure: { kind: 'duration', seconds: 300 },
          target: { kind: 'hr_zone', value: 4 },
        }),
      }),
    },
    {
      id: 'bike-z2-90',
      label: "Z2 90'",
      build: () => ({
        scheme: 'steady',
        modality: 'bike',
        total_s: 5400,
        target: { kind: 'hr_zone', value: 2 },
      }),
    },
  ],
  functional: [
    {
      id: 'functional-3x10-rpe7',
      label: '3×10 @ RPE7',
      build: () => ({
        scheme: 'sets',
        modality: 'functional',
        sets: uniformSets(3, {
          measure: { kind: 'reps', value: 10 },
          target: { kind: 'rpe', value: 7 },
          rest_s: 90,
        }),
      }),
    },
    {
      id: 'functional-amrap-12',
      label: "AMRAP 12'",
      build: () => ({
        scheme: 'amrap',
        modality: 'functional',
        total_s: 720,
      }),
    },
    {
      id: 'functional-emom-10',
      label: "EMOM 10'",
      build: () => ({
        scheme: 'emom',
        modality: 'functional',
        rounds: 10,
      }),
    },
  ],
  core: [
    {
      id: 'core-3x45s',
      label: "3×45'' r30''",
      build: () => ({
        scheme: 'sets',
        modality: 'core',
        sets: uniformSets(3, {
          measure: { kind: 'duration', seconds: 45 },
          rest_s: 30,
        }),
      }),
    },
    {
      id: 'core-3x12',
      label: '3×12',
      build: () => ({
        scheme: 'sets',
        modality: 'core',
        sets: uniformSets(3, {
          measure: { kind: 'reps', value: 12 },
          rest_s: 45,
        }),
      }),
    },
    {
      id: 'core-3x60s',
      label: "3×1'",
      build: () => ({
        scheme: 'sets',
        modality: 'core',
        sets: uniformSets(3, {
          measure: { kind: 'duration', seconds: 60 },
          rest_s: 30,
        }),
      }),
    },
  ],
  mobility: [
    {
      id: 'mobility-10',
      label: "10' suave",
      build: () => ({
        scheme: 'steady',
        modality: 'mobility',
        total_s: 600,
      }),
    },
    {
      id: 'mobility-15',
      label: "15'",
      build: () => ({
        scheme: 'steady',
        modality: 'mobility',
        total_s: 900,
      }),
    },
    {
      id: 'mobility-2x8',
      label: '2×8',
      build: () => ({
        scheme: 'sets',
        modality: 'mobility',
        sets: uniformSets(2, {
          measure: { kind: 'reps', value: 8 },
        }),
      }),
    },
  ],
  other: [],
};

export function presetsForModality(m: Modality | undefined): RxPreset[] {
  if (!m) return [];
  return PRESETS_BY_MODALITY[m] ?? [];
}

// ── "Último usado" recents (per modality, client-side) ───────────────────────
// One slot per modality. localStorage is the right scope: it's a typing
// shortcut for THIS coach on THIS machine, not shared product data.
const RECENTS_STORAGE_KEY = 'fahybrik.rx_recents.v1';

type RecentsMap = Partial<Record<Modality, Prescription>>;

function readRecents(): RecentsMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(RECENTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentsMap) : {};
  } catch {
    return {};
  }
}

export function loadRecentPrescription(m: Modality | undefined): Prescription | null {
  if (!m) return null;
  return readRecents()[m] ?? null;
}

export function saveRecentPrescription(m: Modality | undefined, p: Prescription): void {
  if (!m || typeof window === 'undefined') return;
  try {
    const next = { ...readRecents(), [m]: p };
    window.localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota/privacy-mode failures are non-fatal: recents are a nicety.
  }
}
