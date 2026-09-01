// Route polyline helpers (#64). The outdoor run's GPS trace is shipped + stored as a
// Google ENCODED POLYLINE (precision 5). We store it verbatim; server-side we derive
// the point count (below) and, since #71 (route zone-coloring), the full decode.
//
// THE DECODE USES `@mapbox/polyline` (team-lead, 12-ago: "un decodificador de un
// formato fijo y público no es código nuestro"). A hand-written port existed here
// first; verified byte-for-byte equivalent to it against the canonical Google vector
// and a real round-trip, then replaced — the package is the de-facto standard for
// this exact format, BSD-3-Clause licensed (verified against the actual LICENSE file:
// npm's registry lists it as "Proprietary" only because package.json omits an SPDX
// field, not because it is one), and its zig-zag math is the same algorithm, done
// with plain arithmetic instead of 32-bit bitwise ops — no ceiling on delta magnitude
// that a hand-rolled `<<`/`>>` version would have.
//
// ONE REAL BEHAVIOUR GAP, GUARDED BELOW: the package does not drop a truncated
// trailing value (a corrupt tail from an interrupted sync) — it reconstructs a FINAL
// point from the partial bytes instead of omitting it (verified empirically: decoding
// the canonical vector minus its last character still returns 3 points, the 3rd
// carrying a wrong longitude, not 2 clean ones). `polylinePointCount` already knows
// how many points are genuinely complete without decoding anything, so `decodePolyline`
// slices the package's output to that count — the corrupt point never ships, and iOS's
// own tolerance ("drop it, don't invent it") is preserved without re-deriving the codec.

import { decode as decodePolylineRaw, encode as encodePolylineRaw } from '@mapbox/polyline';
import type { LatLon } from '@fahybrid/shared/domain/running/route-zones';

/**
 * Count the coordinate pairs in an encoded polyline WITHOUT a full float decode — the
 * metadata persisted as `workout_routes.point_count`, AND the guard `decodePolyline`
 * uses to drop a corrupt trailing point (see header). Each signed value ends on a
 * unit whose continuation bit (0x20) is clear; a point is a lat+lon pair, so the
 * count is the number of value terminators halved. Byte-for-byte the same rule as the
 * iOS `PolylineCodec.pointCount`, so both sides agree. No off-the-shelf package covers
 * this specific operation (count without decoding) — it stays hand-written.
 */
export function polylinePointCount(encoded: string): number {
  let terminators = 0;
  for (let i = 0; i < encoded.length; i++) {
    const byte = encoded.charCodeAt(i) - 63;
    if ((byte & 0x20) === 0) terminators++;
  }
  return Math.floor(terminators / 2);
}

/**
 * Decode a Google Encoded Polyline (precision 5) string to ordered lat/lon points.
 * A truncated trailing value (a corrupt tail) is dropped rather than kept as a
 * fabricated coordinate — see the header note on why that needs a guard here.
 */
export function decodePolyline(encoded: string): LatLon[] {
  const decoded = decodePolylineRaw(encoded); // [lat, lng][], precision 5 default
  const completePoints = polylinePointCount(encoded);
  return decoded.slice(0, completePoints).map(([lat, lon]) => ({ lat, lon }));
}

/**
 * Encode ordered lat/lon points to a Google Encoded Polyline (precision 5) —
 * the counterpart to `decodePolyline`. iOS never needs this (its own
 * `PolylineCodec` encodes on-device before the route reaches the API), but the
 * FIT importer (#import-fit) parses a route from FILE BYTES on the SERVER, so
 * the server has to be the one turning coordinates into the stored string.
 * Same package, same precision-5 default as the decode above — no reason to
 * hand-roll a second implementation of the same public format.
 */
export function encodePolyline(points: readonly LatLon[]): string {
  return encodePolylineRaw(points.map((p) => [p.lat, p.lon]));
}
