// Interval splits from a Concept2 PM5, parsed out of `segment_executions.raw_lap_data_json`.
//
// The erg (row/ski/bike) execution stores an aggregate on the segment row itself
// (avg /500m, avg power, spm, calories) AND — when the PM5 lap data is captured —
// a per-interval breakdown inside `raw_lap_data_json`. That same jsonb column is
// ALSO used for other payloads (`zone_seconds`, provider raw laps), so the read
// MUST be tolerant: we only surface a splits table when the blob actually carries
// a well-formed `splits` array, and stay silent (null) otherwise. Never throws.
//
// SHAPE IS PROVISIONAL: the iOS capture agent owns the definitive PM5 payload and
// will finalise the field names/units. This schema is the agreed placeholder
// ({t_s, dist_m, pace_s_per_500m, spm, rest_s?} per interval + optional
// drag_factor / cal_per_hour). When the real shape lands, adjust the schema here
// only — a mismatch safeParses to null, so a wrong guess degrades to "no table"
// rather than a crash or a fabricated row.

import { z } from 'zod';

// One PM5 interval. Unknown keys are stripped (Zod default) so extra provider
// fields never fail the parse. Physical quantities are finite and non-negative.
const ergSplitSchema = z.object({
  /** Interval elapsed work time, seconds. */
  t_s: z.number().finite().nonnegative(),
  /** Interval distance, metres. */
  dist_m: z.number().finite().nonnegative(),
  /** Average split over the interval, seconds per 500 m. */
  pace_s_per_500m: z.number().finite().nonnegative(),
  /** Average stroke rate (row/ski) or cadence (bike), strokes/min. */
  spm: z.number().finite().nonnegative(),
  /** Rest taken after the interval, seconds. Absent on continuous pieces. */
  rest_s: z.number().finite().nonnegative().optional(),
});

// The lap blob we care about. `splits` must be a non-empty array or the whole
// parse fails — that's what keeps a `{ zone_seconds: … }`-only blob from matching.
const ergSplitsSchema = z.object({
  splits: z.array(ergSplitSchema).min(1),
  /** PM5 drag factor for the piece (machine resistance), when reported. */
  drag_factor: z.number().finite().positive().optional(),
  /** Energy rate, kcal/hour, when reported. */
  cal_per_hour: z.number().finite().nonnegative().optional(),
});

export type ErgSplit = z.infer<typeof ergSplitSchema>;
export type ErgSplits = z.infer<typeof ergSplitsSchema>;

/**
 * Tolerant reader: pull the PM5 interval splits out of a `raw_lap_data_json`
 * value. Returns the typed splits ONLY when the blob carries a well-formed,
 * non-empty `splits` array; returns null for anything else (null column, a
 * zone-seconds-only blob, a provider lap shape, a future shape we don't
 * recognise). Never throws — safeParse absorbs every malformed input.
 */
export function parseErgSplits(raw: unknown): ErgSplits | null {
  if (raw == null) return null;
  // jsonb comes back parsed from the driver, but stay robust to a JSON string
  // (or a double-encoded value) — a bad string just parses to null, never throws.
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const parsed = ergSplitsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
