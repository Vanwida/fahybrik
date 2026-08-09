// DEL COACH · la ficha del atleta — vocabulario de cara al coach y cómo se lee
// lo que le mandó a ESE atleta.
//
// Lo que el coach está ESCRIBIENDO vive aparte, en `del-coach-borrador.ts`: son
// dos oficios distintos y sólo uno de los dos puede estar a medias.
//
// Client-safe a propósito (cero `server-only`, cero DB): lo importan la pestaña,
// la lista y el detalle. La FUENTE del dominio sigue siendo
// `@fahybrid/shared/domain/coach-communications` — aquí no se decide nada del
// modelo, sólo cómo se DICE de cara al coach.
//
// Por qué hay un mapa de anclas propio: el compartido habla en la voz del atleta
// («Tu plan») y esta pantalla habla en la del coach («Su plan»). Es la misma
// ancla dicha por el otro lado, no una segunda lista de anclas.

import {
  ANCHOR_LABEL,
  COMMUNICATION_ANCHORS,
  COMMUNICATION_KINDS,
  checkableItems,
  compareInboxCommunications,
  type CoachAthleteCommunicationDTO,
  type CoachCommunicationDTO,
  type CommunicationAnchor,
  type CommunicationKind,
} from '@fahybrid/shared/domain/coach-communications';

// ---------------------------------------------------------------------------
// Cómo se dice de cara al coach
// ---------------------------------------------------------------------------

/** El nombre del tipo en una frase («Nuevo protocolo»). El chip en versales sale
 *  de `KIND_LABEL` del compartido: una sola grafía para la etiqueta gritada. */
export const KIND_COACH_LABEL: Record<CommunicationKind, string> = {
  protocol: 'Protocolo',
  question: 'Pregunta',
  task: 'Tarea',
  note: 'Nota',
  focus: 'Foco',
};

/** Qué le pide al atleta. Es lo que decide por cuál empieza el coach. */
export const KIND_COACH_ASKS: Record<CommunicationKind, string> = {
  protocol: 'seguir unos pasos',
  question: 'decidir',
  task: 'cerrar algo con fecha',
  note: 'entender',
  focus: 'no olvidarse',
};

/** El ancla dicha por el coach. `general` sí se nombra aquí (a diferencia de la
 *  app del atleta): el coach está ELIGIENDO dónde cae, y «en ningún sitio» no
 *  sería una opción que se pueda pulsar. */
export const ANCHOR_COACH_LABEL: Record<CommunicationAnchor, string> = {
  plan: 'Su plan',
  week: 'Esta semana',
  session: 'La sesión',
  test: 'Sus tests',
  race: 'Día de carrera',
  checkin: 'Su check-in',
  general: 'En su bandeja',
};

/** El orden en que se ofrecen: de lo más grande (el plan) a lo más suelto. */
export const ANCHOR_CHOICES: readonly CommunicationAnchor[] = COMMUNICATION_ANCHORS;

/** La etiqueta que verá el atleta, para el pie de ayuda del selector. */
export function anchorAthleteLabel(anchor: CommunicationAnchor): string | null {
  return ANCHOR_LABEL[anchor];
}

// ---------------------------------------------------------------------------
// La biblioteca de comunicados: a quién se publica, cómo se busca, cómo se agrupa
// ---------------------------------------------------------------------------

/** La cabecera del compositor: el nombre si es uno, la cuenta si son varios. */
export function paraQuien(nombres: string[]): string {
  return nombres.length === 1 ? `Para ${nombres[0]}` : `Para ${nombres.length} atletas`;
}

/** Publicado, dicho por quién lo recibe. */
export function avisoPublicado(nombres: string[]): string {
  return nombres.length === 1
    ? `Publicado. Le llega a ${nombres[0]}.`
    : `Publicado. Les llega a ${nombres.length} atletas.`;
}

/** El buscador de la Biblioteca, contra lo que el coach recuerda de un comunicado:
 *  cómo lo tituló y qué escribió arriba. `q` llega recortada y en minúsculas. */
