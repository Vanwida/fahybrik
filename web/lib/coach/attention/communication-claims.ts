import 'server-only';

// Los comunicados que le reclaman algo al atleta, de fila de SQL a hechos.
//
// Extraído de recompute.ts por lo mismo que recompute-batch.ts: mantener los dos
// módulos por debajo del tope de 500 líneas. Aquí sólo se traduce (fila plana →
// tres reclamaciones tipadas); QUIÉN dispara y con qué nivel lo deciden los
// evaluadores, que es donde vive el método editable del coach.

import {
  daysFromNowToIso,
  type SignalFacts,
} from '@fahybrid/shared/domain/coach/signals';
import type { BatchRow } from './recompute-batch';

const DAY_MS = 86_400_000;

/** Cuántos MÁS hay como el que se cita (el propio no cuenta). */
function others(total: number | null): number {
  return Math.max(0, (total ?? 1) - 1);
}

type CommunicationFacts = Pick<
  SignalFacts,
  'communication_question' | 'communication_task' | 'communication_protocol'
>;

/**
 * Las tres reclamaciones del comunicado para un atleta. Cada una es `null`
 * cuando ese tipo no le reclama nada, que es el caso común.
 *
 * El signo de `days` es lo único delicado y por eso se fija aquí y no en el
 * evaluador: una pregunta y una tarea miden lo que YA lleva pasado, y un
 * protocolo mide lo que FALTA hasta su evento (0 = el evento es hoy).
 */
export function communicationClaims(row: BatchRow, now: Date): CommunicationFacts {
  return {
    communication_question: questionClaim(row, now),
    communication_task: taskClaim(row, now),
    communication_protocol: protocolClaim(row, now),
  };
}

function questionClaim(row: BatchRow, now: Date): SignalFacts['communication_question'] {
  const { comm_question_id: id, comm_question_title: title } = row;
  const oldestAt = row.comm_question_oldest_at;
  if (id == null || title == null || oldestAt == null) return null;

  return {
    id,
    title,
    days: Math.floor((now.getTime() - oldestAt.getTime()) / DAY_MS),
    others: others(row.comm_question_n),
    blocks: row.comm_question_blocks ?? false,
  };
}

function taskClaim(row: BatchRow, now: Date): SignalFacts['communication_task'] {
  const { comm_task_id: id, comm_task_title: title } = row;
  const dueIso = row.comm_task_due_iso;
  if (id == null || title == null || dueIso == null) return null;

  return {
    id,
    title,
    // La fecha límite ya pasó, así que el retraso va en positivo.
    days: -daysFromNowToIso(dueIso, now),
    others: others(row.comm_task_n),
  };
}

/**
 * El ancla es un dato acotado ('race' | 'test') que de SQL llega como texto, así
 * que necesita su propia guarda: un ancla que no reconozcamos no es un protocolo
 * a medias, es un protocolo del que no sabemos la fecha.
 */
function protocolClaim(row: BatchRow, now: Date): SignalFacts['communication_protocol'] {
  const { comm_protocol_id: id, comm_protocol_title: title } = row;
  const eventIso = row.comm_protocol_event_iso;
  const anchor = row.comm_protocol_anchor;
  if (id == null || title == null || eventIso == null) return null;
  if (anchor !== 'race' && anchor !== 'test') return null;

  return {
    id,
    title,
    days: daysFromNowToIso(eventIso, now),
    others: others(row.comm_protocol_n),
    anchor,
  };
}
