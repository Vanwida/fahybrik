import 'server-only';

// EL CAMINO DE LECTURA. Ya se escribe la traza (0156 + el motor en vivo) y ya
// se derivan los kilómetros (`km-splits.ts`) — hasta esta pieza, nadie podía
// leerlo: ni la app del atleta ni el panel del coach tenían de dónde pintar
// la curva ni la tabla de kilómetros.
//
// LA REGLA QUE DECIDE ESTE MÓDULO, Y NO ES NEGOCIABLE: lo derivado se calcula
// SIEMPRE sobre la traza completa; lo que se transmite para dibujar va
// reducido. Cortar primero y derivar después daría splits equivocados —
// exactamente el bug que este orden evita: `splits` sale de `computeKmSplits`
// sobre las señales ENTERAS, cargadas por `execution-traces.ts`; SOLO
// DESPUÉS, `display_curve` reduce ritmo y pulso a un presupuesto de puntos
// que existe únicamente para dibujar.
//
// QUE SEA IMPOSIBLE CONFUNDIRLAS. `display_curve` lleva el prefijo en el
// nombre a propósito, y su doc dice explícitamente que no es una fuente de
// cálculo — no "curve", que cualquiera podría leer como intercambiable con
// `splits`.
//
// HONESTIDAD. Una ejecución sin ninguna traza guardada (todo lo grabado antes
// de esta tanda) responde `available: false` con arrays vacíos — nunca un
// 404, nunca un error: es una sesión sin archivo, no una sesión que falló al
// cargar. Ningún hueco de la traza se rellena en ningún paso de este camino.
//
// LA RUTA (#71) es la misma honestidad aplicada al mapa. `route.available`
// depende SOLO de si hay una polilínea decodificable — es independiente de
// `hasAnyTrace`: una ruta puede existir sin punto-traza (se sirve sin
// colorear) y un punto-traza puede existir sin ruta (cinta, sin GPS). Dentro
// de una ruta disponible, `pace_zones: null` es la SEGUNDA honestidad —el
// atleta no tiene zonas medidas, así que ni se inventa color— y cada punto
// puede caer a `zone_code: null` por su cuenta si esa fracción del recorrido
// no tiene cobertura de velocidad. Ver `route-zones.ts` para el algoritmo.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadExecutionTraces } from '@/lib/execution/execution-traces';
import { decodePolyline } from '@/lib/sync/polyline';
import { computeKmSplits, type KmSplit } from '@fahybrid/shared/domain/running/km-splits';
import { downsampleSeries } from '@fahybrid/shared/domain/running/downsample';
import { speedSeriesToPace } from '@fahybrid/shared/domain/running/pace';
import { buildRouteZonePoints, type RouteZonePoint } from '@fahybrid/shared/domain/running/route-zones';
import type { ResolvedZone } from '@fahybrid/shared/domain/methodology';

/**
 * Presupuesto de puntos de `display_curve`. 600 cubre con margen una pantalla
 * de móvil (~390 px de ancho en el doble de diseño — más de un punto por
 * píxel ya no aporta nada al ojo) y sigue siendo una curva legible en el
 * panel del coach, más ancho. `splits` NUNCA usa este número — ver el
 * comentario de cabecera.
 */
export const DISPLAY_CURVE_MAX_POINTS = 600;

export interface DisplaySeries {
  readonly offsets_s: readonly number[];
  readonly values: readonly number[];
}

/**
 * El recorrido, coloreado por zona de ritmo — o la honestidad de que no lo
 * está. Ver la cabecera del módulo y `route-zones.ts` para las dos capas de
 * "sin dato, null" que distingue: sin ruta en absoluto (`available: false`)
 * y ruta sin zonas del atleta (`pace_zones: null`, puntos igual presentes).
 */
export interface AssignmentDetailRoute {
  /** false = no hay polilínea decodificable (cinta, sesión sin GPS, o de
   *  antes de #64) — la tarjeta del mapa no se pinta, no un mapa vacío. */
  available: boolean;
  /** Los puntos del recorrido en orden, cada uno con su zona (o null si esa
   *  fracción no tiene cobertura). Vacío cuando `available` es false. */
  points: RouteZonePoint[];
  /** Las bandas de ritmo resueltas del atleta para correr — la MISMA tabla
   *  que `zone_code` referencia, para que quien pinte resuelva color/label
   *  sin volver a preguntar nada. Null cuando el atleta no tiene zonas
   *  medidas: un mapa sin color es honesto, uno con color inventado no. */
  pace_zones: ResolvedZone[] | null;
}

const EMPTY_ROUTE: AssignmentDetailRoute = { available: false, points: [], pace_zones: null };

export interface AssignmentDetailTrace {
  /** false = sesión sin traza guardada — nada en `workout_traces` todavía
   *  (sesión de antes de esta tanda, o sin GPS/reloj emitiendo). Respuesta
   *  honesta, no un error: el resto de campos quedan vacíos, no ausentes. */
  available: boolean;
  /** Corte por kilómetro con FIDELIDAD COMPLETA — calculado sobre la traza
   *  entera, antes de reducir nada. Esta es LA fuente para cualquier cálculo;
   *  `display_curve` no lo es. */
  splits: KmSplit[];
  /** Ritmo y pulso reducidos a `DISPLAY_CURVE_MAX_POINTS` SOLO PARA DIBUJAR.
   *  NUNCA derives un split, una media, o cualquier cifra de aquí — vuelve a
   *  pedir la traza completa o usa `splits`. Reducción por mín/máx (conserva
   *  picos y valles, ver `downsampleSeries`), nunca decimación ingenua. */
  display_curve: {
    pace: DisplaySeries | null;
    hr: DisplaySeries | null;
  };
  /** El mapa. Disponibilidad PROPIA, independiente de `available` de arriba
   *  — ver la cabecera del módulo. */
  route: AssignmentDetailRoute;
}

