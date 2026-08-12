import 'server-only';

// Umbrales de los agregados de carrera del coach — la capa de lectura sobre
// `coach_running_thresholds` (mig 0183 + 0184). Espejo de web/lib/coach/
// signal-thresholds.ts.
//
// A diferencia de los umbrales de señal (que se mezclan sobre un objeto de
// constantes DEL MOTOR más grande, `SIGNAL_THRESHOLDS`), aquí las columnas
// SON el conjunto entero de lo editable — no hay nada más grande en lo que
// se inserten. `resolveEffectiveRunningThresholds` es por tanto el único
// resolutor: la fila del coach si existe, si no, los defectos.
//
// Sólo lectura por ahora: nada en este encargo pide un editor de coach para
// estos tres números (el consumidor es `running-analytics.ts`, no una
// pantalla de ajustes). Cuando exista, el PUT es el mismo patrón de
// `upsertCoachSignalThresholds` — reemplazo del conjunto entero, sin parche
// por campo.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  COACH_RUNNING_THRESHOLD_KEYS,
  defaultCoachRunningThresholds,
  type CoachRunningThresholds,
} from '@fahybrid/shared/domain/coach/running-thresholds';

const TABLE = 'coach_running_thresholds';

async function loadRow(coach_id: bigint | number, client: Sql): Promise<CoachRunningThresholds | null> {
  try {
    const rows = await client<CoachRunningThresholds[]>`
      select
        min_reps_per_position,
        min_series_for_calibration,
        freshness_alert_tsb,
        min_pairs_for_compromised_trend
      from coach_running_thresholds
      where coach_id = ${coach_id}
      limit 1
    `;
    return rows[0] ?? null;
  } catch (err) {
    // Entorno sin migrar: servir los defectos en vez de tumbar el barrido entero.
    if (isPgMissingRelation(err, TABLE)) return null;
    throw err;
  }
}

/**
 * Los umbrales VIGENTES para los agregados de carrera de un coach: su fila
 * si la ha escrito, si no, los defectos del sistema. Es la única lectura que
 * necesita `running-analytics.ts` — no le importa quién escribió cada
 * número, sólo cuál manda.
 */
export async function resolveEffectiveRunningThresholds(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachRunningThresholds> {
  const row = await loadRow(coach_id, client);
  if (!row) return defaultCoachRunningThresholds();
  // Se cogen las claves editables por su lista, no la fila entera: si la
  // consulta alguna vez trae una columna de más (p.ej. `updated_at`), no se
  // cuela en el objeto que consumen los agregadores. Se esparce sobre los
  // defectos (no se castea directo): si una migración futura añade una
  // cuarta clave editable y la fila aún no la trae, el defecto rellena el
  // hueco en vez de dejar `undefined`.
  const values = Object.fromEntries(COACH_RUNNING_THRESHOLD_KEYS.map((k) => [k, row[k]]));
  return { ...defaultCoachRunningThresholds(), ...values };
}
