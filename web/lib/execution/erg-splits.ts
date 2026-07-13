// Concept2 PM5 erg detail (#33), folded into `segment_executions.raw_lap_data_json`.
//
// iOS captures, per erg segment, the monitor's own per-interval splits (the ErgData
// interval table) plus a few segment-level aggregates the columns don't hold (drag
// factor, cal/h, drive force). There are NO new columns for these — they ride inside
// the segment's `raw_lap_data_json` (alongside the existing `zone_seconds` key). This
// module is the single source of truth for that shape: it validates on the way IN
// (reused by the sync ingest schema) and reads it back tolerantly on the way OUT.
//
// The keys here are the EXACT snake_case the iOS DTOs use on both ends
// (WorkoutModels.ErgSplitDTO on send, AssignmentDetail.ErgSplitActual on decode), so
// the round-trip is symmetric: what iOS posts is what session-actuals echoes back
// verbatim. Never throws — a shared jsonb column (zone_seconds, a future payload) or
// a malformed blob safeParses to null and simply yields "no erg detail".

import { z } from 'zod';

// A tolerant, non-negative, nullable number: iOS sends every split field as
// `Double?`/`Int?`, so an absent metric arrives as null or is omitted entirely.
const numish = z.number().finite().nonnegative().nullish();

// One PM5 interval — the ErgData interval-table row. `index` is the only required
// field (the two source frames 0x37/0x38 may not both have landed for the rest).
// Unknown keys are stripped so a future field never fails the parse.
export const ergSplitItemSchema = z.object({
  index: z.number().int().min(0),
  time_seconds: numish,
  distance_meters: numish,
  avg_pace_s_per_500m: numish,
  stroke_rate_spm: numish,
  avg_power_w: numish,
  calories: numish,
  calories_per_hour: numish,
  drag_factor: numish,
  rest_time_seconds: numish,
  rest_distance_meters: numish,
  avg_hr: numish,
});

// The erg subset of `raw_lap_data_json`: segment-level aggregates + the interval
// array. `zone_seconds` and any other key are stripped by Zod (not part of this
// shape), so reading an old zone-seconds-only blob yields no erg detail.
export const ergDetailSchema = z.object({
  drag_factor: numish,
  avg_calories_per_hour: numish,
  peak_drive_force_lbs: numish,
  avg_drive_force_lbs: numish,
  erg_splits: z.array(ergSplitItemSchema).max(200).nullish(),
});

export type ErgSplitItem = z.infer<typeof ergSplitItemSchema>;
export type ErgDetail = z.infer<typeof ergDetailSchema>;

/**
 * Tolerant reader: pull the erg detail out of a `raw_lap_data_json` value. Returns
 * the aggregates + splits ONLY when the blob actually carries erg data; returns null
 * for anything else (null column, a zone-seconds-only blob, a shape we don't
 * recognise, an empty splits array). Never throws — safeParse absorbs every
 * malformed input, and a JSON string (or double-encoded value) is parsed first.
 */
export function parseErgDetail(raw: unknown): ErgDetail | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const parsed = ergDetailSchema.safeParse(value);
  if (!parsed.success) return null;
  const d = parsed.data;
  // An empty interval array is not "detail" — normalise it away so neither the
  // drawer table nor iOS ever renders an empty ErgData grid.
  const splits = d.erg_splits && d.erg_splits.length > 0 ? d.erg_splits : null;
  const hasAggregate =
    d.drag_factor != null ||
    d.avg_calories_per_hour != null ||
    d.peak_drive_force_lbs != null ||
    d.avg_drive_force_lbs != null;
  if (!splits && !hasAggregate) return null;
  return { ...d, erg_splits: splits };
}
