// EL MAPA DE LA RUTA, COLOREADO POR ZONA — la pieza que faltaba del mockup
// (carrera-en-el-panel.html §09): la ruta exterior no solo se dibuja, se
// pinta por el ritmo al que se corrió cada tramo. Declarada fuera de alcance
// dos veces antes de esta: primero por un campo que faltaba (ya resuelto),
// después por dos huecos reales — (a) no existía decodificador de polilínea
// en el repo, solo un contador de puntos; (b) las bandas de ritmo del
// atleta no viajaban en el payload. Los dos se resuelven en esta tanda.
//
// EL PUENTE tiempo↔posición. La polilínea no lleva marcas de tiempo — es
// solo lat/lon en orden. Lo que SÍ tiene tiempo es la traza de `distance`
// (metros acumulados por instante). Ambas señales — la distancia
// punto-a-punto de la polilínea y el total acumulado de la traza — miden LO
// MISMO por construcción: en iOS, `RunLocationProvider.didUpdateLocations`
// dispara `onCoordinate` (alimenta la polilínea) y `onDistanceDelta`
// (alimenta la traza) desde el MISMO fix de GPS, con la MISMA llamada
// `loc.distance(from: prev)` — no son dos aproximaciones independientes,
// son dos lecturas del mismo cálculo. Por eso "cuánto se ha andado desde el
// inicio, según la polilínea" y "cuánto dice la traza de distancia en ese
// instante" son la MISMA magnitud, y se puede usar una para localizar la
// otra en el tiempo.
//
// EL ALGORITMO, punto a punto de la polilínea ya decodificada:
//   1. Distancia acumulada HASTA este punto, sumando el tramo geodésico
//      (haversine — gran círculo, no una aproximación plana; misma FAMILIA
//      de cálculo que `loc.distance(from:)`, aunque Apple no publica la
//      fórmula ni el radio exactos de CoreLocation, así que no se afirma
//      coincidencia bit a bit — solo que ambas miden distancia esférica
//      real, no un plano) desde el punto anterior.
//   2. ¿En qué instante la traza de distancia alcanzó esa marca? — el primer
//      punto es la SEMILLA del recorrido (el fix inicial, antes de que se
//      acumule ningún delta — ver `OutdoorRunHUDModel`: `onCoordinate` se
//      dispara para el primer fix, `onDistanceDelta` no, porque no hay
//      punto anterior del que medir), así que su instante es 0 por
//      definición; el resto se localiza invirtiendo la traza acumulada
//      (`timeAtValue`, `timed-series.ts`).
//   3. ¿Qué velocidad había en ese instante? — `valueAtTime` sobre la traza
//      de velocidad.
//   4. Velocidad → ritmo (s/km) → zona, con las bandas YA RESUELTAS del
//      atleta (nunca recalculadas aquí — mismo principio que la banda de
//      cumplimiento: se resuelve una vez, se transporta resuelta).
//
// SIN COBERTURA, NULL POR PUNTO — nunca un color inventado. Un hueco de GPS,
// un tramo sin velocidad grabada, o directamente que el atleta no tenga
// zonas medidas: cualquiera de los tres dice `zone_code: null` para ese
// punto, nunca "asumo la zona anterior". Y cuando el atleta no tiene zonas
// en absoluto, `pace_zones` sale `null` (no `[]`) para que quien pinte sepa
// que ni siquiera hay leyenda que ofrecer — un mapa sin color es honesto,
// uno con color inventado no.
//
// LA DECODIFICACIÓN del string en sí (Google Encoded Polyline, precisión 5)
// NO vive aquí: es un formato de codificación fijo, sin variación posible
// por metodología de coach, así que es infraestructura — `web/lib/sync/
// polyline.ts`, junto a `polylinePointCount`, no dominio. Este módulo recibe
// los puntos YA decodificados.
//
// LA DISTANCIA GEODÉSICA TAMPOCO SE ESCRIBE A MANO (Alex/team-lead, 12-ago:
// "un decodificador de un formato fijo y público no es código nuestro" — y
// el mismo criterio alcanza a una fórmula cerrada si ya existe bien resuelta
// y mantenida). `haversine-distance` (MIT, sin dependencias, tipos propios
// con la MISMA forma `{lat, lon}` que `LatLon`) hace la cuenta con `atan2`
// en vez de `asin` — evita el mismo caso límite que aquí se defendía a mano
// con un `Math.min(1, …)` antes de tocar el paquete.

import haversineDistance from 'haversine-distance';
import { toSortedPoints, valueAtTime, timeAtValue, type TimedPoint } from './timed-series';
import type { ResolvedZone } from '../methodology/zone-model';

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

