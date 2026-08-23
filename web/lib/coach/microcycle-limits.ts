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
import { MICROCICLO_DEFAULT_MAX_WEEKS } from '@fahybrid/shared/domain/coach/program-months';

/** El tope de semanas de un microciclo de ESTE coach. Nunca null: la columna
 *  es NOT NULL con defecto 8 (migración 0206). */
export async function loadCoachMaxMicrocicloWeeks(params: {
  coach_id: number | bigint;
  client?: Sql | TransactionClient;
}): Promise<number> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ max_microcycle_weeks: number }>>`
    select max_microcycle_weeks from coaches where id = ${Number(params.coach_id)} limit 1
  `;
  // Sin fila de coach (id inválido) el defecto de la columna no aplica —
  // el llamador ya validó ownership del coach antes de llegar aquí; esto es
  // sólo una guarda defensiva, nunca el camino esperado.
  return rows[0]?.max_microcycle_weeks ?? MICROCICLO_DEFAULT_MAX_WEEKS;
}
