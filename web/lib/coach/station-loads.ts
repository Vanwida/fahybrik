import 'server-only';

// Cargas de competición del coach — lectura/escritura sobre
// `coach_station_loads` (mig 0208).
//
// El resolutor relativo (`stationLoad`) recibe un lookup inyectable. Este
// módulo es el ÚNICO que lee la tabla del coach y la convierte en
// `HyroxStationLoad`. Celda vacía o tabla ausente → null («no lo sé»).
// Nunca se inventa un kilo ni se cae a otra celda.
//
// Guardar reemplaza el conjunto entero: delete + insert de las celdas
// rellenas. Las vacías no se persisten.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  COACH_STATION_LOAD_CELL_COUNT,
  filledCoachStationLoadCount,
  lookupCoachStationLoad,
  mergeCoachStationLoadGrid,
  persistableCoachStationLoadCells,
  type CoachStationLoadStoredRow,
} from '@fahybrid/shared/domain/coach/station-loads';
import type { CoachStationLoadsPutInput, CoachStationLoadsResponse } from '@fahybrid/shared/schema/coach-station-loads';
import type { HyroxStationLoad, HyroxStationSlug } from '@fahybrid/shared/domain/hyrox/stations';
import type { RaceDivision, RaceGender } from '@fahybrid/shared/schema/races';

const TABLE = 'coach_station_loads';

interface StoredRow {
  station_slug: string;
  division: string;
  gender: string;
  kg: number | string | null;
  damper: number | null;
  updated_at: string;
}

function toStored(row: StoredRow): CoachStationLoadStoredRow {
  return {
    station_slug: row.station_slug,
    division: row.division,
    gender: row.gender,
    kg: row.kg == null ? null : Number(row.kg),
    damper: row.damper,
  };
}

async function loadRows(
  coach_id: bigint | number,
  client: Sql | TransactionClient,
): Promise<{ rows: CoachStationLoadStoredRow[]; updated_at: string | null }> {
  try {
    const rows = await client<StoredRow[]>`
      select
        station_slug,
        division,
        gender,
        kg::float8 as kg,
        damper,
        updated_at::text as updated_at
      from coach_station_loads
      where coach_id = ${coach_id}
    `;
    let updated_at: string | null = null;
    for (const row of rows) {
      if (row.updated_at && (!updated_at || row.updated_at > updated_at)) {
        updated_at = row.updated_at;
      }
    }
    return { rows: rows.map(toStored), updated_at };
  } catch (err) {
    if (isPgMissingRelation(err, TABLE)) return { rows: [], updated_at: null };
    throw err;
  }
}

function toResponse(
  stored: CoachStationLoadStoredRow[],
  updated_at: string | null,
): CoachStationLoadsResponse {
  const cells = mergeCoachStationLoadGrid(stored);
  return {
    cells,
    filled_count: filledCoachStationLoadCount(cells),
    cell_count: COACH_STATION_LOAD_CELL_COUNT,
    updated_at,
  };
}

/** El GET del editor: la rejilla completa, vacía donde el coach no ha escrito. */
export async function getCoachStationLoads(
  coach_id: bigint | number,
  client: Sql | TransactionClient = defaultSql,
): Promise<CoachStationLoadsResponse> {
  const { rows, updated_at } = await loadRows(coach_id, client);
  return toResponse(rows, updated_at);
}

/**
 * Lookup inyectable en `anchorsFromZoneProfiles` / `anchorsFromBenchmarks`.
 * Exact match. Tabla ausente o celda vacía → null.
 */
export async function loadCoachStationLoadLookup(
  coach_id: bigint | number,
  client: Sql | TransactionClient = defaultSql,
): Promise<
  (slug: HyroxStationSlug, division: RaceDivision, gender: RaceGender) => HyroxStationLoad | null
> {
  const { rows } = await loadRows(coach_id, client);
  return (slug, division, gender) => lookupCoachStationLoad(rows, slug, division, gender);
}

/**
 * El PUT del editor: reemplaza el conjunto entero. `values` llega ya validado.
 * Celdas vacías no se insertan.
 */
export async function upsertCoachStationLoads(
  coach_id: bigint | number,
  values: CoachStationLoadsPutInput,
  client: Sql = defaultSql,
): Promise<CoachStationLoadsResponse> {
  const persistable = persistableCoachStationLoadCells(values.cells);
  await client.begin(async (tx) => {
    await tx`delete from coach_station_loads where coach_id = ${coach_id}`;
    for (const cell of persistable) {
      await tx`
        insert into coach_station_loads (
          coach_id, station_slug, division, gender, kg, damper, updated_at
        ) values (
          ${coach_id},
          ${cell.station_slug},
          ${cell.division},
          ${cell.gender},
          ${cell.kg},
          ${cell.damper},
          now()
        )
      `;
    }
  });
  return getCoachStationLoads(coach_id, client);
}
