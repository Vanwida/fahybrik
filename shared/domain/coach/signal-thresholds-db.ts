// @fahybrid/shared/domain/coach/signal-thresholds-db — los umbrales EFECTIVOS de
// un coach leídos desde los motores de `shared/domain` que ya van con base de
// datos (readiness compuesto, «Listo para progresar», el contexto de la IA).
//
// La mezcla es UNA (`mergeCoachThresholds`: el defecto de cada clave con el
// número del coach encima); esto solo lee la fila. El resolutor de la web
// (`web/lib/coach/signal-thresholds.ts`) lee la misma fila para el editor y el
// barrido: los dos pasan por `mergeCoachThresholds`, así que no pueden discrepar
// sobre el valor vigente.
//
// `select *` a propósito, como el resolutor: un entorno a medio migrar sirve lo
// que tenga, y una columna que falta se lee como nula (= el defecto).

import type { Sql } from 'postgres';
import {
  COACH_THRESHOLD_KEYS,
  mergeCoachThresholds,
  type CoachThresholdOverrides,
  type CoachThresholds,
} from './signal-thresholds';

/** Postgres «undefined_table»: la tabla aún no existe (entorno sin migrar). */
const UNDEFINED_TABLE = '42P01';

function toOverrides(row: Record<string, unknown> | undefined): CoachThresholdOverrides | null {
  if (!row) return null;
  const out: CoachThresholdOverrides = {};
  for (const k of COACH_THRESHOLD_KEYS) {
    const v = row[k];
    out[k] = v == null ? null : Number(v);
  }
  return out;
}

async function readRow(query: () => Promise<Array<Record<string, unknown>>>): Promise<CoachThresholds> {
  try {
    const rows = await query();
    return mergeCoachThresholds(toOverrides(rows[0]));
  } catch (err) {
    if ((err as { code?: string } | null)?.code === UNDEFINED_TABLE) return mergeCoachThresholds(null);
    throw err;
  }
}

/** Los umbrales efectivos del coach `coach_id`. */
export function loadCoachThresholds(client: Sql, coach_id: number | bigint): Promise<CoachThresholds> {
  return readRow(() =>
    client<Array<Record<string, unknown>>>`
      select * from coach_signal_thresholds where coach_id = ${Number(coach_id)} limit 1
    `,
  );
}

/** Los umbrales efectivos del coach que lleva al atleta (los defectos si no tiene coach). */
export function loadCoachThresholdsForAthlete(
  client: Sql,
  athlete_id: number | bigint,
): Promise<CoachThresholds> {
  return readRow(() =>
    client<Array<Record<string, unknown>>>`
      select t.* from athletes a
      join coach_signal_thresholds t on t.coach_id = a.coach_id
      where a.id = ${Number(athlete_id)}
      limit 1
    `,
  );
}
