import 'server-only';

// EL DETALLE DE UNA SESIÓN, para el coach — prescrito vs ejecutado, tramo a tramo.
//
// Vive aquí y no en la ruta porque ya lo miran dos superficies: el SessionDrawer
// del panel (GET /api/coach/athletes/[id]/sessions/[session_id]/detail) y la tool
// `get_session` del conector MCP. Las dos hacen la MISMA pregunta —«¿qué le puse
// y qué hizo?»— así que hay una sola respuesta y un solo sitio donde se arma.
//
// QUÉ SE ENSAMBLA AQUÍ, Y POR QUÉ NO ESTÁ YA ARMADO EN OTRO SITIO
// ---------------------------------------------------------------
// `loadAssignmentDetail` (el mismo cargador que sirve el brief del iOS) ya da lo
// gordo: los bloques prescritos con sus zonas y sus %RM resueltos contra los
// perfiles del atleta, y la ejecución con sus tramos medidos. Lo que le falta
// para la vista del coach son tres cosas que solo tienen sentido de este lado:
//
//   1. los overrides por-asignación (`wa.notes` codificado: título + nota libre),
//   2. por qué NO hay contenido cuando no lo hay — plantilla ausente, plantilla
//      vacía o reloj de box (`content_state`), que es lo que evita que el panel
//      llame error a una sesión honesta,
//   3. el veredicto de cumplimiento por tramo (`buildRunCompliance`), que cruza
//      la banda prescrita con el lap medido.
//
// TENANCY. El atleta se resuelve contra el coach ANTES de leer nada de la sesión,
// y la asignación se carga scoped al atleta. Un id ajeno se responde igual que un
// id inexistente (`athlete_not_found`): confirmar que existe en otro club ya sería
// la fuga. Los dos motivos viajan separados porque la ruta los distingue en su
// copy ("Atleta no encontrado" / "Entreno no encontrado") y ese contrato es viejo.

