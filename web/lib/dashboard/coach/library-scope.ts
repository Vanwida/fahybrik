import 'server-only';

import type { Sql } from '@/lib/db';

/**
 * QUÉ ES UN ENTRENO DE LA BIBLIOTECA — la definición, una sola vez.
 *
 * Fragmento para el alias `t` de `templates` (el llamador añade su `coach_id`).
 * Lo comparten la Biblioteca, el buscador, la lista de plantillas y el recuento de
 * Ajustes; antes cada uno repetía la regla y Ajustes olvidó la segunda mitad
 * («9 entrenos en tu biblioteca» mientras la Biblioteca decía 0).
 *
 *   · Sin INSTANCIAS por atleta (forks): la biblioteca lista solo plantillas
 *     reutilizables; una instancia se alcanza por su asignación.
 *   · Sin TESTS de calibración (0112): un test mide al atleta, no es un entreno
 *     reutilizable, y tiene su propia superficie. La verdad es el vínculo
 *     `coach_calibration_tests.template_id`, no la forma 'test' (una sesión puede
 *     tener forma de test sin ser un protocolo de calibración).
 *
 * Archivada o borrador NO entra aquí: la Biblioteca las lista marcadas y cada
 * llamador decide si quiere solo las vivas (`t.archived_at is null`).
 */
export function libraryEntrenoScope(client: Sql) {
  // tenancy: coach-fragment — el llamador añade `t.coach_id = …`; `ct` cuelga de `t`.
  return client`(
    t.instance_athlete_id is null
    and not exists (select 1 from coach_calibration_tests ct where ct.template_id = t.id)
  )`;
}
