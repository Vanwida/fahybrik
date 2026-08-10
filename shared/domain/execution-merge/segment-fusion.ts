// @fahybrid/shared/domain/execution-merge — FUSIÓN DE TRAMOS.
//
// El hermano por TRAMO de `precedence.ts`. Aquel fusiona los totales de UNA
// ejecución entre varias fuentes; éste responde la pregunta de un peldaño más
// abajo: cuando un aparato manda sus VUELTAS de un entreno que la app ya midió
// tramo a tramo, ¿qué fila es cuál, y qué campo gana?
//
// EL FALLO QUE CIERRA. La ingesta de Garmin borraba los tramos de la ejecución
// (`delete from segment_executions where execution_id = …`) y reescribía las
// vueltas planas del reloj en su lugar. Se llevaba por delante, con la fila
// padre: los `zone_seconds` que congela el móvil dentro de `raw_lap_data_json`
// —el reparto de zonas de más calidad que existe, medido en vivo con la escalera
// del atleta—, las filas de `segment_zone_seconds` y las de `set_executions`
// (las dos cuelgan con `on delete cascade`), la atribución de tramo de una serie
// (`leg_index`/`leg_role`/`leg_phase`), el enlace a la prescripción y las
// rondas. Un reloj no sabe NADA de todo eso, y aun así lo borraba.
//
//
// ── LAS TRES DECISIONES DEL MODELO ───────────────────────────────────────────
//
// 1. LA IDENTIDAD NO SE DESTRUYE. No hay borrado. Las filas existentes conservan
//    su `id`, y con él todo lo que cuelga de ellas. Un aparato solo puede AÑADIR
//    lo que nadie sabía — la misma ley que ya gobierna `recorded_via` y todos los
//    `coalesce` de la ingesta de tramos.
//
// 2. QUIÉN MANDA EN EL TROCEADO. Las vueltas del reloj y los tramos de la app son
//    dos troceados DISTINTOS del mismo entreno: el reloj corta donde el atleta
//    apretó el botón (o cada kilómetro, en automático) y la app corta por tramo
//    prescrito. Casarlos fila a fila solo es honesto cuando una vuelta y un tramo
//    describen el MISMO trabajo.
//      · La ejecución no tiene ningún tramo medido por la app → el aparato manda
//        en el troceado: sus vueltas SON los tramos (es el caso del entreno que
//        nunca se registró en la app).
//      · La ejecución ya tiene tramos de la app → manda la app. Las vueltas del
//        aparato no crean filas ni mueven fronteras: solo rellenan huecos de los
//        tramos con los que casan.
//    Por qué no se insertan las vueltas sueltas en ese segundo caso: no hay forma
//    de distinguir «trabajo que la app no registró» de «el mismo trabajo cortado
//    de otra manera», y la segunda lectura duplicaría el volumen de la semana.
//    Honesto-o-nada: si no se puede saber, no se inventa una fila.
//
// 3. SE CASA POR TIEMPO, NO POR ORDINAL. La vuelta 0 del reloj no es el tramo 0
//    de la app salvo por casualidad — casar por posición es justamente lo que
//    hacía el código viejo cuando reescribía por orden. Aquí una vuelta casa con
//    un tramo cuando sus ventanas se solapan al menos `MIN_OVERLAP_FRACTION` de
//    la MÁS CORTA de las dos, uno a uno y por mejor solape primero (determinista).
//    Una ventana de duración cero no casa con nada: medido en producción
//    (`0168_segment_zone_seconds`, tramo 574 con `ended_at = started_at`), y la
//    respuesta honesta ahí es «no se sabe», no un emparejamiento a ojo.
//
//
// ── LA PRECEDENCIA POR CAMPO, Y CON QUÉ CRITERIO ─────────────────────────────
//
// `channel.ts` ordena CANALES por fidelidad para las clases `totals`/`segments`/
// `score`/`rpe`, y deja `device_stream` fuera de `segments` con un motivo escrito:
// un esqueleto de Apple Health no trae métricas por vuelta. Una vuelta de webhook
// de Garmin SÍ las trae (distancia, FC, potencia, cadencia), así que ese motivo no
// le aplica y el canal necesita clasificación propia aquí. El criterio que la
// decide es el mismo de siempre —quién puede responder la pregunta que el campo
// hace— y parte los campos del tramo en tres clases:
//
//   ESTRUCTURA — qué ES esta fila dentro del plan. El aparato NO PUEDE aportarlo:
//     no sabe que había una prescripción. Rango −1, como un canal ausente de una
//     clase en `CHANNEL_FIDELITY`; no es que pierda, es que no juega.
//
//   VENTANA — `started_at`/`ended_at`. El aparato tampoco escribe: mover la
//     ventana es re-trocear la fila, y eso lo prohíbe la decisión 2.
//
//   MEDIDA — la física del trabajo. Aquí el aparato SÍ juega, y solo rellena
//     huecos. Por qué no gana nunca sobre un valor existente, aunque su sensor sea
//     mejor: el número del aparato describe LA VENTANA DEL APARATO. Incluso en una
//     vuelta que casa, las fronteras solo se parecen. Una FC media sobre una
//     ventana casi igual no es una FC media mejor de NUESTRA ventana — es la
//     respuesta a otra pregunta. Donde no había dato, en cambio, el número del
//     aparato es estrictamente más que nada, y ahí está toda la fusión.
//
// `hr_source` (mig 0153) se queda en ESTRUCTURA por lo mismo: su vocabulario
// —`strap` | `healthkit` | `pm5`— enumera los latidos que el MOTOR EN VIVO sabe
// enganchar, y una vuelta de webhook no tiene valor honesto ahí. Cuando el
// aparato rellena la FC de un tramo, la columna se queda en NULL, que es el
// estado en el que ya está hoy toda fila de aparato del sistema (Polar y las
// propias vueltas de Garmin escriben `avg_hr` y nunca `hr_source`). Si algún día
// interesa nombrar ese cuarto aparato, es una migración que amplía el CHECK, no
// una etiqueta inventada aquí.
//
// Módulo PURO: no lee datos, no toca la base, no depende del framework. La
// escritura vive en `web/lib/sync/fuse-device-laps.ts`.

