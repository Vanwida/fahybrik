/**
 * Unit tests for the route polyline point-counter (#64) — the server-derived
 * `workout_routes.point_count`. Locked to the Google standard (so it agrees with the
 * iOS PolylineCodec byte-for-byte) via the canonical reference vector. Pure, no DB.
 */
import { describe, expect, it } from 'vitest';
import { polylinePointCount } from '@/lib/sync/polyline';

describe('polylinePointCount (#64)', () => {
  it('counts the canonical Google reference vector (3 points)', () => {
    expect(polylinePointCount('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toBe(3);
  });

  it('counts the reference vector first point alone (1 point)', () => {
    // (38.5, -120.2) → "_p~iF~ps|U" per the Google polyline spec.
    expect(polylinePointCount('_p~iF~ps|U')).toBe(1);
  });

  it('is 0 for an empty string', () => {
    expect(polylinePointCount('')).toBe(0);
  });
});
