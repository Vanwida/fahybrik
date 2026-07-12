// Route polyline helpers (#64). The outdoor run's GPS trace is shipped + stored as a
// Google ENCODED POLYLINE (precision 5). We store it verbatim; the only thing we
// derive server-side is the point count.

/**
 * Count the coordinate pairs in an encoded polyline WITHOUT a full float decode — the
 * metadata persisted as `workout_routes.point_count`. Each signed value ends on a
 * unit whose continuation bit (0x20) is clear; a point is a lat+lon pair, so the
 * count is the number of value terminators halved. Byte-for-byte the same rule as the
 * iOS `PolylineCodec.pointCount`, so both sides agree.
 */
export function polylinePointCount(encoded: string): number {
  let terminators = 0;
  for (let i = 0; i < encoded.length; i++) {
    const byte = encoded.charCodeAt(i) - 63;
    if ((byte & 0x20) === 0) terminators++;
  }
  return Math.floor(terminators / 2);
}
