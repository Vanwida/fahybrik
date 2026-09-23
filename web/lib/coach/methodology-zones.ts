import 'server-only';

// Las zonas de RITMO del coach (`methodology_zones`, mig 0061) — el editor de
// Ajustes › Método. Seis zonas por unidad (por km para correr, por 500 m para
// ergómetro), cada una una banda en segundos respecto al ritmo umbral que da un
// test. Sin filas, el coach usa el modelo estándar (`standardZonesFor`), el
// mismo que ya servía `loadCoachZonesForUnit`: guardar crea sus seis filas,
// restaurar las borra.
//
// Editar el modelo NO recalcula las zonas ya guardadas de cada atleta
// (`athlete_zone_profiles` es una foto del día del test, a propósito): vale para
// los tests nuevos y para las etiquetas que se resuelven al leer.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  standardZonesFor,
  ZONE_ROLES,
  type CoachZone,
  type ZonePaceUnit,
} from '@fahybrid/shared/domain/methodology';
import { paceZonesProblem, type PaceZoneEdit } from '@fahybrid/shared/domain/methodology/method-editors';

export interface PaceZoneModel {
  pace_unit: ZonePaceUnit;
  zones: CoachZone[];
  is_standard: boolean;
  standard: CoachZone[];
}

export class PaceZonesError extends Error {}

export async function getCoachPaceZones(
  coach_id: number | bigint,
  pace_unit: ZonePaceUnit,
  client: Sql = defaultSql,
): Promise<PaceZoneModel> {
  const rows = await client<Array<Omit<CoachZone, 'role'> & { role: string }>>`
    select code, label, color, role, sort_order::int as sort_order, pace_unit,
           low_offset_s::float8 as low_offset_s, high_offset_s::float8 as high_offset_s
    from methodology_zones
    where coach_id = ${Number(coach_id)} and pace_unit = ${pace_unit}
    order by sort_order
  `;
  const standard = [...standardZonesFor(pace_unit)];
  if (rows.length === 0) return { pace_unit, zones: standard, is_standard: true, standard };
  return {
    pace_unit,
    zones: rows.map((r) => ({ ...r, role: r.role as CoachZone['role'] })),
    is_standard: false,
    standard,
  };
}

/**
 * Guardar las seis zonas de una unidad (reemplaza las que hubiera) o, con
 * `null`, volver al estándar. La identidad (código, papel, color, orden) sale
 * del estándar: el coach mueve nombres y bandas, no el eje.
 */
export async function saveCoachPaceZones(
  coach_id: number | bigint,
  pace_unit: ZonePaceUnit,
  zones: readonly PaceZoneEdit[] | null,
  client: Sql = defaultSql,
): Promise<PaceZoneModel> {
  const cid = Number(coach_id);
  if (zones == null) {
    await client`delete from methodology_zones where coach_id = ${cid} and pace_unit = ${pace_unit}`;
    return getCoachPaceZones(cid, pace_unit, client);
  }
  const problem = paceZonesProblem(zones);
  if (problem) throw new PaceZonesError(problem);
  const standard = standardZonesFor(pace_unit);
  await client.begin(async (tx) => {
    await tx`delete from methodology_zones where coach_id = ${cid} and pace_unit = ${pace_unit}`;
    for (const [i, z] of zones.entries()) {
      const base = standard[i]!;
      await tx`
        insert into methodology_zones
          (coach_id, code, label, color, role, sort_order, anchor, pace_unit, low_offset_s, high_offset_s)
        values
          (${cid}, ${base.code}, ${z.label.trim()}, ${base.color}, ${ZONE_ROLES[i]!}, ${i + 1}, 'threshold',
           ${pace_unit}, ${z.low_offset_s}, ${z.high_offset_s})
      `;
    }
  });
  return getCoachPaceZones(cid, pace_unit, client);
}