/** Fracción de la ventana MÁS CORTA que dos intervalos deben compartir para ser
 *  el mismo trabajo. Medio intervalo es el punto donde «se solapan un poco» pasa
 *  a ser «son lo mismo»: por debajo, dos tramos consecutivos con un reloj
 *  desfasado ya casarían entre sí. */
export const MIN_OVERLAP_FRACTION = 0.5;

/** Los campos MEDIDA: la física del trabajo, lo único que un aparato aporta. */
export const SEGMENT_MEASURED_FIELDS = [
  'distance_meters',
  'calories',
  'avg_hr',
  'max_hr',
  'avg_pace_s_per_km',
  'avg_pace_s_per_500m',
  'avg_power_w',
  'stroke_rate_spm',
  'run_cadence_spm',
  'modality',
] as const;
export type SegmentMeasuredField = (typeof SEGMENT_MEASURED_FIELDS)[number];

/**
 * Los campos ESTRUCTURA + VENTANA, listados para que la clasificación sea
 * legible y auditable de un vistazo (nadie los escribe desde un aparato; están
 * aquí como documentación ejecutable, y un test los contrasta con la tabla).
 */
export const SEGMENT_STRUCTURAL_FIELDS = [
  // ventana
  'started_at',
  'ended_at',
  // identidad dentro del plan
  'template_segment_id',
  'position',
  'round_index',
  'leg_index',
  'leg_role',
  'leg_phase',
  // trabajo declarado por el atleta
  'reps_completed',
  'reps_prescribed',
  'reps_status',
  'reps_confirmed',
  'weight_used_kg',
  'is_structural',
  'rx_scaled',
  'scaled_note',
  'emom_rounds_completed',
  'emom_rounds_prescribed',
  // contexto derivado en servidor
  'context_format',
  'context_source',
  'exercise_id',
  'prescription_snapshot',
  'prior_work_s',
  // procedencia
  'source',
  'hr_source',
] as const;
export type SegmentStructuralField = (typeof SEGMENT_STRUCTURAL_FIELDS)[number];

