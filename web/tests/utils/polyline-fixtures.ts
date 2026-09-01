import { encode } from '@mapbox/polyline';
import type { LatLon } from '@fahybrid/shared/domain/running/route-zones';

/**
 * Construye polilíneas válidas para fixtures (round-trip de `decodePolyline`,
 * filas de `workout_routes` en tests de DB real) — envuelve `@mapbox/polyline`,
 * el mismo paquete que ya decodifica en `web/lib/sync/polyline.ts` (team-lead,
 * 12-ago: nada de un segundo codificador escrito a mano solo para tests, si el
 * paquete ya lo hace). El servidor de producción nunca codifica una ruta —
 * solo la recibe ya codificada del dispositivo — así que esto vive exclusiva
 * y explícitamente en tests, nunca en `web/lib/`.
 */
export function encodePolylineForTest(points: readonly LatLon[]): string {
  return encode(points.map((p): [number, number] => [p.lat, p.lon]));
}
