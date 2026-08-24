// @fahybrid/shared/domain/coach/station-loads — kilos de competición del coach.
//
// HARD RULE Nº0: la FORMA de la carga (trineo, un implemento, dos farmers,
// damper) es mecanismo y vive en el catálogo de estaciones. El NÚMERO es
// método: otro entrenador competente pondría otros kilos, así que nace como
// dato editable, vacío por defecto. Vacío = «no lo sé». Nunca se inventa un
// peso ni se copia el de otra celda (otro género, otra división).
//
// Puro y sin base de datos, como el resto de `shared/domain`.

import {
  HYROX_FARMER_IMPLEMENTS,
  HYROX_STATIONS,
  hyroxStationLoadAxis,
  type HyroxLoadAxis,
  type HyroxStationLoad,
  type HyroxStationSlug,
} from '../hyrox/stations';
import type { RaceDivision, RaceGender } from '../../schema/races';

/** Techo de cordura, no un default de metodología: un trineo de competición
 *  no pesa media tonelada. Impide un typo de 99999, no elige kilos. */
export const COACH_STATION_LOAD_KG_MAX = 500;
export const COACH_STATION_DAMPER_MIN = 1;
export const COACH_STATION_DAMPER_MAX = 10;

export const COACH_STATION_LOAD_DIVISIONS = ['open', 'pro', 'elite'] as const;
export const COACH_STATION_LOAD_GENDERS = ['men', 'women', 'mixed'] as const;

export interface CoachStationLoadStation {
  slug: HyroxStationSlug;
  label: string;
  load_axis: HyroxLoadAxis;
  /** Solo farmers: cuántos implementos a la vez. Mecanismo, no editable. */
  implements: number | null;
}

export interface CoachStationLoadCell {
  station_slug: HyroxStationSlug;
  station_label: string;
  load_axis: HyroxLoadAxis;
  implements: number | null;
  division: RaceDivision;
  gender: RaceGender;
  kg: number | null;
  damper: number | null;
}

export interface CoachStationLoadStoredRow {
  station_slug: string;
  division: string;
  gender: string;
  kg: number | null;
  damper: number | null;
}

/** Estaciones CON eje de carga, en orden de carrera. El burpee no entra. */
export function coachStationLoadStations(): CoachStationLoadStation[] {
  const out: CoachStationLoadStation[] = [];
  for (const st of HYROX_STATIONS) {
    if (!st.load_axis) continue;
    out.push({
      slug: st.slug,
      label: st.label,
      load_axis: st.load_axis,
      implements: st.load_axis === 'per_implement' ? HYROX_FARMER_IMPLEMENTS : null,
    });
  }
  return out;
}

export const COACH_STATION_LOAD_CELL_COUNT =
  coachStationLoadStations().length *
  COACH_STATION_LOAD_DIVISIONS.length *
  COACH_STATION_LOAD_GENDERS.length;

export function coachStationLoadCellKey(
  slug: string,
  division: string,
  gender: string,
): string {
  return `${slug}|${division}|${gender}`;
}

/** Las 63 celdas, todas vacías. El default correcto. */
export function emptyCoachStationLoadGrid(): CoachStationLoadCell[] {
  const cells: CoachStationLoadCell[] = [];
  for (const st of coachStationLoadStations()) {
    for (const division of COACH_STATION_LOAD_DIVISIONS) {
      for (const gender of COACH_STATION_LOAD_GENDERS) {
        cells.push({
          station_slug: st.slug,
          station_label: st.label,
          load_axis: st.load_axis,
          implements: st.implements,
          division,
          gender,
          kg: null,
          damper: null,
        });
      }
    }
  }
  return cells;
}

/**
 * Reconstruye el tipo de carga del catálogo a partir del número que escribió
 * el coach. Kind e implements NUNCA salen de la fila: salen del eje.
 * Celda vacía o número inválido → null («no lo sé»).
 */
export function stationLoadFromCoachValue(
  slug: HyroxStationSlug,
  value: { kg?: number | null; damper?: number | null },
): HyroxStationLoad | null {
  const axis = hyroxStationLoadAxis(slug);
  if (!axis) return null;
  if (axis === 'damper') {
    const setting = value.damper;
    if (setting == null || !Number.isFinite(setting)) return null;
    if (setting < COACH_STATION_DAMPER_MIN || setting > COACH_STATION_DAMPER_MAX) return null;
    return { kind: 'damper', setting };
  }
  const kg = value.kg;
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return null;
  if (kg > COACH_STATION_LOAD_KG_MAX) return null;
  if (axis === 'per_implement') {
    return { kind: 'per_implement', kg, implements: HYROX_FARMER_IMPLEMENTS };
  }
  if (axis === 'sled') return { kind: 'sled', kg };
  return { kind: 'single', kg };
}

/** Exact match. Nunca cae a otro género ni otra división. */
export function lookupCoachStationLoad(
  rows: readonly CoachStationLoadStoredRow[],
  slug: HyroxStationSlug,
  division: RaceDivision,
  gender: RaceGender,
): HyroxStationLoad | null {
  const hit = rows.find(
    (r) => r.station_slug === slug && r.division === division && r.gender === gender,
  );
  if (!hit) return null;
  return stationLoadFromCoachValue(slug, hit);
}

export function mergeCoachStationLoadGrid(
  stored: readonly CoachStationLoadStoredRow[],
): CoachStationLoadCell[] {
  const byKey = new Map<string, CoachStationLoadStoredRow>();
  for (const row of stored) {
    const axis = hyroxStationLoadAxis(row.station_slug as HyroxStationSlug);
    if (!axis) continue;
    byKey.set(coachStationLoadCellKey(row.station_slug, row.division, row.gender), row);
  }
  return emptyCoachStationLoadGrid().map((cell) => {
    const hit = byKey.get(
      coachStationLoadCellKey(cell.station_slug, cell.division, cell.gender),
    );
    if (!hit) return cell;
    return {
      ...cell,
      kg: cell.load_axis === 'damper' ? null : (hit.kg ?? null),
      damper: cell.load_axis === 'damper' ? (hit.damper ?? null) : null,
    };
  });
}

export function filledCoachStationLoadCount(cells: readonly CoachStationLoadCell[]): number {
  return cells.filter((c) => (c.load_axis === 'damper' ? c.damper != null : c.kg != null)).length;
}

/** Celdas con un número, listas para persistir. Vacías se omiten. */
export function persistableCoachStationLoadCells(
  cells: readonly { station_slug: string; division: string; gender: string; kg?: number | null; damper?: number | null }[],
): Array<{
  station_slug: HyroxStationSlug;
  division: RaceDivision;
  gender: RaceGender;
  kg: number | null;
  damper: number | null;
}> {
  const out: Array<{
    station_slug: HyroxStationSlug;
    division: RaceDivision;
    gender: RaceGender;
    kg: number | null;
    damper: number | null;
  }> = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    const axis = hyroxStationLoadAxis(cell.station_slug as HyroxStationSlug);
    if (!axis) continue;
    const load = stationLoadFromCoachValue(cell.station_slug as HyroxStationSlug, cell);
    if (!load) continue;
    const key = coachStationLoadCellKey(cell.station_slug, cell.division, cell.gender);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      station_slug: cell.station_slug as HyroxStationSlug,
      division: cell.division as RaceDivision,
      gender: cell.gender as RaceGender,
      kg: load.kind === 'damper' ? null : load.kg,
      damper: load.kind === 'damper' ? load.setting : null,
    });
  }
  return out;
}