export interface RouteZonePoint {
  readonly lat: number;
  readonly lon: number;
  /** Código de la `ResolvedZone` en este punto (p.ej. "Z3"). Null cuando ESTE
   *  punto concreto no se pudo clasificar (sin cobertura de velocidad ahí, o
   *  el atleta no tiene zonas), aunque el resto de la ruta sí tenga color. */
  zone_code: string | null;
}

/** Distancia geodésica (gran círculo) entre dos puntos, en metros — no una
 *  aproximación plana que divergiría en rutas largas. Reexportado para que
 *  quien ya importaba esta función de aquí no tenga que saber que por debajo
 *  es `haversine-distance`. */
export function haversineDistanceM(a: LatLon, b: LatLon): number {
  return haversineDistance(a, b);
}

/** Distancia acumulada (metros) hasta cada punto de la ruta, `[0, ...]` —
 *  el primer punto es el origen, por definición a distancia 0. */
function cumulativeDistancesM(points: readonly LatLon[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1]! + haversineDistanceM(points[i - 1]!, points[i]!));
  }
  return out;
}

/**
 * La zona de ritmo para un ritmo dado (segundos/km), contra las bandas YA
 * RESUELTAS del atleta. Espejo exacto de `zoneForBpm` (`hr-zones.ts`), con
 * el eje invertido: en pulso más alto es más duro; en ritmo, MENOS segundos
 * es más duro. Se recorre de la más fácil a la más dura (`sort_order` asc) y
 * se devuelve la primera banda cuyo borde rápido el ritmo no supera; si el
 * ritmo es más rápido que la banda más dura, esa banda hace de tope — mismo
 * criterio de saturación que `zoneForBpm` devolviendo la zona 5 por defecto,
 * nunca null solo por ir más rápido de lo esperado.
 */
export function paceZoneForSecPerKm(pace_s_per_km: number, zones: readonly ResolvedZone[]): ResolvedZone | null {
  if (!Number.isFinite(pace_s_per_km) || pace_s_per_km <= 0) return null;
  if (zones.length === 0) return null;
  const sorted = [...zones].sort((a, b) => a.sort_order - b.sort_order);
  for (const zone of sorted) {
    if (pace_s_per_km >= zone.fast_s) return zone;
  }
  return sorted[sorted.length - 1]!;
}

function classifyPointAt(
  t: number,
  speedPoints: readonly TimedPoint[],
  zones: readonly ResolvedZone[] | null,
): string | null {
  if (!zones || zones.length === 0) return null;
  const speed_mps = valueAtTime(speedPoints, t);
  if (speed_mps == null || speed_mps <= 0) return null;
  const pace_s_per_km = 1000 / speed_mps;
  return paceZoneForSecPerKm(pace_s_per_km, zones)?.code ?? null;
}

/**
 * La ruta coloreada por zona, punto a punto — el orquestador de todo lo
 * descrito en la cabecera del módulo. Menos de 2 puntos no es una ruta
 * dibujable (sería un punto suelto, no una línea): devuelve `[]`.
 *
 * `pace_zones: null` (el atleta no tiene zonas medidas para correr) produce
 * la ruta con TODOS los puntos a `zone_code: null` — se sigue devolviendo la
 * forma de la ruta, solo que sin poder pintarla; nunca se descarta la ruta
 * entera por no tener con qué colorearla.
 */
export function buildRouteZonePoints(args: {
  points: readonly LatLon[];
  distance: { offsets_s: readonly number[]; values: readonly number[] };
  speed: { offsets_s: readonly number[]; values: readonly number[] };
  pace_zones: readonly ResolvedZone[] | null;
}): RouteZonePoint[] {
  const { points } = args;
  if (points.length < 2) return [];

  const cum = cumulativeDistancesM(points);
  const distancePoints = toSortedPoints(args.distance.offsets_s, args.distance.values);
  const speedPoints = toSortedPoints(args.speed.offsets_s, args.speed.values);

  return points.map((p, i) => {
    // El primer punto es la semilla del recorrido — instante 0 por
    // definición (ver la cabecera: `onDistanceDelta` no dispara para el fix
    // inicial, así que la traza de distancia no tiene una muestra "en el
    // punto 0" de la que interpolar hacia atrás).
    const t = i === 0 ? 0 : timeAtValue(distancePoints, cum[i]!);
    const zone_code = t == null ? null : classifyPointAt(t, speedPoints, args.pace_zones);
    return { lat: p.lat, lon: p.lon, zone_code };
  });
}
