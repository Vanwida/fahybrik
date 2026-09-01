// Lo que el conector pone en el cable para LOS COMUNICADOS.
//
// Un comunicado es lo que el coach le dice a un atleta con forma: un protocolo con
// pasos, una pregunta con opciones y consecuencias, una tarea con fecha, una nota,
// un foco. Lo que le da valor al coach no es el texto —ese lo escribió él— sino EL
// SEGUIMIENTO: quién lo ha visto, quién lo ha hecho, quién ha contestado y qué.
// Por eso el estado viaja siempre, y en la lectura de un atleta viaja SU estado.
//
// Mapeo explícito. Se cae `camino` (la espina del plan resuelta al servir, que son
// decenas de puntos para dibujar) y se cae `display` (cómo se PINTA una sección de
// nota, que no significa nada fuera de una pantalla).

import type {
  CoachAthleteCommunicationDTO,
  CoachCommunicationDTO,
  CommunicationItemDTO,
  CommunicationState,
} from '@fahybrid/shared/domain/coach-communications';

/**
 * El estado de un atleta ante un comunicado, dicho como se dice. `published` es el
 * estado inicial —salió de la mano del coach y aún no lo ha abierto—, no un estado
 * del comunicado: aquí se lee desde el lado del atleta.
 */
const STATE_ES: Record<CommunicationState, string> = {
  published: 'sin abrir',
  seen: 'visto sin cerrar',
  done: 'hecho',
  answered: 'contestado',
};

function item(i: CommunicationItemDTO): Record<string, unknown> {
  return {
    item_id: i.id,
    position: i.position,
    label: i.label,
    content: i.content,
    /** Qué pasa si elige esta opción. Solo en las preguntas. */
    consequence: i.consequence,
    /** Si es un paso que se marca (protocolo) o solo se lee. */
    checkable: i.checkable,
    /** Los trozos de un reparto, cuando la sección es un reparto. */
    segments: i.segments.length > 0 ? i.segments.map((s) => ({ label: s.label, value: s.value_num })) : null,
  };
}

function base(c: CoachCommunicationDTO): Record<string, unknown> {
  return {
    communication_id: c.id,
    /** protocol | question | task | note | focus — la forma manda en cómo se lee. */
    kind: c.kind,
    title: c.title,
    body: c.body,
    final_note: c.final_note,
    /** A qué va enganchado: general, una sesión, una carrera… */
    anchor_kind: c.anchor_kind,
    anchor_ref: c.anchor_ref,
    due_date: c.due_date,
    expires_at: c.expires_at,
    /** true = le tapa la app hasta que lo cierre. */
    blocks: c.blocks,
    is_template: c.is_template,
    status: c.status,
    published_at: c.published_at,
    updated_at: c.updated_at,
    items: c.items.map(item),
    /** El comunicado al que este apunta, cuando engancha con otro. */
    linked: c.linked ? { communication_id: c.linked.id, kind: c.linked.kind, title: c.linked.title } : null,
    /** Cuántos lo han visto / hecho / contestado, del total de destinatarios. */
    tracking: {
      recipients: c.tracking.recipients,
      seen: c.tracking.seen,
      done: c.tracking.done,
      answered: c.tracking.answered,
    },
  };
}

export function toCommunication(c: CoachCommunicationDTO): Record<string, unknown> {
  return base(c);
}

export function toAthleteCommunication(
  c: CoachAthleteCommunicationDTO,
): Record<string, unknown> {
  return {
    ...base(c),
    athlete_state: {
      state: c.athlete_state.state,
      state_es: STATE_ES[c.athlete_state.state],
      seen_at: c.athlete_state.seen_at,
      done_at: c.athlete_state.done_at,
      answered_at: c.athlete_state.answered_at,
      /** Qué opción eligió, cuando era una pregunta. */
      answered_item_id: c.athlete_state.answered_item_id,
      /** Los pasos que lleva marcados, cuando era un protocolo. */
      marked_item_ids: c.athlete_state.marked_item_ids,
      /** Sigue reclamando atención: ni cerrado ni retirado. */
      claims_attention: c.athlete_state.claims_attention,
    },
  };
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function joinEs(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

export function athleteCommsResumen(params: {
  athlete_name: string;
  rows: CoachAthleteCommunicationDTO[];
}): string {
  const { athlete_name, rows } = params;
  if (rows.length === 0) return `A ${athlete_name} no le has comunicado nada todavía.`;

  const by = (s: CommunicationState) => rows.filter((r) => r.athlete_state.state === s).length;
  const parts: string[] = [];
  const pending = by('published');
  const seen = by('seen');
  const done = by('done') + by('answered');
  if (done > 0) parts.push(`${done} ${plural(done, 'cerrado', 'cerrados')}`);
  if (seen > 0) parts.push(`${seen} ${plural(seen, 'visto sin cerrar', 'vistos sin cerrar')}`);
  if (pending > 0) parts.push(`${pending} sin abrir`);

  const claiming = rows.filter((r) => r.athlete_state.claims_attention).length;
  if (claiming > 0) {
    parts.push(`${claiming} ${plural(claiming, 'que espera algo de él', 'que esperan algo de él')}`);
  }

  return `A ${athlete_name} le has mandado ${rows.length} ${plural(rows.length, 'comunicado', 'comunicados')}: ${joinEs(parts)}.`;
}

export function coachCommsResumen(params: {
  view: string;
  rows: CoachCommunicationDTO[];
}): string {
  const { view, rows } = params;
  const scope =
    view === 'templates' ? 'plantillas' : view === 'drafts' ? 'borradores' : 'comunicados publicados';
  if (rows.length === 0) return `No tienes ${scope}.`;

  if (view === 'published') {
    const waiting = rows.filter((r) => r.tracking.recipients > r.tracking.done + r.tracking.answered).length;
    return waiting > 0
      ? `${rows.length} ${scope}, ${waiting} con gente que aún no lo ha cerrado.`
      : `${rows.length} ${scope}, todos cerrados por sus destinatarios.`;
  }
  return `${rows.length} ${scope}.`;
}
