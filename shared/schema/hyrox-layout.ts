// HYROX canonical layout — the fixed 16-element competition structure.
//
// HYROX is fixed: 16 elements = 8×1km runs interleaved with 8 stations.
// `STATION_INDEX_RUN` lists the run positions (odd), `STATION_INDEX_STATION`
// the station positions (even). This is the single source for the layout used by
// the race import/parse pipeline (hyrox/parse, hyresult/map), the athlete race
// context + station detail, and the dobles simulation/analytics.
//
// (Extracted from the former race-plan schema, whose race_plan/result/debrief
// feature was removed when the unified `races` spine replaced those tables.)

export const HYROX_ELEMENT_COUNT = 16 as const;
export const STATION_INDEX_RUN = [1, 3, 5, 7, 9, 11, 13, 15] as const;
export const STATION_INDEX_STATION = [2, 4, 6, 8, 10, 12, 14, 16] as const;

export const HYROX_STATION_LABELS: Readonly<Record<number, string>> = {
  1: 'Run 1km',
  2: 'SkiErg 1km',
  3: 'Run 1km',
  4: 'Sled push',
  5: 'Run 1km',
  6: 'Sled pull',
  7: 'Run 1km',
  8: 'Burpee broad jump 80m',
  9: 'Run 1km',
  10: 'Row 1km',
  11: 'Run 1km',
  12: 'Farmer carry 200m',
  13: 'Run 1km',
  14: 'Sandbag lunge 200m',
  15: 'Run 1km',
  16: 'Wall ball 100',
} as const;
