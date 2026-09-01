import 'server-only';

// El MÉTODO del coach para las analíticas del atleta — la capa de lectura sobre
// `coach_analytics_method` (mig 0189).
//
// Lo leen las tres familias de lecturas: la carga (ventanas del fondo y lo
// reciente, aviso del ritmo de subida, bandas del cociente), la capacidad (las
// puertas del ajuste de velocidad crítica) y la recuperación (objetivo de sueño,
// noches mínimas de basal). Comparten fila a propósito: son el método de UN
// coach sobre UN atleta, y partirlas en tres tablas obligaría a resolver tres
// filas para pintar una pantalla.
//
// Sólo lectura por ahora: nadie ha pedido todavía la pantalla donde el coach los
// edita. Cuando exista, el PUT es reemplazo del conjunto entero — sin parche por
// campo — y valida con `validarMetodoAnalitico` antes de escribir, porque hay
// reglas que ningún CHECK por columna puede cubrir (que lo reciente sea menos
// que el fondo, que la ventana de duraciones quepa la separación exigida).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  COACH_ANALYTICS_METHOD_KEYS,
  defaultCoachAnalyticsMethod,
  type CoachAnalyticsMethod,
} from '@fahybrid/shared/domain/analytics/metodo';
import { resolveMethodRow } from './method-row';

const TABLE = 'coach_analytics_method';

/**
 * El método vigente de un coach: su fila si la ha escrito, si no, los defectos
 * — que son EXACTAMENTE el comportamiento de siempre, así que un coach que no
 * ha tocado nada ve los mismos números que veía.
 */
export async function resolveEffectiveAnalyticsMethod(
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<CoachAnalyticsMethod> {
  return resolveMethodRow<CoachAnalyticsMethod>({
    table: TABLE,
    keys: COACH_ANALYTICS_METHOD_KEYS,
    defaults: defaultCoachAnalyticsMethod(),
    coach_id,
    client,
  });
}
