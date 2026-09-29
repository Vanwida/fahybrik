// @fahybrid/shared/domain/coach/basal-db — la ventana basal y las noches mínimas
// del coach, leídas desde los motores de `shared/domain` que ya van con base de
// datos (el readiness compuesto). Es la MISMA fila que resuelve la web
// (`web/lib/coach/analytics-method.ts`, `coach_analytics_method` 0190/0277): aquí
// solo se leen las cuatro columnas de la basal, con el defecto de
// `analytics/metodo.ts` columna a columna, para que el readiness y el panel
// midan contra la misma basal (P3/P16).
//
// `select *` a propósito, como los demás lectores de método: una columna que aún
// no existe llega ausente y manda el defecto; una tabla que aún no existe, igual.

import type { Sql } from 'postgres';
import type { PuertasBasal } from '../analytics/basal';
import { DEFAULT_COACH_ANALYTICS_METHOD } from '../analytics/metodo';

/** Postgres «undefined_table»: la tabla aún no existe (entorno sin migrar). */
const UNDEFINED_TABLE = '42P01';

const CLAVES = ['basal_dias', 'basal_excluir_dias', 'hrv_min_nights_recent', 'hrv_min_nights_baseline'] as const;

/** La basal del coach que lleva al atleta; los defectos del sistema si no tiene coach o fila. */
export async function loadPuertasBasalForAthlete(client: Sql, athlete_id: number | bigint): Promise<PuertasBasal> {
  const d = DEFAULT_COACH_ANALYTICS_METHOD;
  const out: PuertasBasal = { basal_dias: d.basal_dias, basal_excluir_dias: d.basal_excluir_dias, hrv_min_nights_recent: d.hrv_min_nights_recent, hrv_min_nights_baseline: d.hrv_min_nights_baseline };
  try {
    const rows = await client<Array<Record<string, unknown>>>`
      select m.* from athletes a
      join coach_analytics_method m on m.coach_id = a.coach_id
      where a.id = ${Number(athlete_id)}
      limit 1
    `;
    const row = rows[0];
    if (!row) return out;
    for (const k of CLAVES) {
      const v = row[k];
      const n = v == null ? null : Number(v);
      if (n != null && Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch (err) {
    if ((err as { code?: string } | null)?.code === UNDEFINED_TABLE) return out;
    throw err;
  }
}
