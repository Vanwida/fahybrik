// UN ENTRENO HECHO NO SE PIERDE (auditoría de la app del atleta, E1 / D-04).
//
// El atleta entrena a las 07:00 en un box sin cobertura, o desde la tarjeta de
// ayer que se quedó en el reloj. A las 07:30 su coach «Quita» o «Sustituye» esa
// sesión — borrado duro de lo pendiente — o mueve al grupo con «Empiezan todos el
// lunes». Al guardar, el servidor contestaba 404 y la app lo trata como veneno: en
// el móvil, REINTENTAR para siempre; en el reloj, «Sesión completada» con nada en
// el servidor; en la cola offline, a la basura. Series, cargas y RPE, perdidos, y
// el coach sin saber nada.
//
// Ahora la sesión se guarda SIEMPRE que traiga trabajo:
//   · si el id nombra una sesión suya → se guarda sobre ella, como siempre;
//   · si no (ya no existe, es de otro atleta, o no se lee) → se guarda como una
//     ejecución SUYA sin asignación, la misma forma que un entreno importado de
//     Apple Salud (DECISIONS 2026-08-13), marcada `off_plan_reason` para que su
//     coach la vea en Hoy: «hecho sobre un entreno que ya no estaba en su plan».
// La seguridad no cambia: nunca se escribe sobre la sesión de otro atleta — ese
// envío queda como del que lo manda, sin tocar la del otro ni enlazar su plantilla.
//
// Lo único que sigue siendo 404: un envío SIN trabajo («Marcar como hecha», que no
// lleva ni un número) sobre una sesión que ya no está. Ahí no hay nada que perder,
// y el 404 hace que la app recargue y enseñe el plan de ahora.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';
import type { RunningPR } from '@fahybrid/shared/domain/running/best-efforts';
import {
  detectPrs,
  executionMergeSet,
  executionRowValues,
  isPoolWriteClient,
  persistExecutionChildren,
  recordWorkoutExecution,
  type ExecutionMetricsInput,
} from '@/lib/sync/record-workout-execution';

/** Por qué un entreno guardado no cuelga de una sesión de su plan (`workout_executions.off_plan_reason`, 0270). */
export type OffPlanReason = 'assignment_gone' | 'not_own_assignment' | 'no_assignment';

export type AthleteWorkoutResult =
  | {
      ok: true;
      off_plan: false;
      assignment_id: string;
      execution_id: string;
      segments_saved: number;
      prs: RunningPR[];
    }
  | {
      ok: true;
      off_plan: true;
      execution_id: string;
      segments_saved: number;
      prs: RunningPR[];
    }
  | { ok: false; reason: 'not_found' };