export const EMPTY_TRACE: AssignmentDetailTrace = {
  available: false,
  splits: [],
  display_curve: { pace: null, hr: null },
  route: EMPTY_ROUTE,
};

/**
 * El detalle de traza de una ejecución, listo para pintar en el atleta o en
 * el coach — las dos superficies leen de aquí a través de
 * `loadAssignmentDetail`. `started_at: null` (ejecución sin fecha de inicio,
 * o directamente sin ejecución) da `EMPTY_TRACE` sin tocar la base.
 *
 * `route_polyline`/`pace_zones` son OPCIONALES a propósito: quien no tiene
 * de dónde sacarlos (o no los necesita) simplemente no los pasa, y `route`
 * sale `EMPTY_ROUTE` sin más — nunca un error por faltar lo que el llamador
 * no tenía. `pace_zones` llega YA RESUELTO (las bandas de `athlete_zone_
 * profiles` del modality run) — este módulo nunca resuelve zonas, solo las
 * usa, mismo principio que la banda de cumplimiento.
 */
export async function loadSessionTrace(args: {
  execution_id: number;
  started_at: Date | null;
  route_polyline?: string | null;
  pace_zones?: readonly ResolvedZone[] | null;
  client?: Sql;
}): Promise<AssignmentDetailTrace> {
  try {
    return await loadSessionTraceInner(args);
  } catch {
    // El contrato de este módulo es "nunca un error": una traza que no se
    // puede derivar es una sesión sin archivo, no un 500 del detalle.
    return EMPTY_TRACE;
  }
}

/**
 * ¿Hay alguna fila en `workout_traces` para esta ejecución? El cajón Entreno
 * solo necesita este bit para pintar «Ver la carrera»; no carga la curva.
 */
export async function loadTraceAvailability(args: {
  execution_id: number;
  client?: Sql;
}): Promise<boolean> {
  const client = args.client ?? defaultSql;
  const rows = await client<Array<{ ok: boolean }>>`
    select exists(
      select 1 from workout_traces where execution_id = ${args.execution_id}
    ) as ok
  `;
  return rows[0]?.ok === true;
}

async function loadSessionTraceInner(args: {
  execution_id: number;
  started_at: Date | null;
  route_polyline?: string | null;
  pace_zones?: readonly ResolvedZone[] | null;
  client?: Sql;
}): Promise<AssignmentDetailTrace> {
  if (!args.started_at) return EMPTY_TRACE;
  const client = args.client ?? defaultSql;

  const traces = await loadExecutionTraces({
    execution_id: args.execution_id,
    started_at: args.started_at,
    client,
  });

  // La ruta se resuelve SIEMPRE que haya polilínea, tenga o no la ejecución
  // punto-traza (`hasAnyTrace`) — son dos preguntas distintas (ver cabecera).
  const route = buildRoute(args.route_polyline ?? null, args.pace_zones ?? null, traces.distance, traces.speed);

  if (!traces.hasAnyTrace) return { ...EMPTY_TRACE, route };

  // Fidelidad completa primero: los kilómetros salen de la señal entera.
  const splits = computeKmSplits({
    distance: traces.distance,
    speed: traces.speed.offsets_s.length > 0 ? traces.speed : null,
    hr: traces.hr.offsets_s.length > 0 ? traces.hr : null,
    altitude: traces.altitude.offsets_s.length > 0 ? traces.altitude : null,
  });

  // Solo AHORA, y solo para dibujar, se reduce.
  const pace = speedSeriesToPace(traces.speed);
  const display_curve = {
    pace: pace.offsets_s.length > 0 ? downsampleSeries(pace, DISPLAY_CURVE_MAX_POINTS) : null,
    hr: traces.hr.offsets_s.length > 0 ? downsampleSeries(traces.hr, DISPLAY_CURVE_MAX_POINTS) : null,
  };

  return { available: true, splits, display_curve, route };
}

/** Decodifica (si hay algo que decodificar) y clasifica por zona — ver
 *  `route-zones.ts` para el algoritmo. Menos de 2 puntos decodificados
 *  (polilínea ausente, vacía o corrupta) es `available: false`, igual que
 *  "no hay ruta": una ruta de un punto no dibuja nada. */
function buildRoute(
  route_polyline: string | null,
  pace_zones: readonly ResolvedZone[] | null,
  distance: { offsets_s: readonly number[]; values: readonly number[] },
  speed: { offsets_s: readonly number[]; values: readonly number[] },
): AssignmentDetailRoute {
  if (!route_polyline) return EMPTY_ROUTE;
  const decoded = decodePolyline(route_polyline);
  if (decoded.length < 2) return EMPTY_ROUTE;

  const points = buildRouteZonePoints({ points: decoded, distance, speed, pace_zones });
  const hasZones = pace_zones != null && pace_zones.length > 0;
  return { available: true, points, pace_zones: hasZones ? [...pace_zones] : null };
}