/** Un tramo ya guardado, reducido a lo que la fusión necesita mirar. */
export interface StoredSegment {
  id: number;
  /** Procedencia de la fila. NULL = tramo antiguo de la app (antes de mig 0045). */
  source: string | null;
  started_at: string | null;
  ended_at: string | null;
  /** Valor actual de cada campo MEDIDA; `null` = hueco que un aparato puede llenar. */
  measured: Partial<Record<SegmentMeasuredField, number | string | null>>;
}

/** Una vuelta que trae el aparato, ya normalizada a nuestro vocabulario. */
export interface DeviceLap {
  /** Índice en el orden en que la mandó el aparato — la posición si acaba en fila. */
  index: number;
  started_at: string;
  ended_at: string;
  measured: Partial<Record<SegmentMeasuredField, number | string | null>>;
}

/** Una vuelta casada con un tramo, y lo que aporta que el tramo no tenía. */
export interface LapMerge {
  segmentId: number;
  lapIndex: number;
  /** Solo los campos MEDIDA que el tramo tenía vacíos y la vuelta trae. */
  patch: Partial<Record<SegmentMeasuredField, number | string>>;
}

export interface SegmentFusionPlan {
  /** El aparato manda en el troceado: sus vueltas SON los tramos. */
  deviceOwnsSlicing: boolean;
  /** Vueltas que casan con un tramo existente → rellenan sus huecos. */
  merges: LapMerge[];
  /** Vueltas que se escriben como filas propias (solo si `deviceOwnsSlicing`). */
  newLapIndexes: number[];
  /**
   * Vueltas descartadas: solapan trabajo que la app ya tiene pero no lo bastante
   * para ser la misma unidad. Insertarlas duplicaría el volumen; se cuentan para
   * que el descarte sea visible y no silencioso.
   */
  droppedLapIndexes: number[];
}

/** Segundos de solape entre dos intervalos; 0 si no se tocan o si alguno es
 *  degenerado (duración ≤ 0, que no puede solapar nada). */
export function overlapSeconds(
  a: { started_at: string | null; ended_at: string | null },
  b: { started_at: string; ended_at: string },
): number {
  const aStart = toMs(a.started_at);
  const aEnd = toMs(a.ended_at);
  const bStart = toMs(b.started_at);
  const bEnd = toMs(b.ended_at);
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return 0;
  if (aEnd <= aStart || bEnd <= bStart) return 0;
  const lo = Math.max(aStart, bStart);
  const hi = Math.min(aEnd, bEnd);
  return hi > lo ? (hi - lo) / 1000 : 0;
}

/** Fracción de la ventana más corta que las dos comparten. */
function overlapFraction(
  seg: { started_at: string | null; ended_at: string | null },
  lap: { started_at: string; ended_at: string },
): number {
  const shared = overlapSeconds(seg, lap);
  if (shared <= 0) return 0;
  const segSpan = (toMs(seg.ended_at)! - toMs(seg.started_at)!) / 1000;
  const lapSpan = (toMs(lap.ended_at)! - toMs(lap.started_at)!) / 1000;
  const shortest = Math.min(segSpan, lapSpan);
  return shortest > 0 ? shared / shortest : 0;
}

/**
 * Qué campos MEDIDA aporta una vuelta a un tramo: SOLO los que el tramo tiene
 * vacíos. Un valor existente no se toca nunca (ver la clase MEDIDA arriba).
 */
export function measuredGapPatch(
  segment: StoredSegment,
  lap: DeviceLap,
): Partial<Record<SegmentMeasuredField, number | string>> {
  const patch: Partial<Record<SegmentMeasuredField, number | string>> = {};
  for (const field of SEGMENT_MEASURED_FIELDS) {
    if (segment.measured[field] != null) continue;
    const incoming = lap.measured[field];
    if (incoming == null) continue;
    patch[field] = incoming;
  }
  return patch;
}

