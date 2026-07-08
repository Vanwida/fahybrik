// @fahybrid/shared/domain/coach/test-battery — the FABRIK week-1 calibration
// battery (#34). Single source of truth for the four tests that fix an athlete's
// REAL point of departure in their first week: 5K control, 2K row, 1RM battery,
// HYROX half-sim. Replaces the dead `web/lib/coach/athlete-benchmark-tests.ts`
// stub (which had unwired, non-canonical slugs).
//
// Each protocol declares its `store_results` (the meta_json contract, see
// shared/schema/test-battery) so ONE definition drives: the seed template, the
// is_test badge, and the ejecución→benchmark bridge. Slugs are the LIVE ones
// (benchmark-slugs.ts / STRENGTH_LIFT_SLUGS), not the stub's.

import type { StoreResultSpec } from '../../schema/test-battery';
import {
  BENCH_RUN_5K,
  BENCH_ROW_2K,
  BENCH_HYROX_HALF_SIM,
  BENCH_BACK_SQUAT_1RM,
  BENCH_DEADLIFT_1RM,
  BENCH_BENCH_PRESS_1RM,
} from './benchmark-slugs';

/** The `template_format` a seed test template uses (subset of the enum). */
export type CalibrationFormat = 'test' | 'strength_block' | 'hyrox_sim';

export interface CalibrationTestProtocol {
  // Protocol id — mirrors methodology_tests where one exists; also the value of
  // `templates.meta_json.calibration` so scheduling finds the template without a
  // hardcoded id.
  slug: string;
  label: string;
  // Seed-template shape.
  format: CalibrationFormat;
  primary_modality: 'run' | 'row' | 'strength' | 'hyrox';
  // Coach-facing protocol instructions (the session brief).
  protocol: string;
  // Anchored to the athlete's first week (relative Monday). All four = 1.
  week_offset: number;
  // Preferred weekday (1 = Mon … 7 = Sun) so the four spread across the week
  // rather than piling on one day (each is demanding). A suggestion; the coach
  // can move them (Fork A: auto + override).
  day_of_week: number;
  // The contract: what this test measures and calibrates.
  store_results: StoreResultSpec[];
}

export const CALIBRATION_META_KEY = 'calibration' as const;

// The default v1 battery (Fork B: fixed 4 — the day-1 promise). Coach can
// remove/move any as a normal plan session.
export const FABRIK_WEEK1_BATTERY: readonly CalibrationTestProtocol[] = [
  {
    slug: 'tt_5k',
    label: '5K control',
    format: 'test',
    primary_modality: 'run',
    protocol: '5 km a fondo (contrarreloj). Calienta 10–15 min, luego 5 km al máximo sostenible.',
    week_offset: 1,
    day_of_week: 3, // Wed
    store_results: [
      {
        slug: BENCH_RUN_5K,
        unit: 'seconds',
        measure: 'time',
        derives: 'run_zones',
        modality: 'run',
        label: 'Tiempo 5K',
      },
    ],
  },
  {
    slug: 'tt_2k_row',
    label: 'Remo 2K',
    format: 'test',
    primary_modality: 'row',
    protocol: '2000 m en remoergómetro a fondo. Calienta 10 min, luego 2 km al máximo sostenible.',
    week_offset: 1,
    day_of_week: 5, // Fri
    store_results: [
      {
        slug: BENCH_ROW_2K,
        unit: 'seconds',
        measure: 'time',
        derives: 'row_zones',
        modality: 'row',
        label: 'Tiempo 2K remo',
      },
    ],
  },
  {
    slug: 'one_rm_battery',
    label: 'Batería 1RM',
    format: 'strength_block',
    primary_modality: 'strength',
    protocol: '1RM en sentadilla, peso muerto y press banca. Progresa en series hasta el máximo técnico.',
    week_offset: 1,
    day_of_week: 2, // Tue
    store_results: [
      { slug: BENCH_BACK_SQUAT_1RM, unit: 'kg', measure: 'load', derives: 'strength_max', modality: 'strength', label: 'Sentadilla' },
      { slug: BENCH_DEADLIFT_1RM, unit: 'kg', measure: 'load', derives: 'strength_max', modality: 'strength', label: 'Peso muerto' },
      { slug: BENCH_BENCH_PRESS_1RM, unit: 'kg', measure: 'load', derives: 'strength_max', modality: 'strength', label: 'Press banca' },
    ],
  },
  {
    slug: 'hyrox_half_sim',
    label: 'HYROX half-sim',
    format: 'hyrox_sim',
    primary_modality: 'hyrox',
    protocol: 'Simulacro HYROX a media distancia (4 estaciones + 4 corridas de 500 m). A ritmo de carrera.',
    week_offset: 1,
    day_of_week: 6, // Sat
    store_results: [
      {
        slug: BENCH_HYROX_HALF_SIM,
        unit: 'seconds',
        measure: 'time',
        derives: 'none',
        modality: 'hyrox',
        label: 'Tiempo half-sim',
      },
    ],
  },
] as const;

/** Every store_results spec flattened, keyed by slug (the bridge's routing table). */
export function storeResultSpecBySlug(slug: string): StoreResultSpec | null {
  for (const p of FABRIK_WEEK1_BATTERY) {
    const s = p.store_results.find((r) => r.slug === slug);
    if (s) return s;
  }
  return null;
}
