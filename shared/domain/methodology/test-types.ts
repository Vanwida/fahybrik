// TEST TYPES — the closed sport vocabulary of the Test archetype (UX pase
// docs/superpowers/plans/2026-06-25-ux-hyrox-sim-test.html §2).
//
// WHAT THIS IS
// ------------
// A "test" is the RESOLVER of the plan: the athlete performs it once at RPE 10,
// and its result (a threshold pace) calculates their zone profile, which then
// translates every relative prescription (Z2 / "ritmo umbral" / "Z4 remo") into
// THAT athlete's absolute paces. This module is the single, pure list of the test
// TYPES the coach can author, and how each maps to the objective domain:
//
//   modality  — which discipline the test measures (row | ski | run), the same
//               family the resolved zone profile is stored under.
//   pace_unit — per_500m for ergo (row/ski), per_km for run. The unit of the
//               threshold pace AND of the resolved zone bands.
//   measure   — distance (a fixed-distance TT) | duration (a fixed-time effort).
//   amount    — the canonical measure amount (meters for distance, seconds for
//               duration) so the form pre-fills the protocol.
//
// AGNOSTIC: the test TYPE (Remo 2 km, Ski 2 km, Carrera 3'/9'/30') is universal
// sport vocabulary, identical for every coach — exactly like the editor's
// archetypes. The zone MATH (offsets, labels, colors) is the coach's methodology
// DATA (methodology_zones); this file invents none of it. The two halves are
// joined at resolve time by `resolveZonesForAthlete(testResult, coachZones)`.
//
// The objective effort is ALWAYS RPE 10 (máximo) — that is what makes the result
// a threshold, not a sub-maximal sample. It is a property of the test, not a
// coach choice, so it lives here as a constant, not a form field.

import type { ZonePaceUnit } from './zone-model';

/** Discipline a test measures. Mirrors athlete_zone_profiles.modality. */
export type TestModality = 'row' | 'ski' | 'run';

/** How a test's work is measured. */
export type TestMeasureKind = 'distance' | 'duration';

/** The objective effort of EVERY test — máximo. Not a coach choice. */
export const TEST_TARGET_RPE = 10 as const;

export interface TestType {
  /** Stable slug persisted with the test block + as athlete_zone_profiles.source_test_slug. */
  slug: string;
  /** Coach-facing name (sport vocabulary, Spanish). */
  label: string;
  /** Short protocol descriptor shown under the type picker. */
  protocol: string;
  /** Discipline the test measures (drives modality + the stored profile). */
  modality: TestModality;
  /** Unit of the threshold pace + resolved bands. */
  pace_unit: ZonePaceUnit;
  /** How the work is measured. */
  measure: TestMeasureKind;
  /** Canonical amount: meters (distance) or seconds (duration). */
  amount: number;
}

// Ordered by family (ergo first — the default calculator is the ergo one),
// then run. Each row is a complete objective spec; the form reads it, never asks.
export const TEST_TYPES: TestType[] = [
  {
    slug: 'row_2k',
    label: 'Remo 2 km',
    protocol: '2000 m a tope · split /500m → bandas Concept2',
    modality: 'row',
    pace_unit: 'per_500m',
    measure: 'distance',
    amount: 2000,
  },
  {
    slug: 'ski_2k',
    label: 'Ski 2 km',
    protocol: '2000 m a tope · split /500m → bandas Concept2',
    modality: 'ski',
    pace_unit: 'per_500m',
    measure: 'distance',
    amount: 2000,
  },
  {
    slug: 'run_3min',
    label: 'Carrera 3′',
    protocol: '3 min a tope · ritmo /km → zonas',
    modality: 'run',
    pace_unit: 'per_km',
    measure: 'duration',
    amount: 180,
  },
  {
    slug: 'run_9min',
    label: 'Carrera 9′',
    protocol: '9 min a tope · ritmo /km → zonas',
    modality: 'run',
    pace_unit: 'per_km',
    measure: 'duration',
    amount: 540,
  },
  {
    slug: 'run_30min',
    label: 'Carrera 30′',
    protocol: '30 min a tope · ritmo umbral /km → zonas',
    modality: 'run',
    pace_unit: 'per_km',
    measure: 'duration',
    amount: 1800,
  },
];

export const TEST_TYPES_BY_SLUG: Record<string, TestType> = Object.fromEntries(
  TEST_TYPES.map((t) => [t.slug, t]),
);

/** The default test type a fresh Test block starts on (the ergo one). */
export const DEFAULT_TEST_TYPE_SLUG = 'row_2k';

export function getTestType(slug: string | null | undefined): TestType | null {
  if (!slug) return null;
  return TEST_TYPES_BY_SLUG[slug] ?? null;
}

/**
 * Reverse-lookup a test type from its objective spec (modality × measure ×
 * amount). The five types are UNIQUELY keyed by this triple — row_2k
 * (row,distance,2000), ski_2k (ski,distance,2000), run_3min (run,duration,180),
 * run_9min (run,duration,540), run_30min (run,duration,1800) — so a persisted
 * Test block's prescription round-trips back to its type with NO extra metadata
 * (the prescription IS the test spec). Returns null if no exact match (e.g. a
 * coach tuned the amount), in which case the editor falls back to the closest
 * type by modality+measure.
 */
export function testTypeForSpec(
  modality: TestModality,
  measure: TestMeasureKind,
  amount: number,
): TestType | null {
  return (
    TEST_TYPES.find(
      (t) => t.modality === modality && t.measure === measure && t.amount === amount,
    ) ?? null
  );
}

/** Closest type by modality+measure (the fallback when amount was tuned). */
export function closestTestType(
  modality: TestModality,
  measure: TestMeasureKind,
): TestType | null {
  return TEST_TYPES.find((t) => t.modality === modality && t.measure === measure) ?? null;
}

/** The unit suffix a test's threshold/zone pace renders with (/500m | /km). */
export function testPaceUnitLabel(unit: ZonePaceUnit): string {
  return unit === 'per_km' ? '/km' : '/500m';
}
