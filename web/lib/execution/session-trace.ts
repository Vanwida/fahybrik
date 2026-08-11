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

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadExecutionTraces } from '@/lib/execution/execution-traces';
import { computeKmSplits, type KmSplit } from '@fahybrid/shared/domain/running/km-splits';
import { downsampleSeries } from '@fahybrid/shared/domain/running/downsample';
import { speedSeriesToPace } from '@fahybrid/shared/domain/running/pace';

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
}

export const EMPTY_TRACE: AssignmentDetailTrace = {
  available: false,
  splits: [],
  display_curve: { pace: null, hr: null },
};

/**
 * El detalle de traza de una ejecución, listo para pintar en el atleta o en
 * el coach — las dos superficies leen de aquí a través de
 * `loadAssignmentDetail`. `started_at: null` (ejecución sin fecha de inicio,
 * o directamente sin ejecución) da `EMPTY_TRACE` sin tocar la base.
 */
export async function loadSessionTrace(args: {
  execution_id: number;
  started_at: Date | null;
  client?: Sql;
}): Promise<AssignmentDetailTrace> {
  if (!args.started_at) return EMPTY_TRACE;
  const client = args.client ?? defaultSql;

  const traces = await loadExecutionTraces({
    execution_id: args.execution_id,
    started_at: args.started_at,
    client,
  });
  if (!traces.hasAnyTrace) return EMPTY_TRACE;

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

  return { available: true, splits, display_curve };
}
