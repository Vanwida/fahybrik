// Tope de semanas de UN microciclo, por coach (card 135, migración
// infra/migrations/0206_coach_max_microcycle_weeks.sql). Metodología del
// entrenador, no del sistema — igual que `max_athletes` (ver lib/coach/capacity.ts):
// vive en `coaches.max_microcycle_weeks`, defecto 8, CHECK entre 2 y 26.
//
// Único cargador, reusado por TODOS los caminos que crean o alargan un
// microciclo (biblioteca, plan personal desde cero, encadenar un tramo,
// alargar uno existente, la tool MCP que escribe por los mismos servicios) —
// nunca se relee la columna a mano en cada uno.
//
// Acepta `client?: Sql | TransactionClient` para poder leerse DENTRO de la
// misma transacción que hace la comprobación + el insert (evita una vuelta
// extra al pool y mantiene la lectura consistente con la escritura que sigue).

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  coerceCoachMaxMicrocycleWeeks,
  MICROCICLO_DEFAULT_MAX_WEEKS,
} from '@fahybrid/shared/domain/coach/program-months';

function isMissingMaxMicrocycleWeeksColumn(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err && typeof err.code === 'string' ? err.code : '';
  if (code === '42703') return true;
  const message = err instanceof Error ? err.message : '';
  return message.includes('max_microcycle_weeks') && message.includes('does not exist');
}

/** El tope de semanas de un microciclo de ESTE coach. Nunca null: la columna
 *  es NOT NULL con defecto 8 (migración 0206). Si la columna aún no existe,
 *  el defecto — no un throw — para no tumbar lecturas ni el GET de niveles. */
export async function loadCoachMaxMicrocicloWeeks(params: {
  coach_id: number | bigint;
  client?: Sql | TransactionClient;
}): Promise<number> {
  const client = params.client ?? defaultSql;
  try {
    const rows = await client<Array<{ max_microcycle_weeks: number }>>`
      select max_microcycle_weeks from coaches where id = ${Number(params.coach_id)} limit 1
    `;
    return coerceCoachMaxMicrocycleWeeks(rows[0]?.max_microcycle_weeks);
  } catch (err) {
    if (isMissingMaxMicrocycleWeeksColumn(err)) return MICROCICLO_DEFAULT_MAX_WEEKS;
    throw err;
  }
}
