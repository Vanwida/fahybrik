import 'server-only';

// CÓMO SE ESCRIBE UN COMUNICADO EN SUS TABLAS.
//
// Vive aparte de `communications.ts` porque son dos oficios: aquel LEE (la lista
// del coach, la ficha del atleta, el seguimiento) y esto traduce lo que el coach
// escribió a filas — qué columna usa cada tipo, cuáles se quedan en null para que
// la fila no contradiga a su propio tipo, y qué se comprueba antes de guardar.
//
// Es un módulo HOJA a propósito: no importa nada de la lectura, así que no hay
// forma de montar un ciclo entre los dos.

import type { TransactionClient } from '@/lib/db';
import type {
  CommunicationDisplay,
  CreateCommunicationInput,
} from '@fahybrid/shared/domain/coach-communications';
import { CommunicationError } from '@/lib/communications/store';

/**
 * Las filas de la tabla hija que le tocan a cada tipo. Es UN sitio y no cinco:
 * los pasos de un protocolo, las opciones de una pregunta y las secciones de una
 * nota son la misma lista ordenada, y lo único que cambia es qué columnas usa.
 *
 * `checkable` sólo lo elige el coach en un PROTOCOLO. Fuera de ahí se escribe
 * `true` y es inerte: una opción se elige y una sección se lee, y ninguna de las
 * dos se marca (migración 0162).
 */
type FilaAEscribir = {
  position: number;
  label: string | null;
  content: string;
  consequence: string | null;
  checkable: boolean;
  display: CommunicationDisplay;
  /** Sólo un reparto los lleva. Se escriben en su tabla, no en la fila. */
  segments: { position: number; value_num: number; label: string }[];
};

const SIN_SEGMENTOS: FilaAEscribir['segments'] = [];

export function itemRowsFor(input: CreateCommunicationInput): FilaAEscribir[] {
  if (input.kind === 'task' || input.kind === 'focus') return [];
  if (input.kind === 'question') {
    return input.items.map((option, index) => ({
      position: index + 1,
      label: null,
      content: option.content,
      consequence: option.consequence ?? null,
      checkable: true,
      display: 'texto',
      segments: SIN_SEGMENTOS,
    }));
  }
  if (input.kind === 'protocol') {
    return input.items.map((paso, index) => ({
      position: index + 1,
      label: paso.label ?? null,
      content: paso.content,
      consequence: null,
      checkable: paso.checkable,
      display: 'texto',
      segments: SIN_SEGMENTOS,
    }));
  }
  // Una sección de nota: cada forma dice qué es cada campo. Las dos que no se
  // teclean escriben `content` vacío — un reparto ES sus segmentos y un camino
  // ES el plan del atleta, y un texto de relleno sería un dato que nadie
  // escribió (el CHECK de la 0163 lo permite sólo en esas dos).
  return input.items.map((seccion, index) => {
    const comun = {
      position: index + 1,
      consequence: null,
      checkable: true,
      display: seccion.display,
    } as const;
    if (seccion.display === 'reparto') {
      return {
        ...comun,
        label: seccion.label,
        content: '',
        segments: seccion.segments.map((s, i) => ({
          position: i + 1,
          value_num: s.value_num,
          label: s.label,
        })),
      };
    }
    if (seccion.display === 'camino') {
      return { ...comun, label: seccion.label, content: '', segments: SIN_SEGMENTOS };
    }
    // En una cifra `label` es el PIE y puede faltar; en un texto es la cabecera
    // y el esquema ya la exige.
    return {
      ...comun,
      label: seccion.label ?? null,
      content: seccion.content,
      segments: SIN_SEGMENTOS,
    };
  });
}


export async function insertItems(
  tx: TransactionClient,
  communication_id: string,
  input: CreateCommunicationInput,
): Promise<void> {
  const filas = itemRowsFor(input);
  if (filas.length === 0) return;

  await tx`
    insert into coach_communication_items ${tx(
      filas.map((r) => ({
        communication_id,
        position: r.position,
        label: r.label,
        content: r.content,
        consequence: r.consequence,
        checkable: r.checkable,
        display: r.display,
      })),
      'communication_id',
      'position',
      'label',
      'content',
      'consequence',
      'checkable',
      'display',
    )}
  `;

  const conSegmentos = filas.filter((f) => f.segments.length > 0);
  if (conSegmentos.length === 0) return;

  // Los segmentos van DESPUÉS porque cuelgan del id que acaba de nacer, y se
  // enlazan releyendo por `position` en vez de por el orden de un `returning`:
  // `position` es único por comunicado (lo garantiza `..._items_uq`), así que la
  // correspondencia es exacta y no hay forma de colgarle a un reparto los trozos
  // de otro.
  const escritas = await tx<{ id: string; position: number }[]>`
    select id::text as id, position from coach_communication_items
    where communication_id = ${communication_id}::bigint
  `;
  const porPosicion = new Map(escritas.map((r) => [r.position, r.id]));

  const segmentos = conSegmentos.flatMap((fila) =>
    fila.segments.map((s) => ({
      item_id: porPosicion.get(fila.position)!,
      position: s.position,
      value_num: s.value_num,
      label: s.label,
    })),
  );
  await tx`
    insert into coach_communication_item_segments ${tx(
      segmentos,
      'item_id',
      'position',
      'value_num',
      'label',
    )}
  `;
}

/**
 * El enlace apunta a un comunicado SUYO y vivo, o no se escribe.
 *
 * Los dos casos son el mismo fallo visto desde dos sitios: enlazar al de otro
 * coach filtraría que ese id existe, y enlazar a uno archivado dejaría el pie de
 * la nota llamando a una pantalla que el atleta ya no tiene. Se comprueba dentro
 * de la transacción de escritura, que es donde la respuesta sigue siendo cierta.
 */
export async function requireLinkable(
  tx: TransactionClient,
  coach_id: number | bigint,
  linked_communication_id: string,
): Promise<void> {
  const rows = await tx<{ status: string }[]>`
    select status from coach_communications
    where id = ${linked_communication_id}::bigint and coach_id = ${coach_id as number}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new CommunicationError('unknown_link', 'Ese comunicado no es tuyo', 422);
  }
  if (row.status === 'archived') {
    throw new CommunicationError(
      'archived_link',
      'Ese comunicado está retirado: ya no le aparece a nadie',
      422,
    );
  }
}

/** El enlace del input, si el tipo lo admite. Sólo una nota y una tarea apuntan
 *  a otro: son los dos que dicen «esto sale de aquello». */
export function linkedOf(input: CreateCommunicationInput): string | null {
  return input.kind === 'note' || input.kind === 'task'
    ? (input.linked_communication_id ?? null)
    : null;
}

/** Los campos que solo existen en un tipo. Se escriben null en los demás para
 *  que la fila no pueda contradecir a su propio tipo. */
export function kindOnlyFields(input: CreateCommunicationInput) {
  return {
    final_note: input.kind === 'protocol' ? (input.final_note ?? null) : null,
    due_date: input.kind === 'task' ? input.due_date : null,
    blocks: input.kind === 'question' ? input.blocks : false,
  };
}
