/**
 * Unit tests for the route polyline helpers — point-counter (#64) and full
 * decode (#71, route zone-coloring). Locked to the Google standard (so it
 * agrees with the iOS PolylineCodec byte-for-byte) via the canonical
 * reference vector. Pure, no DB.
 */
import { describe, expect, it } from 'vitest';
import { decodePolyline, polylinePointCount } from '@/lib/sync/polyline';
import type { LatLon } from '@fahybrid/shared/domain/running/route-zones';
import { encodePolylineForTest } from '../utils/polyline-fixtures';

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

describe('decodePolyline (#71)', () => {
  it('decodes the canonical Google reference vector to its published coordinates', () => {
    // Mismo vector que polylinePointCount ya usa como referencia — las tres
    // coordenadas son las publicadas en la especificación de Google.
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ]);
  });

  it('decodes the reference vector first point alone', () => {
    expect(decodePolyline('_p~iF~ps|U')).toEqual([{ lat: 38.5, lon: -120.2 }]);
  });

  it('is [] for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('drops a truncated trailing value instead of throwing', () => {
    // El vector de referencia sin su último carácter: el segundo punto queda
    // a mitad de un valor. Mismo criterio que el `nextValue` de iOS — se
    // descarta la cola corrupta, no se lanza, y el resto se conserva.
    const truncated = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'.slice(0, -1);
    expect(() => decodePolyline(truncated)).not.toThrow();
    expect(decodePolyline(truncated)).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
    ]);
  });

  it('round-trips through the same encode iOS uses — negative + positive deltas, both hemispheres', () => {
    const original: LatLon[] = [
      { lat: 41.38879, lon: 2.15899 }, // Barcelona — Park Güell, ida real de #71
      { lat: 41.38912, lon: 2.15944 },
      { lat: 41.38795, lon: 2.16107 }, // salto grande, cruza a longitud creciente
      { lat: -33.86882, lon: 151.20929 }, // hemisferios opuestos, por si el zig-zag falla en negativo
      { lat: 41.38879, lon: 2.15899 }, // vuelve al origen — delta neto cero
    ];
    const encoded = encodePolylineForTest(original);
    const decoded = decodePolyline(encoded);
    expect(decoded).toHaveLength(original.length);
    decoded.forEach((p, i) => {
      // Redondeo a precisión 5 (1e-5 grado, ~1.1 m) — el mismo que pierde el
      // propio formato, no un error de decodificación.
      expect(p.lat).toBeCloseTo(original[i]!.lat, 5);
      expect(p.lon).toBeCloseTo(original[i]!.lon, 5);
    });
  });
});