export function coincideComunicado(c: CoachCommunicationDTO, q: string): boolean {
  return q ? `${c.title} ${c.body ?? ''}`.toLowerCase().includes(q) : true;
}

/** Repartidos por tipo y en el ORDEN del dominio: de lo que más le pide al atleta
 *  a lo que sólo acompaña. Los tipos sin nada no salen. */
export function porTipo<T extends { kind: CommunicationKind }>(cs: T[]) {
  return COMMUNICATION_KINDS.map((kind) => ({
    kind,
    items: cs.filter((c) => c.kind === kind),
  })).filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------------------
// La lista de la ficha: qué reclama, qué se dice de cada uno y en qué orden
// ---------------------------------------------------------------------------

export type TonoSeguimiento = 'accent' | 'muted' | 'ok' | 'warn' | 'info';

export interface Seguimiento {
  tono: TonoSeguimiento;
  /** La línea que se lee de un vistazo. */
  titular: string;
  /** El matiz que evita abrirlo. Null cuando el titular ya lo dice todo. */
  nota: string | null;
}

/** Hoy en el huso del coach, en ISO. Se compara con `due_date`, que es una fecha
 *  civil sin hora: convertirla a instante la movería un día en cuanto cambie el
 *  huso del servidor. */
export function hoyISO(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dia = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}

const MS_POR_DIA = 86_400_000;

/**
 * El plazo de una tarea, dicho por el coach: «Vence mañana», «Venció hace 3 días».
 *
 * No hay canónico para esto (`formatRelative` mide instantes PASADOS y
 * `formatDaysUntil` habla en la voz de una carrera), así que nace aquí, que es
 * donde vive el concepto — el vencimiento sólo existe en una tarea. Las dos
 * fechas se anclan a mediodía UTC para que el día civil no baile con el huso.
 */
export function venceEn(due_date: string, hoy = hoyISO()): string {
  const dias = Math.round(
    (Date.parse(`${due_date}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / MS_POR_DIA,
  );
  if (!Number.isFinite(dias)) return '';
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  if (dias === -1) return 'Venció ayer';
  if (dias > 1) return `Vence en ${dias} días`;
  return `Venció hace ${Math.abs(dias)} días`;
}

/** Una tarea vencida es la única que se pinta en ámbar: es la que se pierde. */
export function estaVencida(c: CoachAthleteCommunicationDTO, hoy = hoyISO()): boolean {
  return (
    c.kind === 'task' &&
    c.status !== 'archived' &&
    !!c.due_date &&
    c.due_date < hoy &&
    c.athlete_state.state !== 'done'
  );
}

/** El texto de la opción que eligió, para leer la respuesta sin abrir nada. */
export function opcionElegida(c: CoachAthleteCommunicationDTO) {
  const id = c.athlete_state.answered_item_id;
  if (!id) return null;
  return c.items.find((i) => i.id === id) ?? null;
}

/**
 * El seguimiento de ESE atleta, dicho en una línea. Es la columna por la que
 * existe la pestaña: hoy el coach manda un mensaje y lo único que sabe es que se
 * ha enviado.
 */
export function seguimiento(c: CoachAthleteCommunicationDTO, hoy = hoyISO()): Seguimiento {
  const { state, marked_item_ids } = c.athlete_state;

  if (c.status === 'archived') {
    return { tono: 'muted', titular: 'Retirado', nota: 'Ya no le aparece en su bandeja.' };
  }

  if (c.kind === 'task') {
    const plazo = c.due_date ? venceEn(c.due_date, hoy) : null;
    if (state === 'done') return { tono: 'ok', titular: 'Hecho', nota: null };
    if (estaVencida(c, hoy)) {
      return {
        tono: 'warn',
        titular: `${plazo}, y sigue sin hacer`,
        nota: state === 'published' ? 'No lo ha abierto.' : 'Lo ha abierto y no lo ha marcado.',
      };
    }
    if (state === 'published') return { tono: 'accent', titular: 'Sin abrir', nota: plazo };
    return { tono: 'muted', titular: 'Visto, sin hacer', nota: plazo };
  }

  if (c.kind === 'question') {
    if (state === 'answered') {
      const elegida = opcionElegida(c);
      return {
        tono: 'ok',
        titular: elegida ? `Respondió «${elegida.content}»` : 'Respondido',
        nota: elegida?.consequence ?? null,
      };
    }
    if (state === 'published') {
      return {
        tono: c.blocks ? 'warn' : 'accent',
        titular: 'Sin abrir',
        nota: c.blocks ? 'Su plan no se cierra hasta que conteste.' : null,
      };
    }
    return {
      tono: c.blocks ? 'warn' : 'muted',
      titular: 'Vista, sin responder',
      nota: c.blocks ? 'Su plan no se cierra hasta que conteste.' : null,
    };
  }

  if (c.kind === 'protocol') {
    // Sólo cuentan los pasos con casilla: un protocolo puede ser texto leído, y
    // «0 de 5 pasos» sobre cinco líneas que nadie marca sería mentira.
    const total = checkableItems(c.items).length;
    if (state === 'published') return { tono: 'accent', titular: 'Sin abrir', nota: null };
    if (total === 0) {
      return { tono: 'muted', titular: 'Leído', nota: 'No lleva nada que marcar: es para leer.' };
    }
    if (state === 'done') {
      return { tono: 'ok', titular: `Hecho, ${total} de ${total} pasos`, nota: null };
    }
    return { tono: 'muted', titular: `Visto, ${marked_item_ids.length} de ${total} pasos`, nota: null };
  }

  if (c.kind === 'note') {
    if (state === 'published') return { tono: 'accent', titular: 'Sin abrir', nota: null };
    return { tono: 'muted', titular: 'Vista', nota: 'Una nota no pide más que eso.' };
  }

  if (state === 'published') return { tono: 'accent', titular: 'Sin abrir', nota: null };
  return { tono: 'info', titular: 'Activo', nota: 'No caduca. Se retira cuando tú lo retires.' };
}

export interface CarrilesDelCoach {
  /** Lo que todavía te reclama a ti. */
  reclama: CoachAthleteCommunicationDTO[];
  /** Publicado y cerrado: no hay nada que hacer con ello. */
  alDia: CoachAthleteCommunicationDTO[];
  /** Retirado. Es historial, y por eso va plegado al fondo. */
  historial: CoachAthleteCommunicationDTO[];
}

/**
 * Los tres carriles. Dentro de cada uno manda el orden del dominio
 * (`compareInboxCommunications`): lo que bloquea, lo que vence, lo que no ha
 * abierto. Ordenar por fecha es lo que hace el chat, y es por lo que las cosas
 * se pierden.
 */
export function carriles(lista: CoachAthleteCommunicationDTO[]): CarrilesDelCoach {
  const ordenar = (xs: CoachAthleteCommunicationDTO[]) =>
    [...xs].sort((a, b) =>
      compareInboxCommunications(
        {
          kind: a.kind,
          state: a.athlete_state.state,
          blocks: a.blocks,
          due_date: a.due_date,
          published_at: a.published_at ?? a.created_at,
          id: a.id,
        },
        {
          kind: b.kind,
          state: b.athlete_state.state,
          blocks: b.blocks,
          due_date: b.due_date,
          published_at: b.published_at ?? b.created_at,
          id: b.id,
        },
      ),
    );

  const vivos = lista.filter((c) => c.status !== 'archived');
  return {
    reclama: ordenar(vivos.filter((c) => c.athlete_state.claims_attention)),
    alDia: ordenar(vivos.filter((c) => !c.athlete_state.claims_attention)),
    historial: ordenar(lista.filter((c) => c.status === 'archived')),
  };
}

/** Cuántos comunicados vivos le reclaman algo al coach — la insignia de la pestaña. */
export function cuantosReclaman(lista: CoachAthleteCommunicationDTO[]): number {
  return lista.filter((c) => c.status !== 'archived' && c.athlete_state.claims_attention).length;
}
