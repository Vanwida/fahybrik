import 'server-only';
import { sql as defaultSql, type Sql } from '@/lib/db';
import { parseIsoDate } from '@fahybrid/shared/domain/dates';
import type { ProgressionSpec } from '@fahybrid/shared/domain/prescription';

export type ResyncWeekTemplateResult = {
  microcycles_checked: number;
  assignments_resynced: number;
  athletes_updated: string[];
  athletes_failed: string[];
  athletes_incomplete: string[];
};

class IncompleteResyncError extends Error {}

/**
 * Resincroniza los microciclos YA ASIGNADOS que vinieron de esta plantilla de
 * semana (linaje de 0158) — se llama tras cada guardado del editor de día para
 * que una edición posterior de verdad llegue al atleta. Antes de esto, editar
 * una semana ya asignada se guardaba bien en la plantilla y nunca salía de
 * ahí: no había ni rastro de qué microciclos avisar (Alex, 7-ago: escribió una
 * nota para un ejercicio ya asignado y no llegó nunca al atleta).
 *
 * Reusa el MISMO motor que la asignación inicial — `instantiateWeekIntoMicrocycle`
 * vuelve a recorrer días/sesiones con el contenido fresco, y `insertSlotAssignment`
 * decide por slot: 'scheduled' → reemplaza el contenido materializado; cualquier
 * otro estado ('completed'/'partial'/'skipped'/'missed') → se deja intacto, el
 * atleta ya actuó sobre esa fila. Un hueco que el coach quitó de la plantilla
 * (sesión borrada o día pasado a descanso) sí se borra si sigue `scheduled`.
 *
 * Best-effort por microciclo, en su propia transacción: un atleta con un fallo
 * no debe bloquear a los demás ni el guardado del día que disparó esto.
 */
export async function resyncAssignedWeekTemplates(params: {
  coach_id: number | bigint;
  week_template_id: number | bigint;
  progression?: ProgressionSpec;
  client?: Sql;
}, instantiateWeekIntoMicrocycle: typeof import('./instantiate-program').instantiateWeekIntoMicrocycle): Promise<ResyncWeekTemplateResult> {
  const client = params.client ?? defaultSql;

  const microcycles = await client<
    Array<{ id: string; athlete_id: string; start_date: string; week_number: number }>
  >`
    select mc.id::text, mc.athlete_id::text, mc.start_date::text, mc.week_number
    from microcycles mc
    join athletes a on a.id = mc.athlete_id and a.coach_id = ${Number(params.coach_id)}
    join program_week_templates w on w.id = mc.source_week_template_id and w.coach_id = ${Number(params.coach_id)}
    where mc.source_week_template_id = ${Number(params.week_template_id)}
  `;

  let assignments_resynced = 0;
  const athletes_updated = new Set<string>();
  const athletes_failed = new Set<string>();
  const athletes_incomplete = new Set<string>();
  for (const mc of microcycles) {
    try {
      const result = await client.begin(async (tx) => {
        const materialized = await instantiateWeekIntoMicrocycle({
          client: tx as unknown as Sql,
          coach_id: params.coach_id,
          athlete_id: Number(mc.athlete_id),
          week_template_id: params.week_template_id,
          week_start: parseIsoDate(mc.start_date),
          week_number: mc.week_number,
          progression: params.progression,
        });
        // No reemplazar un plan válido por una entrega sin parte de su contenido.
        if (materialized.dropped_sessions.length) throw new IncompleteResyncError('Contenido incompleto');
        return materialized;
      });
      assignments_resynced += result.assignment_count;
      athletes_updated.add(mc.athlete_id);
    } catch (err) {
      athletes_failed.add(mc.athlete_id);
      if (err instanceof IncompleteResyncError) athletes_incomplete.add(mc.athlete_id);
    }
  }

  return { microcycles_checked: microcycles.length, assignments_resynced, athletes_updated: [...athletes_updated], athletes_failed: [...athletes_failed], athletes_incomplete: [...athletes_incomplete] };
}

