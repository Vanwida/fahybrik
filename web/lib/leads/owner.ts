import type { Sql, TransactionClient } from '@/lib/db';
import { readFunnelCoachId } from './funnel-coach';

/**
 * DE QUIÉN ES UN LEAD — la regla escrita una vez (DECISIONS 2026-09-23 «Negocio con
 * dueño»). Todo lo que lee o toca leads desde el panel de un coach la usa: listado,
 * contadores, ficha, transición, lista de espera, citas, embudo.
 *
 *   • `leads.coach_id = <coach>`  → suyo (0147: el dueño se graba al captar).
 *   • `leads.coach_id IS NULL`    → «sin asignar». NO es de todos: solo lo ve y lo
 *     tría el coach que opera el embudo público (`FUNNEL_COACH_ID`, configuración
 *     explícita — nunca un `min(id)`). Sin embudo declarado, un lead sin dueño no lo
 *     ve nadie desde el panel. Antes de 2026-09-23 cualquier club autenticado podía
 *     abrirlo; con miles de coaches eso es enseñar los datos de salud de un
 *     desconocido a todos ellos.
 *   • otro coach                  → no existe (404, nunca 403).
 *
 * `column` es la referencia a `coach_id` con el alias de la consulta (`l.coach_id`,
 * o `coach_id` a secas). El resultado es un fragmento de SQL con índice (`leads_coach_id_idx`).
 */
export function leadOwnedBy(
  client: Sql | TransactionClient,
  coach_id: bigint | number,
  column: ReturnType<Sql>,
) {
  const coach = Number(coach_id);
  // Sin coach no hay dueño que comparar: se falla CERRADO y en voz alta, nunca con
  // una consulta que devuelva los leads de todos.
  if (!Number.isSafeInteger(coach) || coach <= 0) throw new Error('leadOwnedBy: coach_id requerido');
  const funnel = readFunnelCoachId();
  if (funnel !== null && BigInt(coach) === funnel) {
    return client`(${column} = ${coach} or ${column} is null)`;
  }
  return client`${column} = ${coach}`;
}

/**
 * El coach cuya AGENDA atiende a un lead: su dueño; un lead sin dueño, el coach del
 * embudo público (la misma lectura que `leadOwnedBy`). `null` = nadie → sin huecos.
 */
export function calendarCoachForLead(lead_coach_id: bigint | number | null): bigint | null {
  if (lead_coach_id != null) return BigInt(lead_coach_id);
  return readFunnelCoachId();
}
