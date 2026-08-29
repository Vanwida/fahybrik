// ¿Esta fila de `set_executions` CUENTA como serie de trabajo?
//
// Espejo SQL de `isWorkingSet()` (`shared/domain/strength/working-set.ts`).
// Un solo predicado para volumen, analíticas, tonelaje de dobles y actuals
// del coach: antes cada lector repetía `coalesce(st.is_approach, false) = false`
// y cualquier migración pendiente (0207) tumba TODAS las rutas que lo nombra.
//
// `to_jsonb(st)->>'is_approach'` sobrevive sin la columna: ausente = trabajo,
// que es lo que era todo hasta 0207. Cuando la migración corre, el resultado
// es idéntico a `coalesce(st.is_approach, false) = false`.

import type { Sql, TransactionClient } from '@/lib/db';
import { optionalBooleanSql, assertSqlIdent } from '@/lib/db/optional-column';

type SqlLike = Sql | TransactionClient;

/**
 * Predicado SQL: la fila `st` es serie de trabajo (no skipped, no aproximación).
 *
 *   sql`... where ${SET_IS_WORKING(sql)} and ...`
 */
export const SET_IS_WORKING = (sql: SqlLike, alias = 'st') => {
  const a = assertSqlIdent(alias);
  const expr = `${a}.status <> 'skipped' and ${optionalBooleanSql(a, 'is_approach', false)} = false`;
  return sql.unsafe(expr);
};
