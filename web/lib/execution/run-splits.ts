// El equivalente de `erg-splits.ts` para una carrera estructurada (#66, docs/
// DECISIONS.md 2026-08-11 "La carrera guarda su NEGATIVO" — el cierre de la
// asimetría que esa entrada deja escrita).
//
// LA DIFERENCIA CON EL ERG, Y POR QUÉ LA FORMA SIGUE SIENDO LA MISMA. El PM5
// mide una sola pieza física y trocea sus intervalos DENTRO de esa pieza, así
// que un erg vive en UNA fila de `segment_executions` con sus splits anidados
// en `raw_lap_data_json.erg_splits` (ver erg-splits.ts). Una carrera de series
// es al revés: el motor en vivo graba CADA tramo (trabajo y recuperación) como
// su PROPIA fila, con `leg_index`/`leg_role`/`leg_phase` (mig 0146) — no hay una
// fila "padre" con las demás anidadas dentro. Por eso no hay nada que validar
// en la entrada (cada tramo ya se valida como su propio `segmentInputSchema` en
// ingest-execution-segments.ts): este módulo es puramente de LECTURA — agrupa
// las filas que ya llegaron.
//
// EL PATRÓN QUE SE MANTIENE. Para que ambas modalidades se lean igual en el
// wire (un array de sub-tramos colgado de UNA fila de `SegmentActual`), este
// módulo elige, de cada grupo de tramos que comparte `item_uid`, la fila cuyo
// `leg_index === 0` como PORTADORA: solo ELLA lleva el array completo
// (`run_splits`), en orden de `leg_index`. Las demás filas del grupo NO se
// tocan — siguen siendo su propio `SegmentActual`, con sus propios campos
// (duration_seconds, distance_meters…) intactos, tal y como ya los pinta el
// coach hoy («no se filtra», segment-work.ts). `run_splits` es puramente
// ADITIVO: un consumidor que lo ignore ve exactamente lo que veía antes.
//
// Una fuente (las filas de segment_executions), N proyecciones: la fila
// portadora no duplica el array en cada tramo del grupo, así que no hay dos
// copias que puedan divergir.

import {
  SEGMENT_LEG_PHASES,
  SEGMENT_LEG_ROLES,
  type SegmentLegPhase,
  type SegmentLegRole,
} from './segment-work';

/** Un tramo (bout) ejecutado de una carrera estructurada — el análogo de
 *  `ErgSplitItem` para correr. `leg_index`/`leg_role`/`leg_phase` son SIEMPRE
 *  no-null aquí: la regla todo-o-nada de la 0146 es lo que decide si una fila
 *  entra en un grupo en primer lugar. */
export interface RunLegSplitItem {
  leg_index: number;
  leg_role: SegmentLegRole;
  leg_phase: SegmentLegPhase;
  duration_seconds: number | null;
  distance_meters: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  incline_pct: number | null;
  run_cadence_spm: number | null;
  calories: number | null;
}

/** Lo mínimo que hace falta de una fila `SegmentActual`-like para agruparla.
 *  Estructural (no importa `SegmentActual` en sí) para no crear un ciclo con
 *  session-actuals.ts, que es quien llama a este módulo. */
export interface RunLegRow {
  position: number;
  item_uid: string | null;
  leg_index: number | null;
  leg_role: SegmentLegRole | null;
  leg_phase: SegmentLegPhase | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  avg_pace_s_per_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  incline_pct: number | null;
  run_cadence_spm: number | null;
  calories: number | null;
}

const LEG_ROLE_SET = new Set<string>(SEGMENT_LEG_ROLES);
const LEG_PHASE_SET = new Set<string>(SEGMENT_LEG_PHASES);

/** ¿Es esta fila un bout de carrera estructurada casable con su prescripción?
 *  Hace falta la atribución de tramo COMPLETA (mig 0146: todo o nada) Y un
 *  `item_uid` — sin él no hay con qué agrupar los tramos hermanos. */
function isGroupableLeg(
  row: RunLegRow,
): row is RunLegRow & { item_uid: string; leg_index: number; leg_role: SegmentLegRole; leg_phase: SegmentLegPhase } {
  return (
    row.item_uid != null &&
    row.leg_index != null &&
    row.leg_role != null &&
    LEG_ROLE_SET.has(row.leg_role) &&
    row.leg_phase != null &&
    LEG_PHASE_SET.has(row.leg_phase)
  );
}

/**
 * Agrupa las filas de una ejecución por `item_uid` y devuelve, para cada grupo,
 * la tabla completa de tramos (ordenada por `leg_index`) KEYED POR LA POSITION
 * de la fila con `leg_index === 0` — la portadora. Un grupo sin fila
 * `leg_index === 0` (dato incompleto/reenviado a medias) se descarta entero en
 * vez de adivinar cuál sería la portadora.
 *
 * Pura: no toca la base — `buildSegmentActuals` ya tiene todas las columnas que
 * hacen falta en la fila mapeada, así que esto es una segunda pasada en
 * memoria, no una consulta más.
 */
export function groupRunSplits(rows: RunLegRow[]): Map<number, RunLegSplitItem[]> {
  const groups = new Map<string, Array<RunLegRow & { item_uid: string; leg_index: number; leg_role: SegmentLegRole; leg_phase: SegmentLegPhase }>>();
  for (const row of rows) {
    if (!isGroupableLeg(row)) continue;
    const list = groups.get(row.item_uid) ?? [];
    list.push(row);
    groups.set(row.item_uid, list);
  }

  const out = new Map<number, RunLegSplitItem[]>();
  for (const legs of groups.values()) {
    const sorted = [...legs].sort((a, b) => a.leg_index - b.leg_index);
    const carrier = sorted.find((l) => l.leg_index === 0);
    if (!carrier) continue;
    out.set(
      carrier.position,
      sorted.map((l) => ({
        leg_index: l.leg_index,
        leg_role: l.leg_role,
        leg_phase: l.leg_phase,
        duration_seconds: l.duration_seconds,
        distance_meters: l.distance_meters,
        avg_pace_s_per_km: l.avg_pace_s_per_km,
        avg_hr: l.avg_hr,
        max_hr: l.max_hr,
        incline_pct: l.incline_pct,
        run_cadence_spm: l.run_cadence_spm,
        calories: l.calories,
      })),
    );
  }
  return out;
}
