// UN ENTRENO, UNA FILA: el guardado de la app sustituye a su copia plana de Apple Salud.
//
// El reloj (o el móvil) escribe el entreno en Apple Salud al terminar, y Salud se
// sincroniza por su lado. Si esa copia llega ANTES que el guardado de la app, queda
// archivada como una importación plana (sin asignación, `recorded_via = 'imported'`)
// y el guardado estructurado —con sus tramos, series y RPE— entra después: el mismo
// entreno contado dos veces en carga, zonas y volumen. Si llega DESPUÉS, la ingesta
// de Salud ya lo reconoce (`source_workout_ref` y solape de ventana,
// `execution-time-dedupe.ts`) y no archiva nada. Esto hace que el resultado no
// dependa del orden de llegada.
//
// La regla (la del materializador FIT y la del guardado «fuera del plan», ahora en
// TODOS los guardados de la app —plan del coach, libre, fuera del plan, Dobles—):
// se borra la importación plana de Salud del MISMO atleta que
//   · lleve el mismo `source_workout_ref` (el UUID del entreno de Salud), o
//   · se solape en el tiempo con lo que el atleta acaba de guardar: dos entrenos a
//     la vez no los hace nadie (la misma intersección de ventanas que usa la ingesta
//     de Salud cuando la copia llega después).
// El solape solo se mira cuando el guardado trae su hora de inicio: un «Marcar como
// hecha» sin horas no tiene ventana y no puede borrar nada por solape.

import type { Sql, TransactionClient } from '@/lib/db';
import type { ExecutionMetricsInput } from '@/lib/sync/record-workout-execution';
import { sanitizeDurationSeconds, sanitizeSourceWorkoutRef } from '@/lib/sync/sanitize-measurement';
import { coerceWireInstant } from '@/lib/sync/wire-instant';

/** La ventana [inicio, fin] del entreno que se guarda, o null si no trae su inicio. */
export function workWindow(
  input: Pick<ExecutionMetricsInput, 'started_at' | 'ended_at' | 'total_duration_seconds'>,
): { startedAt: string; endedAt: string } | null {
  const started = coerceWireInstant(input.started_at);
  if (!started) return null;
  const startMs = Date.parse(started);
  const ended = coerceWireInstant(input.ended_at);
  const duration = sanitizeDurationSeconds(input.total_duration_seconds);
  const endMs = ended ? Date.parse(ended) : duration != null ? startMs + duration * 1000 : startMs;
  return {
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(Math.max(startMs, endMs)).toISOString(),
  };
}

/**
 * Borra las importaciones planas de Salud que son este mismo entreno (ver
 * cabecera). Se llama dentro de la transacción del guardado, antes de escribir la
 * ejecución. Devuelve cuántas filas sustituyó.
 */
export async function replaceHealthImports(
  sql: Sql | TransactionClient,
  args: { athleteId: number; input: ExecutionMetricsInput },
): Promise<number> {
  const ref = sanitizeSourceWorkoutRef(args.input.source_workout_ref);
  const window = workWindow(args.input);
  if (ref == null && window == null) return 0;
  const rows = await sql<Array<{ id: string }>>`
    delete from workout_executions
    where athlete_id = ${args.athleteId}
      and assignment_id is null
      and off_plan_reason is null
      and source = 'healthkit'
      and recorded_via = 'imported'
      and (
        (${ref}::text is not null and source_workout_ref = ${ref}::text)
        or (
          ${window?.startedAt ?? null}::timestamptz is not null
          and started_at is not null
          and started_at <= ${window?.endedAt ?? null}::timestamptz
          and coalesce(ended_at, started_at) >= ${window?.startedAt ?? null}::timestamptz
        )
      )
    returning id::text as id
  `;
  return rows.length;
}