import type { Sql } from '@/lib/db';
import { loadAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { decodeCoachAssignmentNotes } from '@/lib/dashboard/coach/day-sessions';
import { buildRunCompliance } from '@/lib/dashboard/coach/run-compliance';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';

/** El vocabulario de `workout_executions.perceived_difficulty` (CHECK en 0125). */
const PERCEIVED_DIFFICULTY = ['too_easy', 'as_expected', 'too_hard'] as const;
type PerceivedDifficulty = (typeof PERCEIVED_DIFFICULTY)[number];

/**
 * Por qué no hay detalle, cuando no hay. El motivo se decide una vez y aquí, con
 * la misma fila de la que cuelga el copy de cada superficie.
 */
export type CoachSessionDetailResult =
  | {
      ok: true;
      session: CoachSessionDetail;
      /** De quién es la sesión. Sale de la MISMA fila que comprueba la propiedad,
       *  para que quien encabece una frase con el nombre no tenga que ir a por él
       *  (el coach no piensa en ids). */
      athlete_name: string;
    }
  | { ok: false; reason: 'athlete_not_found' | 'session_not_found' };

/**
 * El detalle completo de UNA sesión de un atleta del coach.
 *
 * `assignment_id` es el id de `workout_assignments` — lo que el panel llama
 * `session_id` en su ruta y lo que `get_plan` devuelve como `assignment_id`.
 */
export async function loadCoachSessionDetail(params: {
  sql: Sql;
  coach_id: number | bigint;
  athlete_id: number;
  assignment_id: number;
}): Promise<CoachSessionDetailResult> {
  const { sql, coach_id, athlete_id, assignment_id } = params;

  const ownership = await sql<Array<{ id: string; full_name: string }>>`
    select id::text, full_name from athletes
    where id = ${athlete_id} and coach_id = ${coach_id as number}
    limit 1
  `;
  if (!ownership[0]) return { ok: false, reason: 'athlete_not_found' };

  const detail = await loadAssignmentDetail({
    sql,
    athlete_id: BigInt(athlete_id),
    assignment_id: BigInt(assignment_id),
  });
  if (!detail) return { ok: false, reason: 'session_not_found' };

  // Lo que el cargador no lee porque el atleta no lo necesita: los overrides del
  // coach (título + nota, codificados en `wa.notes`), quién escribió la sesión, y
  // el nombre de la plantilla — que sobrevive aunque no haya bloques que pintar,
  // porque el nombre de un reloj ES su forma ("AMRAP · 12:00"). `is_clock` marca
  // esa sesión sin movimientos nombrados, que persiste su prescripción en
  // `meta_json` precisamente porque no tiene segmentos.
  const assignmentRows = await sql<
    Array<{
      notes: string | null;
      origin: 'coach' | 'self';
      template_id: string | null;
      template_name: string | null;
      is_clock: boolean;
    }>
  >`
    select wa.notes,
           wa.origin::text as origin,
           wa.template_id::text as template_id,
           t.name as template_name,
           coalesce(t.meta_json ? 'prescription', false) as is_clock
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.id = ${assignment_id}
      and wa.athlete_id = ${athlete_id}
    limit 1
  `;
  const assignmentRow = assignmentRows[0] ?? null;
  const decoded = decodeCoachAssignmentNotes(assignmentRow?.notes);

  // La ejecución y sus tramos vienen del MISMO cargador (`detail.execution`), no
  // de una segunda consulta: es la fila 1:1 de `workout_executions` con sus
  // `segment_executions` ya mapeados a la línea prescrita. La puerta es
  // `execution_id`, no `detail.execution != null`, porque el cargador también
  // emite un bloque de nulos para una sesión marcada como hecha SIN fila de
  // ejecución (un "márcala por mí" del coach); para el panel eso no es una
  // ejecución que enseñar, y ese contrato es el que ya lee su drawer.
  const execution = detail.execution?.execution_id != null ? detail.execution : null;
  const segmentActuals = execution?.segments ?? [];

  const contentState: CoachSessionDetail['content_state'] =
    detail.workout != null
      ? 'blocks'
      : assignmentRow?.template_id == null
        ? 'no_template'
        : assignmentRow.is_clock
          ? 'clock'
          : 'no_content';

  return {
    ok: true,
    athlete_name: ownership[0].full_name,
    session: {
      assignment_id: detail.assignment.id,
      iso_date: detail.assignment.scheduled_for,
      status: detail.assignment.status,
      display_title: decoded.display_title,
      coach_notes: decoded.notes,
      workout: detail.workout,
      content_state: contentState,
      origin: assignmentRow?.origin ?? 'coach',
      template_name: assignmentRow?.template_name ?? null,
      execution: execution
        ? {
            duration_min:
              execution.total_duration_seconds != null
                ? Math.round(execution.total_duration_seconds / 60)
                : null,
            rpe: execution.perceived_exertion,
            athlete_notes: execution.notes,
            ended_at: execution.ended_at,
            started_at: execution.started_at,
            score_label: execution.score_label,
            perceived_difficulty: toPerceivedDifficulty(execution.perceived_difficulty),
            pain_area: execution.pain_area,
            pain_note: execution.pain_note,
            route_polyline: execution.route_polyline,
            elevation_gain_m: execution.elevation_gain_m,
            elevation_loss_m: execution.elevation_loss_m,
            hr_recovery_60_bpm: execution.hr_recovery_60_bpm,
            decoupling_pct: execution.decoupling_pct,
            trace: execution.trace,
          }
        : null,
      segment_actuals: segmentActuals,
      // Cumplimiento por tramo (banda prescrita vs lap ejecutado) sobre los MISMOS
      // bloques y los MISMOS tramos que van en el payload, así que un veredicto no
      // puede discrepar de la línea que lo justifica.
      run_compliance: buildRunCompliance(detail.workout, segmentActuals),
    },
  };
}

/**
 * El veredicto de calibración del atleta, estrechado al vocabulario del CHECK. Un
 * valor fuera de él cae a null («no contestó») en vez de colarse tipado como si
 * fuera una de las tres respuestas.
 */
function toPerceivedDifficulty(raw: string | null): PerceivedDifficulty | null {
  return raw != null && (PERCEIVED_DIFFICULTY as readonly string[]).includes(raw)
    ? (raw as PerceivedDifficulty)
    : null;
}
