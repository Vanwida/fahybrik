// Time in heart-rate zones per segment, stored under the `zone_seconds` key of
// `segment_executions.raw_lap_data_json` (the same jsonb blob that carries the
// erg detail — see `erg-splits.ts`, its sibling reader).
//
// iOS computes it from the segment's HR samples and posts it as
// `segments[].zone_seconds_json`; the ingest writes it through verbatim. Until
// now nothing read it back, so the athlete could never see where the effort
// actually sat. This module is the single reader.
//
// Never throws: a null column, a blob with no zones, a double-encoded string or
// a shape we don't recognise all yield null — "no zone data", never a guess.

import { z } from 'zod';

export const ZONE_KEYS = ['z1', 'z2', 'z3', 'z4', 'z5'] as const;
export type ZoneKey = (typeof ZONE_KEYS)[number];

/** Seconds spent in each zone. Always all five keys — see `parseZoneSeconds`. */
export type ZoneSeconds = Record<ZoneKey, number>;

// Every zone optional on the way in: the engine emits only the zones the athlete
// actually visited. Unknown keys are stripped, so a blob holding the erg detail
// alongside parses to no zones rather than failing.
const seconds = z.number().finite().nonnegative().nullish();
const zoneSecondsSchema = z.object({
  z1: seconds,
  z2: seconds,
  z3: seconds,
  z4: seconds,
  z5: seconds,
});

/**
 * Read the per-zone seconds out of a `raw_lap_data_json` value. Returns all five
 * zones or null.
 *
 * An absent zone becomes 0, which is the TRUTH and not a fabrication: the engine
 * partitions the whole segment across the five bands, so a missing band is one
 * the athlete spent no time in. Filling it keeps the payload a fixed shape iOS
 * can decode as a struct. A blob carrying NO zone at all is a different thing —
 * nothing was measured — and yields null.
 */
export function parseZoneSeconds(raw: unknown): ZoneSeconds | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null) return null;

  const parsed = zoneSecondsSchema.safeParse((value as Record<string, unknown>).zone_seconds);
  if (!parsed.success) return null;

  const measured = ZONE_KEYS.some((k) => parsed.data[k] != null);
  if (!measured) return null;

  return Object.fromEntries(ZONE_KEYS.map((k) => [k, parsed.data[k] ?? 0])) as ZoneSeconds;
}