/** El id de sesión que llega por el cable, o null si no hay uno legible. */
export function wireAssignmentId(raw: unknown): number | null {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d{1,15}$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * ¿Trae algo que el atleta HIZO? Un «Marcar como hecha» manda solo el id y la
 * fuente: no hay entreno que guardar si su sesión ya no está.
 */
export function carriesWorkEvidence(input: ExecutionMetricsInput): boolean {
  return (
    input.started_at != null ||
    input.ended_at != null ||
    input.total_duration_seconds != null ||
    input.perceived_exertion != null ||
    input.score_time_s != null ||
    input.score_rounds != null ||
    input.score_reps != null ||
    (input.notes != null && input.notes.trim() !== '') ||
    (input.segments?.length ?? 0) > 0 ||
    input.route_polyline != null ||
    input.source_workout_ref != null ||
    input.perceived_difficulty != null ||
    input.pain_area != null ||
    (input.pain_note != null && input.pain_note.trim() !== '')
  );
}

/**
 * Guarda el entreno de un atleta: sobre su sesión si el id la nombra, y si no,
 * fuera del plan. Ver la cabecera del fichero.
 */
export async function recordAthleteWorkout(args: {
  athleteId: number;
  rawAssignmentId: unknown;
  input: ExecutionMetricsInput;
  sql?: Sql;
}): Promise<AthleteWorkoutResult> {
  const client = args.sql ?? defaultSql;
  const { athleteId, input } = args;
  const assignmentId = wireAssignmentId(args.rawAssignmentId);

  let reason: OffPlanReason = 'no_assignment';
  if (assignmentId != null) {
    const rows = await client<Array<{ athlete_id: string }>>`
      select athlete_id::text as athlete_id from workout_assignments where id = ${assignmentId} limit 1
    `;
    const owner = rows[0]?.athlete_id;
    if (owner != null && Number(owner) === athleteId) {
      const recorded = await recordWorkoutExecution({ athleteId, assignmentId, input, sql: client });
      if (recorded.ok) return { ...recorded, off_plan: false };
      // Borrada entre la lectura y la escritura (el «Quitar» del coach ganó la carrera).
      reason = 'assignment_gone';
    } else {
      reason = owner == null ? 'assignment_gone' : 'not_own_assignment';
    }
  }

  if (!carriesWorkEvidence(input)) return { ok: false, reason: 'not_found' };

  return recordOffPlanExecution({
    athleteId,
    reason,
    // Solo la sesión que ya no existe queda anotada; jamás el id de la de otro atleta.
    claimedAssignmentId: reason === 'assignment_gone' ? assignmentId : null,
    input,
    sql: client,
  });
}

/**
 * Una ejecución del atleta sin asignación, marcada fuera del plan. Idempotente por
 * la hora de inicio que sella el motor (índice 0270): REINTENTAR, la cola o el reloj
 * reenviando el mismo entreno actualizan la misma fila.
 */
export async function recordOffPlanExecution(args: {
  athleteId: number;
  reason: OffPlanReason;
  claimedAssignmentId: number | null;
  input: ExecutionMetricsInput;
  sql?: Sql | TransactionClient;
}): Promise<AthleteWorkoutResult> {
  const client = args.sql ?? defaultSql;
  const result = isPoolWriteClient(client)
    ? await client.begin((tx) => persistOffPlanExecution({ ...args, sql: tx }))
    : await persistOffPlanExecution({ ...args, sql: client });
  void recomputeAthlete({ athlete_id: args.athleteId }).catch(() => {});
  return result;
}

async function persistOffPlanExecution(args: {
  athleteId: number;
  reason: OffPlanReason;
  claimedAssignmentId: number | null;
  input: ExecutionMetricsInput;
  sql: Sql | TransactionClient;
}): Promise<AthleteWorkoutResult> {
  const { athleteId, input, sql } = args;
  const v = executionRowValues(input);

  // El mismo entreno del reloj ya archivado como importación plana de Apple Salud
  // (se sincronizó antes de que llegara este guardado): el registro estructurado
  // sustituye al plano, la misma regla que el materializador FIT.
  if (v.source_workout_ref) {
    await sql`
      delete from workout_executions
      where athlete_id = ${athleteId}
        and source_workout_ref = ${v.source_workout_ref}
        and assignment_id is null
        and off_plan_reason is null
        and source = 'healthkit'
        and recorded_via = 'imported'
    `;
  }

  const rows = await sql<Array<{ id: string }>>`
    insert into workout_executions (
      assignment_id, athlete_id, started_at, ended_at,
      total_duration_seconds, perceived_exertion, notes,
      score_time_s, score_rounds, score_reps, source, source_workout_ref,
      perceived_difficulty, pain_area, pain_note,
      recorded_via, totals_source, contributing_sources,
      off_plan_reason, claimed_assignment_id
    )
    values (
      null,
      ${athleteId},
      ${v.started_at}::timestamptz,
      ${v.ended_at}::timestamptz,
      ${v.total_duration_seconds},
      ${v.perceived_exertion},
      ${v.notes},
      ${v.score_time_s},
      ${v.score_rounds},
      ${v.score_reps},
      ${v.source}::biometric_source,
      ${v.source_workout_ref},
      ${v.perceived_difficulty},
      ${v.pain_area},
      ${v.pain_note},
      ${v.recorded_via}::execution_recording_method,
      ${v.totals_source}::biometric_source,
      ${v.contributing_sources}::text[]::biometric_source[],
      ${args.reason},
      ${args.claimedAssignmentId}
    )
    on conflict (athlete_id, started_at) where off_plan_reason is not null
    do update set ${executionMergeSet(sql)}
    returning id::text
  `;
  const executionId = Number(rows[0]?.id);

  const children = await persistExecutionChildren({
    sql,
    athleteId,
    executionId,
    startedAt: v.started_at,
    input,
    sessionFormat: null,
  });
  const prs = await detectPrs(sql, athleteId, executionId);

  return {
    ok: true,
    off_plan: true,
    execution_id: String(executionId),
    segments_saved: children.segments_saved,
    prs,
  };
}
