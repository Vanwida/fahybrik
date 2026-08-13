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
import type { RangeTone } from '@fahybrid/shared/domain/zone-chart';
import { CommunicationError } from '@/lib/communications/store';
import { audioPathnameFromUrl, coachIdFromAudioPathname } from '@/lib/communications/audio';

/**
 * Una marca que cuelga de una sección: o PESA (el trozo de un reparto) o marca
 * un PERIODO (el rango de una gráfica), nunca las dos. Comparten tabla y forma
 * de escribirse porque son la misma lista ordenada; lo que las separa lo
 * garantiza el CHECK de la 0169, no un `if` repartido por el código.
 */
type MarcaAEscribir = {
  position: number;
  label: string;
  value_num: number | null;
  week_start: string | null;
  week_end: string | null;
  tone: RangeTone | null;
};

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
  /** Sólo una gráfica la lleva: el periodo del que habla y por qué se filtra. */
  grafica: { week_start: string; weeks: number; modality: string | null } | null;
  /** Sólo una comparativa la lleva: los dos periodos que enfrenta y su largo,
   *  que es UNO para los dos lados. */
  comparativa: { a_start: string; b_start: string; weeks: number } | null;
  test_assignment_id: number | null;
  /** Los trozos de un reparto o los rangos de una gráfica. Se escriben en su
   *  tabla hija, no en la fila. */
  marcas: MarcaAEscribir[];
};

const SIN_MARCAS: MarcaAEscribir[] = [];

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
      grafica: null,
      comparativa: null,
      test_assignment_id: null,
      marcas: SIN_MARCAS,
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
      grafica: null,
      comparativa: null,
      test_assignment_id: null,
      marcas: SIN_MARCAS,
    }));
  }
  // Una sección de nota: cada forma dice qué es cada campo. Las CUATRO que no se
  // teclean escriben `content` vacío — un reparto ES sus segmentos, un camino ES
  // el plan del atleta, una gráfica ES su tiempo en zonas y una comparativa SON
  // sus dos periodos —, y un texto de relleno sería un dato que nadie escribió
  // (el CHECK de la 0170 lo permite sólo en esas cuatro).
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
        grafica: null,
        comparativa: null,
        test_assignment_id: null,
        marcas: seccion.segments.map((s, i) => ({
          position: i + 1,
          label: s.label,
          value_num: s.value_num,
          week_start: null,
          week_end: null,
          tone: null,
        })),
      };
    }
    if (seccion.display === 'grafica') {
      return {
        ...comun,
        label: seccion.label,
        content: '',
        grafica: {
          week_start: seccion.week_start,
          weeks: seccion.weeks,
          modality: seccion.modality,
        },
        comparativa: null,
        test_assignment_id: null,
        marcas: seccion.ranges.map((r, i) => ({
          position: i + 1,
          label: r.label,
          value_num: null,
          week_start: r.week_start,
          week_end: r.week_end,
          tone: r.tone,
        })),
      };
    }
    if (seccion.display === 'comparativa') {
      return {
        ...comun,
        label: seccion.label,
        content: '',
        grafica: null,
        comparativa: {
          a_start: seccion.a_start,
          b_start: seccion.b_start,
          weeks: seccion.weeks,
        },
        test_assignment_id: null,
        marcas: SIN_MARCAS,
      };
    }
    if (seccion.display === 'camino') {
      return {
        ...comun,
        label: seccion.label,
        content: '',
        grafica: null,
        comparativa: null,
        test_assignment_id: null,
        marcas: SIN_MARCAS,
      };
    }
    if (seccion.display === 'test_result') {
      return {
        ...comun,
        label: seccion.label,
        content: '',
        grafica: null,
        comparativa: null,
        test_assignment_id: Number(seccion.assignment_id),
        marcas: SIN_MARCAS,
      };
    }
    // En una cifra `label` es el PIE y puede faltar; en un texto es la cabecera
    // y el esquema ya la exige.
    return {
      ...comun,
      label: seccion.label ?? null,
      content: seccion.content,
      test_assignment_id: null,
      grafica: null,
      comparativa: null,
      marcas: SIN_MARCAS,
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
        grafica_week_start: r.grafica?.week_start ?? null,
        grafica_weeks: r.grafica?.weeks ?? null,
        grafica_modality: r.grafica?.modality ?? null,
        compare_a_start: r.comparativa?.a_start ?? null,
        compare_b_start: r.comparativa?.b_start ?? null,
        compare_weeks: r.comparativa?.weeks ?? null,
        test_assignment_id: r.test_assignment_id ?? null,
      })),
      'communication_id',
      'position',
      'label',
      'content',
      'consequence',
      'checkable',
      'display',
      'grafica_week_start',
      'grafica_weeks',
      'grafica_modality',
      'compare_a_start',
      'compare_b_start',
      'compare_weeks',
      'test_assignment_id',
    )}
  `;

  const conMarcas = filas.filter((f) => f.marcas.length > 0);
  if (conMarcas.length === 0) return;

  // Las marcas van DESPUÉS porque cuelgan del id que acaba de nacer, y se
  // enlazan releyendo por `position` en vez de por el orden de un `returning`:
  // `position` es único por comunicado (lo garantiza `..._items_uq`), así que la
  // correspondencia es exacta y no hay forma de colgarle a un reparto los trozos
  // de otro.
  const escritas = await tx<{ id: string; position: number }[]>`
    select id::text as id, position from coach_communication_items
    where communication_id = ${communication_id}::bigint
  `;
  const porPosicion = new Map(escritas.map((r) => [r.position, r.id]));

  const marcas = conMarcas.flatMap((fila) =>
    fila.marcas.map((m) => ({
      item_id: porPosicion.get(fila.position)!,
      position: m.position,
      value_num: m.value_num,
      label: m.label,
      week_start: m.week_start,
      week_end: m.week_end,
      tone: m.tone,
    })),
  );
  await tx`
    insert into coach_communication_item_segments ${tx(
      marcas,
      'item_id',
      'position',
      'value_num',
      'label',
      'week_start',
      'week_end',
      'tone',
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

/**
 * La nota de voz del input, comprobada.
 *
 * Dos cosas, y las dos son de seguridad y no de forma:
 *   · Que la URL sea de NUESTRO proxy. Sin esto, un comunicado podría guardar un
 *     enlace a cualquier sitio de internet y la app del atleta iría a pedirle
 *     bytes a un dominio ajeno con su sesión abierta.
 *   · Que la carpeta sea la de ESTE coach. El proxy sirve un audio a quien sea
 *     destinatario de un comunicado publicado que lo referencia, así que apuntar
 *     al audio de otro coach y publicarlo se lo entregaría a atletas que no
 *     tienen nada que ver con él.
 *
 * Que vayan los dos campos o ninguno ya lo exige el esquema compartido.
 */
export function audioOf(
  input: CreateCommunicationInput,
  coach_id: number | bigint,
): { url: string | null; seconds: number | null } {
  const url = input.audio_url ?? null;
  if (url == null) return { url: null, seconds: null };

  const pathname = audioPathnameFromUrl(url);
  if (pathname == null || coachIdFromAudioPathname(pathname) !== BigInt(coach_id)) {
    throw new CommunicationError('invalid_audio', 'Ese audio no es de este comunicado', 422);
  }
  return { url, seconds: input.audio_seconds ?? null };
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