/**
 * El plan de fusión de una ejecución. `deviceSource` es la procedencia con la
 * que el aparato firma sus filas ('garmin', 'polar'…): los tramos con OTRA
 * procedencia son los que midió la app y los que le quitan el troceado.
 *
 * Determinista: los solapes se resuelven de mayor a menor y los empates por
 * (tramo, vuelta) crecientes, así que el mismo webhook produce el mismo plan.
 */
export function planSegmentFusion(args: {
  existing: readonly StoredSegment[];
  laps: readonly DeviceLap[];
  deviceSource: string;
  /**
   * La ejecución ES esta actividad del aparato (la archivó él y lleva su
   * referencia). Solo entonces puede mandar en el troceado: en una ejecución que
   * archivó otro —un registro a mano, una sesión que la app cerró y con la que el
   * entreno del reloj simplemente se solapa en el tiempo— sus vueltas pueden
   * rellenar huecos, pero crear filas ahí sería inventar tramos en la sesión de
   * otro.
   */
  deviceOwnsExecution: boolean;
  minOverlapFraction?: number;
}): SegmentFusionPlan {
  const { existing, laps, deviceSource, deviceOwnsExecution } = args;
  const minOverlap = args.minOverlapFraction ?? MIN_OVERLAP_FRACTION;

  const appMeasured = existing.filter((s) => s.source !== deviceSource);
  const deviceOwnsSlicing = deviceOwnsExecution && appMeasured.length === 0;

  // Con el troceado en manos del aparato no hay nada que casar: sus vueltas son
  // los tramos, en su propio orden.
  if (deviceOwnsSlicing) {
    return {
      deviceOwnsSlicing: true,
      merges: [],
      newLapIndexes: laps.map((l) => l.index),
      droppedLapIndexes: [],
    };
  }

  // Todos los pares con solape suficiente, de mayor a menor.
  const candidates: Array<{ segmentId: number; lapIndex: number; fraction: number }> = [];
  const touchesApp = new Set<number>();
  for (const seg of appMeasured) {
    for (const lap of laps) {
      const fraction = overlapFraction(seg, lap);
      if (fraction <= 0) continue;
      touchesApp.add(lap.index);
      if (fraction >= minOverlap) candidates.push({ segmentId: seg.id, lapIndex: lap.index, fraction });
    }
  }
  candidates.sort(
    (a, b) => b.fraction - a.fraction || a.segmentId - b.segmentId || a.lapIndex - b.lapIndex,
  );

  const segmentById = new Map(appMeasured.map((s) => [s.id, s]));
  const lapByIndex = new Map(laps.map((l) => [l.index, l]));
  const usedSegments = new Set<number>();
  const usedLaps = new Set<number>();
  const merges: LapMerge[] = [];
  for (const c of candidates) {
    if (usedSegments.has(c.segmentId) || usedLaps.has(c.lapIndex)) continue;
    usedSegments.add(c.segmentId);
    usedLaps.add(c.lapIndex);
    merges.push({
      segmentId: c.segmentId,
      lapIndex: c.lapIndex,
      patch: measuredGapPatch(segmentById.get(c.segmentId)!, lapByIndex.get(c.lapIndex)!),
    });
  }
  merges.sort((a, b) => a.lapIndex - b.lapIndex);

  return {
    deviceOwnsSlicing: false,
    merges,
    // Manda la app: ninguna vuelta crea fila, ni siquiera las que no tocan nada.
    // Una vuelta que no solapa nada dentro de una sesión que la app SÍ troceó es
    // un hueco de nuestro registro, no una unidad de trabajo aparte que podamos
    // sumar sin arriesgarnos a contar dos veces.
    newLapIndexes: [],
    droppedLapIndexes: laps
      .filter((l) => !usedLaps.has(l.index))
      .map((l) => l.index),
  };
}

function toMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}
