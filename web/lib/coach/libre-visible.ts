// QUÉ SESIONES DEL ATLETA VE EL COACH EN SU CALENDARIO.
//
// El plan es suyo entero (`origin = 'coach'`). Del atleta (`origin = 'self'`, el
// entreno libre) solo lo HECHO: un libre es trabajo real que el coach tiene que
// ver para leer la semana, pero no es plan — no se mueve, no se edita, no cuenta
// en la adherencia (`shared/domain/coach/adherence.ts`) ni en la carga planificada.
// Un libre que el atleta montó y no llegó a hacer no existe para el coach.
//
// HECHO = estado terminal de hecho o una ejecución registrada: la misma regla que
// `isSessionDone`. Un fragmento SQL (con la asignación aliaseada `wa`) para que
// el calendario de la ficha, los siete puntos del vistazo y el enlace viejo a un
// día pregunten lo mismo.

import type { Sql, TransactionClient } from '@/lib/db';

type SqlLike = Sql | TransactionClient;

export const COACH_SEES_ASSIGNMENT = (sql: SqlLike) => sql`(
  wa.origin = 'coach'
  or wa.status in ('completed', 'partial')
  or exists (select 1 from workout_executions we_seen where we_seen.assignment_id = wa.id)
)`;
