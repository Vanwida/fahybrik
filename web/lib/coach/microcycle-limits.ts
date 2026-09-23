// Tope de semanas de UN programa, por coach (card 135, migraciones 0206 y 0259).
// Metodología del entrenador, no del sistema: vive en
// `coaches.max_microcycle_weeks` (CHECK entre 2 y 26); NULL = el defecto del
// producto `MICROCICLO_DEFAULT_MAX_WEEKS`. Se edita en Ajustes › Plan del atleta.
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

/** El tope de semanas de un programa de ESTE coach: el suyo o, sin él, el defecto. */
export async function loadCoachMaxMicrocicloWeeks(params: {
  coach_id: number | bigint;
  client?: Sql | TransactionClient;
}): Promise<number> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ max_microcycle_weeks: number | null }>>`
    select max_microcycle_weeks from coaches where id = ${Number(params.coach_id)} limit 1
  `;
  return rows[0]?.max_microcycle_weeks ?? MICROCICLO_DEFAULT_MAX_WEEKS;
}

/** El ajuste para el editor: lo guardado (null = defecto), lo vigente y el defecto. */
export async function getMaxProgramWeeksSetting(
  coach_id: number | bigint,
  client: Sql = defaultSql,
): Promise<{ stored: number | null; effective: number; default_weeks: number }> {
  const rows = await client<Array<{ max_microcycle_weeks: number | null }>>`
    select max_microcycle_weeks from coaches where id = ${Number(coach_id)} limit 1
  `;
  const stored = rows[0]?.max_microcycle_weeks ?? null;
  return { stored, effective: stored ?? MICROCICLO_DEFAULT_MAX_WEEKS, default_weeks: MICROCICLO_DEFAULT_MAX_WEEKS };
}

/** Guardar el tope (null o el mismo defecto = volver al defecto). Los programas que ya pasan del tope nuevo no se tocan. */
export async function setMaxProgramWeeks(
  coach_id: number | bigint,
  weeks: number | null,
  client: Sql = defaultSql,
): Promise<{ stored: number | null; effective: number; default_weeks: number }> {
  const value = weeks == null || weeks === MICROCICLO_DEFAULT_MAX_WEEKS ? null : weeks;
  await client`update coaches set max_microcycle_weeks = ${value}, updated_at = now() where id = ${Number(coach_id)}`;
  return getMaxProgramWeeksSetting(coach_id, client);
}
