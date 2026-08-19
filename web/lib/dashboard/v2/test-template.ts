// test-template — the factory + helpers for the Test archetype block (UX pase
// 2026-06-25 §2). A Test block is a RESOLVER: a fixed distance/time effort at RPE
// 10 whose result (recorded later, coach-side) calculates the athlete's zone
// profile. Picking a TEST TYPE (Remo 2k · Ski 2k · Carrera 3'/9'/30') fixes the
// modality, the measure, and the objective (always RPE 10) — the form never asks.
//
// DRY: the prescription IS the test spec. The test TYPE round-trips from the
// persisted prescription (modality × measure × amount) via testTypeForSpec — no
// extra metadata column. The block format is 'test' (classifies it for reload).

import type { Modality, Prescription } from '@fahybrid/shared/domain/prescription';
import { setMeasure } from '@fahybrid/shared/domain/prescription';
import {
  TEST_TYPES_BY_SLUG,
  DEFAULT_TEST_TYPE_SLUG,
  TEST_TARGET_RPE,
  testTypeForSpec,
  closestTestType,
  type TestType,
} from '@fahybrid/shared/domain/methodology';
import type { EditorBlock, EditorItem, StructureGroup } from '@/lib/dashboard/v2/editor-types';

export const TEST_BLOCK_FORMAT = 'test';

/** The domain modality a test type's prescription carries (run|row|ski). */
function testDomainModality(t: TestType): Modality {
  return t.modality; // 'row' | 'ski' | 'run' are all valid domain modalities
}

/**
 * Build the prescription for a test type: a STEADY block measured by the test's
 * measure (distance → a single representative set; duration → total_s) at the
 * fixed objective RPE 10. This is a valid Prescription the existing serializer
 * persists and from which the test type round-trips.
 */
export function testPrescription(t: TestType): Prescription {
  const modality = testDomainModality(t);
  const target: Prescription['target'] = { kind: 'rpe', value: TEST_TARGET_RPE };
  if (t.measure === 'duration') {
    return { scheme: 'steady', modality, total_s: t.amount, target };
  }
  return {
    scheme: 'steady',
    modality,
    sets: [{ measure: { kind: 'distance', meters: t.amount } }],
    target,
  };
}

/**
 * Recover the test type from a persisted Test prescription (round-trip).
 *
 * PARTIAL on purpose: `null` means "this prescription is NOT a catalog test
 * spec", and the caller (ArchetypeBlockForm) degrades to the item editor — it
 * never claims a type the prescription doesn't carry. Claiming one would show
 * the coach a false selector (a run 5K labeled «Remo 2 km») and, on touch +
 * Guardar, OVERWRITE the real prescription with the claimed type's — the
 * silent-corruption shape A3 (item-validity.ts) exists to prevent.
 *
 * Not a test spec: no prescription, a modality no test measures, a phased
 * `structure` (session content — warmup/effort/cooldown — which testPrescription
 * can't re-emit), a non-steady scheme, or fixing nothing a test type fixes.
 * Within a test modality+measure, a tuned amount still resolves to the closest
 * type (a 2500 m row is still the Remo 2 km family).
 */
export function testTypeFromPrescription(p: Prescription | undefined): TestType | null {
  if (!p) return null;
  // Phased session content / interval work: the type picker cannot represent it
  // (testPrescription only emits a bare steady spec), so it must not claim it.
  if (p.structure || p.scheme !== 'steady') return null;
  const modality = p.modality;
  if (modality !== 'run' && modality !== 'row' && modality !== 'ski') return null;
  // duration → total_s; distance → first set's distance meters.
  if (p.total_s !== undefined) {
    return testTypeForSpec(modality, 'duration', p.total_s) ?? closestTestType(modality, 'duration');
  }
  const firstSet = p.sets?.[0];
  const m = firstSet ? setMeasure(firstSet) : undefined;
  const meters = m?.kind === 'distance' ? m.meters : undefined;
  if (meters !== undefined) {
    return testTypeForSpec(modality, 'distance', meters) ?? closestTestType(modality, 'distance');
  }
  return null;
}

/** Build a fresh Test block (default test type) for the editor picker. `group` is
 *  optional — the agnostic day editor omits it (flat list, no imposed sections). */
export function createTestBlock(group?: StructureGroup): EditorBlock {
  const t = TEST_TYPES_BY_SLUG[DEFAULT_TEST_TYPE_SLUG];
  const now = Date.now();
  const item: EditorItem = {
    uid: `test-item-${now}`,
    exercise_id: null,
    exercise_name: t.label,
    prescription: testPrescription(t),
  };
  return {
    uid: `test-${now}`,
    title: 'Test',
    format: TEST_BLOCK_FORMAT,
    archetype_id: 'test',
    ...(group ? { group } : {}),
    items: [item],
  };
}
